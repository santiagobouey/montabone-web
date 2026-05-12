'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Producto } from '@/types';

const DIAS_ACTIVO = 60;

interface PuntoVenta {
  id: string;
  nombre: string;
  tipo: string;
  ultimaCompra: string | null;
  activo: boolean;
}

interface Stats {
  pedidosPendientes: number;
  ventasHoy: number;
  totalPorCobrar: number;
  prospectosPorContactar: number;
  stockBajo: Producto[];
  stockTotal: number;
  totalMuestras: number;
  muestrasPorProducto: { nombre: string; cantidad: number }[];
  puntosActivos: number;
  puntosInactivos: number;
  puntosVenta: PuntoVenta[];
}

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [verPuntos, setVerPuntos] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const hoy = new Date().toISOString().split('T')[0];
        const hace60 = new Date(Date.now() - DIAS_ACTIVO * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const [pedidosRes, ventasRes, cobroRes, prospectoRes, productosRes, muestrasRes, clientesRes, pedidosPorClienteRes] = await Promise.all([
          supabase.from('pedidos').select('id').in('estado', ['pendiente', 'preparado']),
          supabase.from('pedidos').select('total').eq('fecha', hoy).eq('estado', 'pagado'),
          supabase.from('pedidos').select('total').in('estado', ['pendiente', 'preparado', 'entregado']),
          supabase.from('prospectos').select('id').in('estado', ['potencial', 'contactado']),
          supabase.from('productos').select('*').order('nombre'),
          supabase.from('muestras').select('cantidad, producto:productos(nombre)'),
          supabase.from('clientes').select('id, nombre, tipo'),
          supabase.from('pedidos').select('cliente_id, fecha').order('fecha', { ascending: false }),
        ]);

        const prods = productosRes.data || [];
        const muestrasData = muestrasRes.data || [];
        const clientes = clientesRes.data || [];
        const pedidosCliente = pedidosPorClienteRes.data || [];

        // Última compra por cliente
        const ultimaCompraMap: Record<string, string> = {};
        for (const p of pedidosCliente) {
          if (!ultimaCompraMap[p.cliente_id]) {
            ultimaCompraMap[p.cliente_id] = p.fecha;
          }
        }

        // Calcular puntos de venta
        const puntosVenta: PuntoVenta[] = clientes.map((c) => {
          const ultimaCompra = ultimaCompraMap[c.id] || null;
          const activo = ultimaCompra ? ultimaCompra >= hace60 : false;
          return { id: c.id, nombre: c.nombre, tipo: c.tipo, ultimaCompra, activo };
        });

        const muestrasPorProducto: Record<string, number> = {};
        for (const m of muestrasData) {
          const prod = m.producto as unknown as { nombre: string } | null;
          const nombre = prod?.nombre ?? 'Desconocido';
          muestrasPorProducto[nombre] = (muestrasPorProducto[nombre] || 0) + (m.cantidad || 0);
        }

        setProductos(prods);
        setStats({
          pedidosPendientes: pedidosRes.data?.length || 0,
          ventasHoy: (ventasRes.data || []).reduce((s, p) => s + p.total, 0),
          totalPorCobrar: (cobroRes.data || []).reduce((s, p) => s + p.total, 0),
          prospectosPorContactar: prospectoRes.data?.length || 0,
          stockBajo: prods.filter((p) => p.stock <= 10),
          stockTotal: prods.reduce((s, p) => s + p.stock, 0),
          totalMuestras: muestrasData.reduce((s, m) => s + (m.cantidad || 0), 0),
          muestrasPorProducto: Object.entries(muestrasPorProducto).map(([nombre, cantidad]) => ({ nombre, cantidad })),
          puntosActivos: puntosVenta.filter((p) => p.activo).length,
          puntosInactivos: puntosVenta.filter((p) => !p.activo).length,
          puntosVenta,
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

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Pedidos Pendientes', value: stats?.pedidosPendientes ?? 0, color: '#ff9800' },
          { label: 'Ventas Hoy', value: fmt(stats?.ventasHoy ?? 0), color: '#4caf50' },
          { label: 'Por Cobrar', value: fmt(stats?.totalPorCobrar ?? 0), color: '#e53935' },
          { label: 'Prospectos', value: stats?.prospectosPorContactar ?? 0, color: '#2196f3' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl p-4 border" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>{s.label}</p>
            <p className="text-2xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Puntos de venta */}
      <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <button
          onClick={() => setVerPuntos(!verPuntos)}
          className="w-full px-4 py-3 flex items-center justify-between border-b"
          style={{ borderColor: '#2a2a2a' }}
        >
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
                    {p.ultimaCompra
                      ? `Última compra: ${new Date(p.ultimaCompra + 'T12:00:00').toLocaleDateString('es-CL')}`
                      : 'Sin compras registradas'}
                  </p>
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-full"
                  style={{
                    backgroundColor: p.activo ? '#4caf50' + '20' : '#e53935' + '20',
                    color: p.activo ? '#4caf50' : '#e53935',
                  }}>
                  {p.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

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
