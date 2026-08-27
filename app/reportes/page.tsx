'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

interface ReporteData {
  ventasTotales: number;
  pedidosTotales: number;
  ventasPagadas: number;
  comisiones: Record<string, number>;
  ventasPorProducto: { nombre: string; cantidad: number; total: number }[];
}

export default function ReportesPage() {
  const [data, setData] = useState<ReporteData | null>(null);
  const [loading, setLoading] = useState(true);
  const hoyDate = new Date();
  const [mesFiltro, setMesFiltro] = useState(hoyDate.getMonth());
  const [anioFiltro, setAnioFiltro] = useState(hoyDate.getFullYear());
  const [showSelectorMes, setShowSelectorMes] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const inicio = `${anioFiltro}-${String(mesFiltro + 1).padStart(2, '0')}-01`;
        const ultimoDia = new Date(anioFiltro, mesFiltro + 1, 0).getDate();
        const fin = `${anioFiltro}-${String(mesFiltro + 1).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
        const [{ data: pedidos }, { data: detalles }] = await Promise.all([
          supabase
            .from('pedidos')
            .select('*, detalle:detalle_pedido(cantidad, precio_unitario, producto:productos(nombre))')
            .gte('fecha', inicio).lte('fecha', fin),
          supabase
            .from('ventas_detalle')
            .select('total, vendedor, nombre_comprador')
            .gte('fecha', inicio).lte('fecha', fin),
        ]);

        const lista = pedidos || [];
        const pagados = lista.filter((p) => p.estado === 'pagado');
        const comisiones: Record<string, number> = {};
        const porProducto: Record<string, { cantidad: number; total: number }> = {};

        for (const p of lista) {
          comisiones[p.vendedor] = (comisiones[p.vendedor] || 0) + Math.round(p.total * 0.05);
          for (const d of (p.detalle || [])) {
            const nombre = d.producto?.nombre ?? 'Desconocido';
            if (!porProducto[nombre]) porProducto[nombre] = { cantidad: 0, total: 0 };
            porProducto[nombre].cantidad += d.cantidad;
            porProducto[nombre].total += d.precio_unitario * d.cantidad;
          }
        }

        // Comisiones de ventas al detalle (5% al vendedor de la venta),
        // excepto cuando la compra es de Santiago Bouey o Hernán Torres.
        const norm = (s: string | null) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").trim();
        const COMPRADORES_EXCLUIDOS = ['santiago bouey', 'hernan torres'];
        for (const v of (detalles || []) as { total: number; vendedor: string | null; nombre_comprador: string | null }[]) {
          if (!v.vendedor) continue;
          if (COMPRADORES_EXCLUIDOS.includes(norm(v.nombre_comprador))) continue;
          comisiones[v.vendedor] = (comisiones[v.vendedor] || 0) + Math.round(v.total * 0.05);
        }

        setData({
          ventasTotales: lista.reduce((s, p) => s + p.total, 0),
          pedidosTotales: lista.length,
          ventasPagadas: pagados.reduce((s, p) => s + p.total, 0),
          comisiones,
          ventasPorProducto: Object.entries(porProducto).map(([nombre, v]) => ({ nombre, ...v })).sort((a, b) => b.total - a.total),
        });
      } catch {}
      setLoading(false);
    }
    load();
  }, [mesFiltro, anioFiltro]);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Reportes</h1>
      </div>

      {/* Selector de mes */}
      <button onClick={() => setShowSelectorMes(!showSelectorMes)}
        className="w-full flex items-center justify-between rounded-xl border px-4 py-3 mb-4"
        style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <p className="font-bold" style={{ color: '#f5f5f5' }}>📅 {MESES[mesFiltro]} {anioFiltro}</p>
        <span style={{ color: '#6b7280' }}>{showSelectorMes ? '▲' : '▼'}</span>
      </button>
      {showSelectorMes && (
        <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setAnioFiltro(anioFiltro - 1)} className="w-8 h-8 rounded-lg border" style={{ borderColor: '#2a2a2a', color: '#f5f5f5' }}>‹</button>
            <p className="font-bold" style={{ color: '#f5f5f5' }}>{anioFiltro}</p>
            <button onClick={() => setAnioFiltro(anioFiltro + 1)} disabled={anioFiltro >= hoyDate.getFullYear()}
              className="w-8 h-8 rounded-lg border disabled:opacity-30" style={{ borderColor: '#2a2a2a', color: '#f5f5f5' }}>›</button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {MESES.map((m, i) => {
              const esFuturo = anioFiltro === hoyDate.getFullYear() && i > hoyDate.getMonth();
              return (
                <button key={m} onClick={() => { if (!esFuturo) { setMesFiltro(i); setShowSelectorMes(false); } }} disabled={esFuturo}
                  className="py-2 rounded-lg text-xs font-semibold border disabled:opacity-30"
                  style={{
                    borderColor: mesFiltro === i ? '#e53935' : '#2a2a2a',
                    backgroundColor: mesFiltro === i ? '#e5393520' : 'transparent',
                    color: mesFiltro === i ? '#e53935' : '#9ca3af',
                  }}>
                  {m.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          { label: 'Ventas del mes', value: fmt(data?.ventasTotales ?? 0), color: '#f5f5f5' },
          { label: 'Pedidos', value: data?.pedidosTotales ?? 0, color: '#2196f3' },
          { label: 'Cobrado', value: fmt(data?.ventasPagadas ?? 0), color: '#4caf50' },
          { label: 'Neto', value: fmt(Math.round((data?.ventasTotales ?? 0) / 1.19)), color: '#ff9800' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>{s.label}</p>
            <p className="text-2xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Comisiones */}
      <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <p className="text-xs font-bold uppercase mb-3" style={{ color: '#6b7280' }}>💵 Comisiones (5%)</p>
        {Object.entries(data?.comisiones ?? {}).map(([vendedor, monto]) => (
          <div key={vendedor} className="flex justify-between items-center py-2 border-b" style={{ borderColor: '#2a2a2a' }}>
            <span style={{ color: '#f5f5f5' }}>{vendedor}</span>
            <span className="font-bold" style={{ color: '#ff9800' }}>{fmt(monto)}</span>
          </div>
        ))}
        {Object.keys(data?.comisiones ?? {}).length === 0 && <p className="text-sm" style={{ color: '#6b7280' }}>Sin datos</p>}
      </div>

      {/* Ventas por producto */}
      <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
          <p className="text-xs font-bold uppercase" style={{ color: '#6b7280' }}>📦 Ventas por Producto</p>
        </div>
        {(data?.ventasPorProducto ?? []).map((p, i) => (
          <div key={p.nombre} className="flex justify-between items-center px-4 py-3" style={{ borderBottom: i < (data?.ventasPorProducto.length ?? 0) - 1 ? '1px solid #2a2a2a' : 'none' }}>
            <div>
              <p className="font-semibold text-sm" style={{ color: '#f5f5f5' }}>{p.nombre}</p>
              <p className="text-xs" style={{ color: '#6b7280' }}>{p.cantidad} unidades</p>
            </div>
            <p className="font-bold" style={{ color: '#4caf50' }}>{fmt(p.total)}</p>
          </div>
        ))}
        {(data?.ventasPorProducto.length ?? 0) === 0 && <p className="p-4 text-sm" style={{ color: '#6b7280' }}>Sin ventas este mes</p>}
      </div>
    </div>
  );
}
