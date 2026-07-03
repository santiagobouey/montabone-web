'use client';

import { useEffect, useState } from 'react';
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

interface Stats {
  // Mes
  ventasMes: number;
  ventasDetalleMes: number;
  utilidadMes: number;
  pedidosMes: number;
  ticketPromedio: number;
  productoMasVendido: string;
  // General
  clientesRegistrados: number;
  puntosActivos: number;
  puntosInactivos: number;
  puntosVenta: PuntoVenta[];
  // Alertas
  pedidosPendientes: number;
  totalPorCobrar: number;
  stockBajo: Producto[];
  prospectosParaInsistir: { id: string; nombre_local: string; nombre_contacto: string }[];
  // Muestras
  totalMuestras: number;
  muestrasPorProducto: { nombre: string; cantidad: number }[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [verPuntos, setVerPuntos] = useState(false);

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
        ] = await Promise.all([
          supabase.from('pedidos').select('total, detalle:detalle_pedido(cantidad, precio_unitario, producto:productos(nombre, costo))').eq('estado', 'pagado').gte('fecha', inicioMes).lte('fecha', finMes),
          supabase.from('ventas_detalle').select('total, items:items_venta_detalle(cantidad, precio_unitario, producto:productos(nombre, costo))').eq('estado', 'pagado').gte('fecha', inicioMes).lte('fecha', finMes),
          supabase.from('ventas_evento').select('total, cantidad, precio_unitario, producto:productos(nombre, costo), evento:eventos(fecha)').gte('eventos.fecha', inicioMes).lte('eventos.fecha', finMes),
          supabase.from('clientes').select('id, nombre, tipo, activo_manual'),
          supabase.from('productos').select('*').order('nombre'),
          supabase.from('muestras').select('cantidad, producto:productos(nombre)'),
          supabase.from('pedidos').select('id').in('estado', ['pendiente', 'preparado']),
          supabase.from('pedidos').select('total').in('estado', ['pendiente', 'preparado', 'entregado']),
          supabase.from('prospectos').select('id, nombre_local, nombre_contacto, proxima_visita').in('estado', ['potencial', 'contactado', 'pendiente']),
          supabase.from('pedidos').select('cliente_id, fecha').order('fecha', { ascending: false }),
          supabase.from('costos_factura').select('monto').gte('created_at', inicioMes).lte('created_at', finMes + 'T23:59:59'),
          supabase.from('ventas_detalle').select('id, total').in('estado', ['pendiente', 'preparado']),
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
          pedidosMes: pedidosMes.length,
          ticketPromedio,
          productoMasVendido,
          clientesRegistrados: clientes.length,
          puntosActivos: puntosVenta.filter((p) => p.activo).length,
          puntosInactivos: puntosVenta.filter((p) => !p.activo).length,
          puntosVenta,
          pedidosPendientes: (pedidosPendientesRes.data?.length || 0) + (detallePendienteRes.data?.length || 0),
          totalPorCobrar: (cobroRes.data || []).reduce((s, p) => s + p.total, 0) + (detallePendienteRes.data || []).reduce((s, v) => s + v.total, 0),
          stockBajo: prods.filter((p) => p.stock <= 10),
          prospectosParaInsistir: (prospectoRes.data || []).filter((p: any) => p.proxima_visita && p.proxima_visita <= hoyStr),
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

      {/* Utilidad del mes destacada */}
      {(() => {
        const util = stats?.utilidadMes ?? 0;
        const ventas = stats?.ventasMes ?? 0;
        const margen = ventas > 0 ? Math.round((util / ventas) * 100) : 0;
        const color = util > 0 ? '#4caf50' : util < 0 ? '#e53935' : '#6b7280';
        return (
          <div className="rounded-xl border p-5 mb-4" style={{ backgroundColor: '#141414', borderColor: color + '60', borderLeftWidth: 4, borderLeftColor: color }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>💰 Utilidad de {MESES[new Date().getMonth()]}</p>
            <p className="text-4xl font-extrabold" style={{ color }}>{fmt(util)}</p>
            <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
              Ventas {fmt(ventas)} · Margen <span style={{ color }}>{margen}%</span>
            </p>
          </div>
        );
      })()}

      {/* Estadísticas del mes */}
      <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: '#6b7280' }}>📊 {MESES[new Date().getMonth()]} {new Date().getFullYear()}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg p-3" style={{ backgroundColor: '#1c1c1c' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>📈 Ventas del mes</p>
            <p className="text-xl font-extrabold" style={{ color: '#4caf50' }}>{fmt(stats?.ventasMes ?? 0)}</p>
          </div>
          <div className="rounded-lg p-3" style={{ backgroundColor: '#1c1c1c' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>💰 Utilidad del mes</p>
            <p className="text-xl font-extrabold" style={{ color: (stats?.utilidadMes ?? 0) < 0 ? '#e53935' : '#2196f3' }}>{fmt(stats?.utilidadMes ?? 0)}</p>
          </div>
          <div className="rounded-lg p-3" style={{ backgroundColor: '#1c1c1c' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>🛒 Ventas al detalle</p>
            <p className="text-xl font-extrabold" style={{ color: '#9c27b0' }}>{fmt(stats?.ventasDetalleMes ?? 0)}</p>
          </div>
          <div className="rounded-lg p-3" style={{ backgroundColor: '#1c1c1c' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>📦 Pedidos del mes</p>
            <p className="text-xl font-extrabold" style={{ color: '#e53935' }}>{stats?.pedidosMes ?? 0}</p>
          </div>
          <div className="rounded-lg p-3" style={{ backgroundColor: '#1c1c1c' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>📊 Ticket promedio</p>
            <p className="text-xl font-extrabold" style={{ color: '#ff9800' }}>{fmt(stats?.ticketPromedio ?? 0)}</p>
          </div>
          <div className="rounded-lg p-3" style={{ backgroundColor: '#1c1c1c' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>👥 Clientes registrados</p>
            <p className="text-xl font-extrabold" style={{ color: '#9c27b0' }}>{stats?.clientesRegistrados ?? 0}</p>
          </div>
          <div className="rounded-lg p-3" style={{ backgroundColor: '#1c1c1c' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>🏆 Más vendido</p>
            <p className="text-sm font-extrabold leading-tight" style={{ color: '#f5f5f5' }}>{stats?.productoMasVendido ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Alertas rápidas */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl p-4 border" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>Pendientes</p>
          <p className="text-2xl font-extrabold" style={{ color: '#ff9800' }}>{stats?.pedidosPendientes ?? 0}</p>
        </div>
        <div className="rounded-xl p-4 border" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>Por Cobrar</p>
          <p className="text-2xl font-extrabold" style={{ color: '#e53935' }}>{fmt(stats?.totalPorCobrar ?? 0)}</p>
        </div>
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

      {/* Stock actual */}
      <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>📦 Stock Actual</p>
        </div>
        {productos.map((p, i) => {
          const color = p.stock === 0 ? '#e53935' : p.stock <= 10 ? '#ff9800' : '#4caf50';
          return (
            <div key={p.id} className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: i < productos.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>{p.nombre}</p>
                <p className="text-xs" style={{ color: '#6b7280' }}>{p.formato}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-extrabold" style={{ color }}>{p.stock}</p>
                <p className="text-xs" style={{ color: '#6b7280' }}>uds</p>
              </div>
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
