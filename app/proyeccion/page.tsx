'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

interface MesDato { key: string; label: string; total: number; real: boolean; proyeccion?: number; }

export default function ProyeccionPage() {
  const [loading, setLoading] = useState(true);
  const [meses, setMeses] = useState<MesDato[]>([]);
  const [proyMes, setProyMes] = useState(0);       // proyección cierre mes actual
  const [ventasMesActual, setVentasMesActual] = useState(0);
  const [mesAnterior, setMesAnterior] = useState(0);
  const [promedio3, setPromedio3] = useState(0);
  const [mejorMes, setMejorMes] = useState<{ label: string; total: number } | null>(null);
  const [crecimiento, setCrecimiento] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const hoy = new Date();
        // Rango: primer día de hace 5 meses
        const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1);
        const inicioStr = inicio.toISOString().split('T')[0];

        const [pedRes, detRes, eveRes] = await Promise.all([
          supabase.from('pedidos').select('fecha, total').eq('estado', 'pagado').gte('fecha', inicioStr),
          supabase.from('ventas_detalle').select('fecha, total').eq('estado', 'pagado').gte('fecha', inicioStr),
          supabase.from('ventas_evento').select('total, evento:eventos(fecha)').gte('eventos.fecha', inicioStr),
        ]);

        const totales: Record<string, number> = {};
        const sumar = (fecha: string, total: number) => {
          const k = fecha.slice(0, 7); // YYYY-MM
          totales[k] = (totales[k] || 0) + total;
        };
        for (const p of (pedRes.data || []) as any[]) sumar(p.fecha, p.total);
        for (const v of (detRes.data || []) as any[]) sumar(v.fecha, v.total);
        for (const v of ((eveRes.data || []) as any[]).filter((x) => x.evento)) sumar(v.evento.fecha, v.total);

        // 6 meses reales (5 completos + actual)
        const lista: MesDato[] = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          lista.push({ key, label: `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, total: totales[key] || 0, real: true });
        }

        const actual = lista[lista.length - 1].total;
        const completos = lista.slice(0, 5); // los 5 anteriores al actual
        const ult3 = completos.slice(-3).map((m) => m.total);
        const prom3 = ult3.length ? Math.round(ult3.reduce((a, b) => a + b, 0) / ult3.length) : 0;
        const anterior = completos[completos.length - 1]?.total ?? 0;

        // Proyección cierre mes actual según ritmo
        const diaHoy = hoy.getDate();
        const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
        const proyeccionActual = diaHoy > 0 ? Math.round(actual / diaHoy * diasMes) : actual;

        // Crecimiento: promedio últimos 3 completos vs 3 previos
        const prev3 = completos.slice(0, 2).map((m) => m.total); // solo hay 5 completos, uso los que haya
        const promPrev = prev3.length ? prev3.reduce((a, b) => a + b, 0) / prev3.length : 0;
        const crec = promPrev > 0 ? Math.round((prom3 - promPrev) / promPrev * 100) : null;

        // Marcar proyección del mes actual en la lista
        lista[lista.length - 1].proyeccion = proyeccionActual;

        // Agregar 3 meses proyectados (promedio 3)
        for (let i = 1; i <= 3; i++) {
          const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
          lista.push({ key: `p${i}`, label: `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, total: 0, real: false, proyeccion: prom3 });
        }

        const mejor = completos.reduce((best, m) => (m.total > (best?.total ?? -1) ? { label: m.label, total: m.total } : best), null as { label: string; total: number } | null);

        setMeses(lista);
        setVentasMesActual(actual);
        setProyMes(proyeccionActual);
        setMesAnterior(anterior);
        setPromedio3(prom3);
        setMejorMes(mejor);
        setCrecimiento(crec);
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  const maxVal = Math.max(...meses.map((m) => Math.max(m.total, m.proyeccion || 0)), 1);
  const vsAnterior = mesAnterior > 0 ? Math.round((proyMes - mesAnterior) / mesAnterior * 100) : null;

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Proyección</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Análisis de ventas y estimación a futuro</p>
      </div>

      {/* Proyección mes actual */}
      <div className="rounded-xl border p-5 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2196f360', borderLeftWidth: 4, borderLeftColor: '#2196f3' }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>🔮 Proyección de {MESES[new Date().getMonth()]} (cierre estimado)</p>
        <p className="text-4xl font-extrabold" style={{ color: '#2196f3' }}>{fmt(proyMes)}</p>
        <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
          Llevas {fmt(ventasMesActual)} este mes
          {vsAnterior !== null && (
            <> · <span style={{ color: vsAnterior >= 0 ? '#4caf50' : '#e53935' }}>{vsAnterior >= 0 ? '▲' : '▼'} {Math.abs(vsAnterior)}% vs mes pasado</span></>
          )}
        </p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <p className="text-xs" style={{ color: '#6b7280' }}>📊 Promedio últimos 3 meses</p>
          <p className="text-2xl font-extrabold" style={{ color: '#4caf50' }}>{fmt(promedio3)}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <p className="text-xs" style={{ color: '#6b7280' }}>🏆 Mejor mes</p>
          <p className="text-lg font-extrabold" style={{ color: '#ff9800' }}>{mejorMes ? fmt(mejorMes.total) : '—'}</p>
          <p className="text-xs" style={{ color: '#6b7280' }}>{mejorMes?.label ?? ''}</p>
        </div>
      </div>

      {/* Gráfico */}
      <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>📈 Ventas reales y proyectadas</p>
        </div>
        <div className="p-4">
          <svg viewBox={`0 0 ${meses.length * 42} 170`} width="100%" style={{ display: 'block' }}>
            {meses.map((m, i) => {
              const x = 8 + i * 42;
              const realH = Math.round((m.total / maxVal) * 120);
              const proyVal = m.proyeccion ?? 0;
              const proyH = Math.round((proyVal / maxVal) * 120);
              const esActual = m.real && m.proyeccion !== undefined; // mes en curso
              return (
                <g key={m.key}>
                  {/* Proyección (barra clara detrás) */}
                  {(!m.real || esActual) && proyH > 0 && (
                    <rect x={x} y={120 - proyH} width={28} height={proyH} rx={3} fill="#2196f3" opacity={0.25} />
                  )}
                  {/* Real (barra sólida) */}
                  {m.real && (
                    <rect x={x} y={120 - realH} width={28} height={Math.max(realH, 2)} rx={3} fill={esActual ? '#2196f3' : '#4caf50'} />
                  )}
                  {/* Valor arriba */}
                  {(m.real ? m.total : proyVal) > 0 && (
                    <text x={x + 14} y={120 - Math.max(m.real ? realH : proyH, proyH) - 4} textAnchor="middle" fontSize={7} fill="#9ca3af" style={{ fontFamily: 'system-ui' }}>
                      {(() => { const v = m.real ? (esActual ? proyVal : m.total) : proyVal; return v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${Math.round(v / 1000)}k`; })()}
                    </text>
                  )}
                  <text x={x + 14} y={135} textAnchor="middle" fontSize={7.5} fill="#6b7280" style={{ fontFamily: 'system-ui' }}>{m.label}</text>
                  {!m.real && <text x={x + 14} y={146} textAnchor="middle" fontSize={6.5} fill="#2196f3" style={{ fontFamily: 'system-ui' }}>proy.</text>}
                </g>
              );
            })}
          </svg>
          <div className="flex gap-4 justify-center mt-2">
            <span className="text-xs flex items-center gap-1" style={{ color: '#6b7280' }}><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#4caf50' }} /> Real</span>
            <span className="text-xs flex items-center gap-1" style={{ color: '#6b7280' }}><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#2196f3', opacity: 0.4 }} /> Proyectado</span>
          </div>
        </div>
      </div>

      {/* Análisis */}
      <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: '#6b7280' }}>🧠 Análisis</p>
        <div className="space-y-2">
          <p className="text-sm" style={{ color: '#f5f5f5' }}>
            📅 Al ritmo actual, <strong>{MESES[new Date().getMonth()]}</strong> cerraría en <strong style={{ color: '#2196f3' }}>{fmt(proyMes)}</strong>.
          </p>
          {vsAnterior !== null && (
            <p className="text-sm" style={{ color: '#f5f5f5' }}>
              {vsAnterior >= 0 ? '📈' : '📉'} Eso es un <strong style={{ color: vsAnterior >= 0 ? '#4caf50' : '#e53935' }}>{vsAnterior >= 0 ? '+' : ''}{vsAnterior}%</strong> respecto al mes pasado ({fmt(mesAnterior)}).
            </p>
          )}
          {crecimiento !== null && (
            <p className="text-sm" style={{ color: '#f5f5f5' }}>
              {crecimiento >= 0 ? '🚀' : '⚠️'} Tu tendencia de los últimos meses es <strong style={{ color: crecimiento >= 0 ? '#4caf50' : '#e53935' }}>{crecimiento >= 0 ? 'al alza' : 'a la baja'} ({crecimiento >= 0 ? '+' : ''}{crecimiento}%)</strong>.
            </p>
          )}
          <p className="text-sm" style={{ color: '#f5f5f5' }}>
            💡 Si mantienes el promedio, los próximos meses venderías cerca de <strong style={{ color: '#4caf50' }}>{fmt(promedio3)}</strong> mensuales.
          </p>
          {mejorMes && (
            <p className="text-sm" style={{ color: '#f5f5f5' }}>
              🏆 Tu mejor mes reciente fue <strong>{mejorMes.label}</strong> con <strong style={{ color: '#ff9800' }}>{fmt(mejorMes.total)}</strong>.
            </p>
          )}
        </div>
        <p className="text-xs mt-3 pt-3 border-t" style={{ borderColor: '#2a2a2a', color: '#4b5563' }}>
          Las proyecciones son estimaciones basadas en tus ventas pagadas de los últimos meses.
        </p>
      </div>
    </div>
  );
}
