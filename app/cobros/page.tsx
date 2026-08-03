'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Pedido } from '@/types';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

const ESTADO_COLORS: Record<string, string> = {
  pendiente: '#ff9800', preparado: '#2196f3', entregado: '#4caf50', pagado: '#6b7280',
};

interface VentaDetalle {
  id: string;
  fecha: string;
  total: number;
  estado: string;
  vendedor: string | null;
  nombre_comprador: string | null;
  observaciones: string | null;
  items: { nombre: string; cantidad: number; precio_unitario: number }[];
}

function mapVentas(data: unknown[]): VentaDetalle[] {
  return (data as Array<{
    id: string; fecha: string; total: number; estado: string; vendedor: string | null;
    nombre_comprador: string | null; observaciones: string | null;
    items: Array<{ cantidad: number; precio_unitario: number; producto: { nombre: string } | null }>;
  }>).map((v) => ({
    id: v.id, fecha: v.fecha, total: v.total, estado: v.estado,
    vendedor: v.vendedor, nombre_comprador: v.nombre_comprador, observaciones: v.observaciones,
    items: (v.items || []).map((i) => ({
      nombre: i.producto?.nombre ?? '—',
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
    })),
  }));
}

export default function CobrosPage() {
  const [tab, setTab] = useState<'cobrar' | 'pagado'>('cobrar');

  // Por cobrar
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [ventasDetalle, setVentasDetalle] = useState<VentaDetalle[]>([]);

  // Pagados
  const [pedidosPagados, setPedidosPagados] = useState<Pedido[]>([]);
  const [ventasDetallePagadas, setVentasDetallePagadas] = useState<VentaDetalle[]>([]);

  const [loading, setLoading] = useState(true);
  const [confirmandoPedido, setConfirmandoPedido] = useState<string | null>(null);
  const [confirmandoDetalle, setConfirmandoDetalle] = useState<string | null>(null);

  const fetchCobros = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('pedidos')
        .select('*, cliente:clientes(nombre), detalle:detalle_pedido(*, producto:productos(nombre))')
        .eq('estado', 'entregado')
        .order('fecha', { ascending: false });
      setPedidos(data || []);
    } catch {}
  }, []);

  const fetchPagados = useCallback(async () => {
    try {
      const [pRes, vRes] = await Promise.all([
        supabase
          .from('pedidos')
          .select('*, cliente:clientes(nombre), detalle:detalle_pedido(*, producto:productos(nombre))')
          .eq('estado', 'pagado')
          .order('fecha', { ascending: false })
          .limit(50),
        supabase
          .from('ventas_detalle')
          .select('id, fecha, total, estado, vendedor, nombre_comprador, observaciones, items:items_venta_detalle(cantidad, precio_unitario, producto:productos(nombre))')
          .eq('estado', 'pagado')
          .order('fecha', { ascending: false })
          .limit(50),
      ]);
      setPedidosPagados(pRes.data || []);
      if (vRes.data) setVentasDetallePagadas(mapVentas(vRes.data));
    } catch {}
  }, []);

  const fetchVentasDetalle = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('ventas_detalle')
        .select('id, fecha, total, estado, vendedor, nombre_comprador, observaciones, items:items_venta_detalle(cantidad, precio_unitario, producto:productos(nombre))')
        .eq('estado', 'entregado')
        .order('fecha', { ascending: false });
      if (data) setVentasDetalle(mapVentas(data));
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([fetchCobros(), fetchVentasDetalle(), fetchPagados()]).finally(() => setLoading(false));
  }, [fetchCobros, fetchVentasDetalle, fetchPagados]);

  async function enviarEmailPagado(cliente: string, vendedor: string, fecha: string, total: number) {
    try {
      await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'pedido_pagado', pedido: { cliente, vendedor, fecha, total } }),
      });
    } catch {}
  }

  async function marcarPagado(id: string) {
    await supabase.from('pedidos').update({ estado: 'pagado' }).eq('id', id);
    setConfirmandoPedido(null);
    const p = pedidos.find((x) => x.id === id);
    if (p) await enviarEmailPagado(p.cliente?.nombre ?? '—', p.vendedor, p.fecha, p.total);
    await Promise.all([fetchCobros(), fetchPagados()]);
  }

  async function marcarPagadoDetalle(id: string) {
    await supabase.from('ventas_detalle').update({ estado: 'pagado' }).eq('id', id);
    setConfirmandoDetalle(null);
    await Promise.all([fetchVentasDetalle(), fetchPagados()]);
  }

  const totalPedidos = pedidos.reduce((s, p) => s + p.total, 0);
  const totalDetalle = ventasDetalle.reduce((s, v) => s + v.total, 0);
  const totalGeneral = totalPedidos + totalDetalle;

  const totalPagadosPedidos = pedidosPagados.reduce((s, p) => s + p.total, 0);
  const totalPagadosDetalle = ventasDetallePagadas.reduce((s, v) => s + v.total, 0);
  const totalPagadoGeneral = totalPagadosPedidos + totalPagadosDetalle;

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Cobros</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('cobrar')}
          className="flex-1 py-2.5 rounded-lg border text-sm font-bold"
          style={{
            backgroundColor: tab === 'cobrar' ? '#e53935' : 'transparent',
            borderColor: tab === 'cobrar' ? '#e53935' : '#2a2a2a',
            color: tab === 'cobrar' ? 'white' : '#6b7280',
          }}>
          💰 Por Cobrar {pedidos.length + ventasDetalle.length > 0 ? `(${pedidos.length + ventasDetalle.length})` : ''}
        </button>
        <button onClick={() => setTab('pagado')}
          className="flex-1 py-2.5 rounded-lg border text-sm font-bold"
          style={{
            backgroundColor: tab === 'pagado' ? '#4caf50' : 'transparent',
            borderColor: tab === 'pagado' ? '#4caf50' : '#2a2a2a',
            color: tab === 'pagado' ? 'white' : '#6b7280',
          }}>
          ✅ Pagado {pedidosPagados.length + ventasDetallePagadas.length > 0 ? `(${pedidosPagados.length + ventasDetallePagadas.length})` : ''}
        </button>
      </div>

      {/* ===== TAB POR COBRAR ===== */}
      {tab === 'cobrar' && (
        <>
          <div className="rounded-xl border p-4 mb-4 flex justify-between items-center" style={{ backgroundColor: '#141414', borderColor: '#e53935' + '40', borderLeftWidth: 4, borderLeftColor: '#e53935' }}>
            <div>
              <p className="text-xs font-bold uppercase" style={{ color: '#6b7280' }}>Total por cobrar</p>
              <p className="text-3xl font-extrabold" style={{ color: '#f5f5f5' }}>{fmt(totalGeneral)}</p>
              <div className="flex gap-3 mt-1">
                <p className="text-xs" style={{ color: '#6b7280' }}>👥 Clientes: {fmt(totalPedidos)}</p>
                <p className="text-xs" style={{ color: '#9c27b0' }}>🛒 Detalle: {fmt(totalDetalle)}</p>
              </div>
            </div>
            <span className="text-4xl">💰</span>
          </div>

          <p className="text-xs mb-3 p-2 rounded-lg" style={{ backgroundColor: '#4caf5015', color: '#6b7280' }}>
            Aquí aparecen las ventas <span style={{ color: '#4caf50', fontWeight: 700 }}>entregadas</span> que aún no te han pagado.
          </p>

          {pedidos.length === 0 && ventasDetalle.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">✅</p>
              <p className="font-bold" style={{ color: '#f5f5f5' }}>¡Todo cobrado!</p>
              <p className="text-sm" style={{ color: '#6b7280' }}>No hay ventas entregadas sin pagar</p>
            </div>
          ) : (
            <div className="space-y-5">
              {pedidos.length > 0 && (
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#e53935' }}>👥 Clientes ({pedidos.length}) · {fmt(totalPedidos)}</p>
              )}
              <div className="space-y-3">
              {pedidos.map((p) => {
                const color = ESTADO_COLORS[p.estado] || '#6b7280';
                const neto = Math.round(p.total / 1.19);
                return (
                  <div key={p.id} className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-bold" style={{ color: '#f5f5f5' }}>{p.cliente?.nombre ?? '—'}</p>
                        <p className="text-xs" style={{ color: '#6b7280' }}>📦 Pedido · {new Date(p.fecha + 'T12:00:00').toLocaleDateString('es-CL')} · {p.vendedor}</p>
                      </div>
                      <span className="text-xs font-bold px-2 py-1 rounded-full border" style={{ color, backgroundColor: color + '20', borderColor: color + '40' }}>
                        {p.estado.toUpperCase()}
                      </span>
                    </div>
                    {(p.detalle || []).map((d) => (
                      <div key={d.id} className="flex justify-between text-sm py-1 border-b" style={{ borderColor: '#2a2a2a' }}>
                        <span style={{ color: '#9ca3af' }}>{d.producto?.nombre ?? '—'}</span>
                        <span style={{ color: '#f5f5f5' }}>{d.cantidad} u. · {fmt(d.precio_unitario * d.cantidad)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center mt-3">
                      <div>
                        <p className="text-xs" style={{ color: '#6b7280' }}>Neto {fmt(neto)} · IVA {fmt(p.total - neto)}</p>
                        <p className="font-extrabold text-lg" style={{ color: '#f5f5f5' }}>{fmt(p.total)}</p>
                      </div>
                      {confirmandoPedido === p.id ? (
                        <div className="flex gap-2">
                          <button onClick={() => setConfirmandoPedido(null)} className="px-3 py-2 rounded-lg text-sm border font-semibold" style={{ borderColor: '#2a2a2a', color: '#6b7280' }}>Cancelar</button>
                          <button onClick={() => marcarPagado(p.id)} className="px-4 py-2 rounded-lg font-bold text-white text-sm" style={{ backgroundColor: '#4caf50' }}>✓ Confirmar</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmandoPedido(p.id)} className="px-4 py-2 rounded-lg font-bold text-white text-sm" style={{ backgroundColor: '#4caf50' }}>✓ Pagado</button>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>

              {ventasDetalle.length > 0 && (
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#9c27b0' }}>🛒 Al detalle ({ventasDetalle.length}) · {fmt(totalDetalle)}</p>
              )}
              <div className="space-y-3">
              {ventasDetalle.map((v) => {
                const color = ESTADO_COLORS[v.estado] || '#6b7280';
                return (
                  <div key={v.id} className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#9c27b0' + '30' }}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-bold" style={{ color: '#f5f5f5' }}>{v.nombre_comprador || 'Cliente al detalle'}</p>
                        <p className="text-xs" style={{ color: '#6b7280' }}>🛒 Detalle · {new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-CL')}{v.vendedor ? ` · ${v.vendedor}` : ''}</p>
                      </div>
                      <span className="text-xs font-bold px-2 py-1 rounded-full border" style={{ color, backgroundColor: color + '20', borderColor: color + '40' }}>
                        {v.estado.toUpperCase()}
                      </span>
                    </div>
                    {v.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm py-1 border-b" style={{ borderColor: '#2a2a2a' }}>
                        <span style={{ color: '#9ca3af' }}>{item.nombre}</span>
                        <span style={{ color: '#f5f5f5' }}>{item.cantidad} u. · {fmt(item.precio_unitario * item.cantidad)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center mt-3">
                      <p className="font-extrabold text-lg" style={{ color: '#f5f5f5' }}>{fmt(v.total)}</p>
                      {confirmandoDetalle === v.id ? (
                        <div className="flex gap-2">
                          <button onClick={() => setConfirmandoDetalle(null)} className="px-3 py-2 rounded-lg text-sm border font-semibold" style={{ borderColor: '#2a2a2a', color: '#6b7280' }}>Cancelar</button>
                          <button onClick={() => marcarPagadoDetalle(v.id)} className="px-4 py-2 rounded-lg font-bold text-white text-sm" style={{ backgroundColor: '#4caf50' }}>✓ Confirmar</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmandoDetalle(v.id)} className="px-4 py-2 rounded-lg font-bold text-white text-sm" style={{ backgroundColor: '#4caf50' }}>✓ Pagado</button>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== TAB PAGADO ===== */}
      {tab === 'pagado' && (
        <>
          <div className="rounded-xl border p-4 mb-4 flex justify-between items-center" style={{ backgroundColor: '#141414', borderColor: '#4caf50' + '40', borderLeftWidth: 4, borderLeftColor: '#4caf50' }}>
            <div>
              <p className="text-xs font-bold uppercase" style={{ color: '#6b7280' }}>Total cobrado</p>
              <p className="text-3xl font-extrabold" style={{ color: '#f5f5f5' }}>{fmt(totalPagadoGeneral)}</p>
              <div className="flex gap-3 mt-1">
                {totalPagadosPedidos > 0 && <p className="text-xs" style={{ color: '#6b7280' }}>Pedidos: {fmt(totalPagadosPedidos)}</p>}
                {totalPagadosDetalle > 0 && <p className="text-xs" style={{ color: '#9c27b0' }}>Detalle: {fmt(totalPagadosDetalle)}</p>}
              </div>
            </div>
            <span className="text-4xl">✅</span>
          </div>

          {pedidosPagados.length === 0 && ventasDetallePagadas.length === 0 ? (
            <div className="text-center py-16">
              <p style={{ color: '#6b7280' }}>No hay registros pagados</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pedidosPagados.map((p) => (
                <div key={p.id} className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-bold" style={{ color: '#f5f5f5' }}>{p.cliente?.nombre ?? '—'}</p>
                      <p className="text-xs" style={{ color: '#6b7280' }}>📦 Pedido · {new Date(p.fecha + 'T12:00:00').toLocaleDateString('es-CL')} · {p.vendedor}</p>
                    </div>
                    <span className="text-xs font-bold px-2 py-1 rounded-full border" style={{ color: '#4caf50', backgroundColor: '#4caf50' + '20', borderColor: '#4caf50' + '40' }}>
                      PAGADO
                    </span>
                  </div>
                  {(p.detalle || []).map((d) => (
                    <div key={d.id} className="flex justify-between text-sm py-1 border-b" style={{ borderColor: '#2a2a2a' }}>
                      <span style={{ color: '#9ca3af' }}>{d.producto?.nombre ?? '—'}</span>
                      <span style={{ color: '#f5f5f5' }}>{d.cantidad} u. · {fmt(d.precio_unitario * d.cantidad)}</span>
                    </div>
                  ))}
                  <p className="font-extrabold text-lg mt-3" style={{ color: '#4caf50' }}>{fmt(p.total)}</p>
                </div>
              ))}

              {ventasDetallePagadas.map((v) => (
                <div key={v.id} className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#9c27b0' + '30' }}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-bold" style={{ color: '#f5f5f5' }}>{v.nombre_comprador || 'Cliente al detalle'}</p>
                      <p className="text-xs" style={{ color: '#6b7280' }}>🛒 Detalle · {new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-CL')}{v.vendedor ? ` · ${v.vendedor}` : ''}</p>
                    </div>
                    <span className="text-xs font-bold px-2 py-1 rounded-full border" style={{ color: '#4caf50', backgroundColor: '#4caf50' + '20', borderColor: '#4caf50' + '40' }}>
                      PAGADO
                    </span>
                  </div>
                  {v.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm py-1 border-b" style={{ borderColor: '#2a2a2a' }}>
                      <span style={{ color: '#9ca3af' }}>{item.nombre}</span>
                      <span style={{ color: '#f5f5f5' }}>{item.cantidad} u. · {fmt(item.precio_unitario * item.cantidad)}</span>
                    </div>
                  ))}
                  <p className="font-extrabold text-lg mt-3" style={{ color: '#4caf50' }}>{fmt(v.total)}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
