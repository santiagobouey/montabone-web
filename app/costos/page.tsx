'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

interface FacturaCosto {
  id: string;
  monto: number;
  unidades: number;
  costo_unitario: number;
  created_at: string;
}

export default function CostosPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [monto, setMonto] = useState('');
  const [unidades, setUnidades] = useState('');
  const [historial, setHistorial] = useState<FacturaCosto[]>([]);
  const [actual, setActual] = useState<FacturaCosto | null>(null);

  const fetchDatos = useCallback(async () => {
    const { data } = await supabase.from('costos_factura').select('*').order('created_at', { ascending: false });
    const facturas = (data || []) as FacturaCosto[];
    setHistorial(facturas);
    setActual(facturas[0] || null);
  }, []);

  useEffect(() => { fetchDatos().finally(() => setLoading(false)); }, [fetchDatos]);

  const montoNum = monto ? parseInt(monto) : 0;
  const unidadesNum = unidades ? parseInt(unidades) : 0;
  const costoUnitarioPreview = montoNum > 0 && unidadesNum > 0 ? Math.round(montoNum / unidadesNum) : 0;

  async function guardar() {
    if (montoNum <= 0 || unidadesNum <= 0) return;
    setSaving(true);
    try {
      const costoUnitario = Math.round(montoNum / unidadesNum);
      // Guardar factura
      await supabase.from('costos_factura').insert({ monto: montoNum, unidades: unidadesNum, costo_unitario: costoUnitario });
      // Aplicar el costo por unidad a TODOS los productos
      await supabase.from('productos').update({ costo: costoUnitario }).neq('id', '00000000-0000-0000-0000-000000000000');
      setMonto(''); setUnidades('');
      await fetchDatos();
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
    setSaving(false);
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Costos</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Ingresa la factura que pagaste y calcula la utilidad de cada venta</p>
      </div>

      {/* Costo unitario actual */}
      {actual && (
        <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderLeftWidth: 4, borderColor: '#2a2a2a', borderLeftColor: '#4caf50' }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: '#6b7280' }}>Costo por unidad vigente</p>
          <p className="text-3xl font-extrabold" style={{ color: '#4caf50' }}>{fmt(actual.costo_unitario)}</p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
            Factura de {fmt(actual.monto)} ÷ {actual.unidades.toLocaleString('es-CL')} unidades
          </p>
        </div>
      )}

      {/* Formulario nueva factura */}
      <div className="rounded-xl border p-4 mb-6" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: '#6b7280' }}>🧾 Ingresar nueva factura</p>

        <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Monto de la factura pagada</label>
        <div className="flex items-center gap-2 mb-3">
          <span style={{ color: '#6b7280' }}>$</span>
          <input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="ej: 1.500.000"
            className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
        </div>

        <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Unidades recibidas (total)</label>
        <input type="number" value={unidades} onChange={(e) => setUnidades(e.target.value)} placeholder="ej: 600"
          className="w-full rounded-lg px-3 py-2 text-sm border mb-3" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

        {costoUnitarioPreview > 0 && (
          <div className="rounded-lg p-3 mb-3 text-center" style={{ backgroundColor: '#4caf5015' }}>
            <p className="text-xs" style={{ color: '#6b7280' }}>Costo por unidad</p>
            <p className="text-2xl font-extrabold" style={{ color: '#4caf50' }}>{fmt(costoUnitarioPreview)}</p>
          </div>
        )}

        <p className="text-xs p-3 rounded-lg mb-3" style={{ backgroundColor: '#ff980015', color: '#ff9800' }}>
          ⚠️ Este costo por unidad se aplicará a todos los productos y se usará para calcular las utilidades de cada venta.
        </p>

        <button onClick={guardar} disabled={saving || costoUnitarioPreview <= 0}
          className="w-full py-3 rounded-lg font-bold text-sm text-white disabled:opacity-40"
          style={{ backgroundColor: guardado ? '#4caf50' : '#e53935' }}>
          {saving ? 'Guardando...' : guardado ? '✓ Guardado y aplicado' : 'Guardar y aplicar a productos'}
        </button>
      </div>

      {/* Historial */}
      {historial.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>📋 Historial de facturas</p>
          </div>
          {historial.map((f, i) => (
            <div key={f.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: i < historial.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>{fmt(f.monto)} · {f.unidades.toLocaleString('es-CL')} uds</p>
                <p className="text-xs" style={{ color: '#6b7280' }}>{new Date(f.created_at).toLocaleDateString('es-CL')}</p>
              </div>
              <p className="font-extrabold" style={{ color: '#4caf50' }}>{fmt(f.costo_unitario)}<span className="text-xs" style={{ color: '#6b7280' }}>/u</span></p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
