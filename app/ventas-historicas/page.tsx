'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

interface ClienteVenta { nombre: string; rut: string | null; total: number; ops: number; }

export default function VentasHistoricasPage() {
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<ClienteVenta[]>([]);
  const [orden, setOrden] = useState<'total' | 'ops'>('total');

  useEffect(() => {
    async function load() {
      try {
        const [pedRes, mayRes, cliRes] = await Promise.all([
          supabase.from('pedidos').select('cliente_id, total'),
          supabase.from('ventas_mayor').select('cliente_id, cliente_nombre, total'),
          supabase.from('clientes').select('id, nombre, rut'),
        ]);
        const cliMap = new Map((cliRes.data || []).map((c: any) => [c.id, c]));
        const acc: Record<string, ClienteVenta> = {};

        for (const p of (pedRes.data || []) as any[]) {
          const c = p.cliente_id ? cliMap.get(p.cliente_id) : null;
          const key = c ? c.id : 'sin_cliente';
          if (!acc[key]) acc[key] = { nombre: c?.nombre ?? 'Sin cliente', rut: c?.rut ?? null, total: 0, ops: 0 };
          acc[key].total += p.total; acc[key].ops += 1;
        }
        for (const v of (mayRes.data || []) as any[]) {
          const c = v.cliente_id ? cliMap.get(v.cliente_id) : null;
          const key = c ? c.id : (v.cliente_nombre ? `n:${v.cliente_nombre.toLowerCase()}` : 'sin_cliente');
          if (!acc[key]) acc[key] = { nombre: c?.nombre ?? v.cliente_nombre ?? 'Sin cliente', rut: c?.rut ?? null, total: 0, ops: 0 };
          acc[key].total += v.total; acc[key].ops += 1;
        }
        setClientes(Object.values(acc));
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  const ordenados = [...clientes].sort((a, b) => orden === 'total' ? b.total - a.total : b.ops - a.ops);
  const totalGeneral = clientes.reduce((s, c) => s + c.total, 0);
  const maxTotal = Math.max(...clientes.map((c) => c.total), 1);

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Ventas Históricas</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Cuánto le has vendido a cada cliente (todo el historial)</p>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: '#4caf50' }}>
          <p className="text-xs" style={{ color: '#6b7280' }}>💰 Total histórico</p>
          <p className="text-2xl font-extrabold" style={{ color: '#4caf50' }}>{fmt(totalGeneral)}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: '#2196f3' }}>
          <p className="text-xs" style={{ color: '#6b7280' }}>👥 Clientes</p>
          <p className="text-2xl font-extrabold" style={{ color: '#2196f3' }}>{clientes.length}</p>
        </div>
      </div>

      {/* Orden */}
      <div className="flex gap-2 mb-4">
        {([['total', 'Por monto'], ['ops', 'Por cantidad de ventas']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setOrden(k)}
            className="flex-1 py-2 rounded-lg border text-xs font-semibold"
            style={{ backgroundColor: orden === k ? '#e5393520' : 'transparent', borderColor: orden === k ? '#e53935' : '#2a2a2a', color: orden === k ? '#e53935' : '#9ca3af' }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Ranking */}
      {ordenados.length === 0 ? (
        <div className="text-center py-12" style={{ color: '#6b7280' }}>
          <p className="text-3xl mb-2">📜</p>
          <p>No hay ventas registradas</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          {ordenados.map((c, i) => (
            <div key={i} className="px-4 py-3" style={{ borderBottom: i < ordenados.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
              <div className="flex justify-between items-center mb-1">
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>
                    <span style={{ color: i === 0 ? '#ff9800' : '#6b7280' }}>{i + 1}. </span>{c.nombre}
                  </p>
                  <p className="text-xs" style={{ color: '#6b7280' }}>
                    {c.rut ? `${c.rut} · ` : ''}{c.ops} venta{c.ops !== 1 ? 's' : ''}
                    {totalGeneral > 0 ? ` · ${Math.round(c.total / totalGeneral * 100)}% del total` : ''}
                  </p>
                </div>
                <p className="font-extrabold flex-shrink-0" style={{ color: '#4caf50' }}>{fmt(c.total)}</p>
              </div>
              <div className="w-full rounded-full h-1.5" style={{ backgroundColor: '#2a2a2a' }}>
                <div className="h-1.5 rounded-full" style={{ width: `${Math.round(c.total / maxTotal * 100)}%`, backgroundColor: i === 0 ? '#ff9800' : '#4caf50' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
