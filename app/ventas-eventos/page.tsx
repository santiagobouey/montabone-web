'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Producto } from '@/types';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const PRECIOS = [3990, 4990, 4995, 5990];

interface Evento {
  id: string;
  nombre: string;
  fecha: string;
}

interface ItemVenta {
  producto: Producto;
  cantidad: number;
  precio: number;
}

interface VentaGuardada {
  id: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
  producto: { nombre: string } | null;
}

export default function VentasEventosPage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [eventoId, setEventoId] = useState('');
  const [items, setItems] = useState<ItemVenta[]>([]);
  const [ventasGuardadas, setVentasGuardadas] = useState<VentaGuardada[]>([]);

  // Modal nuevo evento
  const [showNuevoEvento, setShowNuevoEvento] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoFecha, setNuevoFecha] = useState(new Date().toISOString().split('T')[0]);
  const [savingEvento, setSavingEvento] = useState(false);

  const fetchEventos = useCallback(async () => {
    const { data } = await supabase.from('eventos').select('id, nombre, fecha').order('fecha', { ascending: false });
    setEventos(data || []);
  }, []);

  const fetchVentas = useCallback(async (eId: string) => {
    if (!eId) { setVentasGuardadas([]); return; }
    const { data } = await supabase
      .from('ventas_evento')
      .select('id, cantidad, precio_unitario, total, producto:productos(nombre)')
      .eq('evento_id', eId)
      .order('created_at', { ascending: false });
    setVentasGuardadas((data || []) as unknown as VentaGuardada[]);
  }, []);

  useEffect(() => {
    Promise.all([
      fetchEventos(),
      supabase.from('productos').select('*').order('nombre'),
    ]).then(([, p]) => {
      setProductos(p.data || []);
    }).finally(() => setLoading(false));
  }, [fetchEventos]);

  useEffect(() => { fetchVentas(eventoId); }, [eventoId, fetchVentas]);

  function setPrecio(productoId: string, precio: number) {
    const existe = items.find((i) => i.producto.id === productoId);
    if (existe) {
      setItems((prev) => prev.map((i) => i.producto.id === productoId ? { ...i, precio } : i));
    }
  }

  function toggleProducto(p: Producto) {
    const existe = items.find((i) => i.producto.id === p.id);
    if (existe) {
      setItems((prev) => prev.filter((i) => i.producto.id !== p.id));
    } else {
      setItems((prev) => [...prev, { producto: p, cantidad: 1, precio: PRECIOS[1] }]);
    }
  }

  function setCantidad(productoId: string, delta: number) {
    setItems((prev) => prev.map((i) => i.producto.id === productoId
      ? { ...i, cantidad: Math.max(1, i.cantidad + delta) }
      : i
    ));
  }

  const totalVenta = items.reduce((s, i) => s + i.precio * i.cantidad, 0);

  async function handleGuardar() {
    if (!eventoId || items.length === 0) return;
    setSaving(true);
    try {
      const inserts = items.map((i) => ({
        evento_id: eventoId,
        producto_id: i.producto.id,
        cantidad: i.cantidad,
        precio_unitario: i.precio,
        total: i.precio * i.cantidad,
      }));
      const { error } = await supabase.from('ventas_evento').insert(inserts);
      if (error) throw new Error(error.message);
      setItems([]);
      await fetchVentas(eventoId);
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
        .insert({ nombre: nuevoNombre, fecha: nuevoFecha, lugar: null, observaciones: null })
        .select('id, nombre, fecha')
        .single();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('No se pudo crear el evento');
      setEventos((prev) => [data, ...prev]);
      setEventoId(data.id);
      setShowNuevoEvento(false);
      setNuevoNombre('');
      setNuevoFecha(new Date().toISOString().split('T')[0]);
    } catch (e: unknown) {
      alert('Error al crear evento: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
    setSavingEvento(false);
  }

  const totalEvento = ventasGuardadas.reduce((s, v) => s + v.total, 0);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Ventas en Eventos</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Registro de ventas en ferias y eventos</p>
      </div>

      {/* Selector de evento */}
      <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <label className="block text-xs font-semibold uppercase mb-2" style={{ color: '#6b7280' }}>Evento</label>
        <div className="flex gap-2">
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
            style={{ backgroundColor: '#e53935' }}>
            + Nuevo
          </button>
        </div>
      </div>

      {/* Productos */}
      <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <label className="block text-xs font-semibold uppercase mb-3" style={{ color: '#6b7280' }}>Productos</label>
        <div className="flex flex-wrap gap-2 mb-4">
          {productos.map((p) => {
            const sel = items.find((i) => i.producto.id === p.id);
            return (
              <button key={p.id} onClick={() => toggleProducto(p)}
                className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors"
                style={{
                  backgroundColor: sel ? '#e53935' + '20' : '#1c1c1c',
                  borderColor: sel ? '#e53935' : '#2a2a2a',
                  color: sel ? '#e53935' : '#9ca3af',
                }}>
                {p.nombre}
              </button>
            );
          })}
        </div>

        {/* Items seleccionados */}
        {items.map((item) => (
          <div key={item.producto.id} className="mb-4 p-3 rounded-lg border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a' }}>
            <div className="flex justify-between items-center mb-2">
              <p className="font-semibold text-sm" style={{ color: '#f5f5f5' }}>{item.producto.nombre}</p>
              <button onClick={() => setItems((prev) => prev.filter((i) => i.producto.id !== item.producto.id))}
                className="text-xs px-2 py-1 rounded" style={{ backgroundColor: '#e53935' + '20', color: '#e53935' }}>
                🗑
              </button>
            </div>

            {/* Precios */}
            <p className="text-xs mb-2" style={{ color: '#6b7280' }}>Precio unitario:</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {PRECIOS.map((precio) => (
                <button key={precio} onClick={() => setPrecio(item.producto.id, precio)}
                  className="px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors"
                  style={{
                    backgroundColor: item.precio === precio ? '#e53935' : 'transparent',
                    borderColor: item.precio === precio ? '#e53935' : '#2a2a2a',
                    color: item.precio === precio ? 'white' : '#9ca3af',
                  }}>
                  {fmt(precio)}
                </button>
              ))}
            </div>

            {/* Cantidad */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => setCantidad(item.producto.id, -1)}
                  className="w-8 h-8 rounded-lg border text-lg font-bold"
                  style={{ borderColor: '#2a2a2a', color: '#f5f5f5', backgroundColor: '#0a0a0a' }}>-</button>
                <span className="text-xl font-extrabold w-8 text-center" style={{ color: '#f5f5f5' }}>{item.cantidad}</span>
                <button onClick={() => setCantidad(item.producto.id, 1)}
                  className="w-8 h-8 rounded-lg border text-lg font-bold"
                  style={{ borderColor: '#2a2a2a', color: '#f5f5f5', backgroundColor: '#0a0a0a' }}>+</button>
              </div>
              <p className="text-lg font-extrabold" style={{ color: '#4caf50' }}>{fmt(item.precio * item.cantidad)}</p>
            </div>
          </div>
        ))}

        {items.length > 0 && (
          <>
            <div className="flex justify-between items-center py-3 border-t mt-2" style={{ borderColor: '#2a2a2a' }}>
              <span className="font-bold text-lg" style={{ color: '#6b7280' }}>TOTAL VENTA</span>
              <span className="text-2xl font-extrabold" style={{ color: '#4caf50' }}>{fmt(totalVenta)}</span>
            </div>
            <button onClick={handleGuardar} disabled={saving || !eventoId}
              className="w-full py-3 rounded-lg font-bold text-white text-sm disabled:opacity-40 mt-2"
              style={{ backgroundColor: '#e53935' }}>
              {saving ? 'Guardando...' : '✅ REGISTRAR VENTA'}
            </button>
            {!eventoId && <p className="text-xs text-center mt-2" style={{ color: '#e53935' }}>Selecciona un evento primero</p>}
          </>
        )}
      </div>

      {/* Ventas del evento */}
      {eventoId && (
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <div className="px-4 py-3 border-b flex justify-between items-center" style={{ borderColor: '#2a2a2a' }}>
            <p className="text-xs font-bold uppercase" style={{ color: '#6b7280' }}>📊 Ventas del Evento</p>
            <p className="font-extrabold" style={{ color: '#4caf50' }}>{fmt(totalEvento)}</p>
          </div>
          {ventasGuardadas.length === 0 && (
            <p className="p-4 text-sm text-center" style={{ color: '#6b7280' }}>Sin ventas registradas</p>
          )}
          {ventasGuardadas.map((v, i) => (
            <div key={v.id} className="flex justify-between items-center px-4 py-3"
              style={{ borderBottom: i < ventasGuardadas.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>
                  {(v.producto as { nombre: string } | null)?.nombre ?? '—'}
                </p>
                <p className="text-xs" style={{ color: '#6b7280' }}>{v.cantidad} u. · {fmt(v.precio_unitario)} c/u</p>
              </div>
              <p className="font-bold" style={{ color: '#4caf50' }}>{fmt(v.total)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Modal nuevo evento */}
      {showNuevoEvento && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6" style={{ backgroundColor: '#141414' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg" style={{ color: '#f5f5f5' }}>Nuevo Evento</h2>
              <button onClick={() => setShowNuevoEvento(false)} style={{ color: '#6b7280' }}>✕</button>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Nombre del evento</label>
              <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)}
                placeholder="Ej: Feria La Reina, Mercado Providencia..."
                className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Fecha</label>
              <input type="date" value={nuevoFecha} onChange={(e) => setNuevoFecha(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            </div>
            <button onClick={handleCrearEvento} disabled={savingEvento || !nuevoNombre}
              className="w-full py-3 rounded-lg font-bold text-white text-sm disabled:opacity-40"
              style={{ backgroundColor: '#e53935' }}>
              {savingEvento ? 'Creando...' : 'CREAR EVENTO'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
