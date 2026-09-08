'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const neto = (conIva: number) => Math.round(conIva / 1.19);

const TIPO_LABELS: Record<string, string> = {
  carniceria: 'Carnicerías', distribuidor: 'Distribuidores', restaurante: 'Restaurantes',
  supermercado: 'Supermercados', particular: 'Particulares', botilleria: 'Botillerías', otro: 'Otros',
};
const COMPRADORES_EXCLUIDOS = ['santiago bouey', 'hernan torres'];
const norm = (s: string | null) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
// No generan comisión: compras de los dueños ni ventas al cliente Kao
const sinComision = (nombre: string | null | undefined) => {
  const n = norm(nombre ?? '');
  return COMPRADORES_EXCLUIDOS.includes(n) || n.includes('kao');
};

// Campos que se cargan manualmente cada mes
const GASTOS_FIJOS: [string, string][] = [
  ['sueldos', 'Sueldos'], ['arriendo', 'Arriendo'], ['transporte', 'Transporte'], ['combustible', 'Combustible'],
  ['marketing', 'Marketing / publicidad'], ['contabilidad', 'Contabilidad'], ['servicios', 'Servicios'],
  ['gastos_bancarios', 'Gastos bancarios'], ['otros_gastos', 'Otros gastos'],
];
const SITUACION_MANUAL: [string, string][] = [
  ['saldo_bancos', 'Saldo en bancos'], ['efectivo', 'Efectivo'], ['morosos', 'Clientes morosos'],
  ['creditos', 'Créditos / deudas'], ['cuotas', 'Cuotas mensuales'],
];
const numOf = (m: Record<string, string>, k: string) => { const n = parseInt((m[k] || '').replace(/[^\d-]/g, '')); return isNaN(n) ? 0 : n; };

interface Prod { nombre: string; unidades: number; total: number; costo: number; }
interface Ent { nombre: string; total: number; }

interface Reporte {
  // Resumen / estado de resultados
  ventasTotales: number; ventasNetas: number; iva: number;
  costoVentas: number; margenBruto: number;
  comisiones: number; gastosEventos: number; gastosOper: number;
  utilidad: number;
  // Comparaciones
  ventasMesAnterior: number; ventasAnioAnterior: number;
  ventasYTD: number; costosYTD: number; comisionesYTD: number;
  // Ventas
  unidades: number; kilos: number; precioProm: number; precioPromKilo: number;
  porProducto: Prod[]; porCanal: Ent[]; topClientes: Ent[];
  // Costos producción
  cogsEstimado: number; costoUnitProm: number; facturasProv: number;
  // Situación
  cxc: number; cxp: number; invCosto: number; invVenta: number;
  cobradoAnteriores: number; pendienteAnteriores: number;
  stockUnidades: number;
}

export default function ReportesPage() {
  const [data, setData] = useState<Reporte | null>(null);
  const [loading, setLoading] = useState(true);
  const hoyDate = new Date();
  const [mesFiltro, setMesFiltro] = useState(hoyDate.getMonth());
  const [anioFiltro, setAnioFiltro] = useState(hoyDate.getFullYear());
  const [showSelectorMes, setShowSelectorMes] = useState(false);
  // Datos manuales del mes (gastos fijos + situación) y acumulado del año
  const [manual, setManual] = useState<Record<string, string>>({});
  const [manualAnio, setManualAnio] = useState<Record<string, number>[]>([]);
  const [savingManual, setSavingManual] = useState(false);
  const [guardadoManual, setGuardadoManual] = useState(false);

  async function guardarManual() {
    setSavingManual(true);
    const datos: Record<string, number> = {};
    for (const [k] of [...GASTOS_FIJOS, ...SITUACION_MANUAL, ['otros_ingresos', '']]) datos[k] = numOf(manual, k);
    // Capturar el stock actual como "stock al cierre" de este mes (solo si es el mes en curso)
    const esActual = anioFiltro === hoyDate.getFullYear() && mesFiltro === hoyDate.getMonth();
    if (esActual && data) { datos.stock_valor = data.invVenta; datos.stock_unidades = data.stockUnidades; }
    else { if (numOf(manual, 'stock_valor')) datos.stock_valor = numOf(manual, 'stock_valor'); if (numOf(manual, 'stock_unidades')) datos.stock_unidades = numOf(manual, 'stock_unidades'); }
    await supabase.from('datos_mensuales').upsert({ anio: anioFiltro, mes: mesFiltro, datos }, { onConflict: 'anio,mes' });
    setSavingManual(false);
    setGuardadoManual(true);
    setTimeout(() => setGuardadoManual(false), 2500);
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const inicio = iso(new Date(anioFiltro, mesFiltro, 1));
        const fin = iso(new Date(anioFiltro, mesFiltro + 1, 0));
        const inicioAnio = iso(new Date(anioFiltro, 0, 1));
        const rangoAmplio = iso(new Date(anioFiltro - 1, 0, 1)); // desde ene del año anterior

        const [
          pedM, detM, eveM, mayM, cli, costM, prods, eveGastos,
          pedW, detW, eveW, mayW, costW,
          pedCxc, detCxc, costCxp, datosAnioRes,
          pedCobAnt, detCobAnt, pedPendAnt, detPendAnt,
        ] = await Promise.all([
          supabase.from('pedidos').select('cliente_id, total, estado, detalle:detalle_pedido(cantidad, precio_unitario, producto:productos(nombre, costo))').gte('fecha', inicio).lte('fecha', fin),
          supabase.from('ventas_detalle').select('total, nombre_comprador, items:items_venta_detalle(cantidad, precio_unitario, producto:productos(nombre, costo))').gte('fecha', inicio).lte('fecha', fin),
          supabase.from('ventas_evento').select('total, cantidad, producto:productos(nombre, costo)').gte('fecha', inicio).lte('fecha', fin),
          supabase.from('ventas_mayor').select('total, costo, cliente:clientes(nombre), items:items_venta_mayor(kilos, subtotal)').gte('fecha', inicio).lte('fecha', fin),
          supabase.from('clientes').select('id, nombre, tipo'),
          supabase.from('costos_factura').select('monto').gte('created_at', inicio).lte('created_at', fin + 'T23:59:59'),
          supabase.from('productos').select('nombre, stock, costo, precio'),
          supabase.from('eventos').select('fecha, gastos(monto)').gte('fecha', inicio).lte('fecha', fin),
          // Amplio (comparaciones + YTD): solo totales + fecha
          supabase.from('pedidos').select('fecha, total, cliente:clientes(nombre)').gte('fecha', rangoAmplio).lte('fecha', fin),
          supabase.from('ventas_detalle').select('fecha, total, nombre_comprador').gte('fecha', rangoAmplio).lte('fecha', fin),
          supabase.from('ventas_evento').select('fecha, total').gte('fecha', rangoAmplio).lte('fecha', fin),
          supabase.from('ventas_mayor').select('fecha, total').gte('fecha', rangoAmplio).lte('fecha', fin),
          supabase.from('costos_factura').select('created_at, monto').gte('created_at', rangoAmplio).lte('created_at', fin + 'T23:59:59'),
          // Snapshot situación (todo lo pendiente, sin filtro de mes)
          supabase.from('pedidos').select('total').eq('estado', 'entregado'),
          supabase.from('ventas_detalle').select('total').eq('estado', 'entregado'),
          supabase.from('costos_factura').select('monto').eq('pagada', false),
          supabase.from('datos_mensuales').select('mes, datos').eq('anio', anioFiltro),
          // Cobrado este mes de ventas de meses anteriores (fecha_pago en el mes, venta previa)
          supabase.from('pedidos').select('total').eq('estado', 'pagado').lt('fecha', inicio).gte('fecha_pago', inicio).lte('fecha_pago', fin),
          supabase.from('ventas_detalle').select('total').eq('estado', 'pagado').lt('fecha', inicio).gte('fecha_pago', inicio).lte('fecha_pago', fin),
          // Aún pendiente de cobro de meses anteriores (entregado sin pagar, venta previa al mes)
          supabase.from('pedidos').select('total').eq('estado', 'entregado').lt('fecha', inicio),
          supabase.from('ventas_detalle').select('total').eq('estado', 'entregado').lt('fecha', inicio),
        ]);

        // Datos manuales: mes seleccionado (a inputs) y todos los del año (para acumulado)
        const filasAnio = (datosAnioRes.data || []) as { mes: number; datos: Record<string, number> }[];
        const delMes = filasAnio.find((f) => f.mes === mesFiltro)?.datos ?? {};
        const manualStr: Record<string, string> = {};
        for (const k of Object.keys(delMes)) manualStr[k] = delMes[k] ? String(delMes[k]) : '';
        setManual(manualStr);
        setManualAnio(filasAnio.map((f) => f.datos || {}));

        const cliMap = new Map(((cli.data || []) as any[]).map((c) => [c.id, c]));

        // ---- Ventas del mes por fuente ----
        const vPed = ((pedM.data || []) as any[]).reduce((s, p) => s + p.total, 0);
        const vDet = ((detM.data || []) as any[]).reduce((s, v) => s + v.total, 0);
        const vEve = ((eveM.data || []) as any[]).reduce((s, v) => s + v.total, 0);
        const vMay = ((mayM.data || []) as any[]).reduce((s, v) => s + v.total, 0);
        const ventasTotales = vPed + vDet + vEve + vMay;
        const ventasNetas = neto(ventasTotales);
        const iva = ventasTotales - ventasNetas;

        // ---- Unidades, kilos, producto, COGS ----
        const prodMap: Record<string, Prod> = {};
        const sumaProd = (nombre: string, uni: number, total: number, costo: number) => {
          if (!prodMap[nombre]) prodMap[nombre] = { nombre, unidades: 0, total: 0, costo: 0 };
          prodMap[nombre].unidades += uni; prodMap[nombre].total += total; prodMap[nombre].costo += costo;
        };
        let unidades = 0, cogsEstimado = 0;
        for (const p of (pedM.data || []) as any[]) for (const d of (p.detalle || [])) {
          const c = d.producto?.costo ?? 0; unidades += d.cantidad; cogsEstimado += d.cantidad * c;
          sumaProd(d.producto?.nombre ?? '—', d.cantidad, d.cantidad * d.precio_unitario, d.cantidad * c);
        }
        for (const v of (detM.data || []) as any[]) for (const i of (v.items || [])) {
          const c = i.producto?.costo ?? 0; unidades += i.cantidad; cogsEstimado += i.cantidad * c;
          sumaProd(i.producto?.nombre ?? '—', i.cantidad, i.cantidad * i.precio_unitario, i.cantidad * c);
        }
        for (const v of (eveM.data || []) as any[]) {
          const c = v.producto?.costo ?? 0; unidades += (v.cantidad || 0); cogsEstimado += (v.cantidad || 0) * c;
          sumaProd(v.producto?.nombre ?? '—', v.cantidad || 0, v.total, (v.cantidad || 0) * c);
        }
        const kilos = ((mayM.data || []) as any[]).reduce((s, v) => s + (v.items || []).reduce((a: number, i: any) => a + (i.kilos || 0), 0), 0);
        const costoMayor = ((mayM.data || []) as any[]).reduce((s, v) => s + (v.costo || 0), 0);
        cogsEstimado += costoMayor;
        const porProducto = Object.values(prodMap).sort((a, b) => b.total - a.total);
        const precioProm = unidades > 0 ? (vPed + vDet + vEve) / unidades : 0;
        const precioPromKilo = kilos > 0 ? neto(vMay) / kilos : 0;
        const costoUnitProm = unidades > 0 ? (cogsEstimado - costoMayor) / unidades : 0;

        // ---- Por canal ----
        const canal: Record<string, number> = {};
        for (const p of (pedM.data || []) as any[]) {
          const t = cliMap.get(p.cliente_id)?.tipo ?? 'otro';
          const lbl = TIPO_LABELS[t] ?? 'Otros'; canal[lbl] = (canal[lbl] || 0) + p.total;
        }
        if (vDet > 0) canal['Venta directa'] = (canal['Venta directa'] || 0) + vDet;
        if (vEve > 0) canal['Eventos'] = (canal['Eventos'] || 0) + vEve;
        if (vMay > 0) canal['Por mayor'] = (canal['Por mayor'] || 0) + vMay;
        const porCanal = Object.entries(canal).map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total);

        // ---- Por cliente (top 10) ----
        const clienteMap: Record<string, number> = {};
        for (const p of (pedM.data || []) as any[]) {
          const n = cliMap.get(p.cliente_id)?.nombre ?? 'Sin cliente'; clienteMap[n] = (clienteMap[n] || 0) + p.total;
        }
        for (const v of (mayM.data || []) as any[]) {
          const n = v.cliente?.nombre ?? 'Sin cliente'; clienteMap[n] = (clienteMap[n] || 0) + v.total;
        }
        for (const v of (detM.data || []) as any[]) {
          const n = (v.nombre_comprador || '').trim() || 'Al detalle'; clienteMap[n] = (clienteMap[n] || 0) + v.total;
        }
        const topClientes = Object.entries(clienteMap).map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total).slice(0, 10);

        // ---- Costos / gastos del mes ----
        const facturasProv = ((costM.data || []) as any[]).reduce((s, f) => s + f.monto, 0);
        const gastosEventos = ((eveGastos.data || []) as any[]).reduce((s, e) => s + (e.gastos || []).reduce((a: number, g: any) => a + g.monto, 0), 0);
        // Comisiones (5%): pedidos + detalle excepto compradores excluidos
        const comisiones =
          ((pedM.data || []) as any[]).filter((p) => !sinComision(cliMap.get(p.cliente_id)?.nombre)).reduce((s, p) => s + Math.round(p.total * 0.05), 0) +
          ((detM.data || []) as any[]).filter((v) => !sinComision(v.nombre_comprador)).reduce((s, v) => s + Math.round(v.total * 0.05), 0);
        const gastosOper = comisiones + gastosEventos;
        const costoVentas = facturasProv;
        const margenBruto = ventasNetas - costoVentas;
        const utilidad = margenBruto - gastosOper;

        // ---- Comparaciones (rango amplio, por fecha) ----
        const sumaEntre = (desde: string, hasta: string) => {
          const f = (rows: any[] | null | undefined) => (rows || []).filter((r) => r.fecha >= desde && r.fecha <= hasta).reduce((s, r) => s + r.total, 0);
          return f(pedW.data as any[]) + f(detW.data as any[]) + f(eveW.data as any[]) + f(mayW.data as any[]);
        };
        const iniMesAnt = iso(new Date(anioFiltro, mesFiltro - 1, 1));
        const finMesAnt = iso(new Date(anioFiltro, mesFiltro, 0));
        const iniAnioAnt = iso(new Date(anioFiltro - 1, mesFiltro, 1));
        const finAnioAnt = iso(new Date(anioFiltro - 1, mesFiltro + 1, 0));
        const ventasMesAnterior = sumaEntre(iniMesAnt, finMesAnt);
        const ventasAnioAnterior = sumaEntre(iniAnioAnt, finAnioAnt);
        const ventasYTD = sumaEntre(inicioAnio, fin);
        const costosYTD = ((costW.data || []) as any[]).filter((c) => c.created_at >= inicioAnio).reduce((s, c) => s + c.monto, 0);
        const comisionesYTD = Math.round(
          ((pedW.data || []) as any[]).filter((r) => r.fecha >= inicioAnio && !sinComision(r.cliente?.nombre)).reduce((s, r) => s + r.total * 0.05, 0) +
          ((detW.data || []) as any[]).filter((r) => r.fecha >= inicioAnio && !sinComision(r.nombre_comprador)).reduce((s, r) => s + r.total * 0.05, 0)
        );

        // ---- Situación ----
        const cxc = ((pedCxc.data || []) as any[]).reduce((s, p) => s + p.total, 0) + ((detCxc.data || []) as any[]).reduce((s, v) => s + v.total, 0);
        const cxp = ((costCxp.data || []) as any[]).reduce((s, f) => s + f.monto, 0);
        const invCosto = ((prods.data || []) as any[]).reduce((s, p) => s + (p.stock || 0) * (p.costo || 0), 0);
        const invVenta = ((prods.data || []) as any[]).reduce((s, p) => s + (p.stock || 0) * (p.precio || 0), 0);
        const stockUnidades = ((prods.data || []) as any[]).reduce((s, p) => s + (p.stock || 0), 0);
        const cobradoAnteriores = ((pedCobAnt.data || []) as any[]).reduce((s, p) => s + p.total, 0) + ((detCobAnt.data || []) as any[]).reduce((s, v) => s + v.total, 0);
        const pendienteAnteriores = ((pedPendAnt.data || []) as any[]).reduce((s, p) => s + p.total, 0) + ((detPendAnt.data || []) as any[]).reduce((s, v) => s + v.total, 0);

        setData({
          ventasTotales, ventasNetas, iva, costoVentas, margenBruto, comisiones, gastosEventos, gastosOper, utilidad,
          ventasMesAnterior, ventasAnioAnterior, ventasYTD, costosYTD, comisionesYTD,
          unidades, kilos, precioProm, precioPromKilo, porProducto, porCanal, topClientes,
          cogsEstimado, costoUnitProm, facturasProv, cxc, cxp, invCosto, invVenta,
          cobradoAnteriores, pendienteAnteriores, stockUnidades,
        });
      } catch {}
      setLoading(false);
    }
    load();
  }, [mesFiltro, anioFiltro]);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;
  const d = data;
  const pct = (act: number, ant: number) => ant > 0 ? Math.round((act - ant) / ant * 100) : null;
  const pctMes = pct(d?.ventasTotales ?? 0, d?.ventasMesAnterior ?? 0);
  const pctAnio = pct(d?.ventasTotales ?? 0, d?.ventasAnioAnterior ?? 0);
  const totalVentasClientes = (d?.topClientes ?? []).reduce((s, c) => s + c.total, 0);
  const esMesActual = anioFiltro === hoyDate.getFullYear() && mesFiltro === hoyDate.getMonth();
  const netaYTD = neto(d?.ventasYTD ?? 0);
  const margenYTD = netaYTD - (d?.costosYTD ?? 0);

  // Manual (gastos fijos + situación) del mes y acumulado del año
  const gastosFijos = GASTOS_FIJOS.reduce((s, [k]) => s + numOf(manual, k), 0);
  const otrosIngresos = numOf(manual, 'otros_ingresos');
  const gastosOperMes = (d?.gastosOper ?? 0) + gastosFijos;
  const utilidadFinal = (d?.margenBruto ?? 0) - gastosOperMes + otrosIngresos;
  const gastosFijosYTD = manualAnio.reduce((s, m) => s + GASTOS_FIJOS.reduce((a, [k]) => a + (m[k] || 0), 0), 0);
  const otrosIngresosYTD = manualAnio.reduce((s, m) => s + (m.otros_ingresos || 0), 0);
  const gastosOperYTD = (d?.comisionesYTD ?? 0) + gastosFijosYTD;
  const utilidadYTD = margenYTD - gastosOperYTD + otrosIngresosYTD;
  const inputManual = (k: string) => (
    <input inputMode="numeric" value={manual[k] ?? ''} onChange={(e) => setManual((m) => ({ ...m, [k]: e.target.value }))}
      placeholder="$0" className="w-28 rounded-lg px-2 py-1 text-sm text-right border no-print"
      style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
  );

  const Card = ({ label, value, color = '#f5f5f5', sub }: { label: string; value: string; color?: string; sub?: string }) => (
    <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
      <p className="text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>{label}</p>
      <p className="text-xl font-extrabold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{sub}</p>}
    </div>
  );
  const Seccion = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
    <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}><p className="text-sm font-bold" style={{ color: '#f5f5f5' }}>{titulo}</p></div>
      <div className="p-4">{children}</div>
    </div>
  );
  const Fila = ({ k, v, color = '#f5f5f5', bold }: { k: string; v: string; color?: string; bold?: boolean }) => (
    <div className="flex justify-between items-center py-1.5 border-b" style={{ borderColor: '#2a2a2a' }}>
      <span className="text-sm" style={{ color: bold ? '#f5f5f5' : '#9ca3af', fontWeight: bold ? 700 : 400 }}>{k}</span>
      <span className="text-sm" style={{ color, fontWeight: bold ? 800 : 600 }}>{v}</span>
    </div>
  );

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-3xl mx-auto">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden !important; }
          #reporte-print, #reporte-print * { visibility: visible !important; }
          #reporte-print { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; }
          #reporte-print, #reporte-print * { color: #111 !important; background: #fff !important; border-color: #ccc !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
        }
        .print-only { display: none; }
      ` }} />

      <div className="flex items-center justify-between mb-4 no-print">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Informe Mensual</h1>
        <button onClick={() => window.print()} className="px-4 py-2 rounded-lg font-semibold text-sm text-white" style={{ backgroundColor: '#2196f3' }}>🖨️ Imprimir</button>
      </div>

      {/* Selector de mes */}
      <button onClick={() => setShowSelectorMes(!showSelectorMes)} className="w-full flex items-center justify-between rounded-xl border px-4 py-3 mb-4 no-print" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <p className="font-bold" style={{ color: '#f5f5f5' }}>📅 {MESES[mesFiltro]} {anioFiltro}</p>
        <span style={{ color: '#6b7280' }}>{showSelectorMes ? '▲' : '▼'}</span>
      </button>
      {showSelectorMes && (
        <div className="rounded-xl border p-4 mb-4 no-print" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setAnioFiltro(anioFiltro - 1)} className="w-8 h-8 rounded-lg border" style={{ borderColor: '#2a2a2a', color: '#f5f5f5' }}>‹</button>
            <p className="font-bold" style={{ color: '#f5f5f5' }}>{anioFiltro}</p>
            <button onClick={() => setAnioFiltro(anioFiltro + 1)} disabled={anioFiltro >= hoyDate.getFullYear()} className="w-8 h-8 rounded-lg border disabled:opacity-30" style={{ borderColor: '#2a2a2a', color: '#f5f5f5' }}>›</button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {MESES.map((m, i) => {
              const esFuturo = anioFiltro === hoyDate.getFullYear() && i > hoyDate.getMonth();
              return (
                <button key={m} onClick={() => { if (!esFuturo) { setMesFiltro(i); setShowSelectorMes(false); } }} disabled={esFuturo}
                  className="py-2 rounded-lg text-xs font-semibold border disabled:opacity-30"
                  style={{ borderColor: mesFiltro === i ? '#e53935' : '#2a2a2a', backgroundColor: mesFiltro === i ? '#e5393520' : 'transparent', color: mesFiltro === i ? '#e53935' : '#9ca3af' }}>
                  {m.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div id="reporte-print">
        <div className="print-only" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Montabone — Informe Mensual</h1>
          <p style={{ fontSize: 14, margin: '4px 0 0' }}>{MESES[mesFiltro]} {anioFiltro} · Emitido {new Date().toLocaleDateString('es-CL')}</p>
        </div>

        {/* 1. Resumen ejecutivo */}
        <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: '#6b7280' }}>1 · Resumen ejecutivo</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <Card label="Ventas totales" value={fmt(d?.ventasTotales ?? 0)} color="#4caf50" />
          <Card label="Costos (facturas)" value={fmt(d?.costoVentas ?? 0)} color="#e53935" />
          <Card label="Margen bruto" value={fmt(d?.margenBruto ?? 0)} color="#2196f3" />
          <Card label="Gastos operac." value={fmt(gastosOperMes)} color="#ff9800" />
          <Card label={utilidadFinal < 0 ? 'Pérdida del mes' : 'Utilidad del mes'} value={fmt(utilidadFinal)} color={utilidadFinal < 0 ? '#e53935' : '#4caf50'} />
          <Card label="vs mes / año ant." value={`${pctMes === null ? '—' : (pctMes >= 0 ? '+' : '') + pctMes + '%'} / ${pctAnio === null ? '—' : (pctAnio >= 0 ? '+' : '') + pctAnio + '%'}`} color="#9c27b0"
            sub={`Ant: ${fmt(d?.ventasMesAnterior ?? 0)} · ${fmt(d?.ventasAnioAnterior ?? 0)}`} />
          {esMesActual ? (
            <Card label="Stock actual (a venta)" value={fmt(d?.invVenta ?? 0)} color="#00bcd4"
              sub={`${(d?.stockUnidades ?? 0).toLocaleString('es-CL')} paq. · a hoy · queda ${(() => { const st = d?.stockUnidades ?? 0; const ve = d?.unidades ?? 0; return st + ve > 0 ? Math.round(st / (st + ve) * 100) : 0; })()}%`} />
          ) : (numOf(manual, 'stock_valor') > 0 || numOf(manual, 'stock_unidades') > 0) ? (
            <Card label="Stock al cierre del mes" value={fmt(numOf(manual, 'stock_valor'))} color="#00bcd4"
              sub={`${numOf(manual, 'stock_unidades').toLocaleString('es-CL')} paq.`} />
          ) : (
            <Card label="Stock del mes" value="—" color="#6b7280" sub="Sin registro (guarda los datos ese mes)" />
          )}
        </div>

        {/* 2. Ventas */}
        <Seccion titulo="2 · Ventas">
          <Fila k="Facturación neta (sin IVA)" v={fmt(d?.ventasNetas ?? 0)} />
          <Fila k="IVA (19%)" v={fmt(d?.iva ?? 0)} color="#ff9800" />
          <Fila k="Ventas totales (con IVA)" v={fmt(d?.ventasTotales ?? 0)} color="#4caf50" bold />
          <Fila k="Unidades vendidas (paquetes)" v={`${(d?.unidades ?? 0).toLocaleString('es-CL')} u.`} />
          <Fila k="Kilos vendidos (por mayor)" v={`${(d?.kilos ?? 0).toLocaleString('es-CL')} kg`} />
          <Fila k="Precio promedio por unidad" v={fmt(d?.precioProm ?? 0)} />
          <Fila k="Precio promedio por kilo (neto)" v={fmt(d?.precioPromKilo ?? 0)} />
        </Seccion>

        <Seccion titulo="Ventas por producto">
          {(d?.porProducto ?? []).length === 0 ? <p className="text-sm" style={{ color: '#6b7280' }}>Sin ventas</p> :
            (d?.porProducto ?? []).map((p) => (
              <Fila key={p.nombre} k={`${p.nombre} · ${p.unidades} u.`} v={fmt(p.total)} color="#4caf50" />
            ))}
        </Seccion>

        <Seccion titulo="Ventas por canal">
          {(d?.porCanal ?? []).map((c) => {
            const p = (d?.ventasTotales ?? 0) > 0 ? Math.round(c.total / (d!.ventasTotales) * 100) : 0;
            return <Fila key={c.nombre} k={`${c.nombre} · ${p}%`} v={fmt(c.total)} />;
          })}
        </Seccion>

        <Seccion titulo="Top 10 clientes">
          {(d?.topClientes ?? []).map((c, i) => {
            const p = totalVentasClientes > 0 ? Math.round(c.total / totalVentasClientes * 100) : 0;
            return <Fila key={c.nombre} k={`${i + 1}. ${c.nombre} · ${p}%`} v={fmt(c.total)} color={i === 0 ? '#ff9800' : '#f5f5f5'} />;
          })}
        </Seccion>

        {/* 3. Costos de producción */}
        <Seccion titulo="3 · Costos de producción">
          <Fila k="Costo estimado de lo vendido" v={fmt(d?.cogsEstimado ?? 0)} color="#e53935" />
          <Fila k="Costo promedio por unidad" v={fmt(d?.costoUnitProm ?? 0)} />
          <Fila k="Facturas de proveedores (mes)" v={fmt(d?.facturasProv ?? 0)} color="#e53935" />
          <Fila k="Margen bruto por unidad" v={fmt((d?.precioProm ?? 0) / 1.19 - (d?.costoUnitProm ?? 0))} color="#4caf50" />
          <p className="text-xs mt-2" style={{ color: '#6b7280' }}>ℹ️ El costo estimado usa el costo unitario de cada producto (ficha en Inventario). El desglose por kg (materia prima, mano de obra, envase, transporte, merma) requiere cargar esos datos — lo puedo agregar si quieres registrarlos.</p>
        </Seccion>

        {/* 4. Gastos */}
        <Seccion titulo="4 · Gastos de la empresa">
          <Fila k="Comisiones vendedores (5%)" v={fmt(d?.comisiones ?? 0)} color="#ff9800" />
          <Fila k="Gastos de eventos" v={fmt(d?.gastosEventos ?? 0)} color="#ff9800" />
          <p className="text-xs font-bold uppercase tracking-wide mt-3 mb-1" style={{ color: '#6b7280' }}>Gastos fijos del mes (los cargas tú)</p>
          {GASTOS_FIJOS.map(([k, label]) => (
            <div key={k} className="flex justify-between items-center py-1.5 border-b" style={{ borderColor: '#2a2a2a' }}>
              <span className="text-sm" style={{ color: '#9ca3af' }}>{label}</span>
              <span className="print-only text-sm" style={{ color: '#f5f5f5' }}>{fmt(numOf(manual, k))}</span>
              {inputManual(k)}
            </div>
          ))}
          <Fila k="Total gastos operacionales" v={fmt(gastosOperMes)} color="#ff9800" bold />
          <button onClick={guardarManual} disabled={savingManual}
            className="w-full mt-3 py-2 rounded-lg font-bold text-sm text-white disabled:opacity-40 no-print"
            style={{ backgroundColor: guardadoManual ? '#4caf50' : '#2196f3' }}>
            {savingManual ? 'Guardando...' : guardadoManual ? '✓ Guardado' : '💾 Guardar datos del mes'}
          </button>
        </Seccion>

        {/* 5. Estado de resultados */}
        <Seccion titulo="5 · Estado de resultados">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-sm">
            <span className="font-bold py-1" style={{ color: '#6b7280' }}>Concepto</span>
            <span className="font-bold py-1 text-right" style={{ color: '#6b7280' }}>Mes</span>
            <span className="font-bold py-1 text-right" style={{ color: '#6b7280' }}>Año</span>
            {[
              ['Ventas netas', d?.ventasNetas ?? 0, netaYTD, '#4caf50'],
              ['(-) Costo de ventas', -(d?.costoVentas ?? 0), -(d?.costosYTD ?? 0), '#e53935'],
              ['Margen bruto', d?.margenBruto ?? 0, margenYTD, '#2196f3'],
              ['(-) Gastos operac.', -gastosOperMes, -gastosOperYTD, '#ff9800'],
              ['Resultado operacional', (d?.margenBruto ?? 0) - gastosOperMes, margenYTD - gastosOperYTD, '#2196f3'],
              ['Otros ingresos/gastos', otrosIngresos, otrosIngresosYTD, '#9c27b0'],
              ['Utilidad final', utilidadFinal, utilidadYTD, utilidadFinal < 0 ? '#e53935' : '#4caf50'],
            ].map(([k, mes, anio, color], idx) => (
              <div key={idx} className="contents">
                <span className="py-1.5 border-t" style={{ borderColor: '#2a2a2a', color: '#9ca3af' }}>{k as string}</span>
                <span className="py-1.5 border-t text-right font-semibold" style={{ borderColor: '#2a2a2a', color: color as string }}>{fmt(mes as number)}</span>
                <span className="py-1.5 border-t text-right font-semibold" style={{ borderColor: '#2a2a2a', color: color as string }}>{fmt(anio as number)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center py-1.5 mt-2 border-t no-print" style={{ borderColor: '#2a2a2a' }}>
            <span className="text-sm" style={{ color: '#9ca3af' }}>Otros ingresos (+) / gastos (−)</span>
            {inputManual('otros_ingresos')}
          </div>
          <p className="text-xs mt-2" style={{ color: '#6b7280' }}>El acumulado del año suma los gastos fijos y otros que hayas cargado en cada mes. Recuerda guardar.</p>
        </Seccion>

        {/* Cobros de meses anteriores */}
        <Seccion titulo={`Cobros de meses anteriores (en ${MESES[mesFiltro]})`}>
          <Fila k="✅ Cobrado este mes (ventas de meses anteriores)" v={fmt(d?.cobradoAnteriores ?? 0)} color="#4caf50" />
          <Fila k="⏳ Aún deben de meses anteriores" v={fmt(d?.pendienteAnteriores ?? 0)} color="#e53935" />
          <p className="text-xs mt-2" style={{ color: '#6b7280' }}>ℹ️ &quot;Cobrado este mes&quot; cuenta las ventas que quedaron pendientes de un mes anterior y que se marcaron pagadas dentro de {MESES[mesFiltro]}. Se registra desde ahora en adelante (los pagos marcados antes de este cambio no tienen fecha de pago).</p>
        </Seccion>

        {/* 6. Situación financiera */}
        <Seccion titulo="6 · Situación (a hoy)">
          <Fila k="Cuentas por cobrar (entregado sin pagar)" v={fmt(d?.cxc ?? 0)} color="#ff9800" />
          <Fila k="Cuentas por pagar (facturas proveedor)" v={fmt(d?.cxp ?? 0)} color="#e53935" />
          <Fila k="Inventario valorizado (a costo)" v={fmt(d?.invCosto ?? 0)} />
          <Fila k="Inventario valorizado (a venta)" v={fmt(d?.invVenta ?? 0)} color="#2196f3" />
          <p className="text-xs font-bold uppercase tracking-wide mt-3 mb-1" style={{ color: '#6b7280' }}>Datos del mes (los cargas tú)</p>
          {SITUACION_MANUAL.map(([k, label]) => (
            <div key={k} className="flex justify-between items-center py-1.5 border-b" style={{ borderColor: '#2a2a2a' }}>
              <span className="text-sm" style={{ color: '#9ca3af' }}>{label}</span>
              <span className="print-only text-sm" style={{ color: '#f5f5f5' }}>{fmt(numOf(manual, k))}</span>
              {inputManual(k)}
            </div>
          ))}
          <button onClick={guardarManual} disabled={savingManual}
            className="w-full mt-3 py-2 rounded-lg font-bold text-sm text-white disabled:opacity-40 no-print"
            style={{ backgroundColor: guardadoManual ? '#4caf50' : '#2196f3' }}>
            {savingManual ? 'Guardando...' : guardadoManual ? '✓ Guardado' : '💾 Guardar datos del mes'}
          </button>
        </Seccion>
      </div>
    </div>
  );
}
