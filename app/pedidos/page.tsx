'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Pedido, Cliente, Producto, EstadoPedido } from '@/types';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

const ESTADO_COLORS: Record<string, string> = {
  pendiente: '#ff9800',
  preparado: '#2196f3',
  entregado: '#4caf50',
  pagado: '#6b7280',
};

const ESTADOS: EstadoPedido[] = ['pendiente', 'preparado', 'entregado', 'pagado'];
const PRECIOS_EVENTO = [3300, 3990, 4990, 4995, 5990];

interface ItemPedido {
  producto: Producto;
  cantidad: number;
  precioUnitario: number;
}

interface Evento {
  id: string;
  nombre: string;
  fecha: string;
}

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [todosProductos, setTodosProductos] = useState<Producto[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<EstadoPedido | 'todos'>('todos');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tipoModal, setTipoModal] = useState<'pedido' | 'evento'>('pedido');
  const [editandoPedido, setEditandoPedido] = useState<Pedido | null>(null);

  // Form pedido
  const [clienteId, setClienteId] = useState('');
  const [vendedor, setVendedor] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [items, setItems] = useState<ItemPedido[]>([]);
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);

  // Form evento
  const [eventoId, setEventoId] = useState('');
  const [showNuevoEvento, setShowNuevoEvento] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoFecha, setNuevoFecha] = useState(new Date().toISOString().split('T')[0]);
  const [savingEvento, setSavingEvento] = useState(false);

  const fetchPedidos = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('pedidos')
        .select('*, cliente:clientes(nombre), detalle:detalle_pedido(*, producto:productos(*))')
        .order('fecha', { ascending: false });
      setPedidos(data || []);
    } catch {}
  }, []);

  const fetchEventos = useCallback(async () => {
    const { data } = await supabase.from('eventos').select('id, nombre, fecha').order('fecha', { ascending: false });
    setEventos(data || []);
  }, []);

  useEffect(() => {
    Promise.all([
      fetchPedidos(),
      fetchEventos(),
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('productos').select('*').order('nombre'),
    ]).then(([, , c, p]) => {
      setClientes(c.data || []);
      setTodosProductos(p.data || []);
      setProductos(p.data || []);
    }).finally(() => setLoading(false));
  }, [fetchPedidos, fetchEventos]);

  function abrirNuevo(tipo: 'pedido' | 'evento') {
    setEditandoPedido(null);
    setTipoModal(tipo);
    setItems([]);
    setClienteId(''); setVendedor(''); setObservaciones('');
    setDireccion(''); setTelefono('');
    setFecha(new Date().toISOString().split('T')[0]);
    setEventoId('');
    setShowModal(true);
  }

  function abrirEditar(p: Pedido) {
    setEditandoPedido(p);
    setTipoModal('pedido');
    setClienteId(p.cliente_id);
    setVendedor(p.vendedor);
    setDireccion(p.direccion);
    setTelefono(p.telefono);
    setObservaciones(p.observaciones || '');
    setFecha(p.fecha);
    // Cargar items del detalle
    const itemsCargados: ItemPedido[] = (p.detalle || []).map((d) => ({
      producto: d.producto as unknown as Producto,
      cantidad: d.cantidad,
      precioUnitario: d.precio_unitario,
    }));
    setItems(itemsCargados);
    setShowModal(true);
  }

  function selectCliente(id: string) {
    const c = clientes.find((cl) => cl.id === id);
    setClienteId(id);
    if (c) { setTelefono(c.telefono); setDireccion(c.direccion); }
  }

  function toggleProducto(p: Producto, precioDefault?: number) {
    const exists = items.find((i) => i.producto.id === p.id);
    if (exists) setItems((prev) => prev.filter((i) => i.producto.id !== p.id));
    else setItems((prev) => [...prev, { producto: p, cantidad: 1, precioUnitario: precioDefault ?? p.precio }]);
  }

  function setPrecioEvento(productoId: string, precio: number) {
    setItems((prev) => prev.map((i) => i.producto.id === productoId ? { ...i, precioUnitario: precio } : i));
  }

  const neto = items.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0);
  const total = tipoModal === 'pedido' ? Math.round(neto * 1.19) : neto;

  async function handleGuardarPedido() {
    if (!clienteId || items.length === 0 || !vendedor) return;
    setSaving(true);
    try {
      if (editandoPedido) {
        // EDITAR pedido existente
        const { error: pe } = await supabase.from('pedidos').update({
          cliente_id: clienteId, fecha, total, direccion, telefono,
          vendedor, observaciones: observaciones || null,
        }).eq('id', editandoPedido.id);
        if (pe) throw new Error(pe.message);

        // Restaurar stock de los items anteriores
        for (const d of (editandoPedido.detalle || [])) {
          const prod = d.producto as unknown as Producto;
          if (prod?.id) {
            await supabase.from('productos')
              .update({ stock: prod.stock + d.cantidad })
              .eq('id', prod.id);
          }
        }

        // Borrar detalle anterior e insertar el nuevo
        await supabase.from('detalle_pedido').delete().eq('pedido_id', editandoPedido.id);
        const { error: de } = await supabase.from('detalle_pedido').insert(
          items.map((i) => ({ pedido_id: editandoPedido.id, producto_id: i.producto.id, cantidad: i.cantidad, precio_unitario: i.precioUnitario }))
        );
        if (de) throw new Error(de.message);

        // Descontar nuevo stock
        for (const item of items) {
          const prodActual = todosProductos.find((p) => p.id === item.producto.id);
          if (prodActual) {
            await supabase.from('productos').update({ stock: Math.max(0, prodActual.stock - item.cantidad) }).eq('id', item.producto.id);
          }
        }
      } else {
        // CREAR pedido nuevo
        const { data: pedido, error: pe } = await supabase.from('pedidos').insert({
          cliente_id: clienteId, fecha, total, direccion, telefono,
          estado: 'pendiente', vendedor, observaciones: observaciones || null,
        }).select().single();
        if (pe) throw new Error(pe.message);
        if (!pedido) throw new Error('No se creó el pedido');

        const { error: de } = await supabase.from('detalle_pedido').insert(
          items.map((i) => ({ pedido_id: pedido.id, producto_id: i.producto.id, cantidad: i.cantidad, precio_unitario: i.precioUnitario }))
        );
        if (de) throw new Error(de.message);

        for (const item of items) {
          await supabase.from('productos').update({ stock: Math.max(0, item.producto.stock - item.cantidad) }).eq('id', item.producto.id);
        }
      }

      setShowModal(false);
      await fetchPedidos();
      const { data: p } = await supabase.from('productos').select('*').order('nombre');
      if (p) { setTodosProductos(p); setProductos(p); }
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
    setSaving(false);
  }

  async function handleGuardarEvento() {
    if (!eventoId || items.length === 0) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('ventas_evento').insert(
        items.map((i) => ({
          evento_id: eventoId,
          producto_id: i.producto.id,
          cantidad: i.cantidad,
          precio_unitario: i.precioUnitario,
          total: i.precioUnitario * i.cantidad,
        }))
      );
      if (error) throw new Error(error.message);
      for (const item of items) {
        await supabase.from('productos').update({ stock: Math.max(0, item.producto.stock - item.cantidad) }).eq('id', item.producto.id);
      }
      setShowModal(false);
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
    setSaving(false);
  }

  async function handleCrearEvento() {
    if (!nuevoNombre) return;
    setSavingEvento(true);
    try {
      const { data, error } = await supabase
        .from('eventos')
        .insert({ nombre: nuevoNombre, fecha: nuevoFecha })
        .select('id, nombre, fecha')
        .single();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('No se pudo crear el evento');
      setEventos((prev) => [data, ...prev]);
      setEventoId(data.id);
      setShowNuevoEvento(false);
      setNuevoNombre('');
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
    setSavingEvento(false);
  }

  async function cambiarEstado(id: string, estado: EstadoPedido) {
    await supabase.from('pedidos').update({ estado }).eq('id', id);
    await fetchPedidos();
  }

  const pedidosFiltrados = filtro === 'todos' ? pedidos : pedidos.filter((p) => p.estado === filtro);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Pedidos</h1>
          <p className="text-sm" style={{ color: '#6b7280' }}>{pedidos.length} pedidos en total</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => abrirNuevo('evento')} className="px-3 py-2 rounded-lg font-semibold text-sm text-white" style={{ backgroundColor: '#ff9800' }}>
            🎪 Evento
          </button>
          <button onClick={() => abrirNuevo('pedido')} className="px-3 py-2 rounded-lg font-semibold text-sm text-white" style={{ backgroundColor: '#e53935' }}>
            + Pedido
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {(['todos', ...ESTADOS] as const).map((e) => (
          <button key={e} onClick={() => setFiltro(e)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors"
            style={{
              backgroundColor: filtro === e ? (ESTADO_COLORS[e] || '#e53935') + '20' : 'transparent',
              borderColor: filtro === e ? (ESTADO_COLORS[e] || '#e53935') : '#2a2a2a',
              color: filtro === e ? (ESTADO_COLORS[e] || '#e53935') : '#6b7280',
            }}>
            {e.charAt(0).toUpperCase() + e.slice(1)}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {pedidosFiltrados.map((p) => {
          const color = ESTADO_COLORS[p.estado] || '#6b7280';
          return (
            <div key={p.id} className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-bold" style={{ color: '#f5f5f5' }}>{p.cliente?.nombre ?? '—'}</p>
                  <p className="text-xs" style={{ color: '#6b7280' }}>
                    {new Date(p.fecha + 'T12:00:00').toLocaleDateString('es-CL')} · {p.vendedor}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => abrirEditar(p)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center border text-base"
                    style={{ borderColor: '#2a2a2a', backgroundColor: '#1c1c1c' }}>
                    ✏️
                  </button>
                  <span className="text-xs font-bold px-2 py-1 rounded-full border" style={{ color, backgroundColor: color + '20', borderColor: color + '40' }}>
                    {p.estado.toUpperCase()}
                  </span>
                </div>
              </div>
              {(p.detalle || []).map((d) => (
                <div key={d.id} className="flex justify-between text-sm py-1 border-b" style={{ borderColor: '#2a2a2a' }}>
                  <span style={{ color: '#9ca3af' }}>{d.producto?.nombre ?? '—'}</span>
                  <span style={{ color: '#f5f5f5' }}>{d.cantidad} u. · {fmt(d.precio_unitario * d.cantidad)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center mt-3">
                <p className="font-extrabold text-lg" style={{ color: '#f5f5f5' }}>{fmt(p.total)}</p>
                <div className="flex gap-2">
                  {ESTADOS.filter((e) => e !== p.estado).map((e) => (
                    <button key={e} onClick={() => cambiarEstado(p.id, e)}
                      className="text-xs px-2 py-1 rounded border transition-colors"
                      style={{ borderColor: ESTADO_COLORS[e] + '60', color: ESTADO_COLORS[e], backgroundColor: ESTADO_COLORS[e] + '10' }}>
                      → {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        {pedidosFiltrados.length === 0 && (
          <div className="text-center py-16" style={{ color: '#6b7280' }}>No hay pedidos</div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 overflow-y-auto max-h-[90vh]" style={{ backgroundColor: '#141414' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg" style={{ color: '#f5f5f5' }}>
                {editandoPedido ? '✏️ Editar Pedido' : tipoModal === 'pedido' ? 'Nuevo Pedido' : '🎪 Venta en Evento'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ color: '#6b7280' }}>✕</button>
            </div>

            {/* Toggle tipo (solo en nuevo) */}
            {!editandoPedido && (
              <div className="flex gap-2 mb-4">
                {(['pedido', 'evento'] as const).map((t) => (
                  <button key={t} onClick={() => { setTipoModal(t); setItems([]); }}
                    className="flex-1 py-2 rounded-lg border text-sm font-semibold"
                    style={{
                      backgroundColor: tipoModal === t ? (t === 'pedido' ? '#e53935' : '#ff9800') : 'transparent',
                      borderColor: tipoModal === t ? (t === 'pedido' ? '#e53935' : '#ff9800') : '#2a2a2a',
                      color: tipoModal === t ? 'white' : '#6b7280',
                    }}>
                    {t === 'pedido' ? '📦 Pedido' : '🎪 Evento'}
                  </button>
                ))}
              </div>
            )}

            {/* FORM PEDIDO */}
            {(tipoModal === 'pedido' || editandoPedido) && (
              <>
                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Cliente</label>
                <select value={clienteId} onChange={(e) => selectCliente(e.target.value)} className="w-full rounded-lg px-3 py-2 mb-3 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }}>
                  <option value="">Seleccionar cliente...</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>

                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Fecha</label>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full rounded-lg px-3 py-2 mb-3 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Vendedor</label>
                <div className="flex gap-2 mb-3">
                  {['Santiago', 'Hernán'].map((v) => (
                    <button key={v} onClick={() => setVendedor(v)} className="flex-1 py-2 rounded-lg border text-sm font-semibold"
                      style={{ backgroundColor: vendedor === v ? '#e53935' : 'transparent', borderColor: vendedor === v ? '#e53935' : '#2a2a2a', color: vendedor === v ? 'white' : '#6b7280' }}>
                      {v}
                    </button>
                  ))}
                </div>

                <label className="block text-xs font-semibold uppercase mb-2" style={{ color: '#6b7280' }}>Productos</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {todosProductos.map((p) => {
                    const sel = items.find((i) => i.producto.id === p.id);
                    return (
                      <button key={p.id} onClick={() => toggleProducto(p)}
                        className="px-3 py-1.5 rounded-lg border text-xs font-medium"
                        style={{ backgroundColor: sel ? '#e53935' + '20' : '#1c1c1c', borderColor: sel ? '#e53935' : '#2a2a2a', color: sel ? '#e53935' : '#9ca3af' }}>
                        {p.nombre} ({p.stock})
                      </button>
                    );
                  })}
                </div>

                {items.map((item) => (
                  <div key={item.producto.id} className="mb-3 p-3 rounded-lg border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a' }}>
                    <div className="flex justify-between items-center mb-2">
                      <p className="font-semibold text-sm" style={{ color: '#f5f5f5' }}>{item.producto.nombre}</p>
                      <button onClick={() => setItems((prev) => prev.filter((i) => i.producto.id !== item.producto.id))}
                        className="w-7 h-7 rounded flex items-center justify-center"
                        style={{ backgroundColor: '#e53935' + '20', color: '#e53935' }}>🗑</button>
                    </div>
                    <p className="text-xs mb-2" style={{ color: '#6b7280' }}>Precio:</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {PRECIOS_EVENTO.map((precio) => (
                        <button key={precio} onClick={() => setItems((prev) => prev.map((i) => i.producto.id === item.producto.id ? { ...i, precioUnitario: precio } : i))}
                          className="px-3 py-1.5 rounded-lg border text-xs font-bold"
                          style={{
                            backgroundColor: item.precioUnitario === precio ? '#e53935' : 'transparent',
                            borderColor: item.precioUnitario === precio ? '#e53935' : '#2a2a2a',
                            color: item.precioUnitario === precio ? 'white' : '#9ca3af',
                          }}>
                          {fmt(precio)}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setItems((prev) => prev.map((i) => i.producto.id === item.producto.id ? { ...i, cantidad: Math.max(1, i.cantidad - 1) } : i))}
                          className="w-8 h-8 rounded-lg border font-bold" style={{ borderColor: '#2a2a2a', color: '#f5f5f5' }}>-</button>
                        <span className="w-8 text-center font-extrabold" style={{ color: '#f5f5f5' }}>{item.cantidad}</span>
                        <button onClick={() => setItems((prev) => prev.map((i) => i.producto.id === item.producto.id ? { ...i, cantidad: i.cantidad + 1 } : i))}
                          className="w-8 h-8 rounded-lg border font-bold" style={{ borderColor: '#2a2a2a', color: '#f5f5f5' }}>+</button>
                      </div>
                      <p className="font-extrabold" style={{ color: '#f5f5f5' }}>{fmt(item.precioUnitario * item.cantidad)}</p>
                    </div>
                  </div>
                ))}

                {items.length > 0 && (
                  <div className="mb-3 p-3 rounded-lg" style={{ backgroundColor: '#1c1c1c' }}>
                    <div className="flex justify-between text-sm mb-1"><span style={{ color: '#6b7280' }}>Neto</span><span style={{ color: '#f5f5f5' }}>{fmt(neto)}</span></div>
                    <div className="flex justify-between text-sm mb-1"><span style={{ color: '#6b7280' }}>IVA 19%</span><span style={{ color: '#f5f5f5' }}>{fmt(total - neto)}</span></div>
                    <div className="flex justify-between font-bold"><span style={{ color: '#6b7280' }}>TOTAL</span><span className="text-xl" style={{ color: '#f5f5f5' }}>{fmt(total)}</span></div>
                  </div>
                )}

                <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Observaciones..." rows={2}
                  className="w-full rounded-lg px-3 py-2 mb-4 text-sm border resize-none" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

                <button onClick={handleGuardarPedido} disabled={saving || !clienteId || items.length === 0 || !vendedor}
                  className="w-full py-3 rounded-lg font-bold text-white text-sm disabled:opacity-40"
                  style={{ backgroundColor: '#e53935' }}>
                  {saving ? 'Guardando...' : editandoPedido ? 'GUARDAR CAMBIOS' : 'CONFIRMAR PEDIDO'}
                </button>
              </>
            )}

            {/* FORM EVENTO */}
            {tipoModal === 'evento' && !editandoPedido && (
              <>
                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Evento</label>
                <div className="flex gap-2 mb-4">
                  <select value={eventoId} onChange={(e) => setEventoId(e.target.value)}
                    className="flex-1 rounded-lg px-3 py-2 text-sm border"
                    style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: eventoId ? '#f5f5f5' : '#6b7280' }}>
                    <option value="">Seleccionar evento...</option>
                    {eventos.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre} — {new Date(e.fecha + 'T12:00:00').toLocaleDateString('es-CL')}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => setShowNuevoEvento(true)}
                    className="px-3 py-2 rounded-lg text-sm font-semibold text-white"
                    style={{ backgroundColor: '#ff9800' }}>+ Nuevo</button>
                </div>

                <label className="block text-xs font-semibold uppercase mb-2" style={{ color: '#6b7280' }}>Productos</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {todosProductos.map((p) => {
                    const sel = items.find((i) => i.producto.id === p.id);
                    return (
                      <button key={p.id} onClick={() => toggleProducto(p, PRECIOS_EVENTO[1])}
                        className="px-3 py-1.5 rounded-lg border text-xs font-medium"
                        style={{ backgroundColor: sel ? '#ff9800' + '20' : '#1c1c1c', borderColor: sel ? '#ff9800' : '#2a2a2a', color: sel ? '#ff9800' : '#9ca3af' }}>
                        {p.nombre} ({p.stock})
                      </button>
                    );
                  })}
                </div>

                {items.map((item) => (
                  <div key={item.producto.id} className="mb-3 p-3 rounded-lg border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a' }}>
                    <div className="flex justify-between items-center mb-2">
                      <p className="font-semibold text-sm" style={{ color: '#f5f5f5' }}>{item.producto.nombre}</p>
                      <button onClick={() => setItems((prev) => prev.filter((i) => i.producto.id !== item.producto.id))}
                        className="w-7 h-7 rounded flex items-center justify-center"
                        style={{ backgroundColor: '#e53935' + '20', color: '#e53935' }}>🗑</button>
                    </div>
                    <p className="text-xs mb-2" style={{ color: '#6b7280' }}>Precio:</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {PRECIOS_EVENTO.map((precio) => (
                        <button key={precio} onClick={() => setPrecioEvento(item.producto.id, precio)}
                          className="px-3 py-1.5 rounded-lg border text-xs font-bold"
                          style={{
                            backgroundColor: item.precioUnitario === precio ? '#ff9800' : 'transparent',
                            borderColor: item.precioUnitario === precio ? '#ff9800' : '#2a2a2a',
                            color: item.precioUnitario === precio ? 'white' : '#9ca3af',
                          }}>
                          {fmt(precio)}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setItems((prev) => prev.map((i) => i.producto.id === item.producto.id ? { ...i, cantidad: Math.max(1, i.cantidad - 1) } : i))}
                          className="w-8 h-8 rounded-lg border font-bold" style={{ borderColor: '#2a2a2a', color: '#f5f5f5' }}>-</button>
                        <span className="w-8 text-center font-extrabold" style={{ color: '#f5f5f5' }}>{item.cantidad}</span>
                        <button onClick={() => setItems((prev) => prev.map((i) => i.producto.id === item.producto.id ? { ...i, cantidad: i.cantidad + 1 } : i))}
                          className="w-8 h-8 rounded-lg border font-bold" style={{ borderColor: '#2a2a2a', color: '#f5f5f5' }}>+</button>
                      </div>
                      <p className="font-extrabold" style={{ color: '#ff9800' }}>{fmt(item.precioUnitario * item.cantidad)}</p>
                    </div>
                  </div>
                ))}

                {items.length > 0 && (
                  <div className="flex justify-between items-center py-3 mb-3 border-t" style={{ borderColor: '#2a2a2a' }}>
                    <span className="font-bold" style={{ color: '#6b7280' }}>TOTAL</span>
                    <span className="text-2xl font-extrabold" style={{ color: '#ff9800' }}>{fmt(total)}</span>
                  </div>
                )}

                <button onClick={handleGuardarEvento} disabled={saving || !eventoId || items.length === 0}
                  className="w-full py-3 rounded-lg font-bold text-white text-sm disabled:opacity-40"
                  style={{ backgroundColor: '#ff9800' }}>
                  {saving ? 'Guardando...' : '✅ REGISTRAR VENTA'}
                </button>
                {!eventoId && items.length > 0 && (
                  <p className="text-xs text-center mt-2" style={{ color: '#e53935' }}>Selecciona un evento primero</p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal nuevo evento */}
      {showNuevoEvento && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full md:max-w-sm rounded-t-2xl md:rounded-2xl p-6" style={{ backgroundColor: '#1c1c1c' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg" style={{ color: '#f5f5f5' }}>Nuevo Evento</h2>
              <button onClick={() => setShowNuevoEvento(false)} style={{ color: '#6b7280' }}>✕</button>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Nombre</label>
              <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)}
                placeholder="Ej: Feria La Reina..."
                className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Fecha</label>
              <input type="date" value={nuevoFecha} onChange={(e) => setNuevoFecha(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            </div>
            <button onClick={handleCrearEvento} disabled={savingEvento || !nuevoNombre}
              className="w-full py-3 rounded-lg font-bold text-white text-sm disabled:opacity-40"
              style={{ backgroundColor: '#ff9800' }}>
              {savingEvento ? 'Creando...' : 'CREAR EVENTO'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
