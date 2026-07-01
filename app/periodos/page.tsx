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
interface ProductoVendido { nombre: string; unidades: number; total: number; }
interface ClienteEstado { nombre: string; tipo: string; activo: boolean; ultimaCompra: string | null; }

interface InformeDetalle {
  periodo: Periodo;
  ventasClientes: VentaCliente[];
  ventasDetalleCli: VentaDetalleCli[];
  totalPedidos: number;
  totalDetalle: number;
  totalEventos: number;
  productosVendidos: ProductoVendido[];
  clientesActivos: ClienteEstado[];
  clientesInactivos: ClienteEstado[];
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

      // Productos vendidos
      const prodMap: Record<string, ProductoVendido> = {};
      for (const p of pedidos) for (const d of (p.detalle || [])) {
        const n = d.producto?.nombre ?? '—';
        if (!prodMap[n]) prodMap[n] = { nombre: n, unidades: 0, total: 0 };
        prodMap[n].unidades += d.cantidad; prodMap[n].total += d.precio_unitario * d.cantidad;
      }
      for (const v of detalle) for (const i of (v.items || [])) {
        const n = i.producto?.nombre ?? '—';
        if (!prodMap[n]) prodMap[n] = { nombre: n, unidades: 0, total: 0 };
        prodMap[n].unidades += i.cantidad; prodMap[n].total += i.precio_unitario * i.cantidad;
      }
      for (const v of eventos) {
        const n = v.producto?.nombre ?? '—';
        if (!prodMap[n]) prodMap[n] = { nombre: n, unidades: 0, total: 0 };
        prodMap[n].unidades += v.cantidad; prodMap[n].total += v.precio_unitario * v.cantidad;
      }
      const productosVendidos = Object.values(prodMap).sort((a, b) => b.unidades - a.unidades);

      // Clientes activos/inactivos
      const clientesRes2 = await supabase.from('clientes').select('id, nombre, tipo, activo_manual');
      const todosClientes = (clientesRes2.data || []) as any[];
      const clientesConCompra2 = new Set(pedidos.map((p: any) => p.cliente_id));
      const ultimaCompraMap2: Record<string, string> = {};
      for (const ped of pedidos) if (!ultimaCompraMap2[ped.cliente_id]) ultimaCompraMap2[ped.cliente_id] = ped.fecha;
      const clientesActivos2: ClienteEstado[] = [];
      const clientesInactivos2: ClienteEstado[] = [];
      for (const c of todosClientes) {
        const obj: ClienteEstado = { nombre: c.nombre, tipo: c.tipo, activo: clientesConCompra2.has(c.id), ultimaCompra: ultimaCompraMap2[c.id] || null };
        if (obj.activo) clientesActivos2.push(obj); else clientesInactivos2.push(obj);
      }

      setNombre(''); setShowModal(false);
      await Promise.all([fetchPeriodos(), fetchStatsActuales()]);
      const totalEventosVentas = eventos.reduce((s: number, x: any) => s + x.total, 0);
      setInforme({ periodo, ventasClientes, ventasDetalleCli, totalPedidos: totalPedidosVentas, totalDetalle: totalDetalleVentas, totalEventos: totalEventosVentas, productosVendidos, clientesActivos: clientesActivos2, clientesInactivos: clientesInactivos2 });
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
    const [pedidosRes, detalleRes, eventosRes, clientesRes, todosPedidosRes] = await Promise.all([
      supabase.from('pedidos').select('total, cliente:clientes(nombre), detalle:detalle_pedido(cantidad, precio_unitario, producto:productos(nombre))').eq('periodo_id', p.id),
      supabase.from('ventas_detalle').select('total, nombre_comprador, items:items_venta_detalle(cantidad, precio_unitario, producto:productos(nombre))').eq('periodo_id', p.id),
      supabase.from('ventas_evento').select('total, cantidad, precio_unitario, producto:productos(nombre)').eq('periodo_id', p.id),
      supabase.from('clientes').select('id, nombre, tipo, activo_manual'),
      supabase.from('pedidos').select('cliente_id, fecha').eq('periodo_id', p.id).order('fecha', { ascending: false }),
    ]);
    const pedidos = (pedidosRes.data || []) as any[];
    const detalle = (detalleRes.data || []) as any[];
    const eventos = (eventosRes.data || []) as any[];

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

    const prodMap: Record<string, ProductoVendido> = {};
    for (const ped of pedidos) for (const d of (ped.detalle || [])) {
      const n = d.producto?.nombre ?? '—';
      if (!prodMap[n]) prodMap[n] = { nombre: n, unidades: 0, total: 0 };
      prodMap[n].unidades += d.cantidad; prodMap[n].total += d.precio_unitario * d.cantidad;
    }
    for (const v of detalle) for (const i of (v.items || [])) {
      const n = i.producto?.nombre ?? '—';
      if (!prodMap[n]) prodMap[n] = { nombre: n, unidades: 0, total: 0 };
      prodMap[n].unidades += i.cantidad; prodMap[n].total += i.precio_unitario * i.cantidad;
    }
    for (const v of eventos) {
      const n = v.producto?.nombre ?? '—';
      if (!prodMap[n]) prodMap[n] = { nombre: n, unidades: 0, total: 0 };
      prodMap[n].unidades += v.cantidad; prodMap[n].total += v.precio_unitario * v.cantidad;
    }

    // Clientes activos/inactivos en el período
    const clientes = (clientesRes.data || []) as any[];
    const todosPedidos = (todosPedidosRes.data || []) as any[];
    const ultimaCompraMap: Record<string, string> = {};
    for (const ped of todosPedidos) {
      if (!ultimaCompraMap[ped.cliente_id]) ultimaCompraMap[ped.cliente_id] = ped.fecha;
    }
    const clientesConCompra = new Set(todosPedidos.map((x: any) => x.cliente_id));
    const clientesActivos: ClienteEstado[] = [];
    const clientesInactivos: ClienteEstado[] = [];
    for (const c of clientes) {
      const obj: ClienteEstado = { nombre: c.nombre, tipo: c.tipo, activo: clientesConCompra.has(c.id), ultimaCompra: ultimaCompraMap[c.id] || null };
      if (obj.activo) clientesActivos.push(obj);
      else clientesInactivos.push(obj);
    }

    setInforme({
      periodo: p,
      ventasClientes: Object.values(clienteMap).sort((a, b) => b.total - a.total),
      ventasDetalleCli: Object.values(detalleMap).sort((a, b) => b.total - a.total),
      totalPedidos: pedidos.reduce((s, x) => s + x.total, 0),
      totalDetalle: detalle.reduce((s, x) => s + x.total, 0),
      totalEventos: eventos.reduce((s, x) => s + x.total, 0),
      productosVendidos: Object.values(prodMap).sort((a, b) => b.unidades - a.unidades),
      clientesActivos: clientesActivos.sort((a, b) => a.nombre.localeCompare(b.nombre)),
      clientesInactivos: clientesInactivos.sort((a, b) => a.nombre.localeCompare(b.nombre)),
    });
  }

  function descargarPDF(inf: InformeDetalle) {
    const { periodo: p, ventasClientes, ventasDetalleCli, totalPedidos, totalDetalle, totalEventos, productosVendidos } = inf;
    const margen = p.total_ventas > 0 ? Math.round((p.total_utilidad / p.total_ventas) * 100) : 0;
    const totalCostoPDF = p.total_ventas - p.total_utilidad;

    // Donut SVG
    function buildDonut(segs: { label: string; value: number; color: string }[]) {
      const total = segs.reduce((s, x) => s + x.value, 0);
      if (total === 0) return '';
      const cx = 80, cy = 80, R = 65, r = 38;
      let angle = -Math.PI / 2;
      let paths = '';
      let legend = '';
      for (const seg of segs) {
        if (seg.value === 0) continue;
        const sweep = (seg.value / total) * 2 * Math.PI;
        const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle);
        const x2 = cx + R * Math.cos(angle + sweep), y2 = cy + R * Math.sin(angle + sweep);
        const ix1 = cx + r * Math.cos(angle), iy1 = cy + r * Math.sin(angle);
        const ix2 = cx + r * Math.cos(angle + sweep), iy2 = cy + r * Math.sin(angle + sweep);
        const large = sweep > Math.PI ? 1 : 0;
        paths += `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} L${ix2.toFixed(1)},${iy2.toFixed(1)} A${r},${r} 0 ${large} 0 ${ix1.toFixed(1)},${iy1.toFixed(1)} Z" fill="${seg.color}"/>`;
        legend += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><div style="width:14px;height:14px;border-radius:3px;background:${seg.color};flex-shrink:0"></div><div><div style="font-size:13px;font-weight:600">${seg.label}</div><div style="font-size:12px;color:#666">${fmt(seg.value)} · ${Math.round((seg.value / total) * 100)}%</div></div></div>`;
        angle += sweep;
      }
      return `<div style="display:flex;align-items:center;gap:24px"><svg viewBox="0 0 160 160" width="160" height="160"><g>${paths}</g></svg><div>${legend}</div></div>`;
    }

    // Horizontal bar SVG
    function buildBarChart(items: { label: string; sublabel: string; value: number; color: string }[]) {
      if (items.length === 0) return '';
      const maxVal = Math.max(...items.map(x => x.value));
      const rowH = 46, labelW = 140, barW = 220, valW = 80, totalW = labelW + barW + valW + 10;
      const h = items.length * rowH + 16;
      let rows = '';
      items.forEach((item, i) => {
        const bw = maxVal > 0 ? Math.round((item.value / maxVal) * barW) : 0;
        const y = 8 + i * rowH;
        rows += `<text x="${labelW - 6}" y="${y + 16}" text-anchor="end" font-size="12" fill="#111" font-weight="600" font-family="Arial,sans-serif">${item.label.length > 16 ? item.label.slice(0, 15) + '…' : item.label}</text>`;
        rows += `<text x="${labelW - 6}" y="${y + 30}" text-anchor="end" font-size="10" fill="#888" font-family="Arial,sans-serif">${item.sublabel}</text>`;
        rows += `<rect x="${labelW}" y="${y + 4}" width="${barW}" height="22" rx="4" fill="#f0f0f0"/>`;
        rows += `<rect x="${labelW}" y="${y + 4}" width="${bw}" height="22" rx="4" fill="${item.color}"/>`;
        rows += `<text x="${labelW + barW + 8}" y="${y + 19}" font-size="11" fill="${item.color}" font-weight="800" font-family="Arial,sans-serif">${item.value.toLocaleString('es-CL')}</text>`;
      });
      return `<svg viewBox="0 0 ${totalW} ${h}" width="100%" style="display:block">${rows}</svg>`;
    }

    const donutHtml = buildDonut([
      { label: 'Pedidos a clientes', value: totalPedidos, color: '#e53935' },
      { label: 'Venta al detalle', value: totalDetalle, color: '#9c27b0' },
      { label: 'Eventos', value: totalEventos, color: '#ff9800' },
    ]);

    const colores = ['#e53935','#ff9800','#4caf50','#2196f3','#9c27b0','#00bcd4'];
    const productosBarHtml = buildBarChart(
      productosVendidos.map((x, i) => ({ label: x.nombre, sublabel: fmt(x.total), value: x.unidades, color: colores[i % colores.length] }))
    );

    const clientesBarHtml = buildBarChart(
      ventasClientes.map(x => ({ label: x.nombre, sublabel: `${x.pedidos} pedido${x.pedidos !== 1 ? 's' : ''}`, value: x.total, color: '#e53935' }))
    );

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Informe ${p.nombre}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:32px;color:#111;max-width:800px;margin:0 auto}
      h1{color:#e53935;margin-bottom:4px}
      .sub{color:#666;font-size:13px;margin-bottom:24px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
      .card{border:1px solid #ddd;border-radius:8px;padding:16px}
      .label{font-size:11px;color:#666;text-transform:uppercase;margin-bottom:4px}
      .value{font-size:24px;font-weight:900}
      .chart-box{border:1px solid #ddd;border-radius:8px;padding:20px;margin-bottom:24px}
      .chart-title{font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px;margin:0 0 16px}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th{text-align:left;padding:8px;background:#f5f5f5;font-size:12px;color:#666}
      td{padding:10px 8px;border-bottom:1px solid #eee;font-size:14px}
      h3{margin:24px 0 8px}
      @media print{body{padding:16px}.chart-box{break-inside:avoid}}
    </style></head><body>
    <h1>Informe de Período</h1>
    <p class="sub">${p.nombre} · ${p.fecha_inicio ? new Date(p.fecha_inicio + 'T12:00:00').toLocaleDateString('es-CL') : '—'} → ${new Date(p.fecha_cierre + 'T12:00:00').toLocaleDateString('es-CL')}</p>

    <div class="grid">
      <div class="card"><div class="label">Ventas Totales</div><div class="value" style="color:#2e7d32">${fmt(p.total_ventas)}</div></div>
      <div class="card"><div class="label">Costo Productos</div><div class="value" style="color:#c62828">${fmt(totalCostoPDF)}</div></div>
      <div class="card"><div class="label">Utilidad Neta</div><div class="value" style="color:#1565c0">${fmt(p.total_utilidad)}</div></div>
      <div class="card"><div class="label">Margen</div><div class="value" style="color:${margen>=30?'#2e7d32':margen>=15?'#e65100':'#c62828'}">${margen}%</div></div>
      <div class="card"><div class="label">Pedidos</div><div class="value" style="color:#6a1b9a">${p.total_pedidos}</div></div>
      <div class="card"><div class="label">Ticket Promedio</div><div class="value" style="color:#e65100">${fmt(p.ticket_promedio)}</div></div>
    </div>

    ${p.producto_mas_vendido?`<div class="card" style="margin-bottom:24px"><p style="margin:0;color:#666;font-size:13px">Producto más vendido: <strong>${p.producto_mas_vendido}</strong></p></div>`:'<div style="margin-bottom:24px"></div>'}

    <div class="chart-box">
      <p class="chart-title">Gráfico 1 — Comparación por Tipo de Venta</p>
      ${donutHtml}
    </div>

    ${productosVendidos.length > 0 ? `
    <div class="chart-box">
      <p class="chart-title">Gráfico 2 — Productos más Vendidos (unidades)</p>
      ${productosBarHtml}
    </div>` : ''}

    ${ventasClientes.length > 0 ? `
    <div class="chart-box">
      <p class="chart-title">Gráfico 3 — Compras por Cliente ($)</p>
      ${clientesBarHtml}
    </div>` : ''}

    ${ventasClientes.length>0?`<h3>Detalle — Ventas por Cliente</h3>
    <table><thead><tr><th>Cliente</th><th>Pedidos</th><th style="text-align:right">Total</th></tr></thead><tbody>
      ${ventasClientes.map(c=>`<tr><td>${c.nombre}</td><td>${c.pedidos}</td><td style="text-align:right;font-weight:bold;color:#2e7d32">${fmt(c.total)}</td></tr>`).join('')}
    </tbody></table>`:''}
    ${ventasDetalleCli.length>0?`<h3>Detalle — Venta al Detalle por Comprador</h3>
    <table><thead><tr><th>Comprador</th><th>Ventas</th><th style="text-align:right">Total</th></tr></thead><tbody>
      ${ventasDetalleCli.map(c=>`<tr><td>${c.nombre}</td><td>${c.ventas}</td><td style="text-align:right;font-weight:bold;color:#6a1b9a">${fmt(c.total)}</td></tr>`).join('')}
    </tbody></table>`:''}
    </body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  // Donut SVG helper
  function DonutChart({ segs }: { segs: { label: string; value: number; color: string }[] }) {
    const total = segs.reduce((s, x) => s + x.value, 0);
    if (total === 0) return null;
    const cx = 70, cy = 70, R = 55, r = 30;
    let angle = -Math.PI / 2;
    const paths = segs.map((seg) => {
      const sweep = (seg.value / total) * 2 * Math.PI;
      const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle);
      const x2 = cx + R * Math.cos(angle + sweep), y2 = cy + R * Math.sin(angle + sweep);
      const ix1 = cx + r * Math.cos(angle), iy1 = cy + r * Math.sin(angle);
      const ix2 = cx + r * Math.cos(angle + sweep), iy2 = cy + r * Math.sin(angle + sweep);
      const large = sweep > Math.PI ? 1 : 0;
      const d = `M${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} L${ix2},${iy2} A${r},${r} 0 ${large} 0 ${ix1},${iy1} Z`;
      const pct = Math.round((seg.value / total) * 100);
      angle += sweep;
      return { ...seg, d, pct };
    });
    return (
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 140 140" width={120} height={120} style={{ flexShrink: 0 }}>
          {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} />)}
        </svg>
        <div className="space-y-2 flex-1">
          {paths.map((p) => (
            <div key={p.label} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: '#f5f5f5' }}>{p.label}</p>
                <p className="text-xs" style={{ color: '#6b7280' }}>{fmt(p.value)} · {p.pct}%</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Horizontal bar SVG helper
  function HBarChart({ items, colorFn, valueFn, labelFn, sublabelFn }: {
    items: any[]; colorFn: (i: number) => string;
    valueFn: (x: any) => number; labelFn: (x: any) => string; sublabelFn?: (x: any) => string;
  }) {
    if (items.length === 0) return null;
    const maxVal = Math.max(...items.map(valueFn));
    const rowH = 44, pad = 8, labelW = 120, barAreaW = 160, totalW = labelW + barAreaW + 60;
    const h = items.length * rowH + pad * 2;
    return (
      <svg viewBox={`0 0 ${totalW} ${h}`} width="100%" style={{ display: 'block' }}>
        {items.map((item, i) => {
          const val = valueFn(item);
          const barW = maxVal > 0 ? Math.round((val / maxVal) * barAreaW) : 0;
          const y = pad + i * rowH;
          const color = colorFn(i);
          const label = labelFn(item);
          const sub = sublabelFn ? sublabelFn(item) : '';
          return (
            <g key={i}>
              <text x={labelW - 6} y={y + 16} textAnchor="end" fontSize={11} fill="#f5f5f5" fontWeight="600"
                style={{ fontFamily: 'system-ui, sans-serif' }}>
                {label.length > 14 ? label.slice(0, 13) + '…' : label}
              </text>
              {sub && <text x={labelW - 6} y={y + 30} textAnchor="end" fontSize={9} fill="#6b7280" style={{ fontFamily: 'system-ui, sans-serif' }}>{sub}</text>}
              <rect x={labelW} y={y + 6} width={barAreaW} height={20} rx={4} fill="#2a2a2a" />
              <rect x={labelW} y={y + 6} width={barW} height={20} rx={4} fill={color} />
              <text x={labelW + barAreaW + 8} y={y + 20} fontSize={11} fill={color} fontWeight="800"
                style={{ fontFamily: 'system-ui, sans-serif' }}>
                {val.toLocaleString('es-CL')}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  if (informe) {
    const { periodo: p, ventasClientes, ventasDetalleCli, totalPedidos, totalDetalle, totalEventos } = informe;
    const margen = p.total_ventas > 0 ? Math.round((p.total_utilidad / p.total_ventas) * 100) : 0;
    const totalCosto = p.total_ventas - p.total_utilidad;
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
            { label: '🧾 Costo productos', value: fmt(totalCosto), color: '#e53935' },
            { label: '💰 Utilidad neta', value: fmt(p.total_utilidad), color: '#2196f3' },
            { label: '📊 Ticket promedio', value: fmt(p.ticket_promedio), color: '#ff9800' },
            { label: '📦 Pedidos', value: String(p.total_pedidos), color: '#9c27b0' },
            { label: '📉 Margen', value: `${margen}%`, color: margen >= 30 ? '#4caf50' : margen >= 15 ? '#ff9800' : '#e53935' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
              <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{s.label}</p>
              <p className="text-xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {p.producto_mas_vendido && (
          <div className="rounded-xl border px-4 py-3 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
            <p className="text-xs" style={{ color: '#6b7280' }}>🏆 Producto más vendido: <strong style={{ color: '#f5f5f5' }}>{p.producto_mas_vendido}</strong></p>
          </div>
        )}

        {/* Gráfico 1: Comparación por tipo de venta (donut) */}
        <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>📊 Comparación por Tipo de Venta</p>
          </div>
          <div className="p-4">
            <DonutChart segs={[
              { label: 'Pedidos a clientes', value: totalPedidos, color: '#e53935' },
              { label: 'Venta al detalle', value: totalDetalle, color: '#9c27b0' },
              { label: 'Eventos', value: totalEventos, color: '#ff9800' },
            ].filter(s => s.value > 0)} />
          </div>
        </div>

        {/* Gráfico 2: Productos más vendidos (barras horizontales SVG, unidades) */}
        {informe.productosVendidos.length > 0 && (
          <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>📦 Productos más vendidos (unidades)</p>
            </div>
            <div className="p-3">
              <HBarChart
                items={informe.productosVendidos}
                colorFn={(i) => ['#e53935','#ff9800','#4caf50','#2196f3','#9c27b0','#00bcd4'][i % 6]}
                valueFn={(x) => x.unidades}
                labelFn={(x) => x.nombre}
                sublabelFn={(x) => fmt(x.total)}
              />
            </div>
          </div>
        )}

        {/* Gráfico 3: Cuánto compró cada cliente (barras horizontales SVG, dinero) */}
        {ventasClientes.length > 0 && (
          <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>👥 Compras por cliente ($)</p>
            </div>
            <div className="p-3">
              <HBarChart
                items={ventasClientes}
                colorFn={() => '#e53935'}
                valueFn={(x) => x.total}
                labelFn={(x) => x.nombre}
                sublabelFn={(x) => `${x.pedidos} pedido${x.pedidos !== 1 ? 's' : ''}`}
              />
            </div>
          </div>
        )}

        {/* Ventas al detalle por comprador */}
        {ventasDetalleCli.length > 0 && (
          <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>🛒 Venta al detalle por comprador ($)</p>
            </div>
            <div className="p-3">
              <HBarChart
                items={ventasDetalleCli}
                colorFn={() => '#9c27b0'}
                valueFn={(x) => x.total}
                labelFn={(x) => x.nombre}
                sublabelFn={(x) => `${x.ventas} venta${x.ventas !== 1 ? 's' : ''}`}
              />
            </div>
          </div>
        )}

        {/* Clientes activos e inactivos */}
        {(informe.clientesActivos.length > 0 || informe.clientesInactivos.length > 0) && (
          <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>👥 Estado de Clientes en este Período</p>
            </div>
            <div className="grid grid-cols-2 border-b" style={{ borderColor: '#2a2a2a' }}>
              <div className="flex flex-col items-center py-3 border-r" style={{ borderColor: '#2a2a2a' }}>
                <p className="text-2xl font-extrabold" style={{ color: '#4caf50' }}>{informe.clientesActivos.length}</p>
                <p className="text-xs font-bold" style={{ color: '#4caf50' }}>ACTIVOS</p>
              </div>
              <div className="flex flex-col items-center py-3">
                <p className="text-2xl font-extrabold" style={{ color: '#e53935' }}>{informe.clientesInactivos.length}</p>
                <p className="text-xs font-bold" style={{ color: '#e53935' }}>INACTIVOS</p>
              </div>
            </div>
            {informe.clientesActivos.map((c, i) => (
              <div key={c.nombre} className="flex items-center justify-between px-4 py-2"
                style={{ borderBottom: '1px solid #2a2a2a' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>{c.nombre}</p>
                  <p className="text-xs capitalize" style={{ color: '#6b7280' }}>{c.tipo}</p>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#4caf5020', color: '#4caf50' }}>✓ Compró</span>
              </div>
            ))}
            {informe.clientesInactivos.map((c) => (
              <div key={c.nombre} className="flex items-center justify-between px-4 py-2"
                style={{ borderBottom: '1px solid #2a2a2a' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#9ca3af' }}>{c.nombre}</p>
                  <p className="text-xs capitalize" style={{ color: '#6b7280' }}>{c.tipo}</p>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#e5393520', color: '#e53935' }}>Sin compra</span>
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
