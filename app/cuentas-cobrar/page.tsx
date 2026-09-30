'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const hoyIso = () => new Date().toISOString().split('T')[0];
const diasDesde = (fecha: string) =>
  Math.max(0, Math.round((new Date(hoyIso() + 'T12:00:00').getTime() - new Date(fecha + 'T12:00:00').getTime()) / 86400000));

interface Venta { id: string; fecha: string; total: number; }
interface Deudor {
  key: string;
  nombre: string;
  rut: string | null;
  total: number;
  ventas: Venta[];
  diasMax: number;
}

function agrupar(filas: { id: string; fecha: string; total: number; nombre: string; rut?: string | null }[]): Deudor[] {
  const acc: Record<string, Deudor> = {};
  for (const f of filas) {
    const key = f.nombre.toLowerCase();
    if (!acc[key]) acc[key] = { key, nombre: f.nombre, rut: f.rut ?? null, total: 0, ventas: [], diasMax: 0 };
    acc[key].total += f.total;
    acc[key].ventas.push({ id: f.id, fecha: f.fecha, total: f.total });
    acc[key].diasMax = Math.max(acc[key].diasMax, diasDesde(f.fecha));
    if (!acc[key].rut && f.rut) acc[key].rut = f.rut;
  }
  for (const d of Object.values(acc)) d.ventas.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return Object.values(acc).sort((a, b) => b.total - a.total);
}

export default function CuentasCobrarPage() {
  const [clientes, setClientes] = useState<Deudor[]>([]);
  const [personas, setPersonas] = useState<Deudor[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'clientes' | 'personas'>('clientes');
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [pedRes, detRes] = await Promise.all([
      supabase.from('pedidos').select('id, fecha, total, cliente:clientes(nombre, rut)').eq('estado', 'entregado'),
      supabase.from('ventas_detalle').select('id, fecha, total, nombre_comprador').eq('estado', 'entregado'),
    ]);
    setClientes(agrupar(((pedRes.data || []) as any[]).map((p) => ({
      id: p.id, fecha: p.fecha, total: p.total,
      nombre: p.cliente?.nombre ?? 'Sin cliente', rut: p.cliente?.rut ?? null,
    }))));
    setPersonas(agrupar(((detRes.data || []) as any[]).map((v) => ({
      id: v.id, fecha: v.fecha, total: v.total,
      nombre: (v.nombre_comprador || '').trim() || 'Sin nombre',
    }))));
  }, []);

  useEffect(() => { cargar().finally(() => setLoading(false)); }, [cargar]);

  async function marcarPagado(tabla: 'pedidos' | 'ventas_detalle', ids: string[]) {
    if (ids.length === 0) return;
    await supabase.from(tabla).update({ estado: 'pagado', fecha_pago: hoyIso() }).in('id', ids);
    await cargar();
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  const totalClientes = clientes.reduce((s, d) => s + d.total, 0);
  const totalPersonas = personas.reduce((s, d) => s + d.total, 0);
  const totalGeneral = totalClientes + totalPersonas;
  const lista = tab === 'clientes' ? clientes : personas;
  const tabla = tab === 'clientes' ? 'pedidos' : 'ventas_detalle';
  const colorTab = tab === 'clientes' ? '#e53935' : '#9c27b0';

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden !important; }
          #cxc-print, #cxc-print * { visibility: visible !important; }
          #cxc-print { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; }
          #cxc-print, #cxc-print * { color: #111 !important; background: #fff !important; border-color: #ccc !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
        }
        .print-only { display: none; }
      ` }} />

      <div className="flex items-center justify-between mb-4 no-print">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Cuentas por Cobrar</h1>
          <p className="text-sm" style={{ color: '#6b7280' }}>Entregado y aún sin pagar</p>
        </div>
        <button onClick={() => window.print()} className="px-4 py-2 rounded-lg font-semibold text-sm text-white" style={{ backgroundColor: '#2196f3' }}>🖨️</button>
      </div>

      <div id="cxc-print">
        <div className="print-only" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Montabone — Cuentas por Cobrar</h1>
          <p style={{ fontSize: 14, margin: '4px 0 0' }}>Al {new Date().toLocaleDateString('es-CL')}</p>
        </div>

        {/* Totales */}
        <div className="rounded-xl border p-4 mb-3" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: '#ff9800' }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>💰 Total por cobrar</p>
          <p className="text-3xl font-extrabold" style={{ color: '#ff9800' }}>{fmt(totalGeneral)}</p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{clientes.length + personas.length} deudores</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: '#e53935' }}>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>👥 Clientes</p>
            <p className="text-xl font-extrabold" style={{ color: '#e53935' }}>{fmt(totalClientes)}</p>
            <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{clientes.length} cliente{clientes.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: '#9c27b0' }}>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>🛒 Al detalle</p>
            <p className="text-xl font-extrabold" style={{ color: '#9c27b0' }}>{fmt(totalPersonas)}</p>
            <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{personas.length} persona{personas.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Pestañas */}
        <div className="grid grid-cols-2 gap-2 mb-4 no-print">
          {([['clientes', '👥 Por cliente'], ['personas', '🛒 Por persona']] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => { setTab(k); setAbierto(null); }}
              className="py-2 rounded-lg border text-sm font-semibold"
              style={{ backgroundColor: tab === k ? colorTab + '20' : 'transparent', borderColor: tab === k ? colorTab : '#2a2a2a', color: tab === k ? colorTab : '#9ca3af' }}>
              {lbl}
            </button>
          ))}
        </div>

        {/* En impresión salen las dos listas */}
        {([['clientes', '👥 Por cliente', clientes, 'pedidos'], ['personas', '🛒 Por persona', personas, 'ventas_detalle']] as const).map(([k, titulo, datos]) => (
          <div key={k} className={tab === k ? '' : 'print-only'}>
            <p className="text-xs font-bold uppercase tracking-wide mb-2 print-only" style={{ color: '#6b7280' }}>{titulo}</p>
            {datos.length === 0 ? (
              <div className="text-center py-10 rounded-xl border mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', color: '#6b7280' }}>
                <p className="text-3xl mb-2">✅</p><p>Nadie debe por aquí</p>
              </div>
            ) : (
              <div className="space-y-2 mb-4">
                {datos.map((d, i) => {
                  const open = abierto === k + d.key;
                  const colorDias = d.diasMax >= 30 ? '#e53935' : d.diasMax >= 15 ? '#ff9800' : '#6b7280';
                  return (
                    <div key={d.key} className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: open ? colorTab : '#2a2a2a' }}>
                      <button onClick={() => setAbierto(open ? null : k + d.key)} className="w-full px-4 py-3 text-left">
                        <div className="flex justify-between items-center">
                          <div className="min-w-0 pr-2">
                            <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>
                              <span style={{ color: '#6b7280' }}>{i + 1}. </span>{d.nombre}
                            </p>
                            <p className="text-xs" style={{ color: '#6b7280' }}>
                              {d.rut ? `${d.rut} · ` : ''}{d.ventas.length} venta{d.ventas.length !== 1 ? 's' : ''} ·{' '}
                              <span style={{ color: colorDias }}>hace {d.diasMax} día{d.diasMax !== 1 ? 's' : ''}</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <p className="font-extrabold" style={{ color: colorTab }}>{fmt(d.total)}</p>
                            <span className="no-print" style={{ color: '#6b7280' }}>{open ? '▲' : '▼'}</span>
                          </div>
                        </div>
                      </button>
                      {open && (
                        <div className="px-4 pb-3 border-t" style={{ borderColor: '#2a2a2a' }}>
                          {d.ventas.map((v) => (
                            <div key={v.id} className="flex justify-between items-center py-2 border-b" style={{ borderColor: '#2a2a2a' }}>
                              <span className="text-xs" style={{ color: '#9ca3af' }}>
                                {new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-CL')} · hace {diasDesde(v.fecha)}d
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>{fmt(v.total)}</span>
                                <button onClick={() => marcarPagado(tabla, [v.id])}
                                  className="text-xs px-2 py-1 rounded border no-print"
                                  style={{ borderColor: '#4caf5060', color: '#4caf50', backgroundColor: '#4caf5010' }}>✓ Pagado</button>
                              </div>
                            </div>
                          ))}
                          <button onClick={() => marcarPagado(tabla, d.ventas.map((v) => v.id))}
                            className="w-full mt-3 py-2 rounded-lg font-bold text-sm text-white no-print"
                            style={{ backgroundColor: '#4caf50' }}>
                            ✓ Marcar todo pagado ({fmt(d.total)})
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
