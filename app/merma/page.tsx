'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

type Motivo = 'devolucion' | 'degustacion' | 'muestra' | 'muestra_influencer';

interface ProductoOpt {
  id: string;
  nombre: string;
  formato: string;
  stock: number;
  precio: number;
}

interface ItemMerma {
  producto: ProductoOpt;
  cantidad: number;
}

interface Merma {
  id: string;
  producto_id: string | null;
  cliente_id: string | null;
  influencer_id: string | null;
  cantidad: number;
  motivo: Motivo;
  fecha: string;
  observaciones: string | null;
  producto: { nombre: string; precio: number } | null;
  cliente: { nombre: string } | null;
  influencer: { nombre: string } | null;
}

const MOTIVOS: { key: Motivo; label: string; color: string }[] = [
  { key: 'devolucion', label: '↩️ Devolución', color: '#e53935' },
  { key: 'degustacion', label: '🍴 Degustación', color: '#ff9800' },
  { key: 'muestra', label: '🎁 Muestra a local', color: '#9c27b0' },
  { key: 'muestra_influencer', label: '📣 Muestra a influencer', color: '#2196f3' },
];

export default function MermaPage() {
  const [mermas, setMermas] = useState<Merma[]>([]);
  const [productos, setProductos] = useState<ProductoOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mermaAEliminar, setMermaAEliminar] = useState<Merma | null>(null);
  const [editando, setEditando] = useState<Merma | null>(null);

  // Form
  const [items, setItems] = useState<ItemMerma[]>([]);
  const [motivo, setMotivo] = useState<Motivo>('devolucion');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [observaciones, setObservaciones] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [influencerId, setInfluencerId] = useState('');
  const [clientes, setClientes] = useState<{ id: string; nombre: string }[]>([]);
  const [influencers, setInfluencers] = useState<{ id: string; nombre: string }[]>([]);

  const fetchDatos = useCallback(async () => {
    const [merRes, prodRes, cliRes, infRes] = await Promise.all([
      supabase.from('mermas').select('*, producto:productos(nombre, precio), cliente:clientes(nombre), influencer:influencers(nombre)').order('fecha', { ascending: false }),
      supabase.from('productos').select('id, nombre, formato, stock, precio').order('nombre'),
      supabase.from('clientes').select('id, nombre').order('nombre'),
      supabase.from('influencers').select('id, nombre').order('nombre'),
    ]);
    setMermas((merRes.data || []) as Merma[]);
    setProductos((prodRes.data || []) as ProductoOpt[]);
    setClientes(cliRes.data || []);
    setInfluencers(infRes.data || []);
  }, []);

  useEffect(() => { fetchDatos().finally(() => setLoading(false)); }, [fetchDatos]);

  function abrirNueva() {
    setEditando(null);
    setItems([]); setMotivo('devolucion'); setClienteId(''); setInfluencerId('');
    setFecha(new Date().toISOString().split('T')[0]); setObservaciones('');
    setShowModal(true);
  }

  function abrirEditar(m: Merma) {
    setEditando(m);
    // Compatibilidad: muestras viejas a influencer guardadas como 'muestra'
    setMotivo(m.motivo === 'muestra' && m.influencer_id ? 'muestra_influencer' : m.motivo);
    setClienteId(m.cliente_id || '');
    setInfluencerId(m.influencer_id || '');
    setFecha(m.fecha);
    setObservaciones(m.observaciones || '');
    const prod = productos.find((p) => p.id === m.producto_id);
    setItems(prod ? [{ producto: prod, cantidad: m.cantidad }] : []);
    setShowModal(true);
  }

  function toggleProducto(p: ProductoOpt) {
    // En edición solo se maneja un producto por registro
    if (editando) {
      setItems((prev) => prev[0]?.producto.id === p.id ? [] : [{ producto: p, cantidad: prev[0]?.cantidad ?? 1 }]);
      return;
    }
    const exists = items.find((i) => i.producto.id === p.id);
    if (exists) setItems((prev) => prev.filter((i) => i.producto.id !== p.id));
    else setItems((prev) => [...prev, { producto: p, cantidad: 1 }]);
  }

  async function guardar() {
    if (items.length === 0) return;
    setSaving(true);
    try {
      // Muestra a influencer usa influencer; el resto usa cliente
      const esMuestraInfluencer = motivo === 'muestra_influencer';
      const cliente_id = esMuestraInfluencer ? null : (clienteId || null);
      const influencer_id = esMuestraInfluencer ? (influencerId || null) : null;

      if (editando) {
        const it = items[0];
        // Devolver el stock del producto/cantidad anterior
        if (editando.producto_id) {
          const { data } = await supabase.from('productos').select('stock').eq('id', editando.producto_id).single();
          if (data) await supabase.from('productos').update({ stock: data.stock + editando.cantidad }).eq('id', editando.producto_id);
        }
        // Descontar el stock del producto/cantidad nuevo
        const { data: pn } = await supabase.from('productos').select('stock').eq('id', it.producto.id).single();
        await supabase.from('productos').update({ stock: Math.max(0, (pn?.stock ?? 0) - it.cantidad) }).eq('id', it.producto.id);

        const { error } = await supabase.from('mermas').update({
          producto_id: it.producto.id, cantidad: it.cantidad, motivo, fecha,
          cliente_id, influencer_id, observaciones: observaciones || null,
        }).eq('id', editando.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('mermas').insert(
          items.map((i) => ({
            producto_id: i.producto.id, cantidad: i.cantidad, motivo, fecha,
            cliente_id, influencer_id,
            observaciones: observaciones || null,
          }))
        );
        if (error) throw error;

        // Descontar del stock
        await Promise.all(items.map((i) =>
          supabase.from('productos').update({ stock: Math.max(0, i.producto.stock - i.cantidad) }).eq('id', i.producto.id)
        ));
      }

      setShowModal(false);
      setEditando(null);
      await fetchDatos();
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
    setSaving(false);
  }

  async function eliminar() {
    if (!mermaAEliminar) return;
    try {
      // Devolver las unidades al stock
      if (mermaAEliminar.producto_id) {
        const { data: prod } = await supabase.from('productos').select('stock').eq('id', mermaAEliminar.producto_id).single();
        if (prod) {
          await supabase.from('productos').update({ stock: prod.stock + mermaAEliminar.cantidad }).eq('id', mermaAEliminar.producto_id);
        }
      }
      await supabase.from('mermas').delete().eq('id', mermaAEliminar.id);
      setMermaAEliminar(null);
      await fetchDatos();
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  const valorDe = (m: Merma) => (m.producto?.precio ?? 0) * m.cantidad;
  const totalDevolucion = mermas.filter((m) => m.motivo === 'devolucion');
  const totalDegustacion = mermas.filter((m) => m.motivo === 'degustacion');
  const totalMuestra = mermas.filter((m) => m.motivo === 'muestra');
  const totalMuestraInf = mermas.filter((m) => m.motivo === 'muestra_influencer');
  const totalUnidades = items.reduce((s, i) => s + i.cantidad, 0);
  const colorMotivo = MOTIVOS.find((x) => x.key === motivo)!.color;

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Merma</h1>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Devoluciones, degustaciones y muestras — se descuentan del stock</p>

        </div>
        <button onClick={abrirNueva} className="px-4 py-2 rounded-lg font-bold text-sm text-white flex-shrink-0" style={{ backgroundColor: '#e53935' }}>
          + Registrar
        </button>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          { label: '↩️ Devoluciones', lista: totalDevolucion, color: '#e53935' },
          { label: '🍴 Degustaciones', lista: totalDegustacion, color: '#ff9800' },
          { label: '🎁 Muestras a locales', lista: totalMuestra, color: '#9c27b0' },
          { label: '📣 Muestras a influencer', lista: totalMuestraInf, color: '#2196f3' },
        ].map((t) => (
          <div key={t.label} className="rounded-xl border p-3" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: t.color }}>
            <p className="text-xs" style={{ color: '#6b7280' }}>{t.label}</p>
            <p className="text-2xl font-extrabold" style={{ color: t.color }}>{t.lista.reduce((s, m) => s + m.cantidad, 0)} <span className="text-sm">uds</span></p>
            <p className="text-xs" style={{ color: '#6b7280' }}>{fmt(t.lista.reduce((s, m) => s + valorDe(m), 0))}</p>
          </div>
        ))}
      </div>

      {/* Lista */}
      {mermas.length === 0 ? (
        <div className="text-center py-12" style={{ color: '#6b7280' }}>
          <p className="text-3xl mb-2">📉</p>
          <p>No hay mermas registradas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {mermas.map((m) => {
            const mot = MOTIVOS.find((x) => x.key === m.motivo)!;
            return (
              <div key={m.id} className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: mot.color }}>
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: mot.color + '20', color: mot.color }}>
                        {mot.label}
                      </span>
                      <span className="text-xs" style={{ color: '#6b7280' }}>{new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-CL')}</span>
                    </div>
                    <p className="font-bold" style={{ color: '#f5f5f5' }}>{m.producto?.nombre ?? 'Producto eliminado'} — {m.cantidad} paquete{m.cantidad !== 1 ? 's' : ''}</p>
                    {m.influencer && <p className="text-sm" style={{ color: '#9ca3af' }}>📣 {m.influencer.nombre}</p>}
                    {m.cliente && <p className="text-sm" style={{ color: '#9ca3af' }}>🏪 {m.cliente.nombre}</p>}
                    <p className="text-xs" style={{ color: '#6b7280' }}>Valor venta: {fmt(valorDe(m))}</p>
                    {m.observaciones && <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{m.observaciones}</p>}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => abrirEditar(m)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center border text-base"
                      style={{ borderColor: '#2a2a2a', backgroundColor: '#1c1c1c' }}>✏️</button>
                    <button onClick={() => setMermaAEliminar(m)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center border text-base"
                      style={{ borderColor: '#e5393520', backgroundColor: '#e5393510' }}>🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal nueva merma */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 overflow-y-auto max-h-[90vh]" style={{ backgroundColor: '#141414' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg" style={{ color: '#f5f5f5' }}>{editando ? '✏️ Editar Merma' : '📉 Registrar Merma'}</h2>
              <button onClick={() => { setShowModal(false); setEditando(null); }} style={{ color: '#6b7280' }}>✕</button>
            </div>

            {/* Toggle motivo (2x2 para que quepan las 4 opciones) */}
            <label className="block text-xs font-semibold uppercase mb-2" style={{ color: '#6b7280' }}>Motivo</label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {MOTIVOS.map((mot) => (
                <button key={mot.key} onClick={() => setMotivo(mot.key)}
                  className="py-2 px-1 rounded-lg border text-xs font-semibold"
                  style={{
                    borderColor: motivo === mot.key ? mot.color : '#2a2a2a',
                    backgroundColor: motivo === mot.key ? mot.color + '20' : 'transparent',
                    color: motivo === mot.key ? mot.color : '#9ca3af',
                  }}>
                  {mot.label}
                </button>
              ))}
            </div>

            {motivo === 'muestra_influencer' ? (
              <>
                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Influencer</label>
                <select value={influencerId} onChange={(e) => setInfluencerId(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 mb-3 text-sm border"
                  style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: influencerId ? '#f5f5f5' : '#6b7280' }}>
                  <option value="">— Seleccionar influencer —</option>
                  {influencers.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                </select>
                {influencers.length === 0 && (
                  <p className="text-xs mb-3" style={{ color: '#ff9800' }}>No hay influencers cargados. Agrégalos en la sección Pendientes.</p>
                )}
              </>
            ) : (
              <>
                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>{motivo === 'muestra' ? 'Local' : 'Cliente'}</label>
                <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 mb-3 text-sm border"
                  style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: clienteId ? '#f5f5f5' : '#6b7280' }}>
                  <option value="">— Seleccionar {motivo === 'muestra' ? 'local' : 'cliente (opcional)'} —</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </>
            )}

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="w-full rounded-lg px-3 py-2 mb-3 text-sm border"
              style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

            <label className="block text-xs font-semibold uppercase mb-2" style={{ color: '#6b7280' }}>Productos</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {productos.map((p) => {
                const sel = items.find((i) => i.producto.id === p.id);
                return (
                  <button key={p.id} onClick={() => toggleProducto(p)}
                    className="px-3 py-1.5 rounded-lg border text-xs font-medium"
                    style={{ backgroundColor: sel ? colorMotivo + '20' : '#1c1c1c', borderColor: sel ? colorMotivo : '#2a2a2a', color: sel ? colorMotivo : '#9ca3af' }}>
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setItems((prev) => prev.map((i) => i.producto.id === item.producto.id ? { ...i, cantidad: Math.max(1, i.cantidad - 1) } : i))}
                      className="w-8 h-8 rounded-lg border font-bold" style={{ borderColor: '#2a2a2a', color: '#f5f5f5' }}>-</button>
                    <span className="w-8 text-center font-extrabold" style={{ color: '#f5f5f5' }}>{item.cantidad}</span>
                    <button onClick={() => setItems((prev) => prev.map((i) => i.producto.id === item.producto.id ? { ...i, cantidad: i.cantidad + 1 } : i))}
                      className="w-8 h-8 rounded-lg border font-bold" style={{ borderColor: '#2a2a2a', color: '#f5f5f5' }}>+</button>
                    <span className="text-xs ml-1" style={{ color: '#6b7280' }}>paquete{item.cantidad !== 1 ? 's' : ''}</span>
                  </div>
                  {item.cantidad > item.producto.stock && (
                    <span className="text-xs" style={{ color: '#ff9800' }}>⚠️ stock: {item.producto.stock}</span>
                  )}
                </div>
              </div>
            ))}

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Observaciones (opcional)</label>
            <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="ej: devolución por vencimiento, muestra en local X..."
              className="w-full rounded-lg px-3 py-2 text-sm border mb-4"
              style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

            <button onClick={guardar} disabled={saving || items.length === 0}
              className="w-full py-3 rounded-lg font-bold text-sm text-white disabled:opacity-40"
              style={{ backgroundColor: colorMotivo }}>
              {saving ? 'Guardando...' : editando ? 'Guardar cambios' : `Registrar ${totalUnidades > 0 ? `${totalUnidades} paquete${totalUnidades !== 1 ? 's' : ''}` : 'merma'} y descontar stock`}
            </button>
          </div>
        </div>
      )}

      {/* Modal eliminar */}
      {mermaAEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: '#141414' }}>
            <p className="text-lg font-bold mb-2" style={{ color: '#f5f5f5' }}>¿Eliminar merma?</p>
            <p className="text-sm mb-4" style={{ color: '#6b7280' }}>
              Se eliminará el registro y las {mermaAEliminar.cantidad} unidad{mermaAEliminar.cantidad !== 1 ? 'es' : ''} volverán al stock.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setMermaAEliminar(null)} className="flex-1 py-3 rounded-lg font-bold text-sm border" style={{ borderColor: '#2a2a2a', color: '#6b7280' }}>Cancelar</button>
              <button onClick={eliminar} className="flex-1 py-3 rounded-lg font-bold text-sm text-white" style={{ backgroundColor: '#e53935' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
