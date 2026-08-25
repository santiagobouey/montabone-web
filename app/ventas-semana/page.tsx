'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

interface Venta { fecha: string; total: number; tipo: 'pedido' | 'detalle' | 'evento' | 'mayor'; }

function lunesDe(d: Date) {
  const x = new Date(d);
  const dia = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dia);
  x.setHours(0, 0, 0, 0);
  return x;
}
const iso = (d: Date) => d.toISOString().split('T')[0];

const TIPOS = [
  { label: '📦 Pedidos', tipo: 'pedido', color: '#e53935' },
  { label: '🛒 Detalle', tipo: 'detalle', color: '#9c27b0' },
  { label: '🎪 Eventos', tipo: 'evento', color: '#ff9800' },
  { label: '⚖️ Por mayor', tipo: 'mayor', color: '#00bcd4' },
];

export default function VentasSemanaPage() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<'semanal' | 'mensual'>('semanal');
  const [semanaSel, setSemanaSel] = useState(iso(lunesDe(new Date())));
  const hoy = new Date();
  const [mesSel, setMesSel] = useState(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`);

  useEffect(() => {
    async function load() {
      try {
        // Últimos ~6 meses (cubre semanal y mensual)
        const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1);
        const inicioStr = iso(inicio);
        const [pedRes, detRes, eveRes, mayRes] = await Promise.all([
          supabase.from('pedidos').select('fecha, total').gte('fecha', inicioStr),
          supabase.from('ventas_detalle').select('fecha, total').gte('fecha', inicioStr),
          supabase.from('ventas_evento').select('total, fecha').gte('fecha', inicioStr),
          supabase.from('ventas_mayor').select('fecha, total').gte('fecha', inicioStr),
        ]);
        const arr: Venta[] = [];
        for (const p of (pedRes.data || []) as any[]) arr.push({ fecha: p.fecha, total: p.total, tipo: 'pedido' });
        for (const v of (detRes.data || []) as any[]) arr.push({ fecha: v.fecha, total: v.total, tipo: 'detalle' });
        for (const v of ((eveRes.data || []) as any[]).filter((x) => x.fecha)) arr.push({ fecha: v.fecha, total: v.total, tipo: 'evento' });
        for (const v of (mayRes.data || []) as any[]) arr.push({ fecha: v.fecha, total: v.total, tipo: 'mayor' });
        setVentas(arr);
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  const porTipoDe = (lista: Venta[], total: number) => TIPOS
    .map((t) => ({ ...t, total: lista.filter((v) => v.tipo === t.tipo).reduce((s, v) => s + v.total, 0) }))
    .filter((t) => t.total > 0)
    .map((t) => ({ ...t, pct: total > 0 ? Math.round(t.total / total * 100) : 0 }));

  // ===== SEMANAL =====
  const lunesActual = lunesDe(new Date());
  const semanas: { key: string; label: string; total: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const l = new Date(lunesActual); l.setDate(l.getDate() - i * 7);
    const key = iso(l);
    const fin = new Date(l); fin.setDate(fin.getDate() + 6);
    const total = ventas.filter((v) => iso(lunesDe(new Date(v.fecha + 'T12:00:00'))) === key).reduce((s, v) => s + v.total, 0);
    semanas.push({ key, label: `${l.getDate()}/${l.getMonth() + 1} – ${fin.getDate()}/${fin.getMonth() + 1}`, total });
  }
  const ventasSem = ventas.filter((v) => iso(lunesDe(new Date(v.fecha + 'T12:00:00'))) === semanaSel);
  const totalSem = ventasSem.reduce((s, v) => s + v.total, 0);
  const lunesSemSel = new Date(semanaSel + 'T12:00:00');
  const finSemSel = new Date(lunesSemSel); finSemSel.setDate(finSemSel.getDate() + 6);
  const porDia = DIAS.map((_, i) => ventasSem.filter((v) => ((new Date(v.fecha + 'T12:00:00').getDay() + 6) % 7) === i).reduce((s, v) => s + v.total, 0));
  const maxDia = Math.max(...porDia, 1);
  const idxSemSel = semanas.findIndex((s) => s.key === semanaSel);
  const semAnterior = idxSemSel >= 0 && idxSemSel < semanas.length - 1 ? semanas[idxSemSel + 1].total : 0;
  const vsSemAnt = semAnterior > 0 ? Math.round((totalSem - semAnterior) / semAnterior * 100) : null;

  // ===== MENSUAL =====
  const meses: { key: string; label: string; total: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const total = ventas.filter((v) => v.fecha.slice(0, 7) === key).reduce((s, v) => s + v.total, 0);
    meses.push({ key, label: `${MESES[d.getMonth()]} ${d.getFullYear()}`, total });
  }
  const ventasMes = ventas.filter((v) => v.fecha.slice(0, 7) === mesSel);
  const totalMes = ventasMes.reduce((s, v) => s + v.total, 0);
  const [anioMS, mesMS] = mesSel.split('-').map(Number);
  const idxMesSel = meses.findIndex((m) => m.key === mesSel);
  const mesAnterior = idxMesSel >= 0 && idxMesSel < meses.length - 1 ? meses[idxMesSel + 1].total : 0;
  const vsMesAnt = mesAnterior > 0 ? Math.round((totalMes - mesAnterior) / mesAnterior * 100) : null;

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Ventas</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Resumen por semana y por mes (desde que ingresa el pedido)</p>
      </div>

      {/* Toggle */}
      <div className="flex gap-2 mb-4">
        {([['semanal', '🗓️ Semanales'], ['mensual', '📆 Mensuales']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setVista(k)}
            className="flex-1 py-2.5 rounded-lg border text-sm font-bold"
            style={{ backgroundColor: vista === k ? '#e53935' : 'transparent', borderColor: vista === k ? '#e53935' : '#2a2a2a', color: vista === k ? 'white' : '#6b7280' }}>
            {lbl}
          </button>
        ))}
      </div>

      {vista === 'semanal' ? (
        <>
          {/* Semana seleccionada */}
          <div className="rounded-xl border p-5 mb-4" style={{ backgroundColor: '#141414', borderColor: '#4caf5060', borderLeftWidth: 4, borderLeftColor: '#4caf50' }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>
              📅 Semana {lunesSemSel.getDate()}/{lunesSemSel.getMonth() + 1} – {finSemSel.getDate()}/{finSemSel.getMonth() + 1}
            </p>
            <p className="text-4xl font-extrabold" style={{ color: '#4caf50' }}>{fmt(totalSem)}</p>
            <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
              {ventasSem.length} venta{ventasSem.length !== 1 ? 's' : ''}
              {vsSemAnt !== null && (<> · <span style={{ color: vsSemAnt >= 0 ? '#4caf50' : '#e53935' }}>{vsSemAnt >= 0 ? '▲' : '▼'} {Math.abs(vsSemAnt)}% vs semana anterior</span></>)}
            </p>
          </div>

          {/* Por día */}
          <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: '#6b7280' }}>Ventas por día</p>
            <svg viewBox="0 0 280 120" width="100%" style={{ display: 'block' }}>
              {porDia.map((v, i) => {
                const x = 6 + i * 39; const h = Math.round((v / maxDia) * 80);
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
          <PorTipo lista={porTipoDe(ventasSem, totalSem)} vacio="No hubo ventas esta semana" />

          {/* Comparativa */}
          <ListaComparativa titulo="Últimas semanas — toca para ver" items={semanas} sel={semanaSel} onSel={setSemanaSel} actualKey={semanas[0].key} />
        </>
      ) : (
        <>
          {/* Mes seleccionado */}
          <div className="rounded-xl border p-5 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2196f360', borderLeftWidth: 4, borderLeftColor: '#2196f3' }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>📆 {MESES[(mesMS || 1) - 1]} {anioMS}</p>
            <p className="text-4xl font-extrabold" style={{ color: '#2196f3' }}>{fmt(totalMes)}</p>
            <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
              {ventasMes.length} venta{ventasMes.length !== 1 ? 's' : ''}
              {vsMesAnt !== null && (<> · <span style={{ color: vsMesAnt >= 0 ? '#4caf50' : '#e53935' }}>{vsMesAnt >= 0 ? '▲' : '▼'} {Math.abs(vsMesAnt)}% vs mes anterior</span></>)}
            </p>
          </div>

          {/* Gráfico por mes */}
          <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: '#6b7280' }}>Ventas por mes</p>
            {(() => {
              const ordenados = [...meses].reverse(); // más viejo → más nuevo
              const maxMes = Math.max(...ordenados.map((m) => m.total), 1);
              return (
                <svg viewBox="0 0 300 130" width="100%" style={{ display: 'block' }}>
                  {ordenados.map((m, i) => {
                    const x = 6 + i * 49;
                    const h = Math.round((m.total / maxMes) * 85);
                    const sel = m.key === mesSel;
                    return (
                      <g key={m.key} onClick={() => setMesSel(m.key)} style={{ cursor: 'pointer' }}>
                        {m.total > 0 && <text x={x + 19} y={98 - h - 3} textAnchor="middle" fontSize={7.5} fill="#9ca3af" style={{ fontFamily: 'system-ui' }}>{m.total >= 1000000 ? `${(m.total / 1000000).toFixed(1)}M` : `${Math.round(m.total / 1000)}k`}</text>}
                        <rect x={x} y={98 - Math.max(h, 2)} width={38} height={Math.max(h, 2)} rx={3} fill={sel ? '#2196f3' : m.total > 0 ? '#4caf50' : '#2a2a2a'} />
                        <text x={x + 19} y={112} textAnchor="middle" fontSize={7.5} fontWeight={sel ? 'bold' : 'normal'} fill={sel ? '#2196f3' : '#6b7280'} style={{ fontFamily: 'system-ui' }}>{m.label.split(' ')[0].slice(0, 3)}</text>
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
            <p className="text-xs text-center mt-1" style={{ color: '#6b7280' }}>Toca una barra para ver ese mes</p>
          </div>

          {/* Por tipo */}
          <PorTipo lista={porTipoDe(ventasMes, totalMes)} vacio="No hubo ventas este mes" />

          {/* Comparativa */}
          <ListaComparativa titulo="Últimos meses — toca para ver" items={meses} sel={mesSel} onSel={setMesSel} actualKey={meses[0].key} />
        </>
      )}
    </div>
  );
}

function PorTipo({ lista, vacio }: { lista: { label: string; tipo: string; color: string; total: number; pct: number }[]; vacio: string }) {
  const totalGeneral = lista.reduce((s, t) => s + t.total, 0);
  return (
    <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>Por tipo de venta</p>
      </div>
      {lista.length === 0 ? (
        <p className="p-4 text-sm text-center" style={{ color: '#6b7280' }}>{vacio}</p>
      ) : lista.map((t) => (
        <div key={t.tipo} className="flex justify-between items-center px-4 py-3 border-b last:border-0" style={{ borderColor: '#2a2a2a' }}>
          <span className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>{t.label}</span>
          <div className="text-right">
            <span className="font-extrabold" style={{ color: t.color }}>{fmt(t.total)}</span>
            <span className="text-xs ml-2" style={{ color: '#6b7280' }}>{totalGeneral > 0 ? Math.round(t.total / totalGeneral * 100) : 0}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ListaComparativa({ titulo, items, sel, onSel, actualKey }: { titulo: string; items: { key: string; label: string; total: number }[]; sel: string; onSel: (k: string) => void; actualKey: string }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>{titulo}</p>
      </div>
      {items.map((s, i) => {
        const activo = s.key === sel;
        return (
          <button key={s.key} onClick={() => onSel(s.key)}
            className="w-full flex justify-between items-center px-4 py-3 text-left"
            style={{ borderBottom: i < items.length - 1 ? '1px solid #2a2a2a' : 'none', backgroundColor: activo ? '#4caf5015' : 'transparent' }}>
            <p className="text-sm font-semibold" style={{ color: activo ? '#4caf50' : '#f5f5f5' }}>{s.label}{s.key === actualKey ? ' (actual)' : ''}</p>
            <p className="font-extrabold" style={{ color: activo ? '#4caf50' : '#9ca3af' }}>{fmt(s.total)}</p>
          </button>
        );
      })}
    </div>
  );
}
