'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

const ESTADO_COLORS: Record<string, string> = {
  pendiente: '#ff9800', preparado: '#2196f3', entregado: '#4caf50', pagado: '#6b7280',
};

interface Cliente { id: string; nombre: string; rut: string | null; telefono: string | null; }
interface Pedido {
  id: string; fecha: string; estado: string; total: number; vendedor: string | null;
  detalle: { cantidad: number; precio_unitario: number; producto: { nombre: string } | null }[];
}

export default function EstadoCuentaPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [cargandoPedidos, setCargandoPedidos] = useState(false);

  const fetchClientes = useCallback(async () => {
    const { data } = await supabase.from('clientes').select('id, nombre, rut, telefono').order('nombre');
    setClientes((data || []) as Cliente[]);
  }, []);

  useEffect(() => { fetchClientes().finally(() => setLoading(false)); }, [fetchClientes]);

  useEffect(() => {
    if (!clienteId) { setPedidos([]); return; }
    setCargandoPedidos(true);
    supabase
      .from('pedidos')
      .select('id, fecha, estado, total, vendedor, detalle:detalle_pedido(cantidad, precio_unitario, producto:productos(nombre))')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false })
      .then(({ data }) => { setPedidos((data || []) as unknown as Pedido[]); setCargandoPedidos(false); });
  }, [clienteId]);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  const cliente = clientes.find((c) => c.id === clienteId);
  const porCobrar = pedidos.filter((p) => p.estado === 'entregado').reduce((s, p) => s + p.total, 0);
  const pagado = pedidos.filter((p) => p.estado === 'pagado').reduce((s, p) => s + p.total, 0);
  const enProceso = pedidos.filter((p) => p.estado === 'pendiente' || p.estado === 'preparado').reduce((s, p) => s + p.total, 0);
  const totalComprado = pagado + porCobrar; // lo realmente entregado

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Estado de Cuenta</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Historial de compras y saldo de cada cliente</p>
      </div>

      <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}
        className="w-full rounded-lg px-3 py-3 mb-4 text-sm border"
        style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', color: clienteId ? '#f5f5f5' : '#6b7280' }}>
        <option value="">— Seleccionar cliente —</option>
        {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>

      {!clienteId ? (
        <div className="text-center py-16" style={{ color: '#6b7280' }}>
          <p className="text-3xl mb-2">📇</p>
          <p>Elige un cliente para ver su estado de cuenta</p>
        </div>
      ) : cargandoPedidos ? (
        <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {/* Datos cliente */}
          <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
            <p className="font-bold text-lg" style={{ color: '#f5f5f5' }}>{cliente?.nombre}</p>
            <p className="text-xs" style={{ color: '#6b7280' }}>
              {cliente?.rut ? `RUT ${cliente.rut}` : 'Sin RUT'}{cliente?.telefono ? ` · 📞 ${cliente.telefono}` : ''}
            </p>
          </div>

          {/* Resumen */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl border p-3" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: '#e53935' }}>
              <p className="text-xs" style={{ color: '#6b7280' }}>💰 Por cobrar</p>
              <p className="text-xl font-extrabold" style={{ color: '#e53935' }}>{fmt(porCobrar)}</p>
            </div>
            <div className="rounded-xl border p-3" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: '#4caf50' }}>
              <p className="text-xs" style={{ color: '#6b7280' }}>✅ Pagado</p>
              <p className="text-xl font-extrabold" style={{ color: '#4caf50' }}>{fmt(pagado)}</p>
            </div>
            <div className="rounded-xl border p-3" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: '#ff9800' }}>
              <p className="text-xs" style={{ color: '#6b7280' }}>⏳ En proceso</p>
              <p className="text-xl font-extrabold" style={{ color: '#ff9800' }}>{fmt(enProceso)}</p>
            </div>
          </div>

          <div className="rounded-xl border p-4 mb-4 flex justify-between items-center" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
            <div>
              <p className="text-xs" style={{ color: '#6b7280' }}>Total comprado (entregado)</p>
              <p className="text-2xl font-extrabold" style={{ color: '#f5f5f5' }}>{fmt(totalComprado)}</p>
            </div>
            <p className="text-sm" style={{ color: '#6b7280' }}>{pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''}</p>
          </div>

          {/* Historial de pedidos */}
          <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>📦 Historial de pedidos</p>
            </div>
            {pedidos.length === 0 ? (
              <p className="p-6 text-center text-sm" style={{ color: '#6b7280' }}>Este cliente no tiene pedidos</p>
            ) : pedidos.map((p, i) => {
              const color = ESTADO_COLORS[p.estado] || '#6b7280';
              return (
                <div key={p.id} className="px-4 py-3" style={{ borderBottom: i < pedidos.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>{new Date(p.fecha + 'T12:00:00').toLocaleDateString('es-CL')}</p>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color, backgroundColor: color + '20' }}>{p.estado.toUpperCase()}</span>
                  </div>
                  <p className="text-xs mb-1" style={{ color: '#6b7280' }}>
                    {(p.detalle || []).map((d) => `${d.producto?.nombre ?? '—'} x${d.cantidad}`).join(' · ') || '—'}
                  </p>
                  <p className="font-extrabold" style={{ color: '#f5f5f5' }}>{fmt(p.total)}</p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
