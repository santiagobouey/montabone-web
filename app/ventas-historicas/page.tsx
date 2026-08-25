'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const COLORES = ['#e53935', '#ff9800', '#4caf50', '#2196f3', '#9c27b0', '#00bcd4'];

interface ProdVenta { nombre: string; unidades: number; total: number; }
interface Entidad { key: string; nombre: string; rut: string | null; total: number; ops: number; productos: ProdVenta[]; }

export default function VentasHistoricasPage() {
  const [loading, setLoading] = useState(true);
  const [clientesD, setClientesD] = useState<Entidad[]>([]);
  const [detalleD, setDetalleD] = useState<Entidad[]>([]);
  const [totalD, setTotalD] = useState<Entidad[]>([]);
  const [productosD, setProductosD] = useState<ProdVenta[]>([]);
  const [tab, setTab] = useState<'clientes' | 'detalle' | 'total' | 'productos'>('total');
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [pedRes, detRes, eveRes, cliRes] = await Promise.all([
          supabase.from('pedidos').select('cliente_id, detalle:detalle_pedido(cantidad, precio_unitario, producto:productos(nombre))'),
          supabase.from('ventas_detalle').select('nombre_comprador, items:items_venta_detalle(cantidad, precio_unitario, producto:productos(nombre))'),
          supabase.from('ventas_evento').select('cantidad, precio_unitario, producto:productos(nombre)'),
          supabase.from('clientes').select('id, nombre, rut'),
        ]);
        const cliMap = new Map((cliRes.data || []).map((c: any) => [c.id, c]));
        const porNombre = new Map((cliRes.data || []).map((c: any) => [String(c.nombre).trim().toLowerCase(), c]));

        const nuevo = (): Record<string, Entidad> => ({});
        const agregar = (acc: Record<string, Entidad>, key: string, nombre: string, rut: string | null, prod: string, uni: number, sub: number) => {
          if (!acc[key]) acc[key] = { key, nombre, rut, total: 0, ops: 0, productos: [] };
          let pr = acc[key].productos.find((x) => x.nombre === prod);
          if (!pr) { pr = { nombre: prod, unidades: 0, total: 0 }; acc[key].productos.push(pr); }
          pr.unidades += uni; pr.total += sub; acc[key].total += sub;
        };

        const accCli = nuevo();
        const accDet = nuevo();
        const accTot = nuevo();
        const prodTot: Record<string, ProdVenta> = {};
        const sumaProd = (prod: string, uni: number, sub: number) => {
          if (!prodTot[prod]) prodTot[prod] = { nombre: prod, unidades: 0, total: 0 };
          prodTot[prod].unidades += uni; prodTot[prod].total += sub;
        };

        // Pedidos → Clientes + Total + Productos
        for (const p of (pedRes.data || []) as any[]) {
          const c = p.cliente_id ? cliMap.get(p.cliente_id) : null;
          const key = c ? c.id : 'sin_cliente';
          const nombre = c?.nombre ?? 'Sin cliente';
          if (!accCli[key]) accCli[key] = { key, nombre, rut: c?.rut ?? null, total: 0, ops: 0, productos: [] };
          if (!accTot[key]) accTot[key] = { key, nombre, rut: c?.rut ?? null, total: 0, ops: 0, productos: [] };
          accCli[key].ops += 1; accTot[key].ops += 1;
          for (const d of (p.detalle || [])) {
            const pn = d.producto?.nombre ?? '—'; const sub = d.cantidad * d.precio_unitario;
            agregar(accCli, key, nombre, c?.rut ?? null, pn, d.cantidad, sub);
            agregar(accTot, key, nombre, c?.rut ?? null, pn, d.cantidad, sub);
            sumaProd(pn, d.cantidad, sub);
          }
        }

        // Ventas al detalle → Detalle + Total + Productos
        for (const v of (detRes.data || []) as any[]) {
          const nom = (v.nombre_comprador || '').trim();
          const dkey = nom ? `d:${nom.toLowerCase()}` : 'sin_nombre';
          const dnombre = nom || 'Sin nombre';
          if (!accDet[dkey]) accDet[dkey] = { key: dkey, nombre: dnombre, rut: null, total: 0, ops: 0, productos: [] };
          accDet[dkey].ops += 1;
          // Para Total: unir con cliente registrado si el nombre coincide
          const reg = nom ? porNombre.get(nom.toLowerCase()) : null;
          const tkey = reg ? reg.id : dkey;
          const tnombre = reg?.nombre ?? dnombre;
          if (!accTot[tkey]) accTot[tkey] = { key: tkey, nombre: tnombre, rut: reg?.rut ?? null, total: 0, ops: 0, productos: [] };
          accTot[tkey].ops += 1;
          for (const it of (v.items || [])) {
            const pn = it.producto?.nombre ?? '—'; const sub = it.cantidad * it.precio_unitario;
            agregar(accDet, dkey, dnombre, null, pn, it.cantidad, sub);
            agregar(accTot, tkey, tnombre, reg?.rut ?? null, pn, it.cantidad, sub);
            sumaProd(pn, it.cantidad, sub);
          }
        }

        // Eventos → solo Productos
        for (const v of (eveRes.data || []) as any[]) {
          sumaProd(v.producto?.nombre ?? '—', v.cantidad, v.cantidad * v.precio_unitario);
        }

        const finalizar = (acc: Record<string, Entidad>) => {
          const arr = Object.values(acc);
          for (const c of arr) c.productos.sort((a, b) => b.total - a.total);
          return arr.sort((a, b) => b.total - a.total);
        };
        setClientesD(finalizar(accCli));
        setDetalleD(finalizar(accDet));
        setTotalD(finalizar(accTot));
        setProductosD(Object.values(prodTot).sort((a, b) => b.total - a.total));
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  const lista = tab === 'clientes' ? clientesD : tab === 'detalle' ? detalleD : totalD;
  const totalGeneral = tab === 'productos' ? productosD.reduce((s, p) => s + p.total, 0) : lista.reduce((s, c) => s + c.total, 0);
  const maxTotal = Math.max(...lista.map((c) => c.total), 1);
  const maxProd = Math.max(...productosD.map((p) => p.total), 1);

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Ventas Históricas</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Cuánto se ha vendido, por cliente y por producto (todo el historial)</p>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {([['clientes', '👥 Clientes'], ['detalle', '🛒 Detalle'], ['total', '📊 Total'], ['productos', '📦 Productos']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => { setTab(k); setExpandido(null); }}
            className="py-2 px-1 rounded-lg border text-xs font-semibold"
            style={{ backgroundColor: tab === k ? '#e5393520' : 'transparent', borderColor: tab === k ? '#e53935' : '#2a2a2a', color: tab === k ? '#e53935' : '#9ca3af' }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Total del segmento */}
      <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: '#4caf50' }}>
        <p className="text-xs" style={{ color: '#6b7280' }}>
          💰 {tab === 'clientes' ? 'Total a clientes (pedidos)' : tab === 'detalle' ? 'Total ventas al detalle' : tab === 'productos' ? 'Total en productos' : 'Total histórico (todo)'}
        </p>
        <p className="text-2xl font-extrabold" style={{ color: '#4caf50' }}>{fmt(totalGeneral)}</p>
        <p className="text-xs" style={{ color: '#6b7280' }}>{tab === 'productos' ? `${productosD.length} productos` : `${lista.length} ${tab === 'detalle' ? 'compradores' : 'clientes'}`}</p>
      </div>

      {/* ===== PRODUCTOS ===== */}
      {tab === 'productos' ? (
        productosD.length === 0 ? (
          <div className="text-center py-12" style={{ color: '#6b7280' }}><p className="text-3xl mb-2">📦</p><p>Sin ventas</p></div>
        ) : (
          <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
            {productosD.map((p, i) => (
              <div key={p.nombre} className="px-4 py-3" style={{ borderBottom: i < productosD.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
                <div className="flex justify-between items-center mb-1">
                  <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>{p.nombre}</p>
                  <div className="text-right">
                    <span className="font-extrabold" style={{ color: COLORES[i % COLORES.length] }}>{p.unidades} u.</span>
                    <span className="text-xs ml-2" style={{ color: '#6b7280' }}>{fmt(p.total)}</span>
                  </div>
                </div>
                <div className="w-full rounded-full h-2" style={{ backgroundColor: '#2a2a2a' }}>
                  <div className="h-2 rounded-full" style={{ width: `${Math.round(p.total / maxProd * 100)}%`, backgroundColor: COLORES[i % COLORES.length] }} />
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* ===== RANKING DE ENTIDADES ===== */
        lista.length === 0 ? (
          <div className="text-center py-12" style={{ color: '#6b7280' }}><p className="text-3xl mb-2">📜</p><p>Sin ventas</p></div>
        ) : (
          <div className="space-y-2">
            {lista.map((c, i) => {
              const abierto = expandido === c.key;
              const maxP = Math.max(...c.productos.map((p) => p.total), 1);
              return (
                <div key={c.key} className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: abierto ? '#4caf50' : '#2a2a2a' }}>
                  <button onClick={() => setExpandido(abierto ? null : c.key)} className="w-full px-4 py-3 text-left">
                    <div className="flex justify-between items-center mb-1">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>
                          <span style={{ color: i === 0 ? '#ff9800' : '#6b7280' }}>{i + 1}. </span>{c.nombre}
                        </p>
                        <p className="text-xs" style={{ color: '#6b7280' }}>
                          {c.rut ? `${c.rut} · ` : ''}{c.ops} venta{c.ops !== 1 ? 's' : ''}{totalGeneral > 0 ? ` · ${Math.round(c.total / totalGeneral * 100)}%` : ''}
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
                      {c.productos.map((pr, j) => (
                        <div key={pr.nombre} className="mb-2">
                          <div className="flex justify-between items-center mb-0.5">
                            <p className="text-sm" style={{ color: '#f5f5f5' }}>{pr.nombre}</p>
                            <p className="text-xs" style={{ color: '#6b7280' }}><span className="font-bold" style={{ color: COLORES[j % COLORES.length] }}>{pr.unidades} u.</span> · {fmt(pr.total)}</p>
                          </div>
                          <div className="w-full rounded-full h-2" style={{ backgroundColor: '#2a2a2a' }}>
                            <div className="h-2 rounded-full" style={{ width: `${Math.round(pr.total / maxP * 100)}%`, backgroundColor: COLORES[j % COLORES.length] }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
