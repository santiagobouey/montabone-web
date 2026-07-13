'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

type Motivo = 'devolucion' | 'degustacion';

interface ProductoOpt {
  id: string;
  nombre: string;
  formato: string;
  stock: number;
  precio: number;
}

interface Merma {
  id: string;
  producto_id: string | null;
  cantidad: number;
  motivo: Motivo;
  fecha: string;
  observaciones: string | null;
  producto: { nombre: string; precio: number } | null;
}

const MOTIVOS: { key: Motivo; label: string; color: string }[] = [
  { key: 'devolucion', label: '↩️ Devolución', color: '#e53935' },
  { key: 'degustacion', label: '🍴 Degustación', color: '#ff9800' },
];

export default function MermaPage() {
  const [mermas, setMermas] = useState<Merma[]>([]);
  const [productos, setProductos] = useState<ProductoOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mermaAEliminar, setMermaAEliminar] = useState<Merma | null>(null);

  // Form
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState<Motivo>('devolucion');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [observaciones, setObservaciones] = useState('');

  const fetchDatos = useCallback(async () => {
    const [merRes, prodRes] = await Promise.all([
      supabase.from('mermas').select('*, producto:productos(nombre, precio)').order('fecha', { ascending: false }),
      supabase.from('productos').select('id, nombre, formato, stock, precio').order('nombre'),
    ]);
    setMermas((merRes.data || []) as Merma[]);
    setProductos((prodRes.data || []) as ProductoOpt[]);
  }, []);

  useEffect(() => { fetchDatos().finally(() => setLoading(false)); }, [fetchDatos]);

  function abrirNueva() {
    setProductoId(''); setCantidad(''); setMotivo('devolucion');
    setFecha(new Date().toISOString().split('T')[0]); setObservaciones('');
    setShowModal(true);
  }

  async function guardar() {
    const cant = cantidad ? parseInt(cantidad) : 0;
    if (!productoId || cant <= 0) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('mermas').insert({
        producto_id: productoId, cantidad: cant, motivo, fecha,
        observaciones: observaciones || null,
      });
      if (error) throw error;

      // Descontar del stock
      const prod = productos.find((p) => p.id === productoId);
      if (prod) {
        await supabase.from('productos').update({ stock: Math.max(0, prod.stock - cant) }).eq('id', productoId);
      }

      setShowModal(false);
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

  const prodSel = productos.find((p) => p.id === productoId);

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Merma</h1>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Devoluciones y degustaciones — se descuentan del stock</p>
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
        ].map((t) => (
          <div key={t.label} className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: t.color }}>
            <p className="text-xs" style={{ color: '#6b7280' }}>{t.label}</p>
            <p className="text-2xl font-extrabold" style={{ color: t.color }}>{t.lista.reduce((s, m) => s + m.cantidad, 0)} <span className="text-sm">uds</span></p>
            <p className="text-xs" style={{ color: '#6b7280' }}>{fmt(t.lista.reduce((s, m) => s + valorDe(m), 0))} en valor venta</p>
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
                    <p className="text-xs" style={{ color: '#6b7280' }}>Valor venta: {fmt(valorDe(m))}</p>
                    {m.observaciones && <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{m.observaciones}</p>}
                  </div>
                  <button onClick={() => setMermaAEliminar(m)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center border text-base flex-shrink-0"
                    style={{ borderColor: '#e5393520', backgroundColor: '#e5393510' }}>🗑️</button>
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
              <h2 className="font-bold text-lg" style={{ color: '#f5f5f5' }}>📉 Registrar Merma</h2>
              <button onClick={() => setShowModal(false)} style={{ color: '#6b7280' }}>✕</button>
            </div>

            <label className="block text-xs font-semibold uppercase mb-2" style={{ color: '#6b7280' }}>Motivo</label>
            <div className="flex gap-2 mb-4">
              {MOTIVOS.map((mot) => (
                <button key={mot.key} onClick={() => setMotivo(mot.key)}
                  className="flex-1 py-2 rounded-lg border text-xs font-semibold"
                  style={{
                    borderColor: motivo === mot.key ? mot.color : '#2a2a2a',
                    backgroundColor: motivo === mot.key ? mot.color + '20' : 'transparent',
                    color: motivo === mot.key ? mot.color : '#9ca3af',
                  }}>
                  {mot.label}
                </button>
              ))}
            </div>

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Producto</label>
            <select value={productoId} onChange={(e) => setProductoId(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm border mb-3"
              style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: productoId ? '#f5f5f5' : '#6b7280' }}>
              <option value="">— Seleccionar producto —</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} ({p.formato}) — stock: {p.stock}</option>
              ))}
            </select>

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Cantidad de paquetes</label>
            <input type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="ej: 2" min={1}
              className="w-full rounded-lg px-3 py-2 text-sm border mb-1"
              style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            {prodSel && cantidad && parseInt(cantidad) > prodSel.stock && (
              <p className="text-xs mb-2" style={{ color: '#ff9800' }}>⚠️ Stock actual: {prodSel.stock} — el stock quedará en 0</p>
            )}
            <div className="mb-3" />

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm border mb-3"
              style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Observaciones (opcional)</label>
            <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="ej: cliente devolvió por vencimiento, muestra en local X..."
              className="w-full rounded-lg px-3 py-2 text-sm border mb-4"
              style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

            <button onClick={guardar} disabled={saving || !productoId || !cantidad || parseInt(cantidad) <= 0}
              className="w-full py-3 rounded-lg font-bold text-sm text-white disabled:opacity-40"
              style={{ backgroundColor: MOTIVOS.find((x) => x.key === motivo)!.color }}>
              {saving ? 'Guardando...' : 'Registrar y descontar del stock'}
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
