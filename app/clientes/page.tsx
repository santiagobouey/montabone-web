'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Cliente, TipoCliente } from '@/types';

const TIPOS: TipoCliente[] = ['carniceria', 'distribuidor', 'restaurante', 'supermercado', 'particular', 'otro'];
const TIPO_LABELS: Record<TipoCliente, string> = {
  carniceria: 'Carnicería', distribuidor: 'Distribuidor', restaurante: 'Restaurante',
  supermercado: 'Supermercado', particular: 'Particular', otro: 'Otro',
};

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [tipo, setTipo] = useState<TipoCliente>('otro');
  const [observaciones, setObservaciones] = useState('');
  const [muestraEntregada, setMuestraEntregada] = useState(false);

  const fetchClientes = useCallback(async () => {
    try {
      const { data } = await supabase.from('clientes').select('*').order('nombre');
      setClientes(data || []);
    } catch {}
  }, []);

  useEffect(() => { fetchClientes().finally(() => setLoading(false)); }, [fetchClientes]);

  function abrirNuevo() {
    setEditando(null); setNombre(''); setTelefono(''); setDireccion('');
    setTipo('otro'); setObservaciones(''); setMuestraEntregada(false);
    setShowModal(true);
  }

  function abrirEditar(c: Cliente) {
    setEditando(c); setNombre(c.nombre); setTelefono(c.telefono);
    setDireccion(c.direccion); setTipo(c.tipo ?? 'otro');
    setObservaciones(c.observaciones || ''); setMuestraEntregada(c.muestra_entregada ?? false);
    setShowModal(true);
  }

  async function handleGuardar() {
    if (!nombre || !telefono) return;
    setSaving(true);
    try {
      const payload = { nombre, telefono, direccion, tipo, observaciones: observaciones || null, muestra_entregada: muestraEntregada };
      if (editando) await supabase.from('clientes').update(payload).eq('id', editando.id);
      else await supabase.from('clientes').insert(payload);
      setShowModal(false);
      await fetchClientes();
    } catch {}
    setSaving(false);
  }

  const filtrados = clientes.filter((c) => c.nombre.toLowerCase().includes(busqueda.toLowerCase()));

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
        className="w-full rounded-lg px-3 py-2 mb-4 text-sm border" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

      <div className="space-y-3">
        {filtrados.map((c) => (
          <div key={c.id} className="rounded-xl border p-4 cursor-pointer" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }} onClick={() => abrirEditar(c)}>
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold" style={{ color: '#f5f5f5' }}>{c.nombre}</p>
                <p className="text-sm" style={{ color: '#6b7280' }}>{c.telefono} · {c.direccion}</p>
                <span className="text-xs px-2 py-0.5 rounded-full mt-1 inline-block" style={{ backgroundColor: '#2a2a2a', color: '#9ca3af' }}>
                  {TIPO_LABELS[c.tipo] ?? c.tipo}
                </span>
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
              <button onClick={() => setShowModal(false)} style={{ color: '#6b7280' }}>✕</button>
            </div>

            {[{ label: 'Nombre', value: nombre, set: setNombre }, { label: 'Teléfono', value: telefono, set: setTelefono }, { label: 'Dirección', value: direccion, set: setDireccion }].map(({ label, value, set }) => (
              <div key={label} className="mb-3">
                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>{label}</label>
                <input value={value} onChange={(e) => set(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
              </div>
            ))}

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

            <button onClick={() => setMuestraEntregada(!muestraEntregada)} className="w-full flex items-center justify-between p-3 rounded-lg border mb-4 transition-colors"
              style={{ backgroundColor: muestraEntregada ? '#4caf50' + '10' : '#1c1c1c', borderColor: muestraEntregada ? '#4caf50' : '#2a2a2a' }}>
              <span className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>🎁 Muestra entregada</span>
              <div className="w-10 h-5 rounded-full transition-colors flex items-center px-0.5" style={{ backgroundColor: muestraEntregada ? '#4caf50' : '#2a2a2a' }}>
                <div className="w-4 h-4 rounded-full bg-white transition-transform" style={{ transform: muestraEntregada ? 'translateX(20px)' : 'translateX(0)' }} />
              </div>
            </button>

            <button onClick={handleGuardar} disabled={saving || !nombre || !telefono} className="w-full py-3 rounded-lg font-bold text-white text-sm disabled:opacity-40" style={{ backgroundColor: '#e53935' }}>
              {saving ? 'Guardando...' : 'GUARDAR'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
