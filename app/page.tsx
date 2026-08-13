'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Producto } from '@/types';

const DIAS_ACTIVO = 60;
const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

interface PuntoVenta {
  id: string;
  nombre: string;
  tipo: string;
  ultimaCompra: string | null;
  activo: boolean;
  activoManual: boolean | null;
}

interface EstadoResumen { n: number; total: number; }

interface Stats {
  // Mes
  ventasMes: number;
  ventasDetalleMes: number;
  utilidadMes: number;
  ventasLote: number;
  utilidadLote: number;
  pedidosMes: number;
  ticketPromedio: number;
  productoMasVendido: string;
  pedidosPorEstado: Record<string, EstadoResumen>;
  detallePorEstado: Record<string, EstadoResumen>;
  // General
  clientesRegistrados: number;
  puntosActivos: number;
  puntosInactivos: number;
  puntosVenta: PuntoVenta[];
  // Alertas
  pedidosPendientes: number;
  totalPorCobrar: number;
  stockBajo: Producto[];
  porVencer: { nombre: string; fecha: string; dias: number; stock: number }[];
  prospectosParaInsistir: { id: string; nombre_local: string; nombre_contacto: string }[];
  seguimientosMuestras: { local: string; productos: string }[];
  // Muestras
  totalMuestras: number;
  muestrasPorProducto: { nombre: string; cantidad: number }[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [verPuntos, setVerPuntos] = useState(false);
  const [editStockId, setEditStockId] = useState<string | null>(null);
  const [editStockVal, setEditStockVal] = useState('');
  const [savingStock, setSavingStock] = useState(false);

  async function guardarStock(id: string) {
    const nuevo = editStockVal === '' ? 0 : parseFloat(editStockVal);
    if (isNaN(nuevo)) return;
    setSavingStock(true);
    await supabase.from('productos').update({ stock: nuevo }).eq('id', id);
    setProductos((prev) => prev.map((p) => p.id === id ? { ...p, stock: nuevo } : p));
    setEditStockId(null);
    setSavingStock(false);
  }

  useEffect(() => {
    async function load() {
      try {
        const hoy = new Date();
        const hoyStr = hoy.toISOString().split('T')[0];
        const hace60 = new Date(Date.now() - DIAS_ACTIVO * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const inicioMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
        const finMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;

        const [
          pedidosMesRes,
          detallesMesRes,
          eventosMesRes,
          clientesRes,
          productosRes,
          muestrasRes,
          pedidosPendientesRes,
          cobroRes,
          prospectoRes,
          pedidosPorClienteRes,
          facturasMesRes,
          detallePendienteRes,
          detalleCobrarRes,
          pedidosEstadoRes,
          detalleEstadoRes,
          pedidosLoteRes,
          detalleLoteRes,
          eventosLoteRes,
          facturasLoteRes,
          mayorLoteRes,
          seguimientosRes,
        ] = await Promise.all([
          supabase.from('pedidos').select('total, detalle:detalle_pedido(cantidad, precio_unitario, producto:productos(nombre, costo))').eq('estado', 'pagado').gte('fecha', inicioMes).lte('fecha', finMes),
          supabase.from('ventas_detalle').select('total, items:items_venta_detalle(cantidad, precio_unitario, producto:productos(nombre, costo))').eq('estado', 'pagado').gte('fecha', inicioMes).lte('fecha', finMes),
          supabase.from('ventas_evento').select('total, cantidad, precio_unitario, producto:productos(nombre, costo), evento:eventos(fecha)').gte('eventos.fecha', inicioMes).lte('eventos.fecha', finMes),
          supabase.from('clientes').select('id, nombre, tipo, activo_manual'),
          supabase.from('productos').select('*').order('nombre'),
          supabase.from('muestras').select('cantidad, producto:productos(nombre)'),
          supabase.from('pedidos').select('id').in('estado', ['pendiente', 'preparado']),
          supabase.from('pedidos').select('total').eq('estado', 'entregado'),
          supabase.from('prospectos').select('id, nombre_local, nombre_contacto, proxima_visita').in('estado', ['potencial', 'contactado', 'pendiente']),
          supabase.from('pedidos').select('cliente_id, fecha').order('fecha', { ascending: false }),
          supabase.from('costos_factura').select('monto').gte('created_at', inicioMes).lte('created_at', finMes + 'T23:59:59'),
          supabase.from('ventas_detalle').select('id, total').in('estado', ['pendiente', 'preparado']),
          supabase.from('ventas_detalle').select('total').eq('estado', 'entregado'),
          supabase.from('pedidos').select('estado, total').gte('fecha', inicioMes).lte('fecha', finMes),
          supabase.from('ventas_detalle').select('estado, total').gte('fecha', inicioMes).lte('fecha', finMes),
          // Lote actual (período sin cerrar): todo lo que aún no ha sido archivado
          supabase.from('pedidos').select('total').is('periodo_id', null),
          supabase.from('ventas_detalle').select('total').is('periodo_id', null),
          supabase.from('ventas_evento').select('total').is('periodo_id', null),
          supabase.from('costos_factura').select('monto').is('periodo_id', null),
          supabase.from('ventas_mayor').select('total, costo').is('periodo_id', null),
          supabase.from('mermas').select('destino_nombre, seguimiento_fecha, producto:productos(nombre)').eq('motivo', 'muestra').eq('seguimiento_hecho', false).not('seguimiento_fecha', 'is', null).lte('seguimiento_fecha', hoyStr),
        ]);

        const pedidosMes = (pedidosMesRes.data || []) as any[];
        const detallesMes = (detallesMesRes.data || []) as any[];
        const eventosMes = ((eventosMesRes.data || []) as any[]).filter((v) => v.evento);
        const clientes = clientesRes.data || [];
        const prods = productosRes.data || [];
        const muestrasData = muestrasRes.data || [];
        const pedidosCliente = pedidosPorClienteRes.data || [];

        // Ventas del mes
        const ventasPedidos = pedidosMes.reduce((s: number, p: any) => s + p.total, 0);
        const ventasDetalle = detallesMes.reduce((s: number, v: any) => s + v.total, 0);
        const ventasEventos = eventosMes.reduce((s: number, v: any) => s + v.total, 0);
        const ventasMes = ventasPedidos + ventasDetalle + ventasEventos;

        // Utilidad del mes = ventas del mes - facturas (costos) del mes
        const facturasMes = ((facturasMesRes.data || []) as any[]).reduce((s, f) => s + f.monto, 0);
        const utilidadMes = ventasMes - facturasMes;

        // Utilidad del LOTE actual (período sin cerrar) = ventas del lote - facturas del lote
        const mayorLote = (mayorLoteRes.data || []) as any[];
        const ventasLote =
          ((pedidosLoteRes.data || []) as any[]).reduce((s, x) => s + x.total, 0) +
          ((detalleLoteRes.data || []) as any[]).reduce((s, x) => s + x.total, 0) +
          ((eventosLoteRes.data || []) as any[]).reduce((s, x) => s + x.total, 0) +
          mayorLote.reduce((s, x) => s + x.total, 0);
        const costosLote =
          ((facturasLoteRes.data || []) as any[]).reduce((s, f) => s + f.monto, 0) +
          mayorLote.reduce((s, x) => s + x.costo, 0);
        const utilidadLote = ventasLote - costosLote;

        // Desglose por estado (pedidos a locales y ventas al detalle del mes)
        const agruparPorEstado = (filas: any[]) => {
          const map: Record<string, EstadoResumen> = {};
          for (const f of filas) {
            if (!map[f.estado]) map[f.estado] = { n: 0, total: 0 };
            map[f.estado].n += 1; map[f.estado].total += f.total;
          }
          return map;
        };
        const pedidosPorEstado = agruparPorEstado((pedidosEstadoRes.data || []) as any[]);
        const detallePorEstado = agruparPorEstado((detalleEstadoRes.data || []) as any[]);

        // Pedidos del mes
        const totalTransacciones = pedidosMes.length + detallesMes.length + eventosMes.length;
        const ticketPromedio = totalTransacciones > 0 ? ventasMes / totalTransacciones : 0;

        // Producto más vendido
        const unidadesPorProducto: Record<string, number> = {};
        for (const p of pedidosMes) {
          for (const d of (p.detalle || [])) {
            const nombre = d.producto?.nombre ?? 'Desconocido';
            unidadesPorProducto[nombre] = (unidadesPorProducto[nombre] || 0) + d.cantidad;
          }
        }
        for (const v of detallesMes) {
          for (const i of (v.items || [])) {
            const nombre = i.producto?.nombre ?? 'Desconocido';
            unidadesPorProducto[nombre] = (unidadesPorProducto[nombre] || 0) + i.cantidad;
          }
        }
        for (const v of eventosMes) {
          const nombre = v.producto?.nombre ?? 'Desconocido';
          unidadesPorProducto[nombre] = (unidadesPorProducto[nombre] || 0) + v.cantidad;
        }
        const productoMasVendido = Object.entries(unidadesPorProducto).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

        // Productos por vencer (vencen dentro de 15 días o ya vencidos, con stock)
        const en15 = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const porVencer = prods
          .filter((p) => p.fecha_vencimiento && p.stock > 0 && p.fecha_vencimiento <= en15)
          .map((p) => {
            const dias = Math.round((new Date(p.fecha_vencimiento + 'T12:00:00').getTime() - new Date(hoyStr + 'T12:00:00').getTime()) / (24 * 60 * 60 * 1000));
            return { nombre: p.nombre, fecha: p.fecha_vencimiento as string, dias, stock: p.stock };
          })
          .sort((a, b) => a.dias - b.dias);

        // Puntos de venta
        const ultimaCompraMap: Record<string, string> = {};
        for (const p of pedidosCliente) {
          if (!ultimaCompraMap[p.cliente_id]) ultimaCompraMap[p.cliente_id] = p.fecha;
        }
        const puntosVenta: PuntoVenta[] = clientes.map((c: any) => {
          const ultimaCompra = ultimaCompraMap[c.id] || null;
          const activoManual = c.activo_manual ?? null;
          const activo = activoManual !== null ? activoManual : (ultimaCompra ? ultimaCompra >= hace60 : false);
          return { id: c.id, nombre: c.nombre, tipo: c.tipo, ultimaCompra, activo, activoManual };
        });

        // Seguimientos de muestras a local pendientes (agrupados por local)
        const segRaw = (seguimientosRes.data || []) as any[];
        const segMap: Record<string, Set<string>> = {};
        for (const s of segRaw) {
          const local = s.destino_nombre || 'Sin nombre';
          if (!segMap[local]) segMap[local] = new Set();
          if (s.producto?.nombre) segMap[local].add(s.producto.nombre);
        }
        const seguimientosMuestras = Object.entries(segMap).map(([local, prods]) => ({ local, productos: Array.from(prods).join(', ') }));

        // Muestras
        const muestrasPorProducto: Record<string, number> = {};
        for (const m of muestrasData) {
          const prod = m.producto as unknown as { nombre: string } | null;
          const nombre = prod?.nombre ?? 'Desconocido';
          muestrasPorProducto[nombre] = (muestrasPorProducto[nombre] || 0) + (m.cantidad || 0);
        }

        setProductos(prods);
        setStats({
          ventasMes,
          ventasDetalleMes: ventasDetalle,
          utilidadMes,
          ventasLote,
          utilidadLote,
          pedidosPorEstado,
          detallePorEstado,
          pedidosMes: pedidosMes.length,
          ticketPromedio,
          productoMasVendido,
          clientesRegistrados: clientes.length,
          puntosActivos: puntosVenta.filter((p) => p.activo).length,
          puntosInactivos: puntosVenta.filter((p) => !p.activo).length,
          puntosVenta,
          pedidosPendientes: (pedidosPendientesRes.data?.length || 0) + (detallePendienteRes.data?.length || 0),
          totalPorCobrar: (cobroRes.data || []).reduce((s, p) => s + p.total, 0) + (detalleCobrarRes.data || []).reduce((s, v) => s + v.total, 0),
          stockBajo: prods.filter((p) => p.stock <= 10),
          porVencer,
          prospectosParaInsistir: (prospectoRes.data || []).filter((p: any) => p.proxima_visita && p.proxima_visita <= hoyStr),
          seguimientosMuestras,
          totalMuestras: muestrasData.reduce((s, m) => s + (m.cantidad || 0), 0),
          muestrasPorProducto: Object.entries(muestrasPorProducto).map(([nombre, cantidad]) => ({ nombre, cantidad })),
        });
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Montabone Gestión</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Lote actual: venta y utilidad */}
      {(() => {
        const util = stats?.utilidadLote ?? 0;
        const ventas = stats?.ventasLote ?? 0;
        const margen = ventas > 0 ? Math.round((util / ventas) * 100) : 0;
        const color = util > 0 ? '#4caf50' : util < 0 ? '#e53935' : '#6b7280';
        return (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Link href="/ventas-mes" className="rounded-xl border p-5 block transition-colors hover:brightness-125" style={{ backgroundColor: '#141414', borderColor: '#4caf50' + '60', borderLeftWidth: 4, borderLeftColor: '#4caf50' }}>
              <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>📈 Venta del lote actual</p>
              <p className="text-3xl md:text-4xl font-extrabold" style={{ color: '#4caf50' }}>{fmt(ventas)}</p>
              <p className="text-xs mt-1" style={{ color: '#6b7280' }}>Total vendido</p>
            </Link>
            <Link href="/periodos" className="rounded-xl border p-5 block transition-colors hover:brightness-125" style={{ backgroundColor: '#141414', borderColor: color + '60', borderLeftWidth: 4, borderLeftColor: color }}>
              <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>💰 Utilidad del lote actual</p>
              <p className="text-3xl md:text-4xl font-extrabold" style={{ color }}>{fmt(util)}</p>
              <p className="text-xs mt-1" style={{ color: '#6b7280' }}>Margen <span style={{ color }}>{margen}%</span></p>
            </Link>
          </div>
        );
      })()}

      {/* Estadísticas del mes */}
      <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: '#6b7280' }}>📊 {MESES[new Date().getMonth()]} {new Date().getFullYear()}</p>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/ventas-mes" className="rounded-lg p-3 block transition-colors hover:brightness-125" style={{ backgroundColor: '#1c1c1c' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>📈 Ventas del mes</p>
            <p className="text-xl font-extrabold" style={{ color: '#4caf50' }}>{fmt(stats?.ventasMes ?? 0)}</p>
          </Link>
          <Link href="/periodos" className="rounded-lg p-3 block transition-colors hover:brightness-125" style={{ backgroundColor: '#1c1c1c' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>💰 Utilidad del lote</p>
            <p className="text-xl font-extrabold" style={{ color: (stats?.utilidadLote ?? 0) < 0 ? '#e53935' : '#2196f3' }}>{fmt(stats?.utilidadLote ?? 0)}</p>
          </Link>
          <Link href="/ventas-mes" className="rounded-lg p-3 block transition-colors hover:brightness-125" style={{ backgroundColor: '#1c1c1c' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>🛒 Ventas al detalle</p>
            <p className="text-xl font-extrabold" style={{ color: '#9c27b0' }}>{fmt(stats?.ventasDetalleMes ?? 0)}</p>
          </Link>
          <Link href="/pedidos" className="rounded-lg p-3 block transition-colors hover:brightness-125" style={{ backgroundColor: '#1c1c1c' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>📦 Pedidos del mes</p>
            <p className="text-xl font-extrabold" style={{ color: '#e53935' }}>{stats?.pedidosMes ?? 0}</p>
          </Link>
          <div className="rounded-lg p-3" style={{ backgroundColor: '#1c1c1c' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>📊 Ticket promedio</p>
            <p className="text-xl font-extrabold" style={{ color: '#ff9800' }}>{fmt(stats?.ticketPromedio ?? 0)}</p>
          </div>
          <Link href="/clientes" className="rounded-lg p-3 block transition-colors hover:brightness-125" style={{ backgroundColor: '#1c1c1c' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>👥 Clientes registrados</p>
            <p className="text-xl font-extrabold" style={{ color: '#9c27b0' }}>{stats?.clientesRegistrados ?? 0}</p>
          </Link>
          <Link href="/inventario" className="rounded-lg p-3 block transition-colors hover:brightness-125" style={{ backgroundColor: '#1c1c1c' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>🏆 Más vendido</p>
            <p className="text-sm font-extrabold leading-tight" style={{ color: '#f5f5f5' }}>{stats?.productoMasVendido ?? '—'}</p>
          </Link>
        </div>
      </div>

      {/* Ventas por estado */}
      {(() => {
        const ESTADOS_ORDEN = [
          { key: 'pendiente', label: 'Pendiente', color: '#ff9800' },
          { key: 'preparado', label: 'Preparado', color: '#2196f3' },
          { key: 'entregado', label: 'Entregado', color: '#4caf50' },
          { key: 'pagado', label: 'Pagado', color: '#6b7280' },
        ];
        const bloques = [
          { titulo: '📦 Pedidos a locales', data: stats?.pedidosPorEstado ?? {}, href: '/pedidos' },
          { titulo: '🛒 Ventas al detalle', data: stats?.detallePorEstado ?? {}, href: '/pedidos' },
        ];
        return (
          <div className="grid md:grid-cols-2 gap-3 mb-4">
            {bloques.map((b) => (
              <div key={b.titulo} className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
                <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: '#6b7280' }}>{b.titulo} — {MESES[new Date().getMonth()]}</p>
                <div className="space-y-2">
                  {ESTADOS_ORDEN.map((e) => {
                    const r = b.data[e.key];
                    return (
                      <Link key={e.key} href={`${b.href}?estado=${e.key}`} className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:brightness-125" style={{ backgroundColor: '#1c1c1c' }}>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: e.color + '20', color: e.color }}>
                          {e.label}
                        </span>
                        <div className="text-right">
                          <span className="text-sm font-extrabold" style={{ color: e.color }}>{r?.n ?? 0}</span>
                          <span className="text-xs ml-2" style={{ color: '#6b7280' }}>{fmt(r?.total ?? 0)}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Seguimiento de muestras a locales */}
      {(stats?.seguimientosMuestras.length ?? 0) > 0 && (
        <Link href="/merma" className="block rounded-xl border p-4 mb-4" style={{ backgroundColor: '#9c27b0' + '15', borderColor: '#9c27b0' + '60', borderLeftWidth: 4, borderLeftColor: '#9c27b0' }}>
          <p className="font-bold text-sm mb-2" style={{ color: '#9c27b0' }}>
            🔔 {stats!.seguimientosMuestras.length} muestra{stats!.seguimientosMuestras.length > 1 ? 's' : ''} para hacer seguimiento
          </p>
          {stats!.seguimientosMuestras.map((s, idx) => (
            <p key={idx} className="text-sm py-0.5" style={{ color: '#f5f5f5' }}>
              🏪 <span className="font-semibold">{s.local}</span> <span style={{ color: '#6b7280' }}>— {s.productos}</span>
            </p>
          ))}
        </Link>
      )}

      {/* Alertas rápidas */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Link href="/pedidos?estado=pendiente" className="rounded-xl p-4 border block transition-colors hover:brightness-125" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>Pendientes ›</p>
          <p className="text-2xl font-extrabold" style={{ color: '#ff9800' }}>{stats?.pedidosPendientes ?? 0}</p>
        </Link>
        <Link href="/cobros" className="rounded-xl p-4 border block transition-colors hover:brightness-125" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>Por Cobrar ›</p>
          <p className="text-2xl font-extrabold" style={{ color: '#e53935' }}>{fmt(stats?.totalPorCobrar ?? 0)}</p>
        </Link>
      </div>

      {/* Alerta prospectos */}
      {(stats?.prospectosParaInsistir.length ?? 0) > 0 && (
        <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#9c27b0' + '15', borderColor: '#9c27b0' + '60', borderLeftWidth: 4, borderLeftColor: '#9c27b0' }}>
          <p className="font-bold text-sm mb-2" style={{ color: '#9c27b0' }}>
            🔔 {stats!.prospectosParaInsistir.length} prospecto{stats!.prospectosParaInsistir.length > 1 ? 's' : ''} para volver a contactar hoy
          </p>
          {stats!.prospectosParaInsistir.map((p) => (
            <p key={p.id} className="text-sm py-1" style={{ color: '#f5f5f5' }}>
              📞 <span className="font-semibold">{p.nombre_local}</span> — {p.nombre_contacto}
            </p>
          ))}
        </div>
      )}

      {/* Productos por vencer */}
      {(stats?.porVencer.length ?? 0) > 0 && (
        <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#ff980015', borderColor: '#ff9800' + '60', borderLeftWidth: 4, borderLeftColor: '#ff9800' }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: '#ff9800' }}>⏰ Por Vencer</p>
          <div className="space-y-2">
            {stats!.porVencer.map((p, i) => {
              const vencido = p.dias < 0;
              const col = vencido ? '#e53935' : p.dias <= 5 ? '#ff9800' : '#f5f5f5';
              return (
                <div key={i} className="flex justify-between items-center">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>{p.nombre} <span style={{ color: '#6b7280', fontWeight: 400 }}>· {p.stock} uds</span></p>
                    <p className="text-xs" style={{ color: '#6b7280' }}>Vence {new Date(p.fecha + 'T12:00:00').toLocaleDateString('es-CL')}</p>
                  </div>
                  <span className="text-sm font-bold flex-shrink-0" style={{ color: col }}>
                    {vencido ? `Vencido hace ${Math.abs(p.dias)}d` : p.dias === 0 ? 'Vence hoy' : `en ${p.dias}d`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stock bajo */}
      {(stats?.stockBajo.length ?? 0) > 0 && (
        <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderColor: '#e53935' + '40', borderLeftWidth: 4, borderLeftColor: '#e53935' }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: '#6b7280' }}>⚠️ Stock Bajo</p>
          <div className="space-y-2">
            {stats!.stockBajo.map((p) => (
              <div key={p.id} className="flex justify-between items-center">
                <span className="text-sm" style={{ color: '#f5f5f5' }}>{p.nombre}</span>
                <span className="text-sm font-bold" style={{ color: '#e53935' }}>{p.stock} uds</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Puntos de venta */}
      <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <button onClick={() => setVerPuntos(!verPuntos)} className="w-full px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: '#2a2a2a' }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>🏪 Puntos de Venta</p>
          <span style={{ color: '#6b7280' }}>{verPuntos ? '▲' : '▼'}</span>
        </button>
        <div className="grid grid-cols-2">
          <div className="flex flex-col items-center justify-center py-4 border-r" style={{ borderColor: '#2a2a2a' }}>
            <p className="text-3xl font-extrabold" style={{ color: '#4caf50' }}>{stats?.puntosActivos ?? 0}</p>
            <p className="text-xs font-semibold mt-1" style={{ color: '#4caf50' }}>ACTIVOS</p>
            <p className="text-xs" style={{ color: '#6b7280' }}>últimos {DIAS_ACTIVO} días</p>
          </div>
          <div className="flex flex-col items-center justify-center py-4">
            <p className="text-3xl font-extrabold" style={{ color: '#e53935' }}>{stats?.puntosInactivos ?? 0}</p>
            <p className="text-xs font-semibold mt-1" style={{ color: '#e53935' }}>INACTIVOS</p>
            <p className="text-xs" style={{ color: '#6b7280' }}>sin compras recientes</p>
          </div>
        </div>
        {verPuntos && (
          <div className="border-t" style={{ borderColor: '#2a2a2a' }}>
            {(stats?.puntosVenta ?? []).sort((a, b) => (b.activo ? 1 : 0) - (a.activo ? 1 : 0)).map((p, i) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: i < (stats?.puntosVenta.length ?? 0) - 1 ? '1px solid #2a2a2a' : 'none' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>{p.nombre}</p>
                  <p className="text-xs" style={{ color: '#6b7280' }}>
                    {p.ultimaCompra ? `Última compra: ${new Date(p.ultimaCompra + 'T12:00:00').toLocaleDateString('es-CL')}` : 'Sin compras registradas'}
                  </p>
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-full"
                  style={{ backgroundColor: p.activo ? '#4caf50' + '20' : '#e53935' + '20', color: p.activo ? '#4caf50' : '#e53935' }}>
                  {p.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stock actual (editable) */}
      <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>📦 Stock Actual <span style={{ color: '#4b5563', fontWeight: 400 }}>· toca para editar</span></p>
        </div>
        {productos.map((p, i) => {
          const color = p.stock === 0 ? '#e53935' : p.stock <= 10 ? '#ff9800' : '#4caf50';
          const editando = editStockId === p.id;
          return (
            <div key={p.id} className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: i < productos.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>{p.nombre}</p>
                <p className="text-xs" style={{ color: '#6b7280' }}>{p.formato}</p>
              </div>
              {editando ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <input type="number" value={editStockVal} autoFocus
                    onChange={(e) => setEditStockVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') guardarStock(p.id); }}
                    className="w-20 rounded-lg px-2 py-1.5 text-sm text-right border"
                    style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
                  <button onClick={() => guardarStock(p.id)} disabled={savingStock}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold disabled:opacity-40"
                    style={{ backgroundColor: '#4caf50' }}>✓</button>
                  <button onClick={() => setEditStockId(null)}
                    className="w-9 h-9 rounded-lg flex items-center justify-center border"
                    style={{ borderColor: '#2a2a2a', color: '#6b7280' }}>✕</button>
                </div>
              ) : (
                <button onClick={() => { setEditStockId(p.id); setEditStockVal(String(p.stock)); }}
                  className="text-right flex-shrink-0 px-2 py-1 rounded-lg transition-colors hover:brightness-125">
                  <p className="text-xl font-extrabold" style={{ color }}>{p.stock} <span className="text-xs">✏️</span></p>
                  <p className="text-xs" style={{ color: '#6b7280' }}>uds</p>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Muestras */}
      <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#ff9800' + '40', borderLeftWidth: 4, borderLeftColor: '#ff9800' }}>
        <div className="flex justify-between items-center mb-3">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>🎁 Muestras Entregadas</p>
          <span className="text-2xl font-extrabold" style={{ color: '#ff9800' }}>{stats?.totalMuestras ?? 0}</span>
        </div>
        {(stats?.muestrasPorProducto ?? []).map((m) => (
          <div key={m.nombre} className="flex justify-between items-center py-1">
            <span className="text-sm" style={{ color: '#9ca3af' }}>{m.nombre}</span>
            <span className="text-sm font-bold" style={{ color: '#ff9800' }}>{m.cantidad} paq.</span>
          </div>
        ))}
      </div>
    </div>
  );
}
