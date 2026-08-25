'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const COLORES = ['#e53935', '#ff9800', '#4caf50', '#2196f3', '#9c27b0', '#00bcd4'];

interface ProdVenta { nombre: string; unidades: number; total: number; }
interface ClienteVenta { key: string; nombre: string; rut: string | null; total: number; ops: number; productos: ProdVenta[]; }

export default function VentasHistoricasPage() {
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<ClienteVenta[]>([]);
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [pedRes, cliRes] = await Promise.all([
          supabase.from('pedidos').select('cliente_id, detalle:detalle_pedido(cantidad, precio_unitario, producto:productos(nombre))'),
          supabase.from('clientes').select('id, nombre, rut'),
        ]);
        const cliMap = new Map((cliRes.data || []).map((c: any) => [c.id, c]));
        const acc: Record<string, ClienteVenta> = {};

        for (const p of (pedRes.data || []) as any[]) {
          const c = p.cliente_id ? cliMap.get(p.cliente_id) : null;
          const key = c ? c.id : 'sin_cliente';
          if (!acc[key]) acc[key] = { key, nombre: c?.nombre ?? 'Sin cliente', rut: c?.rut ?? null, total: 0, ops: 0, productos: [] };
          acc[key].ops += 1;
          const prodMap: Record<string, ProdVenta> = {};
          for (const pr of acc[key].productos) prodMap[pr.nombre] = pr;
          for (const d of (p.detalle || [])) {
            const n = d.producto?.nombre ?? '—';
            const sub = d.cantidad * d.precio_unitario;
            if (!prodMap[n]) { prodMap[n] = { nombre: n, unidades: 0, total: 0 }; acc[key].productos.push(prodMap[n]); }
            prodMap[n].unidades += d.cantidad;
            prodMap[n].total += sub;
            acc[key].total += sub;
          }
        }
        for (const c of Object.values(acc)) c.productos.sort((a, b) => b.total - a.total);
        setClientes(Object.values(acc));
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  const ordenados = [...clientes].sort((a, b) => b.total - a.total);
  const totalGeneral = clientes.reduce((s, c) => s + c.total, 0);
  const maxTotal = Math.max(...clientes.map((c) => c.total), 1);

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Ventas Históricas</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Cuánto le has vendido a cada cliente. Toca un cliente para ver por producto.</p>
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

      {/* Ranking */}
      {ordenados.length === 0 ? (
        <div className="text-center py-12" style={{ color: '#6b7280' }}>
          <p className="text-3xl mb-2">📜</p>
          <p>No hay ventas registradas</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ordenados.map((c, i) => {
            const abierto = expandido === c.key;
            const maxProd = Math.max(...c.productos.map((p) => p.total), 1);
            return (
              <div key={c.key} className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: abierto ? '#4caf50' : '#2a2a2a' }}>
                <button onClick={() => setExpandido(abierto ? null : c.key)} className="w-full px-4 py-3 text-left">
                  <div className="flex justify-between items-center mb-1">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>
                        <span style={{ color: i === 0 ? '#ff9800' : '#6b7280' }}>{i + 1}. </span>{c.nombre}
                      </p>
                      <p className="text-xs" style={{ color: '#6b7280' }}>
                        {c.rut ? `${c.rut} · ` : ''}{c.ops} pedido{c.ops !== 1 ? 's' : ''}
                        {totalGeneral > 0 ? ` · ${Math.round(c.total / totalGeneral * 100)}%` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className="font-extrabold" style={{ color: '#4caf50' }}>{fmt(c.total)}</p>
                      <span style={{ color: '#6b7280' }}>{abierto ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  <div className="w-full rounded-full h-1.5" style={{ backgroundColor: '#2a2a2a' }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${Math.round(c.total / maxTotal * 100)}%`, backgroundColor: i === 0 ? '#ff9800' : '#4caf50' }} />
                  </div>
                </button>

                {abierto && (
                  <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: '#2a2a2a' }}>
                    <p className="text-xs font-bold uppercase tracking-wide mb-2 mt-2" style={{ color: '#6b7280' }}>📦 Por producto</p>
                    {c.productos.length === 0 ? (
                      <p className="text-xs" style={{ color: '#6b7280' }}>Sin detalle de productos</p>
                    ) : c.productos.map((pr, j) => (
                      <div key={pr.nombre} className="mb-2">
                        <div className="flex justify-between items-center mb-0.5">
                          <p className="text-sm" style={{ color: '#f5f5f5' }}>{pr.nombre}</p>
                          <p className="text-xs" style={{ color: '#6b7280' }}>
                            <span className="font-bold" style={{ color: COLORES[j % COLORES.length] }}>{pr.unidades} u.</span> · {fmt(pr.total)}
                          </p>
                        </div>
                        <div className="w-full rounded-full h-2" style={{ backgroundColor: '#2a2a2a' }}>
                          <div className="h-2 rounded-full" style={{ width: `${Math.round(pr.total / maxProd * 100)}%`, backgroundColor: COLORES[j % COLORES.length] }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
