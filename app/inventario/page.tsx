'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Producto } from '@/types';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

export default function InventarioPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);

  const [nombre, setNombre] = useState('');
  const [sku, setSku] = useState('');
  const [formato, setFormato] = useState('');
  const [stock, setStock] = useState('');
  const [precio, setPrecio] = useState('');
  const [costo, setCosto] = useState('');
  const [fechaIngreso, setFechaIngreso] = useState(new Date().toISOString().split('T')[0]);
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const [ritmoVenta, setRitmoVenta] = useState<Record<string, number>>({});

  const fetchProductos = useCallback(async () => {
    try {
      const { data } = await supabase.from('productos').select('*').order('nombre');
      setProductos(data || []);
    } catch {}
  }, []);

  // Ritmo de venta: unidades vendidas por producto en los últimos 30 días
  const fetchRitmo = useCallback(async () => {
    try {
      const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const [pedRes, detRes, eveRes] = await Promise.all([
        supabase.from('detalle_pedido').select('producto_id, cantidad, pedido:pedidos(fecha)'),
        supabase.from('items_venta_detalle').select('producto_id, cantidad, venta:ventas_detalle(fecha)'),
        supabase.from('ventas_evento').select('producto_id, cantidad, evento:eventos(fecha)'),
      ]);
      const unidades: Record<string, number> = {};
      for (const d of (pedRes.data || []) as any[]) {
        if (d.pedido?.fecha >= hace30) unidades[d.producto_id] = (unidades[d.producto_id] || 0) + d.cantidad;
      }
      for (const i of (detRes.data || []) as any[]) {
        if (i.venta?.fecha >= hace30) unidades[i.producto_id] = (unidades[i.producto_id] || 0) + i.cantidad;
      }
      for (const v of (eveRes.data || []) as any[]) {
        if (v.evento?.fecha >= hace30) unidades[v.producto_id] = (unidades[v.producto_id] || 0) + v.cantidad;
      }
      setRitmoVenta(unidades);
    } catch {}
  }, []);

  useEffect(() => { Promise.all([fetchProductos(), fetchRitmo()]).finally(() => setLoading(false)); }, [fetchProductos, fetchRitmo]);

  function abrirNuevo() {
    setEditando(null); setNombre(''); setSku(''); setFormato(''); setStock('');
    setPrecio(''); setCosto(''); setFechaIngreso(new Date().toISOString().split('T')[0]); setFechaVencimiento(''); setObservaciones('');
    setShowModal(true);
  }

  function abrirEditar(p: Producto) {
    setEditando(p); setNombre(p.nombre); setSku(p.sku || ''); setFormato(p.formato);
    setStock(String(p.stock)); setPrecio(String(p.precio)); setCosto(String(p.costo || ''));
    setFechaIngreso(p.fecha_ingreso?.split('T')[0] || '');
    setFechaVencimiento(p.fecha_vencimiento?.split('T')[0] || ''); setObservaciones(p.observaciones || '');
    setShowModal(true);
  }

  async function handleGuardar() {
    if (!nombre || !formato || !stock || !precio) return;
    setSaving(true);
    try {
      const payload = {
        nombre, sku: sku || null, formato, stock: parseInt(stock), precio: parseInt(precio),
        costo: costo ? parseInt(costo) : 0,
        fecha_ingreso: fechaIngreso, fecha_vencimiento: fechaVencimiento || null, observaciones: observaciones || null,
      };
      if (editando) await supabase.from('productos').update(payload).eq('id', editando.id);
      else await supabase.from('productos').insert(payload);
      setShowModal(false);
      await fetchProductos();
    } catch {}
    setSaving(false);
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Inventario</h1>
          <p className="text-sm" style={{ color: '#6b7280' }}>{productos.length} productos · {productos.reduce((s, p) => s + p.stock, 0)} uds total</p>
        </div>
        <button onClick={abrirNuevo} className="px-4 py-2 rounded-lg font-semibold text-sm text-white" style={{ backgroundColor: '#e53935' }}>+ Nuevo</button>
      </div>

      <div className="space-y-3">
        {productos.map((p) => {
          const color = p.stock === 0 ? '#e53935' : p.stock <= 10 ? '#ff9800' : '#4caf50';
          const vendidas30 = ritmoVenta[p.id] || 0;
          const diasAgote = p.stock > 0 && vendidas30 > 0 ? Math.round(p.stock / (vendidas30 / 30)) : null;
          const colorAgote = diasAgote === null ? '#6b7280' : diasAgote <= 7 ? '#e53935' : diasAgote <= 14 ? '#ff9800' : '#4caf50';
          return (
            <div key={p.id} className="rounded-xl border p-4 cursor-pointer" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }} onClick={() => abrirEditar(p)}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold" style={{ color: '#f5f5f5' }}>{p.nombre}</p>
                  <p className="text-sm" style={{ color: '#6b7280' }}>{p.formato} · {fmt(p.precio)} c/u {p.costo ? `· Costo: ${fmt(p.costo)}` : ''}</p>
                  {p.sku && <p className="text-xs" style={{ color: '#6b7280' }}>SKU: {p.sku}</p>}
                  {p.fecha_vencimiento && (
                    <p className="text-xs mt-1" style={{ color: '#ff9800' }}>
                      Vence: {new Date(p.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-CL')}
                    </p>
                  )}
                  {diasAgote !== null && (
                    <p className="text-xs mt-1 font-semibold" style={{ color: colorAgote }}>
                      ⏳ Se agota en ~{diasAgote} día{diasAgote !== 1 ? 's' : ''} <span style={{ color: '#6b7280', fontWeight: 'normal' }}>({vendidas30} uds vendidas en 30 días)</span>
                    </p>
                  )}
                  {p.stock > 0 && vendidas30 === 0 && (
                    <p className="text-xs mt-1" style={{ color: '#6b7280' }}>Sin ventas en los últimos 30 días</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-3xl font-extrabold" style={{ color }}>{p.stock}</p>
                  <p className="text-xs" style={{ color: '#6b7280' }}>uds</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 overflow-y-auto max-h-[90vh]" style={{ backgroundColor: '#141414' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg" style={{ color: '#f5f5f5' }}>{editando ? 'Editar Producto' : 'Nuevo Producto'}</h2>
              <button onClick={() => setShowModal(false)} style={{ color: '#6b7280' }}>✕</button>
            </div>

            {[
              { label: 'Nombre', value: nombre, set: setNombre },
              { label: 'SKU (opcional)', value: sku, set: setSku },
              { label: 'Formato', value: formato, set: setFormato, placeholder: 'ej: 500g, 1kg' },
              { label: 'Stock (unidades)', value: stock, set: setStock, type: 'number' },
              { label: 'Precio de venta', value: precio, set: setPrecio, type: 'number' },
              { label: 'Costo (precio de compra)', value: costo, set: setCosto, type: 'number' },
            ].map(({ label, value, set, type, placeholder }) => (
              <div key={label} className="mb-3">
                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>{label}</label>
                <input type={type || 'text'} value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder}
                  className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
              </div>
            ))}

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Fecha de Elaboración</label>
                <input type="date" value={fechaIngreso} onChange={(e) => {
                  const val = e.target.value;
                  setFechaIngreso(val);
                  // Vence automáticamente 60 días después de la elaboración
                  if (val) {
                    const d = new Date(val + 'T12:00:00');
                    d.setDate(d.getDate() + 60);
                    setFechaVencimiento(d.toISOString().split('T')[0]);
                  }
                }} className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Fecha Vencimiento <span style={{ color: '#4b5563', fontWeight: 400 }}>(auto +60 días)</span></label>
                <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Observaciones</label>
              <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} className="w-full rounded-lg px-3 py-2 text-sm border resize-none" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            </div>

            <button onClick={handleGuardar} disabled={saving || !nombre || !formato || !stock || !precio} className="w-full py-3 rounded-lg font-bold text-white text-sm disabled:opacity-40" style={{ backgroundColor: '#e53935' }}>
              {saving ? 'Guardando...' : 'GUARDAR'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
