'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

interface FacturaCosto {
  id: string;
  monto: number;
  neto: number;
  iva: number;
  descripcion: string | null;
  created_at: string;
}

export default function CostosPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [neto, setNeto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [historial, setHistorial] = useState<FacturaCosto[]>([]);
  const [facturaAEliminar, setFacturaAEliminar] = useState<FacturaCosto | null>(null);

  const fetchDatos = useCallback(async () => {
    const { data } = await supabase.from('costos_factura').select('id, monto, neto, iva, descripcion, created_at').is('periodo_id', null).order('created_at', { ascending: false });
    setHistorial((data || []) as FacturaCosto[]);
  }, []);

  useEffect(() => { fetchDatos().finally(() => setLoading(false)); }, [fetchDatos]);

  const netoNum = neto ? parseInt(neto) : 0;
  const ivaNum = Math.round(netoNum * 0.19);
  const totalNum = netoNum + ivaNum;
  const totalPagado = historial.reduce((s, f) => s + f.monto, 0);

  async function guardar() {
    if (netoNum <= 0) return;
    setSaving(true);
    try {
      await supabase.from('costos_factura').insert({ monto: totalNum, neto: netoNum, iva: ivaNum, descripcion: descripcion || null });
      setNeto(''); setDescripcion('');
      await fetchDatos();
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
    setSaving(false);
  }

  async function eliminar() {
    if (!facturaAEliminar) return;
    await supabase.from('costos_factura').delete().eq('id', facturaAEliminar.id);
    setFacturaAEliminar(null);
    await fetchDatos();
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Costos</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Ingresa lo que pagaste en facturas. La utilidad = ventas − costos.</p>
      </div>

      {/* Total pagado */}
      <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderLeftWidth: 4, borderColor: '#2a2a2a', borderLeftColor: '#e53935' }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>🧾 Total pagado (período actual)</p>
        <p className="text-3xl font-extrabold" style={{ color: '#e53935' }}>{fmt(totalPagado)}</p>
        <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{historial.length} factura{historial.length !== 1 ? 's' : ''} registrada{historial.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Formulario nueva factura */}
      <div className="rounded-xl border p-4 mb-6" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: '#6b7280' }}>➕ Ingresar factura</p>

        <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Monto neto</label>
        <div className="flex items-center gap-2 mb-3">
          <span style={{ color: '#6b7280' }}>$</span>
          <input type="number" value={neto} onChange={(e) => setNeto(e.target.value)} placeholder="ej: 1.260.504"
            className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
        </div>

        {/* Desglose IVA / Total */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-lg p-2 text-center" style={{ backgroundColor: '#1c1c1c' }}>
            <p className="text-xs" style={{ color: '#6b7280' }}>Neto</p>
            <p className="text-sm font-bold" style={{ color: '#9ca3af' }}>{fmt(netoNum)}</p>
          </div>
          <div className="rounded-lg p-2 text-center" style={{ backgroundColor: '#1c1c1c' }}>
            <p className="text-xs" style={{ color: '#6b7280' }}>IVA 19%</p>
            <p className="text-sm font-bold" style={{ color: '#ff9800' }}>{fmt(ivaNum)}</p>
          </div>
          <div className="rounded-lg p-2 text-center" style={{ backgroundColor: '#4caf5015' }}>
            <p className="text-xs" style={{ color: '#6b7280' }}>Total</p>
            <p className="text-sm font-extrabold" style={{ color: '#4caf50' }}>{fmt(totalNum)}</p>
          </div>
        </div>

        <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Descripción (opcional)</label>
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="ej: Producción chorizos, insumos..."
          className="w-full rounded-lg px-3 py-2 text-sm border mb-4" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

        <button onClick={guardar} disabled={saving || netoNum <= 0}
          className="w-full py-3 rounded-lg font-bold text-sm text-white disabled:opacity-40"
          style={{ backgroundColor: guardado ? '#4caf50' : '#e53935' }}>
          {saving ? 'Guardando...' : guardado ? '✓ Guardado' : 'Guardar factura'}
        </button>
      </div>

      {/* Historial */}
      {historial.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>📋 Facturas del período actual</p>
          </div>
          {historial.map((f, i) => (
            <div key={f.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: i < historial.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>{fmt(f.monto)}</p>
                {(f.neto > 0 || f.iva > 0) && (
                  <p className="text-xs" style={{ color: '#6b7280' }}>Neto {fmt(f.neto)} + IVA {fmt(f.iva)}</p>
                )}
                <p className="text-xs truncate" style={{ color: '#6b7280' }}>{f.descripcion || 'Sin descripción'} · {new Date(f.created_at).toLocaleDateString('es-CL')}</p>
              </div>
              <button onClick={() => setFacturaAEliminar(f)}
                className="w-8 h-8 rounded-lg flex items-center justify-center border text-base flex-shrink-0"
                style={{ borderColor: '#e5393520', backgroundColor: '#e5393510' }}>🗑️</button>
            </div>
          ))}
        </div>
      )}

      {/* Modal eliminar */}
      {facturaAEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: '#141414' }}>
            <p className="text-lg font-bold mb-2" style={{ color: '#f5f5f5' }}>¿Eliminar factura?</p>
            <p className="text-sm mb-4" style={{ color: '#6b7280' }}>Se eliminará la factura de {fmt(facturaAEliminar.monto)}.</p>
            <div className="flex gap-3">
              <button onClick={() => setFacturaAEliminar(null)} className="flex-1 py-3 rounded-lg font-bold text-sm border" style={{ borderColor: '#2a2a2a', color: '#6b7280' }}>Cancelar</button>
              <button onClick={eliminar} className="flex-1 py-3 rounded-lg font-bold text-sm text-white" style={{ backgroundColor: '#e53935' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
