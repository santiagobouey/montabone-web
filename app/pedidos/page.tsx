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

interface ItemPedido {
  producto: Producto;
  cantidad: number;
  precioUnitario: number;
}

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<EstadoPedido | 'todos'>('todos');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form
  const [clienteId, setClienteId] = useState('');
  const [vendedor, setVendedor] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [items, setItems] = useState<ItemPedido[]>([]);
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);

  const fetchPedidos = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('pedidos')
        .select('*, cliente:clientes(nombre), detalle:detalle_pedido(*, producto:productos(nombre))')
        .order('fecha', { ascending: false });
      setPedidos(data || []);
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([
      fetchPedidos(),
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('productos').select('*').gt('stock', 0).order('nombre'),
    ]).then(([, c, p]) => {
      setClientes(c.data || []);
      setProductos(p.data || []);
    }).finally(() => setLoading(false));
  }, [fetchPedidos]);

  function selectCliente(id: string) {
    const c = clientes.find((cl) => cl.id === id);
    setClienteId(id);
    if (c) { setTelefono(c.telefono); setDireccion(c.direccion); }
  }

  function toggleProducto(p: Producto) {
    const exists = items.find((i) => i.producto.id === p.id);
    if (exists) setItems((prev) => prev.filter((i) => i.producto.id !== p.id));
    else setItems((prev) => [...prev, { producto: p, cantidad: 1, precioUnitario: p.precio }]);
  }

  const neto = items.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0);
  const total = Math.round(neto * 1.19);

  async function handleGuardar() {
    if (!clienteId || items.length === 0 || !vendedor) return;
    setSaving(true);
    try {
      const { data: pedido } = await supabase.from('pedidos').insert({
        cliente_id: clienteId, fecha, total, direccion, telefono,
        estado: 'pendiente', vendedor, observaciones: observaciones || null,
      }).select().single();
      if (!pedido) throw new Error('No pedido');
      await supabase.from('detalle_pedido').insert(
        items.map((i) => ({ pedido_id: pedido.id, producto_id: i.producto.id, cantidad: i.cantidad, precio_unitario: i.precioUnitario }))
      );
      for (const item of items) {
        await supabase.from('productos').update({ stock: Math.max(0, item.producto.stock - item.cantidad) }).eq('id', item.producto.id);
      }
      setShowModal(false);
      setClienteId(''); setVendedor(''); setItems([]); setObservaciones('');
      await fetchPedidos();
    } catch {}
    setSaving(false);
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
        <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-lg font-semibold text-sm text-white" style={{ backgroundColor: '#e53935' }}>
          + Nuevo
        </button>
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
                <span className="text-xs font-bold px-2 py-1 rounded-full border" style={{ color, backgroundColor: color + '20', borderColor: color + '40' }}>
                  {p.estado.toUpperCase()}
                </span>
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

      {/* Modal nuevo pedido */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 overflow-y-auto max-h-[90vh]" style={{ backgroundColor: '#141414' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg" style={{ color: '#f5f5f5' }}>Nuevo Pedido</h2>
              <button onClick={() => setShowModal(false)} style={{ color: '#6b7280' }}>✕</button>
            </div>

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
                <button key={v} onClick={() => setVendedor(v)} className="flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors"
                  style={{ backgroundColor: vendedor === v ? '#e53935' : 'transparent', borderColor: vendedor === v ? '#e53935' : '#2a2a2a', color: vendedor === v ? 'white' : '#6b7280' }}>
                  {v}
                </button>
              ))}
            </div>

            <label className="block text-xs font-semibold uppercase mb-2" style={{ color: '#6b7280' }}>Productos</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {productos.map((p) => {
                const sel = items.find((i) => i.producto.id === p.id);
                return (
                  <button key={p.id} onClick={() => toggleProducto(p)}
                    className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors"
                    style={{ backgroundColor: sel ? '#e53935' + '20' : '#1c1c1c', borderColor: sel ? '#e53935' : '#2a2a2a', color: sel ? '#e53935' : '#9ca3af' }}>
                    {p.nombre} ({p.stock})
                  </button>
                );
              })}
            </div>

            {items.map((item) => (
              <div key={item.producto.id} className="flex items-center gap-2 mb-2 p-2 rounded-lg" style={{ backgroundColor: '#1c1c1c' }}>
                <span className="flex-1 text-sm" style={{ color: '#f5f5f5' }}>{item.producto.nombre}</span>
                <input type="number" value={item.precioUnitario} onChange={(e) => setItems((prev) => prev.map((i) => i.producto.id === item.producto.id ? { ...i, precioUnitario: Number(e.target.value) } : i))}
                  className="w-24 rounded px-2 py-1 text-sm border text-center" style={{ backgroundColor: '#0a0a0a', borderColor: '#2a2a2a', color: '#e53935' }} />
                <div className="flex items-center gap-1">
                  <button onClick={() => setItems((prev) => prev.map((i) => i.producto.id === item.producto.id ? { ...i, cantidad: Math.max(1, i.cantidad - 1) } : i))} className="w-6 h-6 rounded border text-sm" style={{ borderColor: '#2a2a2a', color: '#f5f5f5' }}>-</button>
                  <span className="w-8 text-center text-sm font-bold" style={{ color: '#f5f5f5' }}>{item.cantidad}</span>
                  <button onClick={() => setItems((prev) => prev.map((i) => i.producto.id === item.producto.id ? { ...i, cantidad: i.cantidad + 1 } : i))} className="w-6 h-6 rounded border text-sm" style={{ borderColor: '#2a2a2a', color: '#f5f5f5' }}>+</button>
                </div>
                <span className="text-sm font-bold w-16 text-right" style={{ color: '#f5f5f5' }}>{fmt(item.precioUnitario * item.cantidad)}</span>
                <button onClick={() => setItems((prev) => prev.filter((i) => i.producto.id !== item.producto.id))}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
                  style={{ backgroundColor: '#e53935' + '20', color: '#e53935' }}>🗑</button>
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

            <button onClick={handleGuardar} disabled={saving || !clienteId || items.length === 0 || !vendedor}
              className="w-full py-3 rounded-lg font-bold text-white text-sm transition-opacity disabled:opacity-40"
              style={{ backgroundColor: '#e53935' }}>
              {saving ? 'Guardando...' : 'CONFIRMAR PEDIDO'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
