'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const numOf = (m: Record<string, string>, k: string) => { const n = parseInt((m[k] || '').replace(/[^\d-]/g, '')); return isNaN(n) ? 0 : n; };

// Lo que se carga a mano (la app no lo puede saber sola)
const ACTIVOS_MANUAL: [string, string][] = [
  ['efectivo', '💵 Efectivo en caja'],
  ['saldo_bancos', '🏦 Saldo en bancos'],
];
const PASIVOS_MANUAL: [string, string][] = [
  ['creditos', '🏧 Créditos / deudas'],
  ['cuotas', '📆 Cuotas por pagar'],
];

export default function SituacionFinancieraPage() {
  const [loading, setLoading] = useState(true);
  const [cxc, setCxc] = useState(0);
  const [cxcClientes, setCxcClientes] = useState(0);
  const [cxcDetalle, setCxcDetalle] = useState(0);
  const [cxp, setCxp] = useState(0);
  const [invCosto, setInvCosto] = useState(0);
  const [invVenta, setInvVenta] = useState(0);
  const [paquetes, setPaquetes] = useState(0);
  const [manual, setManual] = useState<Record<string, string>>({});
  const [datosBase, setDatosBase] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth();

  const cargar = useCallback(async () => {
    const [pedRes, detRes, cxpRes, prodRes, datosRes] = await Promise.all([
      supabase.from('pedidos').select('total').eq('estado', 'entregado'),
      supabase.from('ventas_detalle').select('total').eq('estado', 'entregado'),
      supabase.from('costos_factura').select('monto').eq('pagada', false),
      supabase.from('productos').select('stock, costo, precio'),
      supabase.from('datos_mensuales').select('datos').eq('anio', anio).eq('mes', mes).maybeSingle(),
    ]);
    const c = ((pedRes.data || []) as any[]).reduce((s, p) => s + p.total, 0);
    const dt = ((detRes.data || []) as any[]).reduce((s, v) => s + v.total, 0);
    setCxcClientes(c); setCxcDetalle(dt); setCxc(c + dt);
    setCxp(((cxpRes.data || []) as any[]).reduce((s, f) => s + f.monto, 0));
    const prods = (prodRes.data || []) as any[];
    setInvCosto(prods.reduce((s, p) => s + (p.stock || 0) * (p.costo || 0), 0));
    setInvVenta(prods.reduce((s, p) => s + (p.stock || 0) * (p.precio || 0), 0));
    setPaquetes(prods.reduce((s, p) => s + (p.stock || 0), 0));
    const datos = ((datosRes.data as any)?.datos ?? {}) as Record<string, number>;
    setDatosBase(datos);
    const str: Record<string, string> = {};
    for (const k of Object.keys(datos)) str[k] = datos[k] ? String(datos[k]) : '';
    setManual(str);
  }, [anio, mes]);

  useEffect(() => { cargar().finally(() => setLoading(false)); }, [cargar]);

  async function guardar() {
    setSaving(true);
    // Mezclar con lo que ya está guardado (gastos fijos del informe) para no borrarlo
    const datos: Record<string, number> = { ...datosBase };
    for (const [k] of [...ACTIVOS_MANUAL, ...PASIVOS_MANUAL]) datos[k] = numOf(manual, k);
    await supabase.from('datos_mensuales').upsert({ anio, mes, datos }, { onConflict: 'anio,mes' });
    setDatosBase(datos);
    setSaving(false); setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  const efectivo = numOf(manual, 'efectivo');
  const bancos = numOf(manual, 'saldo_bancos');
  const creditos = numOf(manual, 'creditos');
  const cuotas = numOf(manual, 'cuotas');

  const totalActivos = efectivo + bancos + cxc + invCosto;
  const totalPasivos = cxp + creditos + cuotas;
  const patrimonio = totalActivos - totalPasivos;
  const capitalTrabajo = totalActivos - totalPasivos;
  const razonCorriente = totalPasivos > 0 ? totalActivos / totalPasivos : null;
  const disponible = efectivo + bancos;

  const Fila = ({ k, v, color = '#f5f5f5', bold, sub }: { k: string; v: string; color?: string; bold?: boolean; sub?: string }) => (
    <div className="flex justify-between items-center py-2 border-b" style={{ borderColor: '#2a2a2a' }}>
      <div className="min-w-0 pr-2">
        <span className="text-sm" style={{ color: bold ? '#f5f5f5' : '#9ca3af', fontWeight: bold ? 700 : 400 }}>{k}</span>
        {sub && <p className="text-xs" style={{ color: '#6b7280' }}>{sub}</p>}
      </div>
      <span className="text-sm flex-shrink-0" style={{ color, fontWeight: bold ? 800 : 600 }}>{v}</span>
    </div>
  );
  const input = (k: string) => (
    <input inputMode="numeric" value={manual[k] ?? ''} onChange={(e) => setManual((m) => ({ ...m, [k]: e.target.value }))}
      placeholder="$0" className="w-28 rounded-lg px-2 py-1 text-sm text-right border no-print"
      style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
  );
  const Seccion = ({ titulo, color, children }: { titulo: string; color: string; children: React.ReactNode }) => (
    <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: color }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}><p className="text-sm font-bold" style={{ color: '#f5f5f5' }}>{titulo}</p></div>
      <div className="px-4 pb-3">{children}</div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden !important; }
          #esf-print, #esf-print * { visibility: visible !important; }
          #esf-print { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; }
          #esf-print, #esf-print * { color: #111 !important; background: #fff !important; border-color: #ccc !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
        }
        .print-only { display: none; }
      ` }} />

      <div className="flex items-center justify-between mb-4 no-print">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Situación Financiera</h1>
          <p className="text-sm" style={{ color: '#6b7280' }}>Qué tienes, qué debes y cuánto vale el negocio hoy</p>
        </div>
        <button onClick={() => window.print()} className="px-4 py-2 rounded-lg font-semibold text-sm text-white" style={{ backgroundColor: '#2196f3' }}>🖨️</button>
      </div>

      <div id="esf-print">
        <div className="print-only" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Montabone — Estado de Situación Financiera</h1>
          <p style={{ fontSize: 14, margin: '4px 0 0' }}>Al {hoy.toLocaleDateString('es-CL')}</p>
        </div>

        {/* Resumen */}
        <div className="rounded-xl border p-5 mb-3" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: patrimonio >= 0 ? '#4caf50' : '#e53935' }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>💼 Patrimonio neto</p>
          <p className="text-3xl font-extrabold" style={{ color: patrimonio >= 0 ? '#4caf50' : '#e53935' }}>{fmt(patrimonio)}</p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>Lo que tienes menos lo que debes</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: '#4caf50' }}>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>📥 Activos</p>
            <p className="text-xl font-extrabold" style={{ color: '#4caf50' }}>{fmt(totalActivos)}</p>
          </div>
          <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: '#e53935' }}>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>📤 Pasivos</p>
            <p className="text-xl font-extrabold" style={{ color: '#e53935' }}>{fmt(totalPasivos)}</p>
          </div>
        </div>

        {/* Activos */}
        <Seccion titulo="📥 Lo que tienes (Activos)" color="#4caf50">
          {ACTIVOS_MANUAL.map(([k, label]) => (
            <div key={k} className="flex justify-between items-center py-2 border-b" style={{ borderColor: '#2a2a2a' }}>
              <span className="text-sm" style={{ color: '#9ca3af' }}>{label}</span>
              <span className="print-only text-sm" style={{ color: '#f5f5f5' }}>{fmt(numOf(manual, k))}</span>
              {input(k)}
            </div>
          ))}
          <Fila k="📨 Cuentas por cobrar" v={fmt(cxc)} color="#ff9800" sub={`Clientes ${fmt(cxcClientes)} · Detalle ${fmt(cxcDetalle)}`} />
          <Fila k="📦 Inventario (a costo)" v={fmt(invCosto)} color="#2196f3" sub={`${paquetes.toLocaleString('es-CL')} paquetes · valen ${fmt(invVenta)} a precio de venta`} />
          <Fila k="Total activos" v={fmt(totalActivos)} color="#4caf50" bold />
        </Seccion>

        {/* Pasivos */}
        <Seccion titulo="📤 Lo que debes (Pasivos)" color="#e53935">
          <Fila k="🏭 Proveedores por pagar" v={fmt(cxp)} color="#e53935" sub="Facturas marcadas como no pagadas" />
          {PASIVOS_MANUAL.map(([k, label]) => (
            <div key={k} className="flex justify-between items-center py-2 border-b" style={{ borderColor: '#2a2a2a' }}>
              <span className="text-sm" style={{ color: '#9ca3af' }}>{label}</span>
              <span className="print-only text-sm" style={{ color: '#f5f5f5' }}>{fmt(numOf(manual, k))}</span>
              {input(k)}
            </div>
          ))}
          <Fila k="Total pasivos" v={fmt(totalPasivos)} color="#e53935" bold />
        </Seccion>

        <button onClick={guardar} disabled={saving}
          className="w-full py-2.5 rounded-lg font-bold text-sm text-white disabled:opacity-40 mb-4 no-print"
          style={{ backgroundColor: guardado ? '#4caf50' : '#2196f3' }}>
          {saving ? 'Guardando...' : guardado ? '✓ Guardado' : `💾 Guardar datos de ${MESES[mes]}`}
        </button>

        {/* Indicadores */}
        <Seccion titulo="📊 Cómo estás parado" color="#9c27b0">
          <Fila k="💰 Disponible ahora (caja + bancos)" v={fmt(disponible)} color={disponible >= 0 ? '#4caf50' : '#e53935'} />
          <Fila k="⚖️ Capital de trabajo" v={fmt(capitalTrabajo)} color={capitalTrabajo >= 0 ? '#4caf50' : '#e53935'}
            sub="Lo que te quedaría si cobras todo y pagas todo" />
          <Fila k="🧮 Razón corriente" v={razonCorriente === null ? '—' : razonCorriente.toFixed(2)}
            color={razonCorriente === null ? '#6b7280' : razonCorriente >= 1.5 ? '#4caf50' : razonCorriente >= 1 ? '#ff9800' : '#e53935'}
            sub="Sobre 1 puedes cubrir tus deudas; bajo 1 estás apretado" />
          <Fila k="🧊 Plata detenida en stock" v={totalActivos > 0 ? `${Math.round(invCosto / totalActivos * 100)}%` : '—'} color="#2196f3"
            sub="Mientras más alto, más plata tienes inmovilizada en productos" />
        </Seccion>

        {/* Resumen en palabras */}
        <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <p className="text-sm font-bold mb-2" style={{ color: '#f5f5f5' }}>📝 Resumen</p>
          <p className="text-sm leading-relaxed" style={{ color: '#9ca3af' }}>
            Hoy el negocio vale <span className="font-bold" style={{ color: patrimonio >= 0 ? '#4caf50' : '#e53935' }}>{fmt(patrimonio)}</span>.
            Tienes <span className="font-bold" style={{ color: '#4caf50' }}>{fmt(totalActivos)}</span> en activos
            {disponible > 0 && <>, de los cuales <span style={{ color: '#4caf50' }}>{fmt(disponible)}</span> son plata disponible</>}
            {cxc > 0 && <>, te deben <span style={{ color: '#ff9800' }}>{fmt(cxc)}</span></>}
            {invCosto > 0 && <> y tienes <span style={{ color: '#2196f3' }}>{fmt(invCosto)}</span> en stock ({paquetes.toLocaleString('es-CL')} paquetes)</>}.
            {totalPasivos > 0
              ? <> Debes <span className="font-bold" style={{ color: '#e53935' }}>{fmt(totalPasivos)}</span>
                  {cxp > 0 && <>, de los cuales {fmt(cxp)} son a proveedores</>}.</>
              : <> No tienes deudas registradas.</>}
            {razonCorriente !== null && razonCorriente < 1 && <> ⚠️ Tus deudas superan tus activos: ojo con la caja.</>}
            {razonCorriente !== null && razonCorriente >= 1.5 && <> Estás en una posición cómoda para cubrir tus deudas.</>}
          </p>
          {(disponible === 0) && (
            <p className="text-xs mt-3" style={{ color: '#6b7280' }}>
              ℹ️ No has cargado efectivo ni saldo en bancos. Sin eso, el patrimonio queda incompleto — complétalos arriba y guarda.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
