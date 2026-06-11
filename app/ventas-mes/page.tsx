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

export default function VentasMesPage() {
  const [resumen, setResumen] = useState<ResumenMes | null>(null);
  const [loading, setLoading] = useState(true);

  const hoy = new Date();
  const mes = hoy.getMonth();
  const anio = hoy.getFullYear();
  const inicioMes = `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
  const finMes = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(new Date(anio, mes + 1, 0).getDate()).padStart(2, '0')}`;

  useEffect(() => {
    async function load() {
      try {
        const [pedidosRes, detalleRes, eventosRes] = await Promise.all([
          supabase
            .from('pedidos')
            .select('total')
            .eq('estado', 'pagado')
            .gte('fecha', inicioMes)
            .lte('fecha', finMes),
          supabase
            .from('ventas_detalle')
            .select('total')
            .eq('estado', 'pagado')
            .gte('fecha', inicioMes)
            .lte('fecha', finMes),
          supabase
            .from('ventas_evento')
            .select('total, evento:eventos(fecha)')
            .gte('eventos.fecha', inicioMes)
            .lte('eventos.fecha', finMes),
        ]);

        const pedidos = pedidosRes.data || [];
        const detalle = detalleRes.data || [];
        const eventos = (eventosRes.data || []).filter((v: any) => v.evento);

        setResumen({
          pedidos: pedidos.length,
          totalPedidos: pedidos.reduce((s, p) => s + p.total, 0),
          detalle: detalle.length,
          totalDetalle: detalle.reduce((s, v) => s + v.total, 0),
          eventos: eventos.length,
          totalEventos: eventos.reduce((s: number, v: any) => s + v.total, 0),
        });
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, [inicioMes, finMes]);

  const totalGeneral = (resumen?.totalPedidos ?? 0) + (resumen?.totalDetalle ?? 0) + (resumen?.totalEventos ?? 0);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Venta Mensual</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>{MESES[mes]} {anio}</p>
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

      {/* Desglose */}
      <div className="space-y-3">

        {/* Pedidos */}
        <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span>📦</span>
              <p className="font-bold" style={{ color: '#f5f5f5' }}>Pedidos</p>
            </div>
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
            <div className="flex items-center gap-2">
              <span>🛒</span>
              <p className="font-bold" style={{ color: '#f5f5f5' }}>Venta al Detalle</p>
            </div>
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
            <div className="flex items-center gap-2">
              <span>🎪</span>
              <p className="font-bold" style={{ color: '#f5f5f5' }}>Eventos</p>
            </div>
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

      {totalGeneral === 0 && (
        <div className="text-center py-10 mt-4">
          <p className="text-3xl mb-2">📭</p>
          <p style={{ color: '#6b7280' }}>Sin ventas pagadas este mes todavía</p>
        </div>
      )}
    </div>
  );
}
