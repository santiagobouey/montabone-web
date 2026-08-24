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
// Estados en los que el pedido ya salió de bodega → el stock está descontado
const CONSUMEN_STOCK: string[] = ['entregado', 'pagado'];
const PRECIOS_PRESET = [2940, 3300, 3760, 3990, 4000, 4990, 4995, 5990];
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

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

interface VentaDetalle {
  id: string;
  fecha: string;
  total: number;
  estado: string;
  vendedor: string | null;
  nombre_comprador: string | null;
  observaciones: string | null;
  items: { producto_id: string | null; nombre: string; cantidad: number; precio_unitario: number }[];
}

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [todosProductos, setTodosProductos] = useState<Producto[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [ventasDetalle, setVentasDetalle] = useState<VentaDetalle[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<EstadoPedido | 'todos'>('todos');

  // Filtro inicial desde la URL (?estado=pendiente)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const estado = params.get('estado');
    if (estado && ESTADOS.includes(estado as EstadoPedido)) setFiltro(estado as EstadoPedido);
  }, []);
  const [showModal, setShowModal] = useState(false);
  const [showSelectorMes, setShowSelectorMes] = useState(false);

  const hoyDate = new Date();
  const [mesFiltro, setMesFiltro] = useState(hoyDate.getMonth());
  const [anioFiltro, setAnioFiltro] = useState(hoyDate.getFullYear());
  const inicioMes = `${anioFiltro}-${String(mesFiltro + 1).padStart(2, '0')}-01`;
  const finMes = `${anioFiltro}-${String(mesFiltro + 1).padStart(2, '0')}-${String(new Date(anioFiltro, mesFiltro + 1, 0).getDate()).padStart(2, '0')}`;
  const [saving, setSaving] = useState(false);
  const [tipoModal, setTipoModal] = useState<'pedido' | 'evento' | 'detalle'>('pedido');
  const [editandoPedido, setEditandoPedido] = useState<Pedido | null>(null);
  const [editandoDetalle, setEditandoDetalle] = useState<VentaDetalle | null>(null);
  const [conIva, setConIva] = useState(true);
  const [verVentasDetalle, setVerVentasDetalle] = useState(false);
  const [pedidoAEliminar, setPedidoAEliminar] = useState<Pedido | null>(null);

  // Form pedido
  const [clienteId, setClienteId] = useState('');
  const [vendedor, setVendedor] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [items, setItems] = useState<ItemPedido[]>([]);
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);

  // Form detalle
  const [nombreComprador, setNombreComprador] = useState('');
  const [estadoDetalle, setEstadoDetalle] = useState<string>('pendiente');

  // Form evento
  const [eventoId, setEventoId] = useState('');
  const [showNuevoEvento, setShowNuevoEvento] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoFecha, setNuevoFecha] = useState(new Date().toISOString().split('T')[0]);
  const [savingEvento, setSavingEvento] = useState(false);

  const fetchPedidos = useCallback(async (inicio: string, fin: string) => {
    try {
      const { data } = await supabase
        .from('pedidos')
        .select('*, cliente:clientes(nombre), detalle:detalle_pedido(*, producto:productos(*))')
        .gte('fecha', inicio)
        .lte('fecha', fin)
        .order('fecha', { ascending: false });
      setPedidos(data || []);
    } catch {}
  }, []);

  const fetchEventos = useCallback(async () => {
    const { data } = await supabase.from('eventos').select('id, nombre, fecha').order('fecha', { ascending: false });
    setEventos(data || []);
  }, []);

  const fetchVentasDetalle = useCallback(async (inicio: string, fin: string) => {
    try {
      const { data } = await supabase
        .from('ventas_detalle')
        .select('id, fecha, total, estado, vendedor, nombre_comprador, observaciones, items:items_venta_detalle(cantidad, precio_unitario, producto_id, producto:productos(nombre))')
        .gte('fecha', inicio)
        .lte('fecha', fin)
        .order('fecha', { ascending: false });
      if (data) {
        const mapped: VentaDetalle[] = (data as unknown as Array<{
          id: string; fecha: string; total: number; estado: string; vendedor: string | null; nombre_comprador: string | null; observaciones: string | null;
          items: Array<{ cantidad: number; precio_unitario: number; producto_id: string | null; producto: { nombre: string } | null }>;
        }>).map((v) => ({
          id: v.id,
          fecha: v.fecha,
          total: v.total,
          estado: v.estado,
          vendedor: v.vendedor,
          nombre_comprador: v.nombre_comprador,
          observaciones: v.observaciones,
          items: (v.items || []).map((i) => ({
            producto_id: i.producto_id,
            nombre: i.producto?.nombre ?? '—',
            cantidad: i.cantidad,
            precio_unitario: i.precio_unitario,
          })),
        }));
        setVentasDetalle(mapped);
      }
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([
      fetchPedidos(inicioMes, finMes),
      fetchEventos(),
      fetchVentasDetalle(inicioMes, finMes),
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('productos').select('*').order('nombre'),
    ]).then(([, , , c, p]) => {
      setClientes(c.data || []);
      setTodosProductos(p.data || []);
      setProductos(p.data || []);
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesFiltro, anioFiltro]);

  function abrirNuevo(tipo: 'pedido' | 'evento' | 'detalle') {
    setEditandoPedido(null);
    setEditandoDetalle(null);
    setTipoModal(tipo);
    setItems([]);
    setClienteId(''); setVendedor(''); setObservaciones('');
    setDireccion(''); setTelefono('');
    setFecha(new Date().toISOString().split('T')[0]);
    setEventoId(''); setConIva(true); setNombreComprador(''); setEstadoDetalle('pendiente');
    setShowModal(true);
  }

  function abrirEditarDetalle(v: VentaDetalle) {
    setEditandoDetalle(v);
    setEditandoPedido(null);
    setTipoModal('detalle');
    setFecha(v.fecha);
    setNombreComprador(v.nombre_comprador || '');
    setVendedor(v.vendedor || '');
    setObservaciones(v.observaciones || '');
    setEstadoDetalle(v.estado);
    // Cargar items (buscar el producto completo por id)
    const itemsCargados: ItemPedido[] = (v.items || []).map((it) => {
      const prod = todosProductos.find((p) => p.id === it.producto_id);
      return {
        producto: (prod || { id: it.producto_id, nombre: it.nombre, stock: 0, precio: it.precio_unitario }) as unknown as Producto,
        cantidad: it.cantidad,
        precioUnitario: it.precio_unitario,
      };
    });
    setItems(itemsCargados);
    // Deducir si el total traía IVA (total ≈ neto*1.19)
    const netoCarg = itemsCargados.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0);
    setConIva(Math.abs(v.total - Math.round(netoCarg * 1.19)) <= Math.abs(v.total - netoCarg));
    setShowModal(true);
  }

  function abrirEditar(p: Pedido) {
    setEditandoPedido(p);
    setEditandoDetalle(null);
    setTipoModal('pedido');
    setClienteId(p.cliente_id);
    setVendedor(p.vendedor);
    setDireccion(p.direccion);
    setTelefono(p.telefono);
    setObservaciones(p.observaciones || '');
    setFecha(p.fecha);
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

  function setPrecioItem(productoId: string, precio: number) {
    setItems((prev) => prev.map((i) => i.producto.id === productoId ? { ...i, precioUnitario: precio } : i));
  }

  const neto = items.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0);
  const total = (tipoModal === 'pedido' && conIva) ? Math.round(neto * 1.19) : neto;

  async function handleGuardarPedido() {
    if (!clienteId || items.length === 0 || !vendedor) return;
    setSaving(true);
    try {
      if (editandoPedido) {
        const { error: pe } = await supabase.from('pedidos').update({
          cliente_id: clienteId, fecha, total, direccion, telefono,
          vendedor, observaciones: observaciones || null,
        }).eq('id', editandoPedido.id);
        if (pe) throw new Error(pe.message);

        // Solo se ajusta stock si el pedido ya estaba entregado/pagado (stock ya descontado)
        const yaDescontado = CONSUMEN_STOCK.includes(editandoPedido.estado);

        if (yaDescontado) {
          // Devolver el stock de los productos que tenía antes
          await ajustarStock((editandoPedido.detalle || []).map((d) => {
            const prod = d.producto as unknown as Producto;
            return { id: prod?.id, cantidad: d.cantidad };
          }), +1);
        }

        await supabase.from('detalle_pedido').delete().eq('pedido_id', editandoPedido.id);
        const { error: de } = await supabase.from('detalle_pedido').insert(
          items.map((i) => ({ pedido_id: editandoPedido.id, producto_id: i.producto.id, cantidad: i.cantidad, precio_unitario: i.precioUnitario }))
        );
        if (de) throw new Error(de.message);

        if (yaDescontado) {
          // Descontar el stock de los productos nuevos
          await ajustarStock(items.map((i) => ({ id: i.producto.id, cantidad: i.cantidad })), -1);
        }
      } else {
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

        // El stock NO se descuenta al crear: baja cuando el pedido pasa a "entregado".

        // Email nuevo pedido
        const clienteData = clientes.find((c) => c.id === clienteId);
        await enviarEmail('nuevo_pedido', {
          cliente: clienteData?.nombre ?? '—',
          rut: clienteData?.rut ?? null,
          razon_social: clienteData?.razon_social ?? null,
          telefono: clienteData?.telefono ?? null,
          vendedor,
          fecha,
          total,
          direccion,
          productos: items.map((i) => ({
            nombre: i.producto.nombre,
            cantidad: i.cantidad,
            subtotal: i.precioUnitario * i.cantidad,
          })),
        });
      }

      setShowModal(false);
      await fetchPedidos(inicioMes, finMes);
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
      for (const item of items) {
        const { error } = await supabase.from('ventas_evento').insert({
          evento_id: eventoId,
          producto_id: item.producto.id,
          cantidad: item.cantidad,
          precio_unitario: item.precioUnitario,
          total: item.precioUnitario * item.cantidad,
        });
        if (error) throw new Error(`Error guardando ${item.producto.nombre}: ${error.message} (code: ${error.code})`);
      }
      // Descontar leyendo el stock actual de la base (no el cacheado)
      await ajustarStock(items.map((i) => ({ id: i.producto.id, cantidad: i.cantidad })), -1);

      setItems([]);
      setShowModal(false);
      await fetchVentasDetalle(inicioMes, finMes);
      const { data: p } = await supabase.from('productos').select('*').order('nombre');
      if (p) { setTodosProductos(p); setProductos(p); }
      alert('✅ Venta registrada correctamente');
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
    setSaving(false);
  }

  async function handleGuardarDetalle() {
    if (items.length === 0) return;
    setSaving(true);
    try {
      const totalVenta = conIva ? Math.round(neto * 1.19) : neto;

      if (editandoDetalle) {
        // Si la venta estaba entregada/pagada, devolver el stock de los items anteriores
        if (CONSUMEN_STOCK.includes(editandoDetalle.estado)) {
          await ajustarStock((editandoDetalle.items || []).map((it) => ({ id: it.producto_id ?? undefined, cantidad: it.cantidad })), +1);
        }
        const { error: ue } = await supabase.from('ventas_detalle').update({
          fecha, total: totalVenta, estado: estadoDetalle,
          vendedor: vendedor || null, nombre_comprador: nombreComprador || null,
          observaciones: observaciones || null,
        }).eq('id', editandoDetalle.id);
        if (ue) throw new Error(ue.message);

        await supabase.from('items_venta_detalle').delete().eq('venta_id', editandoDetalle.id);
        const { error: ie } = await supabase.from('items_venta_detalle').insert(
          items.map((i) => ({ venta_id: editandoDetalle.id, producto_id: i.producto.id, cantidad: i.cantidad, precio_unitario: i.precioUnitario }))
        );
        if (ie) throw new Error(ie.message);

        // Descontar stock de los items nuevos si el estado consume
        if (CONSUMEN_STOCK.includes(estadoDetalle)) {
          await ajustarStock(items.map((i) => ({ id: i.producto.id, cantidad: i.cantidad })), -1);
        }
      } else {
        const { data: venta, error: ve } = await supabase
          .from('ventas_detalle')
          .insert({
            fecha,
            total: totalVenta,
            estado: estadoDetalle,
            vendedor: vendedor || null,
            nombre_comprador: nombreComprador || null,
            observaciones: observaciones || null,
          })
          .select('id')
          .single();
        if (ve) throw new Error(ve.message);
        if (!venta) throw new Error('No se creó la venta');

        const { error: ie } = await supabase.from('items_venta_detalle').insert(
          items.map((i) => ({
            venta_id: venta.id,
            producto_id: i.producto.id,
            cantidad: i.cantidad,
            precio_unitario: i.precioUnitario,
          }))
        );
        if (ie) throw new Error(ie.message);

        // El stock solo baja si la venta se registra ya como entregada/pagada
        if (CONSUMEN_STOCK.includes(estadoDetalle)) {
          await ajustarStock(items.map((i) => ({ id: i.producto.id, cantidad: i.cantidad })), -1);
        }
      }

      setItems([]);
      setEditandoDetalle(null);
      setShowModal(false);
      await fetchVentasDetalle(inicioMes, finMes);
      const { data: p } = await supabase.from('productos').select('*').order('nombre');
      if (p) { setTodosProductos(p); setProductos(p); }
      alert(editandoDetalle ? '✅ Venta al detalle actualizada' : '✅ Venta al detalle registrada');
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

  async function enviarEmail(tipo: string, pedidoData: object) {
    try {
      await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, pedido: pedidoData }),
      });
    } catch {}
  }

  // Descuenta (signo -1) o devuelve (signo +1) stock leyendo el valor actual de cada producto
  async function ajustarStock(movimientos: { id?: string; cantidad: number }[], signo: number) {
    for (const m of movimientos) {
      if (!m.id) continue;
      const { data } = await supabase.from('productos').select('stock').eq('id', m.id).single();
      const actual = data?.stock ?? 0;
      const nuevo = signo < 0 ? Math.max(0, actual - m.cantidad) : actual + m.cantidad;
      await supabase.from('productos').update({ stock: nuevo }).eq('id', m.id);
    }
  }

  async function cambiarEstado(id: string, estado: EstadoPedido) {
    const p = pedidos.find((x) => x.id === id);

    // Ajustar stock según entra o sale de un estado que consume stock (entregado/pagado)
    if (p) {
      const eraConsumido = CONSUMEN_STOCK.includes(p.estado);
      const seraConsumido = CONSUMEN_STOCK.includes(estado);
      const movimientos = (p.detalle || []).map((d) => {
        const prod = d.producto as unknown as Producto;
        return { id: prod?.id, cantidad: d.cantidad };
      });
      if (!eraConsumido && seraConsumido) {
        await ajustarStock(movimientos, -1); // pasa a entregado → baja stock
      } else if (eraConsumido && !seraConsumido) {
        await ajustarStock(movimientos, +1); // vuelve atrás → devuelve stock
      }
    }

    await supabase.from('pedidos').update({ estado }).eq('id', id);
    if (estado === 'pagado' && p) {
      await enviarEmail('pedido_pagado', {
        cliente: p.cliente?.nombre ?? '—',
        vendedor: p.vendedor,
        fecha: p.fecha,
        total: p.total,
      });
    }
    await fetchPedidos(inicioMes, finMes);
    const { data: prods } = await supabase.from('productos').select('*').order('nombre');
    if (prods) { setTodosProductos(prods); setProductos(prods); }
  }

  async function cambiarEstadoDetalle(id: string, estado: string) {
    const v = ventasDetalle.find((x) => x.id === id);
    if (v) {
      const eraConsumido = CONSUMEN_STOCK.includes(v.estado);
      const seraConsumido = CONSUMEN_STOCK.includes(estado);
      const movimientos = (v.items || []).map((i) => ({ id: i.producto_id ?? undefined, cantidad: i.cantidad }));
      if (!eraConsumido && seraConsumido) {
        await ajustarStock(movimientos, -1); // pasa a entregado → baja stock
      } else if (eraConsumido && !seraConsumido) {
        await ajustarStock(movimientos, +1); // vuelve atrás → devuelve stock
      }
    }
    await supabase.from('ventas_detalle').update({ estado }).eq('id', id);
    await fetchVentasDetalle(inicioMes, finMes);
    const { data: prods } = await supabase.from('productos').select('*').order('nombre');
    if (prods) { setTodosProductos(prods); setProductos(prods); }
  }

  async function eliminarPedido(p: Pedido) {
    // Solo devolver stock si el pedido ya lo había descontado (entregado/pagado)
    if (CONSUMEN_STOCK.includes(p.estado)) {
      await ajustarStock((p.detalle || []).map((d) => {
        const prod = d.producto as unknown as Producto;
        return { id: prod?.id, cantidad: d.cantidad };
      }), +1);
    }
    await supabase.from('detalle_pedido').delete().eq('pedido_id', p.id);
    await supabase.from('pedidos').delete().eq('id', p.id);
    setPedidoAEliminar(null);
    await fetchPedidos(inicioMes, finMes);
    const { data: prods } = await supabase.from('productos').select('*').order('nombre');
    if (prods) { setTodosProductos(prods); setProductos(prods); }
  }

  // Orden por estado: pendiente → preparado → entregado → pagado
  const ORDEN_ESTADO: Record<string, number> = { pendiente: 0, preparado: 1, entregado: 2, pagado: 3 };
  const pedidosFiltrados = (filtro === 'todos' ? pedidos : pedidos.filter((p) => p.estado === filtro))
    .slice()
    .sort((a, b) => (ORDEN_ESTADO[a.estado] ?? 9) - (ORDEN_ESTADO[b.estado] ?? 9) || b.fecha.localeCompare(a.fecha));
  const ventasDetalleOrdenadas = ventasDetalle
    .slice()
    .sort((a, b) => (ORDEN_ESTADO[a.estado] ?? 9) - (ORDEN_ESTADO[b.estado] ?? 9) || b.fecha.localeCompare(a.fecha));


  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Ventas</h1>
          <p className="text-sm" style={{ color: '#6b7280' }}>{pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''} en {MESES[mesFiltro]}</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={() => abrirNuevo('detalle')} className="px-3 py-2 rounded-lg font-semibold text-sm text-white" style={{ backgroundColor: '#9c27b0' }}>
            🛒 Detalle
          </button>
          <button onClick={() => abrirNuevo('evento')} className="px-3 py-2 rounded-lg font-semibold text-sm text-white" style={{ backgroundColor: '#ff9800' }}>
            🎪 Evento
          </button>
          <button onClick={() => abrirNuevo('pedido')} className="px-3 py-2 rounded-lg font-semibold text-sm text-white" style={{ backgroundColor: '#e53935' }}>
            + Pedido
          </button>
        </div>
      </div>

      {/* Selector de mes */}
      <div className="mb-4">
        <button onClick={() => setShowSelectorMes(!showSelectorMes)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold"
          style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', color: '#f5f5f5' }}>
          📅 {MESES[mesFiltro]} {anioFiltro}
          <span style={{ color: '#6b7280' }}>{showSelectorMes ? '▲' : '▼'}</span>
        </button>

        {showSelectorMes && (
          <div className="mt-2 rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
            {/* Año */}
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setAnioFiltro((a) => a - 1)}
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold"
                style={{ backgroundColor: '#1c1c1c', color: '#f5f5f5' }}>‹</button>
              <p className="font-bold text-sm" style={{ color: '#6b7280' }}>{anioFiltro}</p>
              <button onClick={() => setAnioFiltro((a) => a + 1)} disabled={anioFiltro >= hoyDate.getFullYear()}
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold disabled:opacity-30"
                style={{ backgroundColor: '#1c1c1c', color: '#f5f5f5' }}>›</button>
            </div>
            {/* Meses */}
            <div className="grid grid-cols-4 gap-2">
              {MESES.map((nombre, i) => {
                const esFuturo = anioFiltro === hoyDate.getFullYear() && i > hoyDate.getMonth();
                const activo = i === mesFiltro && anioFiltro === anioFiltro;
                return (
                  <button key={i} onClick={() => { if (!esFuturo) { setMesFiltro(i); setShowSelectorMes(false); } }} disabled={esFuturo}
                    className="py-2 rounded-lg text-xs font-bold disabled:opacity-30"
                    style={{ backgroundColor: activo ? '#e53935' : '#1c1c1c', color: activo ? 'white' : '#9ca3af' }}>
                    {nombre.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Ventas al detalle - resumen */}
      {ventasDetalle.length > 0 && (
        <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#9c27b0' + '40', borderLeftWidth: 4, borderLeftColor: '#9c27b0' }}>
          <button
            onClick={() => setVerVentasDetalle(!verVentasDetalle)}
            className="w-full px-4 py-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#9c27b0' }}>🛒 Ventas al Detalle</p>
            </div>
            <span style={{ color: '#6b7280' }}>{verVentasDetalle ? '▲' : '▼'}</span>
          </button>

          {verVentasDetalle && (
            <div className="border-t" style={{ borderColor: '#2a2a2a' }}>
              {ventasDetalleOrdenadas.map((v, idx) => (
                <div key={v.id} className="px-4 py-3"
                  style={{ borderBottom: idx < ventasDetalle.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>
                        {v.nombre_comprador || new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-CL')}
                        {v.vendedor ? ` · ${v.vendedor}` : ''}
                      </p>
                      <p className="text-xs" style={{ color: '#6b7280' }}>
                        {new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-CL')}
                      </p>
                      {v.observaciones && (
                        <p className="text-xs" style={{ color: '#6b7280' }}>{v.observaciones}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <p className="font-extrabold text-sm" style={{ color: '#9c27b0' }}>{fmt(v.total)}</p>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full border"
                        style={{
                          color: ESTADO_COLORS[v.estado] || '#6b7280',
                          backgroundColor: (ESTADO_COLORS[v.estado] || '#6b7280') + '20',
                          borderColor: (ESTADO_COLORS[v.estado] || '#6b7280') + '40',
                        }}>
                        {v.estado.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  {v.items.map((item, i) => (
                    <p key={i} className="text-xs" style={{ color: '#6b7280' }}>
                      {item.nombre} — {item.cantidad} u. · {fmt(item.precio_unitario)} c/u
                    </p>
                  ))}
                  <div className="flex gap-2 mt-2 flex-wrap items-center">
                    <button onClick={() => abrirEditarDetalle(v)}
                      className="text-xs px-2 py-1 rounded border"
                      style={{ borderColor: '#2a2a2a', color: '#9ca3af', backgroundColor: '#1c1c1c' }}>
                      ✏️ Editar
                    </button>
                    {ESTADOS.filter((e) => e !== v.estado).map((e) => (
                      <button key={e} onClick={() => cambiarEstadoDetalle(v.id, e)}
                        className="text-xs px-2 py-1 rounded border"
                        style={{ borderColor: ESTADO_COLORS[e] + '60', color: ESTADO_COLORS[e], backgroundColor: ESTADO_COLORS[e] + '10' }}>
                        → {e}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filtros pedidos */}
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

      {/* Lista pedidos */}
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
                  <button onClick={() => setPedidoAEliminar(p)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center border text-base"
                    style={{ borderColor: '#e5393520', backgroundColor: '#e5393510' }}>
                    🗑️
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

      {/* Modal principal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 overflow-y-auto max-h-[90vh]" style={{ backgroundColor: '#141414' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg" style={{ color: '#f5f5f5' }}>
                {editandoPedido ? '✏️ Editar Pedido' : editandoDetalle ? '✏️ Editar Venta al Detalle' : tipoModal === 'pedido' ? 'Nuevo Pedido' : tipoModal === 'evento' ? '🎪 Venta en Evento' : '🛒 Venta al Detalle'}
              </h2>
              <button onClick={() => { setShowModal(false); setEditandoDetalle(null); }} style={{ color: '#6b7280' }}>✕</button>
            </div>

            {/* Toggle tipo (solo en nuevo) */}
            {!editandoPedido && !editandoDetalle && (
              <div className="flex gap-2 mb-4">
                {(['pedido', 'evento', 'detalle'] as const).map((t) => {
                  const colors: Record<string, string> = { pedido: '#e53935', evento: '#ff9800', detalle: '#9c27b0' };
                  const labels: Record<string, string> = { pedido: '📦 Pedido', evento: '🎪 Evento', detalle: '🛒 Detalle' };
                  return (
                    <button key={t} onClick={() => { setTipoModal(t); setItems([]); }}
                      className="flex-1 py-2 rounded-lg border text-xs font-semibold"
                      style={{
                        backgroundColor: tipoModal === t ? colors[t] : 'transparent',
                        borderColor: tipoModal === t ? colors[t] : '#2a2a2a',
                        color: tipoModal === t ? 'white' : '#6b7280',
                      }}>
                      {labels[t]}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ===== FORM PEDIDO ===== */}
            {(tipoModal === 'pedido' || editandoPedido) && (
              <>
                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Cliente</label>
                <select value={clienteId} onChange={(e) => selectCliente(e.target.value)} className="w-full rounded-lg px-3 py-2 mb-1 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }}>
                  <option value="">Seleccionar cliente...</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.rut ? ` — ${c.rut}` : ''}</option>)}
                </select>
                {(() => {
                  const c = clientes.find((x) => x.id === clienteId);
                  if (!c) return <div className="mb-3" />;
                  return (
                    <p className="text-xs mb-3" style={{ color: '#6b7280' }}>
                      {c.razon_social ? `${c.razon_social} · ` : ''}RUT: <span style={{ color: c.rut ? '#f5f5f5' : '#e53935' }}>{c.rut || 'sin RUT'}</span>
                    </p>
                  );
                })()}

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
                      {PRECIOS_PRESET.map((precio) => (
                        <button key={precio} onClick={() => setPrecioItem(item.producto.id, precio)}
                          className="px-3 py-1.5 rounded-lg border text-xs font-bold"
                          style={{
                            backgroundColor: item.precioUnitario === precio ? '#e53935' : 'transparent',
                            borderColor: item.precioUnitario === precio ? '#e53935' : '#2a2a2a',
                            color: item.precioUnitario === precio ? 'white' : '#9ca3af',
                          }}>
                          {fmt(precio)}
                        </button>
                      ))}
                      <input type="number" inputMode="numeric"
                        value={PRECIOS_PRESET.includes(item.precioUnitario) ? '' : (item.precioUnitario || '')}
                        onChange={(e) => setPrecioItem(item.producto.id, parseInt(e.target.value) || 0)}
                        placeholder="Otro $"
                        className="w-24 px-3 py-1.5 rounded-lg border text-xs font-bold"
                        style={{
                          backgroundColor: (!PRECIOS_PRESET.includes(item.precioUnitario) && item.precioUnitario > 0) ? '#e53935' : 'transparent',
                          borderColor: (!PRECIOS_PRESET.includes(item.precioUnitario) && item.precioUnitario > 0) ? '#e53935' : '#2a2a2a',
                          color: (!PRECIOS_PRESET.includes(item.precioUnitario) && item.precioUnitario > 0) ? 'white' : '#f5f5f5',
                        }} />
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

                <button onClick={() => setConIva(!conIva)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border mb-3"
                  style={{ backgroundColor: conIva ? '#2196f3' + '10' : '#1c1c1c', borderColor: conIva ? '#2196f3' : '#2a2a2a' }}>
                  <span className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>Incluir IVA 19%</span>
                  <div className="w-10 h-5 rounded-full flex items-center px-0.5" style={{ backgroundColor: conIva ? '#2196f3' : '#2a2a2a' }}>
                    <div className="w-4 h-4 rounded-full bg-white transition-transform" style={{ transform: conIva ? 'translateX(20px)' : 'translateX(0)' }} />
                  </div>
                </button>

                {items.length > 0 && (
                  <div className="mb-3 p-3 rounded-lg" style={{ backgroundColor: '#1c1c1c' }}>
                    <div className="flex justify-between text-sm mb-1"><span style={{ color: '#6b7280' }}>Neto</span><span style={{ color: '#f5f5f5' }}>{fmt(neto)}</span></div>
                    {conIva && <div className="flex justify-between text-sm mb-1"><span style={{ color: '#6b7280' }}>IVA 19%</span><span style={{ color: '#f5f5f5' }}>{fmt(total - neto)}</span></div>}
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

            {/* ===== FORM EVENTO ===== */}
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
                      <button key={p.id} onClick={() => toggleProducto(p, PRECIOS_PRESET[1])}
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
                      {PRECIOS_PRESET.map((precio) => (
                        <button key={precio} onClick={() => setPrecioItem(item.producto.id, precio)}
                          className="px-3 py-1.5 rounded-lg border text-xs font-bold"
                          style={{
                            backgroundColor: item.precioUnitario === precio ? '#ff9800' : 'transparent',
                            borderColor: item.precioUnitario === precio ? '#ff9800' : '#2a2a2a',
                            color: item.precioUnitario === precio ? 'white' : '#9ca3af',
                          }}>
                          {fmt(precio)}
                        </button>
                      ))}
                      <input type="number" inputMode="numeric"
                        value={PRECIOS_PRESET.includes(item.precioUnitario) ? '' : (item.precioUnitario || '')}
                        onChange={(e) => setPrecioItem(item.producto.id, parseInt(e.target.value) || 0)}
                        placeholder="Otro $"
                        className="w-24 px-3 py-1.5 rounded-lg border text-xs font-bold"
                        style={{
                          backgroundColor: (!PRECIOS_PRESET.includes(item.precioUnitario) && item.precioUnitario > 0) ? '#ff9800' : 'transparent',
                          borderColor: (!PRECIOS_PRESET.includes(item.precioUnitario) && item.precioUnitario > 0) ? '#ff9800' : '#2a2a2a',
                          color: (!PRECIOS_PRESET.includes(item.precioUnitario) && item.precioUnitario > 0) ? 'white' : '#f5f5f5',
                        }} />
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
                    <span className="text-2xl font-extrabold" style={{ color: '#ff9800' }}>{fmt(neto)}</span>
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

            {/* ===== FORM DETALLE ===== */}
            {tipoModal === 'detalle' && !editandoPedido && (
              <>
                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Fecha</label>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full rounded-lg px-3 py-2 mb-3 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Nombre del comprador (opcional)</label>
                <input value={nombreComprador} onChange={(e) => setNombreComprador(e.target.value)}
                  placeholder="Ej: María González..."
                  className="w-full rounded-lg px-3 py-2 mb-3 text-sm border"
                  style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Vendedor (opcional)</label>
                <div className="flex gap-2 mb-3">
                  {['Santiago', 'Hernán'].map((v) => (
                    <button key={v} onClick={() => setVendedor(vendedor === v ? '' : v)} className="flex-1 py-2 rounded-lg border text-sm font-semibold"
                      style={{ backgroundColor: vendedor === v ? '#9c27b0' : 'transparent', borderColor: vendedor === v ? '#9c27b0' : '#2a2a2a', color: vendedor === v ? 'white' : '#6b7280' }}>
                      {v}
                    </button>
                  ))}
                </div>

                <label className="block text-xs font-semibold uppercase mb-2" style={{ color: '#6b7280' }}>Productos</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {todosProductos.map((p) => {
                    const sel = items.find((i) => i.producto.id === p.id);
                    return (
                      <button key={p.id} onClick={() => toggleProducto(p, PRECIOS_PRESET[1])}
                        className="px-3 py-1.5 rounded-lg border text-xs font-medium"
                        style={{ backgroundColor: sel ? '#9c27b0' + '20' : '#1c1c1c', borderColor: sel ? '#9c27b0' : '#2a2a2a', color: sel ? '#9c27b0' : '#9ca3af' }}>
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
                      {PRECIOS_PRESET.map((precio) => (
                        <button key={precio} onClick={() => setPrecioItem(item.producto.id, precio)}
                          className="px-3 py-1.5 rounded-lg border text-xs font-bold"
                          style={{
                            backgroundColor: item.precioUnitario === precio ? '#9c27b0' : 'transparent',
                            borderColor: item.precioUnitario === precio ? '#9c27b0' : '#2a2a2a',
                            color: item.precioUnitario === precio ? 'white' : '#9ca3af',
                          }}>
                          {fmt(precio)}
                        </button>
                      ))}
                      <input type="number" inputMode="numeric"
                        value={PRECIOS_PRESET.includes(item.precioUnitario) ? '' : (item.precioUnitario || '')}
                        onChange={(e) => setPrecioItem(item.producto.id, parseInt(e.target.value) || 0)}
                        placeholder="Otro $"
                        className="w-24 px-3 py-1.5 rounded-lg border text-xs font-bold"
                        style={{
                          backgroundColor: (!PRECIOS_PRESET.includes(item.precioUnitario) && item.precioUnitario > 0) ? '#9c27b0' : 'transparent',
                          borderColor: (!PRECIOS_PRESET.includes(item.precioUnitario) && item.precioUnitario > 0) ? '#9c27b0' : '#2a2a2a',
                          color: (!PRECIOS_PRESET.includes(item.precioUnitario) && item.precioUnitario > 0) ? 'white' : '#f5f5f5',
                        }} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setItems((prev) => prev.map((i) => i.producto.id === item.producto.id ? { ...i, cantidad: Math.max(1, i.cantidad - 1) } : i))}
                          className="w-8 h-8 rounded-lg border font-bold" style={{ borderColor: '#2a2a2a', color: '#f5f5f5' }}>-</button>
                        <span className="w-8 text-center font-extrabold" style={{ color: '#f5f5f5' }}>{item.cantidad}</span>
                        <button onClick={() => setItems((prev) => prev.map((i) => i.producto.id === item.producto.id ? { ...i, cantidad: i.cantidad + 1 } : i))}
                          className="w-8 h-8 rounded-lg border font-bold" style={{ borderColor: '#2a2a2a', color: '#f5f5f5' }}>+</button>
                      </div>
                      <p className="font-extrabold" style={{ color: '#9c27b0' }}>{fmt(item.precioUnitario * item.cantidad)}</p>
                    </div>
                  </div>
                ))}

                <button onClick={() => setConIva(!conIva)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border mb-3"
                  style={{ backgroundColor: conIva ? '#9c27b0' + '10' : '#1c1c1c', borderColor: conIva ? '#9c27b0' : '#2a2a2a' }}>
                  <span className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>Incluir IVA 19%</span>
                  <div className="w-10 h-5 rounded-full flex items-center px-0.5" style={{ backgroundColor: conIva ? '#9c27b0' : '#2a2a2a' }}>
                    <div className="w-4 h-4 rounded-full bg-white transition-transform" style={{ transform: conIva ? 'translateX(20px)' : 'translateX(0)' }} />
                  </div>
                </button>

                {items.length > 0 && (
                  <div className="mb-3 p-3 rounded-lg" style={{ backgroundColor: '#1c1c1c' }}>
                    <div className="flex justify-between text-sm mb-1"><span style={{ color: '#6b7280' }}>Neto</span><span style={{ color: '#f5f5f5' }}>{fmt(neto)}</span></div>
                    {conIva && <div className="flex justify-between text-sm mb-1"><span style={{ color: '#6b7280' }}>IVA 19%</span><span style={{ color: '#f5f5f5' }}>{fmt(Math.round(neto * 1.19) - neto)}</span></div>}
                    <div className="flex justify-between font-bold"><span style={{ color: '#6b7280' }}>TOTAL</span><span className="text-xl" style={{ color: '#9c27b0' }}>{fmt(conIva ? Math.round(neto * 1.19) : neto)}</span></div>
                  </div>
                )}

                <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Observaciones..." rows={2}
                  className="w-full rounded-lg px-3 py-2 mb-3 text-sm border resize-none" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

                <label className="block text-xs font-semibold uppercase mb-2" style={{ color: '#6b7280' }}>Estado</label>
                <div className="flex gap-2 mb-4 flex-wrap">
                  {ESTADOS.map((e) => (
                    <button key={e} onClick={() => setEstadoDetalle(e)}
                      className="flex-1 py-2 rounded-lg border text-xs font-semibold"
                      style={{
                        backgroundColor: estadoDetalle === e ? ESTADO_COLORS[e] : 'transparent',
                        borderColor: estadoDetalle === e ? ESTADO_COLORS[e] : '#2a2a2a',
                        color: estadoDetalle === e ? 'white' : '#6b7280',
                      }}>
                      {e.charAt(0).toUpperCase() + e.slice(1)}
                    </button>
                  ))}
                </div>

                <button onClick={handleGuardarDetalle} disabled={saving || items.length === 0}
                  className="w-full py-3 rounded-lg font-bold text-white text-sm disabled:opacity-40"
                  style={{ backgroundColor: '#9c27b0' }}>
                  {saving ? 'Guardando...' : editandoDetalle ? '✅ GUARDAR CAMBIOS' : '✅ REGISTRAR VENTA AL DETALLE'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal confirmar eliminación */}
      {pedidoAEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: '#141414' }}>
            <p className="text-lg font-bold mb-1" style={{ color: '#f5f5f5' }}>¿Eliminar pedido?</p>
            <p className="text-sm mb-1" style={{ color: '#6b7280' }}>
              Cliente: <strong style={{ color: '#f5f5f5' }}>{pedidoAEliminar.cliente?.nombre ?? '—'}</strong>
            </p>
            <p className="text-sm mb-4" style={{ color: '#6b7280' }}>
              Total: <strong style={{ color: '#f5f5f5' }}>{fmt(pedidoAEliminar.total)}</strong>
            </p>
            <p className="text-xs mb-4 p-3 rounded-lg" style={{ backgroundColor: '#e5393515', color: '#e53935' }}>
              ⚠️ Esta acción no se puede deshacer.{CONSUMEN_STOCK.includes(pedidoAEliminar.estado) ? ' El stock será devuelto automáticamente.' : ''}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setPedidoAEliminar(null)}
                className="flex-1 py-3 rounded-lg font-bold text-sm border"
                style={{ borderColor: '#2a2a2a', color: '#6b7280' }}>
                Cancelar
              </button>
              <button onClick={() => eliminarPedido(pedidoAEliminar)}
                className="flex-1 py-3 rounded-lg font-bold text-sm text-white"
                style={{ backgroundColor: '#e53935' }}>
                Eliminar
              </button>
            </div>
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
