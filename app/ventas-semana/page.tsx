'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

interface Venta { fecha: string; total: number; tipo: 'pedido' | 'detalle' | 'evento' | 'mayor'; }

// Lunes (inicio de semana) de una fecha
function lunesDe(d: Date) {
  const x = new Date(d);
  const dia = (x.getDay() + 6) % 7; // 0 = lunes
  x.setDate(x.getDate() - dia);
  x.setHours(0, 0, 0, 0);
  return x;
}
const iso = (d: Date) => d.toISOString().split('T')[0];

export default function VentasSemanaPage() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [semanaSel, setSemanaSel] = useState(iso(lunesDe(new Date())));

  useEffect(() => {
    async function load() {
      try {
        const lunesActual = lunesDe(new Date());
        const inicio = new Date(lunesActual);
        inicio.setDate(inicio.getDate() - 7 * 7); // 8 semanas atrás
        const inicioStr = iso(inicio);

        const [pedRes, detRes, eveRes, mayRes] = await Promise.all([
          supabase.from('pedidos').select('fecha, total').in('estado', ['entregado', 'pagado']).gte('fecha', inicioStr),
          supabase.from('ventas_detalle').select('fecha, total').in('estado', ['entregado', 'pagado']).gte('fecha', inicioStr),
          supabase.from('ventas_evento').select('total, evento:eventos(fecha)').gte('eventos.fecha', inicioStr),
          supabase.from('ventas_mayor').select('fecha, total').in('estado', ['entregado', 'pagado']).gte('fecha', inicioStr),
        ]);

        const arr: Venta[] = [];
        for (const p of (pedRes.data || []) as any[]) arr.push({ fecha: p.fecha, total: p.total, tipo: 'pedido' });
        for (const v of (detRes.data || []) as any[]) arr.push({ fecha: v.fecha, total: v.total, tipo: 'detalle' });
        for (const v of ((eveRes.data || []) as any[]).filter((x) => x.evento)) arr.push({ fecha: v.evento.fecha, total: v.total, tipo: 'evento' });
        for (const v of (mayRes.data || []) as any[]) arr.push({ fecha: v.fecha, total: v.total, tipo: 'mayor' });
        setVentas(arr);
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  // Semanas (últimas 8, de la más nueva a la más vieja)
  const lunesActual = lunesDe(new Date());
  const semanas: { key: string; label: string; total: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const l = new Date(lunesActual); l.setDate(l.getDate() - i * 7);
    const key = iso(l);
    const fin = new Date(l); fin.setDate(fin.getDate() + 6);
    const total = ventas.filter((v) => { const vl = iso(lunesDe(new Date(v.fecha + 'T12:00:00'))); return vl === key; }).reduce((s, v) => s + v.total, 0);
    semanas.push({ key, label: `${l.getDate()}/${l.getMonth() + 1} – ${fin.getDate()}/${fin.getMonth() + 1}`, total });
  }

  // Detalle de la semana seleccionada
  const ventasSem = ventas.filter((v) => iso(lunesDe(new Date(v.fecha + 'T12:00:00'))) === semanaSel);
  const totalSem = ventasSem.reduce((s, v) => s + v.total, 0);
  const lunesSemSel = new Date(semanaSel + 'T12:00:00');
  const finSemSel = new Date(lunesSemSel); finSemSel.setDate(finSemSel.getDate() + 6);

  const porDia = DIAS.map((_, i) => {
    const total = ventasSem.filter((v) => ((new Date(v.fecha + 'T12:00:00').getDay() + 6) % 7) === i).reduce((s, v) => s + v.total, 0);
    return total;
  });
  const maxDia = Math.max(...porDia, 1);

  const porTipo = [
    { label: '📦 Pedidos', tipo: 'pedido', color: '#e53935' },
    { label: '🛒 Detalle', tipo: 'detalle', color: '#9c27b0' },
    { label: '🎪 Eventos', tipo: 'evento', color: '#ff9800' },
    { label: '⚖️ Por mayor', tipo: 'mayor', color: '#00bcd4' },
  ].map((t) => ({ ...t, total: ventasSem.filter((v) => v.tipo === t.tipo).reduce((s, v) => s + v.total, 0) }));

  // Comparación con semana anterior
  const idxSel = semanas.findIndex((s) => s.key === semanaSel);
  const totalAnterior = idxSel >= 0 && idxSel < semanas.length - 1 ? semanas[idxSel + 1].total : 0;
  const vsAnterior = totalAnterior > 0 ? Math.round((totalSem - totalAnterior) / totalAnterior * 100) : null;

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Ventas Semanales</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Resumen de tus ventas por semana (entregadas y pagadas)</p>
      </div>

      {/* Semana seleccionada */}
      <div className="rounded-xl border p-5 mb-4" style={{ backgroundColor: '#141414', borderColor: '#4caf5060', borderLeftWidth: 4, borderLeftColor: '#4caf50' }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>
          📅 Semana {lunesSemSel.getDate()}/{lunesSemSel.getMonth() + 1} – {finSemSel.getDate()}/{finSemSel.getMonth() + 1}
        </p>
        <p className="text-4xl font-extrabold" style={{ color: '#4caf50' }}>{fmt(totalSem)}</p>
        <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
          {ventasSem.length} venta{ventasSem.length !== 1 ? 's' : ''}
          {vsAnterior !== null && (
            <> · <span style={{ color: vsAnterior >= 0 ? '#4caf50' : '#e53935' }}>{vsAnterior >= 0 ? '▲' : '▼'} {Math.abs(vsAnterior)}% vs semana anterior</span></>
          )}
        </p>
      </div>

      {/* Por día */}
      <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: '#6b7280' }}>Ventas por día</p>
        <svg viewBox="0 0 280 120" width="100%" style={{ display: 'block' }}>
          {porDia.map((v, i) => {
            const x = 6 + i * 39;
            const h = Math.round((v / maxDia) * 80);
            return (
              <g key={i}>
                {v > 0 && <text x={x + 15} y={95 - h - 3} textAnchor="middle" fontSize={7} fill="#9ca3af" style={{ fontFamily: 'system-ui' }}>{v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${Math.round(v / 1000)}k`}</text>}
                <rect x={x} y={95 - Math.max(h, 2)} width={30} height={Math.max(h, 2)} rx={3} fill={v > 0 ? '#4caf50' : '#2a2a2a'} />
                <text x={x + 15} y={110} textAnchor="middle" fontSize={8} fill="#6b7280" style={{ fontFamily: 'system-ui' }}>{DIAS[i]}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Por tipo */}
      <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>Por tipo de venta</p>
        </div>
        {porTipo.filter((t) => t.total > 0).length === 0 ? (
          <p className="p-4 text-sm text-center" style={{ color: '#6b7280' }}>No hubo ventas esta semana</p>
        ) : porTipo.filter((t) => t.total > 0).map((t) => (
          <div key={t.tipo} className="flex justify-between items-center px-4 py-3 border-b last:border-0" style={{ borderColor: '#2a2a2a' }}>
            <span className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>{t.label}</span>
            <div className="text-right">
              <span className="font-extrabold" style={{ color: t.color }}>{fmt(t.total)}</span>
              <span className="text-xs ml-2" style={{ color: '#6b7280' }}>{totalSem > 0 ? Math.round(t.total / totalSem * 100) : 0}%</span>
            </div>
          </div>
        ))}
      </div>

      {/* Comparativa últimas semanas */}
      <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>Últimas semanas — toca para ver</p>
        </div>
        {semanas.map((s, i) => {
          const sel = s.key === semanaSel;
          return (
            <button key={s.key} onClick={() => setSemanaSel(s.key)}
              className="w-full flex justify-between items-center px-4 py-3 text-left"
              style={{ borderBottom: i < semanas.length - 1 ? '1px solid #2a2a2a' : 'none', backgroundColor: sel ? '#4caf5015' : 'transparent' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: sel ? '#4caf50' : '#f5f5f5' }}>{s.label}{i === 0 ? ' (actual)' : ''}</p>
              </div>
              <p className="font-extrabold" style={{ color: sel ? '#4caf50' : '#9ca3af' }}>{fmt(s.total)}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
