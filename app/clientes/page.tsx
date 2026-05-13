'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Cliente, TipoCliente } from '@/types';

const TIPOS: TipoCliente[] = ['carniceria', 'distribuidor', 'restaurante', 'supermercado', 'particular', 'botilleria', 'otro'];
const TIPO_LABELS: Record<TipoCliente, string> = {
  carniceria: 'Carnicería', distribuidor: 'Distribuidor', restaurante: 'Restaurante',
  supermercado: 'Supermercado', particular: 'Particular', botilleria: 'Botillería', otro: 'Otro',
};

const COMUNAS_SANTIAGO = [
  'Cerrillos', 'Cerro Navia', 'Conchalí', 'El Bosque', 'Estación Central',
  'Huechuraba', 'Independencia', 'La Cisterna', 'La Florida', 'La Granja',
  'La Pintana', 'La Reina', 'Las Condes', 'Lo Barnechea', 'Lo Espejo',
  'Lo Prado', 'Macul', 'Maipú', 'Ñuñoa', 'Padre Hurtado', 'Pedro Aguirre Cerda',
  'Peñalolén', 'Providencia', 'Pudahuel', 'Quilicura', 'Quinta Normal',
  'Recoleta', 'Renca', 'San Bernardo', 'San Joaquín', 'San Miguel',
  'San Ramón', 'Santiago', 'Vitacura',
];

const DIAS_ACTIVO = 60;

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [ultimasCompras, setUltimasCompras] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activo' | 'inactivo'>('todos');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);

  const [nombre, setNombre] = useState('');
  const [nombreContacto, setNombreContacto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [comuna, setComuna] = useState('');
  const [tipo, setTipo] = useState<TipoCliente>('otro');
  const [observaciones, setObservaciones] = useState('');
  const [muestraEntregada, setMuestraEntregada] = useState(false);
  const [activoManual, setActivoManual] = useState<boolean | null>(null);

  const fetchClientes = useCallback(async () => {
    try {
      const [clientesRes, pedidosRes] = await Promise.all([
        supabase.from('clientes').select('*').order('nombre'),
        supabase.from('pedidos').select('cliente_id, fecha').order('fecha', { ascending: false }),
      ]);
      setClientes(clientesRes.data || []);
      const map: Record<string, string> = {};
      for (const p of (pedidosRes.data || [])) {
        if (!map[p.cliente_id]) map[p.cliente_id] = p.fecha;
      }
      setUltimasCompras(map);
    } catch {}
  }, []);

  useEffect(() => { fetchClientes().finally(() => setLoading(false)); }, [fetchClientes]);

  function abrirNuevo() {
    setEditando(null); setNombre(''); setNombreContacto(''); setTelefono(''); setDireccion('');
    setComuna(''); setTipo('otro'); setObservaciones(''); setMuestraEntregada(false);
    setActivoManual(null); setConfirmandoEliminar(false);
    setShowModal(true);
  }

  function abrirEditar(c: Cliente) {
    setEditando(c); setNombre(c.nombre); setNombreContacto(c.nombre_contacto || ''); setTelefono(c.telefono);
    setDireccion(c.direccion); setComuna('');
    setTipo(c.tipo ?? 'otro');
    setObservaciones(c.observaciones || ''); setMuestraEntregada(c.muestra_entregada ?? false);
    setActivoManual(c.activo_manual ?? null); setConfirmandoEliminar(false);
    setShowModal(true);
  }

  async function handleEliminar() {
    if (!editando) return;
    try {
      // Borrar detalle_pedido y pedidos del cliente antes de borrar el cliente
      const { data: pedidosCliente } = await supabase.from('pedidos').select('id').eq('cliente_id', editando.id);
      if (pedidosCliente && pedidosCliente.length > 0) {
        const ids = pedidosCliente.map((p) => p.id);
        await supabase.from('detalle_pedido').delete().in('pedido_id', ids);
        await supabase.from('pedidos').delete().eq('cliente_id', editando.id);
      }
      const { error } = await supabase.from('clientes').delete().eq('id', editando.id);
      if (error) throw error;
      setConfirmandoEliminar(false);
      setShowModal(false);
      await fetchClientes();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar';
      alert('Error: ' + msg);
    }
  }

  async function handleGuardar() {
    if (!nombre || !telefono) return;
    setSaving(true);
    const direccionCompleta = comuna ? `${direccion}, ${comuna}` : direccion;
    try {
      const payload = { nombre, nombre_contacto: nombreContacto || null, telefono, direccion: direccionCompleta, tipo, observaciones: observaciones || null, muestra_entregada: muestraEntregada, activo_manual: activoManual };
      if (editando) {
        const { error } = await supabase.from('clientes').update(payload).eq('id', editando.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clientes').insert(payload);
        if (error) throw error;
      }
      setShowModal(false);
      await fetchClientes();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al guardar';
      alert('Error: ' + msg);
    }
    setSaving(false);
  }

  const hace60 = new Date(Date.now() - DIAS_ACTIVO * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const esActivo = (c: Cliente) => {
    if (c.activo_manual !== null && c.activo_manual !== undefined) return c.activo_manual;
    return ultimasCompras[c.id] ? ultimasCompras[c.id] >= hace60 : false;
  };

  const filtrados = clientes.filter((c) => {
    const matchBusqueda = c.nombre.toLowerCase().includes(busqueda.toLowerCase());
    const activo = esActivo(c);
    if (filtroEstado === 'activo') return matchBusqueda && activo;
    if (filtroEstado === 'inactivo') return matchBusqueda && !activo;
    return matchBusqueda;
  });

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Clientes</h1>
          <p className="text-sm" style={{ color: '#6b7280' }}>{clientes.length} clientes registrados</p>
        </div>
        <button onClick={abrirNuevo} className="px-4 py-2 rounded-lg font-semibold text-sm text-white" style={{ backgroundColor: '#e53935' }}>+ Nuevo</button>
      </div>

      <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente..."
        className="w-full rounded-lg px-3 py-2 mb-3 text-sm border" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

      <div className="flex gap-2 mb-4">
        {(['todos', 'activo', 'inactivo'] as const).map((e) => (
          <button key={e} onClick={() => setFiltroEstado(e)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
            style={{
              backgroundColor: filtroEstado === e ? (e === 'activo' ? '#4caf50' : e === 'inactivo' ? '#e53935' : '#e53935') + '20' : 'transparent',
              borderColor: filtroEstado === e ? (e === 'activo' ? '#4caf50' : e === 'inactivo' ? '#e53935' : '#e53935') : '#2a2a2a',
              color: filtroEstado === e ? (e === 'activo' ? '#4caf50' : e === 'inactivo' ? '#e53935' : '#e53935') : '#6b7280',
            }}>
            {e === 'todos' ? 'Todos' : e === 'activo' ? '● Activos' : '● Inactivos'}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtrados.map((c) => (
          <div key={c.id} className="rounded-xl border p-4 cursor-pointer" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }} onClick={() => abrirEditar(c)}>
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold" style={{ color: '#f5f5f5' }}>{c.nombre}</p>
                {c.nombre_contacto && <p className="text-sm" style={{ color: '#9ca3af' }}>{c.nombre_contacto}</p>}
                <p className="text-sm" style={{ color: '#6b7280' }}>{c.telefono} · {c.direccion}</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#2a2a2a', color: '#9ca3af' }}>
                    {TIPO_LABELS[c.tipo] ?? c.tipo}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{
                      backgroundColor: esActivo(c) ? '#4caf50' + '20' : '#e53935' + '20',
                      color: esActivo(c) ? '#4caf50' : '#e53935',
                    }}>
                    {esActivo(c) ? '● Activo' : '● Inactivo'}
                  </span>
                  {ultimasCompras[c.id] && (
                    <span className="text-xs" style={{ color: '#6b7280' }}>
                      Última compra: {new Date(ultimasCompras[c.id] + 'T12:00:00').toLocaleDateString('es-CL')}
                    </span>
                  )}
                </div>
              </div>
              {c.muestra_entregada && (
                <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ backgroundColor: '#4caf50' + '20', color: '#4caf50' }}>
                  🎁 Muestra
                </span>
              )}
            </div>
          </div>
        ))}
        {filtrados.length === 0 && <div className="text-center py-16" style={{ color: '#6b7280' }}>No hay clientes</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 overflow-y-auto max-h-[90vh]" style={{ backgroundColor: '#141414' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg" style={{ color: '#f5f5f5' }}>{editando ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
              <button onClick={() => { setShowModal(false); setConfirmandoEliminar(false); }} style={{ color: '#6b7280' }}>✕</button>
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Nombre del Local</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Nombre del Dueño / Contacto</label>
              <input value={nombreContacto} onChange={(e) => setNombreContacto(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Teléfono</label>
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Dirección</label>
              <input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Ej: Av. Grecia 1234" className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Comuna</label>
              <select value={comuna} onChange={(e) => setComuna(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: comuna ? '#f5f5f5' : '#6b7280' }}>
                <option value="">Seleccionar comuna...</option>
                {COMUNAS_SANTIAGO.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <label className="block text-xs font-semibold uppercase mb-2" style={{ color: '#6b7280' }}>Tipo</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {TIPOS.map((t) => (
                <button key={t} onClick={() => setTipo(t)} className="px-3 py-1.5 rounded-full border text-xs font-medium transition-colors"
                  style={{ backgroundColor: tipo === t ? '#e53935' + '20' : 'transparent', borderColor: tipo === t ? '#e53935' : '#2a2a2a', color: tipo === t ? '#e53935' : '#6b7280' }}>
                  {TIPO_LABELS[t]}
                </button>
              ))}
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Observaciones</label>
              <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} className="w-full rounded-lg px-3 py-2 text-sm border resize-none" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold uppercase mb-2" style={{ color: '#6b7280' }}>Estado de actividad</label>
              <div className="flex gap-2">
                {([{ val: null, label: 'Auto' }, { val: true, label: '● Activo' }, { val: false, label: '● Inactivo' }] as { val: boolean | null; label: string }[]).map(({ val, label }) => (
                  <button key={String(val)} onClick={() => setActivoManual(val)}
                    className="flex-1 py-2 rounded-lg border text-xs font-semibold transition-colors"
                    style={{
                      backgroundColor: activoManual === val ? (val === true ? '#4caf50' : val === false ? '#e53935' : '#e53935') + '20' : 'transparent',
                      borderColor: activoManual === val ? (val === true ? '#4caf50' : val === false ? '#e53935' : '#6b7280') : '#2a2a2a',
                      color: activoManual === val ? (val === true ? '#4caf50' : val === false ? '#e53935' : '#9ca3af') : '#6b7280',
                    }}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs mt-1" style={{ color: '#4b5563' }}>Auto = se calcula por las compras de los últimos {DIAS_ACTIVO} días</p>
            </div>

            <button onClick={() => setMuestraEntregada(!muestraEntregada)} className="w-full flex items-center justify-between p-3 rounded-lg border mb-4 transition-colors"
              style={{ backgroundColor: muestraEntregada ? '#4caf50' + '10' : '#1c1c1c', borderColor: muestraEntregada ? '#4caf50' : '#2a2a2a' }}>
              <span className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>🎁 Muestra entregada</span>
              <div className="w-10 h-5 rounded-full transition-colors flex items-center px-0.5" style={{ backgroundColor: muestraEntregada ? '#4caf50' : '#2a2a2a' }}>
                <div className="w-4 h-4 rounded-full bg-white transition-transform" style={{ transform: muestraEntregada ? 'translateX(20px)' : 'translateX(0)' }} />
              </div>
            </button>

            <button onClick={handleGuardar} disabled={saving || !nombre || !telefono} className="w-full py-3 rounded-lg font-bold text-white text-sm disabled:opacity-40 mb-2" style={{ backgroundColor: '#e53935' }}>
              {saving ? 'Guardando...' : 'GUARDAR'}
            </button>

            {editando && !confirmandoEliminar && (
              <button onClick={() => setConfirmandoEliminar(true)} className="w-full py-3 rounded-lg font-bold text-sm border" style={{ color: '#e53935', borderColor: '#e53935' + '40', backgroundColor: '#e53935' + '10' }}>
                🗑 Eliminar cliente
              </button>
            )}

            {editando && confirmandoEliminar && (
              <div className="rounded-lg border p-3" style={{ borderColor: '#e53935' + '60', backgroundColor: '#e53935' + '10' }}>
                <p className="text-sm font-semibold text-center mb-3" style={{ color: '#f5f5f5' }}>¿Eliminar a {editando.nombre}?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmandoEliminar(false)} className="flex-1 py-2 rounded-lg font-bold text-sm border" style={{ color: '#9ca3af', borderColor: '#2a2a2a', backgroundColor: '#1c1c1c' }}>
                    Cancelar
                  </button>
                  <button onClick={handleEliminar} className="flex-1 py-2 rounded-lg font-bold text-sm text-white" style={{ backgroundColor: '#e53935' }}>
                    Sí, eliminar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
