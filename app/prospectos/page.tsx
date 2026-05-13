'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Prospecto, TipoCliente, EstadoProspecto } from '@/types';

const TIPOS: TipoCliente[] = ['carniceria', 'distribuidor', 'restaurante', 'supermercado', 'particular', 'botilleria', 'otro'];
const TIPO_LABELS: Record<TipoCliente, string> = {
  carniceria: 'Carnicería', distribuidor: 'Distribuidor', restaurante: 'Restaurante',
  supermercado: 'Supermercado', particular: 'Particular', botilleria: 'Botillería', otro: 'Otro',
};
const ESTADOS: EstadoProspecto[] = ['potencial', 'contactado', 'pendiente', 'cerrado'];
const ESTADO_COLORS: Record<EstadoProspecto, string> = {
  potencial: '#2196f3', contactado: '#ff9800', pendiente: '#9c27b0', cerrado: '#4caf50',
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

export default function ProspectosPage() {
  const [prospectos, setProspectos] = useState<Prospecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [convirtiendo, setConvirtiendo] = useState(false);
  const [editando, setEditando] = useState<Prospecto | null>(null);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const [confirmandoConvertir, setConfirmandoConvertir] = useState(false);

  const [nombreLocal, setNombreLocal] = useState('');
  const [nombreContacto, setNombreContacto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [comuna, setComuna] = useState('');
  const [tipo, setTipo] = useState<TipoCliente>('otro');
  const [estado, setEstado] = useState<EstadoProspecto>('potencial');
  const [observaciones, setObservaciones] = useState('');
  const [muestraEntregada, setMuestraEntregada] = useState(false);

  const fetchProspectos = useCallback(async () => {
    try {
      const { data } = await supabase.from('prospectos').select('*').order('created_at', { ascending: false });
      setProspectos(data || []);
    } catch {}
  }, []);

  useEffect(() => { fetchProspectos().finally(() => setLoading(false)); }, [fetchProspectos]);

  function cerrarModal() {
    setShowModal(false);
    setConfirmandoEliminar(false);
    setConfirmandoConvertir(false);
  }

  function abrirNuevo() {
    setEditando(null); setNombreLocal(''); setNombreContacto(''); setTelefono('');
    setDireccion(''); setComuna(''); setTipo('otro'); setEstado('potencial');
    setObservaciones(''); setMuestraEntregada(false);
    setConfirmandoEliminar(false); setConfirmandoConvertir(false);
    setShowModal(true);
  }

  function abrirEditar(p: Prospecto) {
    setEditando(p);
    setNombreLocal(p.nombre_local || '');
    setNombreContacto(p.nombre_contacto || '');
    setTelefono(p.telefono); setDireccion(p.direccion);
    setComuna('');
    setTipo(p.tipo ?? 'otro'); setEstado(p.estado ?? 'potencial');
    setObservaciones(p.observaciones || ''); setMuestraEntregada(p.muestra_entregada ?? false);
    setConfirmandoEliminar(false); setConfirmandoConvertir(false);
    setShowModal(true);
  }

  async function handleGuardar() {
    if (!nombreLocal || !telefono) return;
    setSaving(true);
    const direccionCompleta = comuna ? `${direccion}, ${comuna}` : direccion;
    try {
      const payload = {
        nombre_local: nombreLocal,
        nombre_contacto: nombreContacto || null,
        telefono,
        direccion: direccionCompleta,
        tipo,
        estado,
        observaciones: observaciones || null,
        muestra_entregada: muestraEntregada ?? false,
      };
      if (editando) {
        const { error } = await supabase.from('prospectos').update(payload).eq('id', editando.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('prospectos').insert(payload);
        if (error) throw new Error(error.message);
      }
      cerrarModal();
      await fetchProspectos();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      alert('Error al guardar: ' + msg);
    }
    setSaving(false);
  }

  async function handleEliminar() {
    if (!editando) return;
    try {
      await supabase.from('prospectos').delete().eq('id', editando.id);
      cerrarModal();
      await fetchProspectos();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar';
      alert('Error: ' + msg);
    }
  }

  async function handleConvertirACliente() {
    if (!editando) return;
    setConvirtiendo(true);
    try {
      const { error } = await supabase.from('clientes').insert({
        nombre: editando.nombre_local,
        telefono: editando.telefono,
        direccion: editando.direccion,
        tipo: editando.tipo,
        observaciones: editando.observaciones || null,
        muestra_entregada: editando.muestra_entregada ?? false,
      });
      if (error) throw new Error(error.message);
      await supabase.from('prospectos').update({ estado: 'cerrado' }).eq('id', editando.id);
      cerrarModal();
      await fetchProspectos();
      alert(`✅ ${editando.nombre_local} fue agregado a la lista de clientes.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error desconocido al convertir';
      alert('Error al convertir: ' + msg);
    }
    setConvirtiendo(false);
  }

  const filtrados = prospectos.filter((p) =>
    (p.nombre_local || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.nombre_contacto || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Prospectos</h1>
          <p className="text-sm" style={{ color: '#6b7280' }}>{prospectos.length} prospectos</p>
        </div>
        <button onClick={abrirNuevo} className="px-4 py-2 rounded-lg font-semibold text-sm text-white" style={{ backgroundColor: '#e53935' }}>+ Nuevo</button>
      </div>

      <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar prospecto..."
        className="w-full rounded-lg px-3 py-2 mb-4 text-sm border" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

      <div className="space-y-3">
        {filtrados.map((p) => {
          const color = ESTADO_COLORS[p.estado] ?? '#6b7280';
          return (
            <div key={p.id} className="rounded-xl border p-4 cursor-pointer" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }} onClick={() => abrirEditar(p)}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold" style={{ color: '#f5f5f5' }}>{p.nombre_local || '—'}</p>
                  <p className="text-sm" style={{ color: '#9ca3af' }}>{p.nombre_contacto}</p>
                  <p className="text-xs" style={{ color: '#6b7280' }}>{p.telefono} · {p.direccion}</p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full border" style={{ color, borderColor: color + '40', backgroundColor: color + '15' }}>{p.estado}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#2a2a2a', color: '#9ca3af' }}>{TIPO_LABELS[p.tipo] ?? p.tipo}</span>
                  </div>
                </div>
                {p.muestra_entregada && <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ backgroundColor: '#4caf50' + '20', color: '#4caf50' }}>🎁 Muestra</span>}
              </div>
            </div>
          );
        })}
        {filtrados.length === 0 && <div className="text-center py-16" style={{ color: '#6b7280' }}>No hay prospectos</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 overflow-y-auto max-h-[90vh]" style={{ backgroundColor: '#141414' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg" style={{ color: '#f5f5f5' }}>{editando ? 'Editar Prospecto' : 'Nuevo Prospecto'}</h2>
              <button onClick={cerrarModal} style={{ color: '#6b7280' }}>✕</button>
            </div>

            {[{ label: 'Nombre del Local', value: nombreLocal, set: setNombreLocal }, { label: 'Nombre Contacto', value: nombreContacto, set: setNombreContacto }, { label: 'Teléfono', value: telefono, set: setTelefono }].map(({ label, value, set }) => (
              <div key={label} className="mb-3">
                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>{label}</label>
                <input value={value} onChange={(e) => set(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
              </div>
            ))}

            <div className="mb-3">
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Dirección</label>
              <input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Ej: Av. Grecia 1234"
                className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Comuna</label>
              <select value={comuna} onChange={(e) => setComuna(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: comuna ? '#f5f5f5' : '#6b7280' }}>
                <option value="">Seleccionar comuna...</option>
                {COMUNAS_SANTIAGO.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <label className="block text-xs font-semibold uppercase mb-2" style={{ color: '#6b7280' }}>Tipo</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {TIPOS.map((t) => (
                <button key={t} onClick={() => setTipo(t)} className="px-3 py-1.5 rounded-full border text-xs font-medium"
                  style={{ backgroundColor: tipo === t ? '#2196f3' + '20' : 'transparent', borderColor: tipo === t ? '#2196f3' : '#2a2a2a', color: tipo === t ? '#2196f3' : '#6b7280' }}>
                  {TIPO_LABELS[t]}
                </button>
              ))}
            </div>

            <label className="block text-xs font-semibold uppercase mb-2" style={{ color: '#6b7280' }}>Estado</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {ESTADOS.map((e) => (
                <button key={e} onClick={() => setEstado(e)} className="px-3 py-1.5 rounded-full border text-xs font-medium"
                  style={{ backgroundColor: estado === e ? ESTADO_COLORS[e] + '20' : 'transparent', borderColor: estado === e ? ESTADO_COLORS[e] : '#2a2a2a', color: estado === e ? ESTADO_COLORS[e] : '#6b7280' }}>
                  {e}
                </button>
              ))}
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Observaciones</label>
              <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2}
                className="w-full rounded-lg px-3 py-2 text-sm border resize-none" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            </div>

            <button onClick={() => setMuestraEntregada(!muestraEntregada)} className="w-full flex items-center justify-between p-3 rounded-lg border mb-4"
              style={{ backgroundColor: muestraEntregada ? '#4caf50' + '10' : '#1c1c1c', borderColor: muestraEntregada ? '#4caf50' : '#2a2a2a' }}>
              <span className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>🎁 Muestra entregada</span>
              <div className="w-10 h-5 rounded-full flex items-center px-0.5" style={{ backgroundColor: muestraEntregada ? '#4caf50' : '#2a2a2a' }}>
                <div className="w-4 h-4 rounded-full bg-white transition-transform" style={{ transform: muestraEntregada ? 'translateX(20px)' : 'translateX(0)' }} />
              </div>
            </button>

            <button onClick={handleGuardar} disabled={saving || !nombreLocal || !telefono}
              className="w-full py-3 rounded-lg font-bold text-white text-sm disabled:opacity-40 mb-2" style={{ backgroundColor: '#e53935' }}>
              {saving ? 'Guardando...' : 'GUARDAR'}
            </button>

            {/* Convertir a cliente */}
            {editando && !confirmandoConvertir && !confirmandoEliminar && (
              <button onClick={() => setConfirmandoConvertir(true)}
                className="w-full py-3 rounded-lg font-bold text-sm border mb-2"
                style={{ color: '#4caf50', borderColor: '#4caf50' + '40', backgroundColor: '#4caf50' + '10' }}>
                ✅ Pasar a lista de clientes
              </button>
            )}

            {editando && confirmandoConvertir && (
              <div className="rounded-lg border p-3 mb-2" style={{ borderColor: '#4caf50' + '60', backgroundColor: '#4caf50' + '10' }}>
                <p className="text-sm font-semibold text-center mb-3" style={{ color: '#f5f5f5' }}>
                  ¿Agregar {editando.nombre_local} como cliente?
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmandoConvertir(false)}
                    className="flex-1 py-2 rounded-lg font-bold text-sm border"
                    style={{ color: '#9ca3af', borderColor: '#2a2a2a', backgroundColor: '#1c1c1c' }}>
                    Cancelar
                  </button>
                  <button onClick={handleConvertirACliente} disabled={convirtiendo}
                    className="flex-1 py-2 rounded-lg font-bold text-sm text-white disabled:opacity-40"
                    style={{ backgroundColor: '#4caf50' }}>
                    {convirtiendo ? 'Pasando...' : 'Sí, pasar'}
                  </button>
                </div>
              </div>
            )}

            {/* Eliminar */}
            {editando && !confirmandoEliminar && !confirmandoConvertir && (
              <button onClick={() => setConfirmandoEliminar(true)}
                className="w-full py-3 rounded-lg font-bold text-sm border"
                style={{ color: '#e53935', borderColor: '#e53935' + '40', backgroundColor: '#e53935' + '10' }}>
                🗑 Eliminar prospecto
              </button>
            )}

            {editando && confirmandoEliminar && (
              <div className="rounded-lg border p-3" style={{ borderColor: '#e53935' + '60', backgroundColor: '#e53935' + '10' }}>
                <p className="text-sm font-semibold text-center mb-3" style={{ color: '#f5f5f5' }}>
                  ¿Eliminar a {editando.nombre_local}?
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmandoEliminar(false)}
                    className="flex-1 py-2 rounded-lg font-bold text-sm border"
                    style={{ color: '#9ca3af', borderColor: '#2a2a2a', backgroundColor: '#1c1c1c' }}>
                    Cancelar
                  </button>
                  <button onClick={handleEliminar}
                    className="flex-1 py-2 rounded-lg font-bold text-sm text-white"
                    style={{ backgroundColor: '#e53935' }}>
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
