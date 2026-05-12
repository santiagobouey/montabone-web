'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Pedido } from '@/types';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

const ESTADO_COLORS: Record<string, string> = {
  pendiente: '#ff9800', preparado: '#2196f3', entregado: '#4caf50',
};

export default function CobrosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCobros = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('pedidos')
        .select('*, cliente:clientes(nombre), detalle:detalle_pedido(*, producto:productos(nombre))')
        .in('estado', ['pendiente', 'preparado', 'entregado'])
        .order('fecha', { ascending: false });
      setPedidos(data || []);
    } catch {}
  }, []);

  useEffect(() => { fetchCobros().finally(() => setLoading(false)); }, [fetchCobros]);

  async function marcarPagado(id: string) {
    if (!confirm('¿Marcar este pedido como pagado?')) return;
    await supabase.from('pedidos').update({ estado: 'pagado' }).eq('id', id);
    await fetchCobros();
  }

  const total = pedidos.reduce((s, p) => s + p.total, 0);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Cuentas por Cobrar</h1>
        <p className="text-sm" style={{ color: '#6b7280' }}>{pedidos.length} pedidos pendientes</p>
      </div>

      <div className="rounded-xl border p-4 mb-6 flex justify-between items-center" style={{ backgroundColor: '#141414', borderColor: '#e53935' + '40', borderLeftWidth: 4, borderLeftColor: '#e53935' }}>
        <div>
          <p className="text-xs font-bold uppercase" style={{ color: '#6b7280' }}>Total por cobrar</p>
          <p className="text-3xl font-extrabold" style={{ color: '#f5f5f5' }}>{fmt(total)}</p>
          <p className="text-xs" style={{ color: '#6b7280' }}>Neto: {fmt(Math.round(total / 1.19))}</p>
        </div>
        <span className="text-4xl">💰</span>
      </div>

      {pedidos.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">✅</p>
          <p className="font-bold" style={{ color: '#f5f5f5' }}>¡Todo cobrado!</p>
          <p className="text-sm" style={{ color: '#6b7280' }}>No hay cuentas pendientes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pedidos.map((p) => {
            const color = ESTADO_COLORS[p.estado] || '#6b7280';
            const neto = Math.round(p.total / 1.19);
            return (
              <div key={p.id} className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-bold" style={{ color: '#f5f5f5' }}>{p.cliente?.nombre ?? '—'}</p>
                    <p className="text-xs" style={{ color: '#6b7280' }}>
                      {new Date(p.fecha + 'T12:00:00').toLocaleDateString('es-CL')} · {p.vendedor}
                    </p>
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
                  <button onClick={() => marcarPagado(p.id)} className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-white text-sm" style={{ backgroundColor: '#4caf50' }}>
                    ✓ Pagado
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
