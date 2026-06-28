'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

interface Periodo {
  id: string;
  nombre: string;
  fecha_inicio: string | null;
  fecha_cierre: string;
  total_ventas: number;
  total_utilidad: number;
  total_pedidos: number;
  producto_mas_vendido: string | null;
  ticket_promedio: number;
  created_at: string;
}

interface VentaCliente { nombre: string; total: number; pedidos: number; }
interface VentaDetalleCli { nombre: string; total: number; ventas: number; }

interface InformeDetalle {
  periodo: Periodo;
  ventasClientes: VentaCliente[];
  ventasDetalleCli: VentaDetalleCli[];
  totalPedidos: number;
  totalDetalle: number;
}

export default function PeriodosPage() {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [cerrando, setCerrando] = useState(false);
  const [reabriendo, setReabriendo] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showReabrirModal, setShowReabrirModal] = useState(false);
  const [nombre, setNombre] = useState('');
  const [informe, setInforme] = useState<InformeDetalle | null>(null);
  const [statsActuales, setStatsActuales] = useState<{ ventas: number; pedidos: number } | null>(null);

  const fetchPeriodos = useCallback(async () => {
    const { data } = await supabase.from('periodos').select('*').order('created_at', { ascending: false });
    setPeriodos(data || []);
  }, []);

  const fetchStatsActuales = useCallback(async () => {
    const [pedidosRes, detalleRes] = await Promise.all([
      supabase.from('pedidos').select('total').is('periodo_id', null),
      supabase.from('ventas_detalle').select('total').is('periodo_id', null),
    ]);
    const pedidos = pedidosRes.data || [];
    const detalle = detalleRes.data || [];
    setStatsActuales({
      ventas: [...pedidos, ...detalle].reduce((s, x) => s + x.total, 0),
      pedidos: pedidos.length,
    });
  }, []);

  useEffect(() => {
    Promise.all([fetchPeriodos(), fetchStatsActuales()]).finally(() => setLoading(false));
  }, [fetchPeriodos, fetchStatsActuales]);

  async function cerrarPeriodo() {
    if (!nombre) return;
    setCerrando(true);
    try {
      const [pedidosRes, detalleRes, eventosRes] = await Promise.all([
        supabase.from('pedidos').select('id, total, fecha, cliente:clientes(nombre), detalle:detalle_pedido(cantidad, precio_unitario, producto:productos(nombre, costo))').is('periodo_id', null),
        supabase.from('ventas_detalle').select('id, total, nombre_comprador, items:items_venta_detalle(cantidad, precio_unitario, producto:productos(nombre, costo))').is('periodo_id', null),
        supabase.from('ventas_evento').select('id, total, cantidad, precio_unitario, producto:productos(nombre, costo)').is('periodo_id', null),
      ]);

      const pedidos = (pedidosRes.data || []) as any[];
      const detalle = (detalleRes.data || []) as any[];
      const eventos = (eventosRes.data || []) as any[];

      const totalVentas = [...pedidos, ...detalle, ...eventos].reduce((s, x) => s + x.total, 0);
      const totalPedidosVentas = pedidos.reduce((s: number, x: any) => s + x.total, 0);
      const totalDetalleVentas = detalle.reduce((s: number, x: any) => s + x.total, 0);

      let totalUtilidad = 0;
      for (const p of pedidos) for (const d of (p.detalle || [])) totalUtilidad += (d.precio_unitario - (d.producto?.costo ?? 0)) * d.cantidad;
      for (const v of detalle) for (const i of (v.items || [])) totalUtilidad += (i.precio_unitario - (i.producto?.costo ?? 0)) * i.cantidad;
      for (const v of eventos) totalUtilidad += (v.precio_unitario - (v.producto?.costo ?? 0)) * v.cantidad;

      const totalTransacciones = pedidos.length + detalle.length + eventos.length;
      const ticketPromedio = totalTransacciones > 0 ? totalVentas / totalTransacciones : 0;

      const unidades: Record<string, number> = {};
      for (const p of pedidos) for (const d of (p.detalle || [])) { const n = d.producto?.nombre ?? '—'; unidades[n] = (unidades[n] || 0) + d.cantidad; }
      for (const v of detalle) for (const i of (v.items || [])) { const n = i.producto?.nombre ?? '—'; unidades[n] = (unidades[n] || 0) + i.cantidad; }
      for (const v of eventos) { const n = v.producto?.nombre ?? '—'; unidades[n] = (unidades[n] || 0) + v.cantidad; }
      const productoMasVendido = Object.entries(unidades).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      const fechas = pedidos.map((p: any) => p.fecha).filter(Boolean).sort();
      const fechaInicio = fechas[0] || null;

      const { data: periodo, error } = await supabase.from('periodos').insert({
        nombre, fecha_inicio: fechaInicio,
        fecha_cierre: new Date().toISOString().split('T')[0],
        total_ventas: totalVentas, total_utilidad: totalUtilidad,
        total_pedidos: pedidos.length, producto_mas_vendido: productoMasVendido, ticket_promedio: ticketPromedio,
      }).select().single();

      if (error || !periodo) throw new Error(error?.message || 'No se pudo crear el período');

      const periodoId = periodo.id;
      await Promise.all([
        pedidos.length > 0 && supabase.from('pedidos').update({ periodo_id: periodoId }).in('id', pedidos.map((p: any) => p.id)),
        detalle.length > 0 && supabase.from('ventas_detalle').update({ periodo_id: periodoId }).in('id', detalle.map((v: any) => v.id)),
        eventos.length > 0 && supabase.from('ventas_evento').update({ periodo_id: periodoId }).in('id', eventos.map((v: any) => v.id)),
      ]);

      // Ventas por cliente (pedidos)
      const clienteMap: Record<string, VentaCliente> = {};
      for (const p of pedidos) {
        const cn = p.cliente?.nombre ?? 'Sin cliente';
        if (!clienteMap[cn]) clienteMap[cn] = { nombre: cn, total: 0, pedidos: 0 };
        clienteMap[cn].total += p.total; clienteMap[cn].pedidos += 1;
      }
      const ventasClientes = Object.values(clienteMap).sort((a, b) => b.total - a.total);

      // Ventas al detalle por comprador
      const detalleMap: Record<string, VentaDetalleCli> = {};
      for (const v of detalle) {
        const cn = v.nombre_comprador || 'Sin nombre';
        if (!detalleMap[cn]) detalleMap[cn] = { nombre: cn, total: 0, ventas: 0 };
        detalleMap[cn].total += v.total; detalleMap[cn].ventas += 1;
      }
      const ventasDetalleCli = Object.values(detalleMap).sort((a, b) => b.total - a.total);

      await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'periodo_cerrado',
          pedido: {
            nombre: periodo.nombre, fecha_inicio: periodo.fecha_inicio, fecha_cierre: periodo.fecha_cierre,
            total_ventas: periodo.total_ventas, total_utilidad: periodo.total_utilidad,
            total_pedidos: periodo.total_pedidos, producto_mas_vendido: periodo.producto_mas_vendido,
            ticket_promedio: periodo.ticket_promedio, ventas_clientes: ventasClientes,
          },
        }),
      });

      setNombre(''); setShowModal(false);
      await Promise.all([fetchPeriodos(), fetchStatsActuales()]);
      setInforme({ periodo, ventasClientes, ventasDetalleCli, totalPedidos: totalPedidosVentas, totalDetalle: totalDetalleVentas });
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
    setCerrando(false);
  }

  async function reabrirPeriodo(p: Periodo) {
    setReabriendo(true);
    try {
      await Promise.all([
        supabase.from('pedidos').update({ periodo_id: null }).eq('periodo_id', p.id),
        supabase.from('ventas_detalle').update({ periodo_id: null }).eq('periodo_id', p.id),
        supabase.from('ventas_evento').update({ periodo_id: null }).eq('periodo_id', p.id),
      ]);
      await supabase.from('periodos').delete().eq('id', p.id);
      setInforme(null); setShowReabrirModal(false);
      await Promise.all([fetchPeriodos(), fetchStatsActuales()]);
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
    setReabriendo(false);
  }

  async function verInforme(p: Periodo) {
    const [pedidosRes, detalleRes] = await Promise.all([
      supabase.from('pedidos').select('total, cliente:clientes(nombre)').eq('periodo_id', p.id),
      supabase.from('ventas_detalle').select('total, nombre_comprador').eq('periodo_id', p.id),
    ]);
    const pedidos = (pedidosRes.data || []) as any[];
    const detalle = (detalleRes.data || []) as any[];

    const clienteMap: Record<string, VentaCliente> = {};
    for (const ped of pedidos) {
      const cn = ped.cliente?.nombre ?? 'Sin cliente';
      if (!clienteMap[cn]) clienteMap[cn] = { nombre: cn, total: 0, pedidos: 0 };
      clienteMap[cn].total += ped.total; clienteMap[cn].pedidos += 1;
    }

    const detalleMap: Record<string, VentaDetalleCli> = {};
    for (const v of detalle) {
      const cn = v.nombre_comprador || 'Sin nombre';
      if (!detalleMap[cn]) detalleMap[cn] = { nombre: cn, total: 0, ventas: 0 };
      detalleMap[cn].total += v.total; detalleMap[cn].ventas += 1;
    }

    setInforme({
      periodo: p,
      ventasClientes: Object.values(clienteMap).sort((a, b) => b.total - a.total),
      ventasDetalleCli: Object.values(detalleMap).sort((a, b) => b.total - a.total),
      totalPedidos: pedidos.reduce((s, x) => s + x.total, 0),
      totalDetalle: detalle.reduce((s, x) => s + x.total, 0),
    });
  }

  function descargarPDF(inf: InformeDetalle) {
    const { periodo: p, ventasClientes, ventasDetalleCli, totalPedidos, totalDetalle } = inf;
    const margen = p.total_ventas > 0 ? Math.round((p.total_utilidad / p.total_ventas) * 100) : 0;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Informe ${p.nombre}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{color:#e53935;margin-bottom:4px}
      .sub{color:#666;font-size:13px;margin-bottom:24px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
      .card{border:1px solid #ddd;border-radius:8px;padding:16px}.label{font-size:11px;color:#666;text-transform:uppercase;margin-bottom:4px}
      .value{font-size:24px;font-weight:900}.green{color:#2e7d32}.blue{color:#1565c0}.red{color:#c62828}.orange{color:#e65100}.purple{color:#6a1b9a}
      table{width:100%;border-collapse:collapse;margin-top:8px}th{text-align:left;padding:8px;background:#f5f5f5;font-size:12px;color:#666}
      td{padding:10px 8px;border-bottom:1px solid #eee;font-size:14px}h3{margin:24px 0 8px}
      @media print{body{padding:16px}}
    </style></head><body>
    <h1>📊 Informe de Período</h1>
    <p class="sub">${p.nombre} · ${p.fecha_inicio ? new Date(p.fecha_inicio + 'T12:00:00').toLocaleDateString('es-CL') : '—'} → ${new Date(p.fecha_cierre + 'T12:00:00').toLocaleDateString('es-CL')}</p>
    <div class="grid">
      <div class="card"><div class="label">📈 Ventas Totales</div><div class="value green">${fmt(p.total_ventas)}</div></div>
      <div class="card"><div class="label">💰 Utilidad</div><div class="value blue">${fmt(p.total_utilidad)}</div></div>
      <div class="card"><div class="label">📦 Pedidos</div><div class="value red">${p.total_pedidos}</div></div>
      <div class="card"><div class="label">📊 Ticket Promedio</div><div class="value orange">${fmt(p.ticket_promedio)}</div></div>
    </div>
    <div class="card" style="margin-bottom:24px">
      <div class="label">Margen de Utilidad</div>
      <div class="value" style="color:${margen>=30?'#2e7d32':margen>=15?'#e65100':'#c62828'}">${margen}%</div>
      ${p.producto_mas_vendido?`<p style="margin:8px 0 0;color:#666;font-size:13px">🏆 Producto más vendido: <strong>${p.producto_mas_vendido}</strong></p>`:''}
    </div>
    <h3>📊 Comparación por Tipo de Venta</h3>
    <table><thead><tr><th>Tipo</th><th style="text-align:right">Total</th><th style="text-align:right">% del total</th></tr></thead><tbody>
      <tr><td>📦 Pedidos</td><td style="text-align:right;font-weight:bold;color:#c62828">${fmt(totalPedidos)}</td><td style="text-align:right">${p.total_ventas>0?Math.round((totalPedidos/p.total_ventas)*100):0}%</td></tr>
      <tr><td>🛒 Venta al Detalle</td><td style="text-align:right;font-weight:bold;color:#6a1b9a">${fmt(totalDetalle)}</td><td style="text-align:right">${p.total_ventas>0?Math.round((totalDetalle/p.total_ventas)*100):0}%</td></tr>
      <tr style="background:#f5f5f5"><td><strong>TOTAL</strong></td><td style="text-align:right;font-weight:bold;color:#2e7d32">${fmt(p.total_ventas)}</td><td style="text-align:right">100%</td></tr>
    </tbody></table>
    ${ventasClientes.length>0?`<h3>👥 Ventas por Cliente (Pedidos)</h3>
    <table><thead><tr><th>Cliente</th><th>Pedidos</th><th style="text-align:right">Total</th></tr></thead><tbody>
      ${ventasClientes.map(c=>`<tr><td>${c.nombre}</td><td>${c.pedidos}</td><td style="text-align:right;font-weight:bold;color:#2e7d32">${fmt(c.total)}</td></tr>`).join('')}
    </tbody></table>`:''}
    ${ventasDetalleCli.length>0?`<h3>🛒 Ventas al Detalle por Comprador</h3>
    <table><thead><tr><th>Comprador</th><th>Ventas</th><th style="text-align:right">Total</th></tr></thead><tbody>
      ${ventasDetalleCli.map(c=>`<tr><td>${c.nombre}</td><td>${c.ventas}</td><td style="text-align:right;font-weight:bold;color:#6a1b9a">${fmt(c.total)}</td></tr>`).join('')}
    </tbody></table>`:''}
    </body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  if (informe) {
    const { periodo: p, ventasClientes, ventasDetalleCli, totalPedidos, totalDetalle } = informe;
    const margen = p.total_ventas > 0 ? Math.round((p.total_utilidad / p.total_ventas) * 100) : 0;
    return (
      <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setInforme(null)} className="w-9 h-9 rounded-lg flex items-center justify-center border text-lg"
            style={{ borderColor: '#2a2a2a', backgroundColor: '#141414', color: '#f5f5f5' }}>←</button>
          <div className="flex-1">
            <h1 className="text-xl font-bold" style={{ color: '#f5f5f5' }}>{p.nombre}</h1>
            <p className="text-xs" style={{ color: '#6b7280' }}>
              {p.fecha_inicio ? new Date(p.fecha_inicio + 'T12:00:00').toLocaleDateString('es-CL') : '—'} → {new Date(p.fecha_cierre + 'T12:00:00').toLocaleDateString('es-CL')}
            </p>
          </div>
          <button onClick={() => descargarPDF(informe!)} className="px-3 py-2 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: '#2196f3' }}>⬇️ PDF</button>
          <button onClick={() => setShowReabrirModal(true)} className="px-3 py-2 rounded-lg text-xs font-bold border" style={{ borderColor: '#ff9800', color: '#ff9800' }}>🔓 Reabrir</button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { label: '📈 Ventas totales', value: fmt(p.total_ventas), color: '#4caf50' },
            { label: '💰 Utilidad', value: fmt(p.total_utilidad), color: '#2196f3' },
            { label: '📦 Pedidos', value: String(p.total_pedidos), color: '#e53935' },
            { label: '📊 Ticket promedio', value: fmt(p.ticket_promedio), color: '#ff9800' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
              <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{s.label}</p>
              <p className="text-xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Margen */}
        <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <div className="flex justify-between items-center mb-2">
            <p className="text-xs font-bold" style={{ color: '#6b7280' }}>MARGEN DE UTILIDAD</p>
            <p className="text-xl font-extrabold" style={{ color: margen >= 30 ? '#4caf50' : margen >= 15 ? '#ff9800' : '#e53935' }}>{margen}%</p>
          </div>
          <div className="w-full rounded-full h-3" style={{ backgroundColor: '#2a2a2a' }}>
            <div className="h-3 rounded-full" style={{ width: `${Math.min(margen, 100)}%`, backgroundColor: margen >= 30 ? '#4caf50' : margen >= 15 ? '#ff9800' : '#e53935' }} />
          </div>
          {p.producto_mas_vendido && <p className="text-xs mt-2" style={{ color: '#6b7280' }}>🏆 Más vendido: <strong style={{ color: '#f5f5f5' }}>{p.producto_mas_vendido}</strong></p>}
        </div>

        {/* Comparación pedidos vs detalle */}
        <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>📊 Comparación por Tipo de Venta</p>
          </div>
          <div className="p-4 space-y-3">
            {[
              { label: '📦 Pedidos', total: totalPedidos, color: '#e53935' },
              { label: '🛒 Venta al Detalle', total: totalDetalle, color: '#9c27b0' },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between items-center mb-1">
                  <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>{item.label}</p>
                  <p className="font-extrabold" style={{ color: item.color }}>{fmt(item.total)}</p>
                </div>
                <div className="w-full rounded-full h-2" style={{ backgroundColor: '#2a2a2a' }}>
                  <div className="h-2 rounded-full" style={{ width: `${p.total_ventas > 0 ? Math.round((item.total / p.total_ventas) * 100) : 0}%`, backgroundColor: item.color }} />
                </div>
                <p className="text-xs mt-0.5 text-right" style={{ color: '#6b7280' }}>{p.total_ventas > 0 ? Math.round((item.total / p.total_ventas) * 100) : 0}%</p>
              </div>
            ))}
          </div>
        </div>

        {/* Ventas por cliente */}
        {ventasClientes.length > 0 && (
          <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>👥 Ventas por Cliente (Pedidos)</p>
            </div>
            {ventasClientes.map((c, i) => (
              <div key={c.nombre} className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: i < ventasClientes.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>{c.nombre}</p>
                  <p className="text-xs" style={{ color: '#6b7280' }}>{c.pedidos} pedido{c.pedidos !== 1 ? 's' : ''}</p>
                </div>
                <p className="font-extrabold" style={{ color: '#e53935' }}>{fmt(c.total)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Ventas al detalle por comprador */}
        {ventasDetalleCli.length > 0 && (
          <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>🛒 Venta al Detalle por Comprador</p>
            </div>
            {ventasDetalleCli.map((c, i) => (
              <div key={c.nombre} className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: i < ventasDetalleCli.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>{c.nombre}</p>
                  <p className="text-xs" style={{ color: '#6b7280' }}>{c.ventas} venta{c.ventas !== 1 ? 's' : ''}</p>
                </div>
                <p className="font-extrabold" style={{ color: '#9c27b0' }}>{fmt(c.total)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Modal reabrir */}
        {showReabrirModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
            <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: '#141414' }}>
              <p className="text-lg font-bold mb-2" style={{ color: '#f5f5f5' }}>🔓 ¿Reabrir Período?</p>
              <p className="text-sm mb-4" style={{ color: '#6b7280' }}>Todos los pedidos de <strong style={{ color: '#f5f5f5' }}>{p.nombre}</strong> volverán al período actual y este informe será eliminado.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowReabrirModal(false)} className="flex-1 py-3 rounded-lg font-bold text-sm border" style={{ borderColor: '#2a2a2a', color: '#6b7280' }}>Cancelar</button>
                <button onClick={() => reabrirPeriodo(p)} disabled={reabriendo} className="flex-1 py-3 rounded-lg font-bold text-sm text-white disabled:opacity-40" style={{ backgroundColor: '#ff9800' }}>
                  {reabriendo ? 'Reabriendo...' : 'Reabrir'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Períodos</h1>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Historial de lotes y cierres de período</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-lg font-bold text-sm text-white" style={{ backgroundColor: '#e53935' }}>
          🔒 Cerrar Período
        </button>
      </div>

      <div className="rounded-xl border p-4 mb-6" style={{ backgroundColor: '#141414', borderColor: '#4caf50' + '40', borderLeftWidth: 4, borderLeftColor: '#4caf50' }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: '#6b7280' }}>📋 Período Actual (sin cerrar)</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs" style={{ color: '#6b7280' }}>Ventas registradas</p>
            <p className="text-2xl font-extrabold" style={{ color: '#4caf50' }}>{fmt(statsActuales?.ventas ?? 0)}</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: '#6b7280' }}>Pedidos</p>
            <p className="text-2xl font-extrabold" style={{ color: '#e53935' }}>{statsActuales?.pedidos ?? 0}</p>
          </div>
        </div>
      </div>

      {periodos.length === 0 ? (
        <div className="text-center py-12" style={{ color: '#6b7280' }}>
          <p className="text-3xl mb-2">📁</p>
          <p>No hay períodos cerrados todavía</p>
        </div>
      ) : (
        <div className="space-y-3">
          {periodos.map((p) => (
            <button key={p.id} onClick={() => verInforme(p)} className="w-full rounded-xl border p-4 text-left" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
              <div className="flex justify-between items-start mb-2">
                <p className="font-bold" style={{ color: '#f5f5f5' }}>{p.nombre}</p>
                <p className="text-xs" style={{ color: '#6b7280' }}>Ver informe →</p>
              </div>
              <p className="text-xs mb-3" style={{ color: '#6b7280' }}>
                {p.fecha_inicio ? new Date(p.fecha_inicio + 'T12:00:00').toLocaleDateString('es-CL') : '—'} → {new Date(p.fecha_cierre + 'T12:00:00').toLocaleDateString('es-CL')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div><p className="text-xs" style={{ color: '#6b7280' }}>Ventas</p><p className="font-extrabold text-sm" style={{ color: '#4caf50' }}>{fmt(p.total_ventas)}</p></div>
                <div><p className="text-xs" style={{ color: '#6b7280' }}>Utilidad</p><p className="font-extrabold text-sm" style={{ color: '#2196f3' }}>{fmt(p.total_utilidad)}</p></div>
                <div><p className="text-xs" style={{ color: '#6b7280' }}>Pedidos</p><p className="font-extrabold text-sm" style={{ color: '#e53935' }}>{p.total_pedidos}</p></div>
              </div>
            </button>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: '#141414' }}>
            <h2 className="font-bold text-lg mb-1" style={{ color: '#f5f5f5' }}>🔒 Cerrar Período</h2>
            <p className="text-sm mb-4" style={{ color: '#6b7280' }}>Se archivarán todos los pedidos actuales y se generará un informe.</p>
            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Nombre del período</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej: Lote Junio 2026, Producción #3..."
              className="w-full rounded-lg px-3 py-2 mb-4 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            <p className="text-xs p-3 rounded-lg mb-4" style={{ backgroundColor: '#ff980015', color: '#ff9800' }}>
              ⚠️ Se archivarán {statsActuales?.pedidos ?? 0} pedido{(statsActuales?.pedidos ?? 0) !== 1 ? 's' : ''} con {fmt(statsActuales?.ventas ?? 0)} en ventas.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-lg font-bold text-sm border" style={{ borderColor: '#2a2a2a', color: '#6b7280' }}>Cancelar</button>
              <button onClick={cerrarPeriodo} disabled={cerrando || !nombre} className="flex-1 py-3 rounded-lg font-bold text-sm text-white disabled:opacity-40" style={{ backgroundColor: '#e53935' }}>
                {cerrando ? 'Cerrando...' : 'Cerrar y generar informe'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
