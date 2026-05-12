'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Gasto {
  id: string;
  detalle: string;
  monto: number;
  pagado_por: string;
}

interface Evento {
  id: string;
  nombre: string;
  fecha: string;
  lugar: string | null;
  observaciones: string | null;
  gastos: Gasto[];
}

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

export default function GastosPage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showGastoModal, setShowGastoModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [eventoActivo, setEventoActivo] = useState<Evento | null>(null);

  const [nombre, setNombre] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [lugar, setLugar] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const [gastoDetalle, setGastoDetalle] = useState('');
  const [gastoMonto, setGastoMonto] = useState('');
  const [gastoPagadoPor, setGastoPagadoPor] = useState('Santiago');

  const fetchEventos = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('eventos')
        .select('*, gastos(id, detalle, monto, pagado_por)')
        .order('fecha', { ascending: false });
      setEventos(data || []);
    } catch {}
  }, []);

  useEffect(() => { fetchEventos().finally(() => setLoading(false)); }, [fetchEventos]);

  async function handleGuardarEvento() {
    if (!nombre || !fecha) return;
    setSaving(true);
    try {
      await supabase.from('eventos').insert({ nombre, fecha, lugar: lugar || null, observaciones: observaciones || null });
      setShowModal(false);
      setNombre(''); setLugar(''); setObservaciones('');
      await fetchEventos();
    } catch {}
    setSaving(false);
  }

  async function handleGuardarGasto() {
    if (!gastoDetalle || !gastoMonto || !eventoActivo) return;
    setSaving(true);
    try {
      await supabase.from('gastos').insert({ evento_id: eventoActivo.id, detalle: gastoDetalle, monto: parseInt(gastoMonto), pagado_por: gastoPagadoPor });
      setShowGastoModal(false);
      setGastoDetalle(''); setGastoMonto('');
      await fetchEventos();
    } catch {}
    setSaving(false);
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Gastos / Eventos</h1>
          <p className="text-sm" style={{ color: '#6b7280' }}>{eventos.length} eventos</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-lg font-semibold text-sm text-white" style={{ backgroundColor: '#e53935' }}>+ Evento</button>
      </div>

      <div className="space-y-4">
        {eventos.map((e) => {
          const totalGastos = (e.gastos || []).reduce((s, g) => s + g.monto, 0);
          return (
            <div key={e.id} className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
              <div className="p-4 border-b" style={{ borderColor: '#2a2a2a' }}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold" style={{ color: '#f5f5f5' }}>{e.nombre}</p>
                    <p className="text-xs" style={{ color: '#6b7280' }}>
                      {new Date(e.fecha + 'T12:00:00').toLocaleDateString('es-CL')} {e.lugar ? `· ${e.lugar}` : ''}
                    </p>
                  </div>
                  <p className="font-extrabold text-lg" style={{ color: '#e53935' }}>{fmt(totalGastos)}</p>
                </div>
              </div>
              {(e.gastos || []).map((g) => (
                <div key={g.id} className="flex justify-between items-center px-4 py-2 border-b text-sm" style={{ borderColor: '#2a2a2a' }}>
                  <span style={{ color: '#9ca3af' }}>{g.detalle}</span>
                  <div className="text-right">
                    <p className="font-semibold" style={{ color: '#f5f5f5' }}>{fmt(g.monto)}</p>
                    <p className="text-xs" style={{ color: '#6b7280' }}>{g.pagado_por}</p>
                  </div>
                </div>
              ))}
              <button onClick={() => { setEventoActivo(e); setShowGastoModal(true); }}
                className="w-full py-2 text-sm font-semibold" style={{ color: '#e53935', backgroundColor: '#1c1c1c' }}>
                + Agregar gasto
              </button>
            </div>
          );
        })}
        {eventos.length === 0 && <div className="text-center py-16" style={{ color: '#6b7280' }}>No hay eventos</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6" style={{ backgroundColor: '#141414' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg" style={{ color: '#f5f5f5' }}>Nuevo Evento</h2>
              <button onClick={() => setShowModal(false)} style={{ color: '#6b7280' }}>✕</button>
            </div>
            {[{ label: 'Nombre', value: nombre, set: setNombre }, { label: 'Lugar', value: lugar, set: setLugar }].map(({ label, value, set }) => (
              <div key={label} className="mb-3">
                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>{label}</label>
                <input value={value} onChange={(e) => set(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
              </div>
            ))}
            <div className="mb-3">
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            </div>
            <button onClick={handleGuardarEvento} disabled={saving || !nombre} className="w-full py-3 rounded-lg font-bold text-white text-sm disabled:opacity-40" style={{ backgroundColor: '#e53935' }}>
              {saving ? 'Guardando...' : 'CREAR EVENTO'}
            </button>
          </div>
        </div>
      )}

      {showGastoModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6" style={{ backgroundColor: '#141414' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg" style={{ color: '#f5f5f5' }}>Agregar Gasto</h2>
              <button onClick={() => setShowGastoModal(false)} style={{ color: '#6b7280' }}>✕</button>
            </div>
            <p className="text-sm mb-4" style={{ color: '#6b7280' }}>Evento: {eventoActivo?.nombre}</p>
            <div className="mb-3">
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Detalle</label>
              <input value={gastoDetalle} onChange={(e) => setGastoDetalle(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            </div>
            <div className="mb-3">
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Monto</label>
              <input type="number" value={gastoMonto} onChange={(e) => setGastoMonto(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            </div>
            <label className="block text-xs font-semibold uppercase mb-2" style={{ color: '#6b7280' }}>Pagado por</label>
            <div className="flex gap-2 mb-4">
              {['Santiago', 'Hernán'].map((v) => (
                <button key={v} onClick={() => setGastoPagadoPor(v)} className="flex-1 py-2 rounded-lg border text-sm font-semibold"
                  style={{ backgroundColor: gastoPagadoPor === v ? '#e53935' : 'transparent', borderColor: gastoPagadoPor === v ? '#e53935' : '#2a2a2a', color: gastoPagadoPor === v ? 'white' : '#6b7280' }}>
                  {v}
                </button>
              ))}
            </div>
            <button onClick={handleGuardarGasto} disabled={saving || !gastoDetalle || !gastoMonto} className="w-full py-3 rounded-lg font-bold text-white text-sm disabled:opacity-40" style={{ backgroundColor: '#e53935' }}>
              {saving ? 'Guardando...' : 'GUARDAR GASTO'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
