'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

interface ResumenMes {
  pedidos: number;
  totalPedidos: number;
  detalle: number;
  totalDetalle: number;
  eventos: number;
  totalEventos: number;
}

interface FilaExport {
  tipo: string;
  fecha: string;
  cliente: string;
  productos: string;
  total: number;
}

export default function VentasMesPage() {
  const [resumen, setResumen] = useState<ResumenMes | null>(null);
  const [filasExport, setFilasExport] = useState<FilaExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [ventasPorMes, setVentasPorMes] = useState<number[]>(Array(12).fill(0));

  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth());
  const [anio, setAnio] = useState(hoy.getFullYear());

  const inicioMes = `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
  const finMes = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(new Date(anio, mes + 1, 0).getDate()).padStart(2, '0')}`;

  function mesAnterior() {
    if (mes === 0) { setMes(11); setAnio((a) => a - 1); }
    else setMes((m) => m - 1);
  }

  function mesSiguiente() {
    if (mes === 11) { setMes(0); setAnio((a) => a + 1); }
    else setMes((m) => m + 1);
  }

  const esMesActual = mes === hoy.getMonth() && anio === hoy.getFullYear();

  useEffect(() => {
    async function load() {
      try {
        const [pedidosRes, detalleRes, eventosRes] = await Promise.all([
          supabase
            .from('pedidos')
            .select('fecha, total, cliente:clientes(nombre), detalle:detalle_pedido(cantidad, precio_unitario, producto:productos(nombre))')
            .eq('estado', 'pagado')
            .gte('fecha', inicioMes)
            .lte('fecha', finMes)
            .order('fecha', { ascending: true }),
          supabase
            .from('ventas_detalle')
            .select('fecha, total, nombre_comprador, items:items_venta_detalle(cantidad, precio_unitario, producto:productos(nombre))')
            .eq('estado', 'pagado')
            .gte('fecha', inicioMes)
            .lte('fecha', finMes)
            .order('fecha', { ascending: true }),
          supabase
            .from('ventas_evento')
            .select('total, cantidad, precio_unitario, producto:productos(nombre), evento:eventos(nombre, fecha)')
            .gte('eventos.fecha', inicioMes)
            .lte('eventos.fecha', finMes),
        ]);

        const pedidos = (pedidosRes.data || []) as any[];
        const detalle = (detalleRes.data || []) as any[];
        const eventosRaw = ((eventosRes.data || []) as any[]).filter((v) => v.evento);

        setResumen({
          pedidos: pedidos.length,
          totalPedidos: pedidos.reduce((s, p) => s + p.total, 0),
          detalle: detalle.length,
          totalDetalle: detalle.reduce((s, v) => s + v.total, 0),
          eventos: eventosRaw.length,
          totalEventos: eventosRaw.reduce((s, v) => s + v.total, 0),
        });

        // Armar filas para exportar
        const filas: FilaExport[] = [];

        for (const p of pedidos) {
          const prods = (p.detalle || []).map((d: any) => `${d.producto?.nombre ?? '—'} x${d.cantidad}`).join(' | ');
          filas.push({ tipo: 'Pedido', fecha: p.fecha, cliente: p.cliente?.nombre ?? '—', productos: prods, total: p.total });
        }

        for (const v of detalle) {
          const prods = (v.items || []).map((i: any) => `${i.producto?.nombre ?? '—'} x${i.cantidad}`).join(' | ');
          filas.push({ tipo: 'Venta al Detalle', fecha: v.fecha, cliente: v.nombre_comprador || 'Sin nombre', productos: prods, total: v.total });
        }

        for (const v of eventosRaw) {
          filas.push({ tipo: 'Evento', fecha: v.evento?.fecha ?? '', cliente: v.evento?.nombre ?? '—', productos: `${v.producto?.nombre ?? '—'} x${v.cantidad}`, total: v.total });
        }

        filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
        setFilasExport(filas);
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, [inicioMes, finMes]);

  // Ventas de todo el año para el gráfico comparativo
  useEffect(() => {
    async function loadAnio() {
      const inicioAnio = `${anio}-01-01`;
      const finAnio = `${anio}-12-31`;
      const [pedidosRes, detalleRes, eventosRes] = await Promise.all([
        supabase.from('pedidos').select('fecha, total').eq('estado', 'pagado').gte('fecha', inicioAnio).lte('fecha', finAnio),
        supabase.from('ventas_detalle').select('fecha, total').eq('estado', 'pagado').gte('fecha', inicioAnio).lte('fecha', finAnio),
        supabase.from('ventas_evento').select('total, evento:eventos(fecha)').gte('eventos.fecha', inicioAnio).lte('eventos.fecha', finAnio),
      ]);
      const totales = Array(12).fill(0);
      for (const p of (pedidosRes.data || []) as any[]) {
        const m = parseInt(p.fecha.slice(5, 7)) - 1;
        if (m >= 0 && m < 12) totales[m] += p.total;
      }
      for (const v of (detalleRes.data || []) as any[]) {
        const m = parseInt(v.fecha.slice(5, 7)) - 1;
        if (m >= 0 && m < 12) totales[m] += v.total;
      }
      for (const v of ((eventosRes.data || []) as any[]).filter((x) => x.evento)) {
        const m = parseInt(v.evento.fecha.slice(5, 7)) - 1;
        if (m >= 0 && m < 12) totales[m] += v.total;
      }
      setVentasPorMes(totales);
    }
    loadAnio();
  }, [anio]);

  const totalGeneral = (resumen?.totalPedidos ?? 0) + (resumen?.totalDetalle ?? 0) + (resumen?.totalEventos ?? 0);

  function exportarCSV() {
    const encabezado = ['Tipo', 'Fecha', 'Cliente / Comprador', 'Productos', 'Total'];
    const filas = filasExport.map((f) => [
      f.tipo,
      new Date(f.fecha + 'T12:00:00').toLocaleDateString('es-CL'),
      f.cliente,
      f.productos,
      Math.round(f.total).toString(),
    ]);

    const resumenFilas = [
      [],
      ['RESUMEN'],
      ['Total Pedidos', '', '', '', Math.round(resumen?.totalPedidos ?? 0).toString()],
      ['Total Venta al Detalle', '', '', '', Math.round(resumen?.totalDetalle ?? 0).toString()],
      ['Total Eventos', '', '', '', Math.round(resumen?.totalEventos ?? 0).toString()],
      ['TOTAL GENERAL', '', '', '', Math.round(totalGeneral).toString()],
    ];

    const contenido = [encabezado, ...filas, ...resumenFilas]
      .map((fila) => fila.map((c) => `"${c}"`).join(','))
      .join('\n');

    const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ventas-${MESES[mes].toLowerCase()}-${anio}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Venta Mensual</h1>
        {totalGeneral > 0 && (
          <button onClick={exportarCSV}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: '#2196f3' }}>
            ⬇️ Exportar CSV
          </button>
        )}
      </div>

      {/* Selector de mes y año */}
      <div className="rounded-xl border p-4 mb-6" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        {/* Selector de año */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setAnio((a) => a - 1)}
            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold"
            style={{ backgroundColor: '#1c1c1c', color: '#f5f5f5' }}>‹</button>
          <p className="font-bold text-sm" style={{ color: '#6b7280' }}>{anio}</p>
          <button onClick={() => setAnio((a) => a + 1)} disabled={anio >= hoy.getFullYear()}
            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold disabled:opacity-30"
            style={{ backgroundColor: '#1c1c1c', color: '#f5f5f5' }}>›</button>
        </div>
        {/* Grid de meses */}
        <div className="grid grid-cols-4 gap-2">
          {MESES.map((nombre, i) => {
            const esFuturo = anio === hoy.getFullYear() && i > hoy.getMonth();
            const activo = i === mes;
            return (
              <button key={i} onClick={() => !esFuturo && setMes(i)} disabled={esFuturo}
                className="py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-30"
                style={{
                  backgroundColor: activo ? '#e53935' : '#1c1c1c',
                  color: activo ? 'white' : '#9ca3af',
                }}>
                {nombre.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Total general */}
      <div className="rounded-xl border p-5 mb-6 flex justify-between items-center"
        style={{ backgroundColor: '#141414', borderColor: '#4caf50' + '40', borderLeftWidth: 4, borderLeftColor: '#4caf50' }}>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>Total vendido en {MESES[mes]}</p>
          <p className="text-4xl font-extrabold" style={{ color: '#4caf50' }}>{fmt(totalGeneral)}</p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>Solo ventas con estado <span style={{ color: '#4caf50' }}>Pagado</span></p>
        </div>
        <span className="text-5xl">📈</span>
      </div>

      {/* Comparación entre meses del año */}
      <div className="rounded-xl border overflow-hidden mb-6" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>📊 Ventas por mes — {anio}</p>
        </div>
        <div className="p-4">
          {(() => {
            const maxVenta = Math.max(...ventasPorMes, 1);
            const H = 120;
            return (
              <svg viewBox={`0 0 380 ${H + 34}`} width="100%" style={{ display: 'block' }}>
                {ventasPorMes.map((v, i) => {
                  const barH = Math.round((v / maxVenta) * H);
                  const x = 8 + i * 31;
                  const esSel = i === mes;
                  const color = esSel ? '#e53935' : v > 0 ? '#4caf50' : '#2a2a2a';
                  return (
                    <g key={i} onClick={() => setMes(i)} style={{ cursor: 'pointer' }}>
                      <rect x={x} y={H - Math.max(barH, 2)} width={24} height={Math.max(barH, 2)} rx={3} fill={color} />
                      {v > 0 && (
                        <text x={x + 12} y={H - Math.max(barH, 2) - 4} textAnchor="middle" fontSize={7} fill="#9ca3af"
                          style={{ fontFamily: 'system-ui, sans-serif' }}>
                          {v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${Math.round(v / 1000)}k`}
                        </text>
                      )}
                      <text x={x + 12} y={H + 14} textAnchor="middle" fontSize={8} fontWeight={esSel ? 'bold' : 'normal'}
                        fill={esSel ? '#e53935' : '#6b7280'} style={{ fontFamily: 'system-ui, sans-serif' }}>
                        {MESES[i].slice(0, 3)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            );
          })()}
          <p className="text-xs text-center mt-1" style={{ color: '#6b7280' }}>Toca una barra para ver ese mes</p>
        </div>
      </div>

      {/* Desglose */}
      <div className="space-y-3 mb-6">
        {/* Pedidos */}
        <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2"><span>📦</span><p className="font-bold" style={{ color: '#f5f5f5' }}>Pedidos</p></div>
            <p className="text-2xl font-extrabold" style={{ color: '#e53935' }}>{fmt(resumen?.totalPedidos ?? 0)}</p>
          </div>
          <p className="text-xs" style={{ color: '#6b7280' }}>{resumen?.pedidos ?? 0} pedido{resumen?.pedidos !== 1 ? 's' : ''} pagado{resumen?.pedidos !== 1 ? 's' : ''} este mes</p>
          {totalGeneral > 0 && (
            <div className="mt-3">
              <div className="w-full rounded-full h-2" style={{ backgroundColor: '#2a2a2a' }}>
                <div className="h-2 rounded-full" style={{ width: `${Math.round(((resumen?.totalPedidos ?? 0) / totalGeneral) * 100)}%`, backgroundColor: '#e53935' }} />
              </div>
              <p className="text-xs mt-1 text-right" style={{ color: '#6b7280' }}>{Math.round(((resumen?.totalPedidos ?? 0) / totalGeneral) * 100)}%</p>
            </div>
          )}
        </div>

        {/* Venta al detalle */}
        <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2"><span>🛒</span><p className="font-bold" style={{ color: '#f5f5f5' }}>Venta al Detalle</p></div>
            <p className="text-2xl font-extrabold" style={{ color: '#9c27b0' }}>{fmt(resumen?.totalDetalle ?? 0)}</p>
          </div>
          <p className="text-xs" style={{ color: '#6b7280' }}>{resumen?.detalle ?? 0} venta{resumen?.detalle !== 1 ? 's' : ''} pagada{resumen?.detalle !== 1 ? 's' : ''} este mes</p>
          {totalGeneral > 0 && (
            <div className="mt-3">
              <div className="w-full rounded-full h-2" style={{ backgroundColor: '#2a2a2a' }}>
                <div className="h-2 rounded-full" style={{ width: `${Math.round(((resumen?.totalDetalle ?? 0) / totalGeneral) * 100)}%`, backgroundColor: '#9c27b0' }} />
              </div>
              <p className="text-xs mt-1 text-right" style={{ color: '#6b7280' }}>{Math.round(((resumen?.totalDetalle ?? 0) / totalGeneral) * 100)}%</p>
            </div>
          )}
        </div>

        {/* Eventos */}
        <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2"><span>🎪</span><p className="font-bold" style={{ color: '#f5f5f5' }}>Eventos</p></div>
            <p className="text-2xl font-extrabold" style={{ color: '#ff9800' }}>{fmt(resumen?.totalEventos ?? 0)}</p>
          </div>
          <p className="text-xs" style={{ color: '#6b7280' }}>{resumen?.eventos ?? 0} venta{resumen?.eventos !== 1 ? 's' : ''} en evento este mes</p>
          {totalGeneral > 0 && (
            <div className="mt-3">
              <div className="w-full rounded-full h-2" style={{ backgroundColor: '#2a2a2a' }}>
                <div className="h-2 rounded-full" style={{ width: `${Math.round(((resumen?.totalEventos ?? 0) / totalGeneral) * 100)}%`, backgroundColor: '#ff9800' }} />
              </div>
              <p className="text-xs mt-1 text-right" style={{ color: '#6b7280' }}>{Math.round(((resumen?.totalEventos ?? 0) / totalGeneral) * 100)}%</p>
            </div>
          )}
        </div>
      </div>

      {/* Detalle de ventas */}
      {filasExport.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>Detalle de ventas</p>
          </div>
          {filasExport.map((f, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: i < filasExport.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
              <div className="flex-1 min-w-0 mr-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: f.tipo === 'Pedido' ? '#e53935' + '20' : f.tipo === 'Venta al Detalle' ? '#9c27b0' + '20' : '#ff9800' + '20',
                      color: f.tipo === 'Pedido' ? '#e53935' : f.tipo === 'Venta al Detalle' ? '#9c27b0' : '#ff9800',
                    }}>
                    {f.tipo === 'Pedido' ? '📦' : f.tipo === 'Venta al Detalle' ? '🛒' : '🎪'}
                  </span>
                  <p className="text-sm font-semibold truncate" style={{ color: '#f5f5f5' }}>{f.cliente}</p>
                </div>
                <p className="text-xs truncate" style={{ color: '#6b7280' }}>
                  {new Date(f.fecha + 'T12:00:00').toLocaleDateString('es-CL')} · {f.productos}
                </p>
              </div>
              <p className="font-extrabold text-sm whitespace-nowrap" style={{ color: '#4caf50' }}>{fmt(f.total)}</p>
            </div>
          ))}
        </div>
      )}

      {totalGeneral === 0 && (
        <div className="text-center py-10 mt-4">
          <p className="text-3xl mb-2">📭</p>
          <p style={{ color: '#6b7280' }}>Sin ventas pagadas este mes todavía</p>
        </div>
      )}
    </div>
  );
}
