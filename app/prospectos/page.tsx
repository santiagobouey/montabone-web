'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Prospecto, TipoCliente, EstadoProspecto } from '@/types';

const TIPOS: TipoCliente[] = ['carniceria', 'distribuidor', 'restaurante', 'supermercado', 'particular', 'botilleria', 'otro'];
const TIPO_LABELS: Record<TipoCliente, string> = {
  carniceria: 'Carnicería', distribuidor: 'Distribuidor', restaurante: 'Restaurante',
  supermercado: 'Supermercado', particular: 'Particular', botilleria: 'Botillería', otro: 'Otro',
};
const ESTADOS: EstadoProspecto[] = ['potencial', 'contactado', 'pendiente', 'cerrado', 'no_interesado'];
const ESTADO_COLORS: Record<EstadoProspecto, string> = {
  potencial: '#2196f3', contactado: '#ff9800', pendiente: '#9c27b0', cerrado: '#4caf50', no_interesado: '#e53935',
};
const ESTADO_LABELS: Record<EstadoProspecto, string> = {
  potencial: 'potencial', contactado: 'contactado', pendiente: 'pendiente', cerrado: 'cerrado', no_interesado: 'no interesado',
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
  const [confirmandoNoInteres, setConfirmandoNoInteres] = useState(false);
  const [confirmandoInsistir, setConfirmandoInsistir] = useState(false);

  const [nombreLocal, setNombreLocal] = useState('');
  const [nombreContacto, setNombreContacto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [comuna, setComuna] = useState('');
  const [tipo, setTipo] = useState<TipoCliente>('otro');
  const [estado, setEstado] = useState<EstadoProspecto>('potencial');
  const [observaciones, setObservaciones] = useState('');
  const [muestraEntregada, setMuestraEntregada] = useState(false);

  // Buscador IA
  interface ResultadoIA { nombre: string; direccion: string; telefono: string | null; tipo: string; nota: string | null; }
  const [showBuscador, setShowBuscador] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [agregandoIA, setAgregandoIA] = useState(false);
  const [zonaBusqueda, setZonaBusqueda] = useState('');
  const [tipoBusqueda, setTipoBusqueda] = useState('todos');
  const [resultadosIA, setResultadosIA] = useState<ResultadoIA[]>([]);
  const [seleccionadosIA, setSeleccionadosIA] = useState<Set<number>>(new Set());
  const [errorBusqueda, setErrorBusqueda] = useState('');

  const fetchProspectos = useCallback(async () => {
    try {
      const { data } = await supabase.from('prospectos').select('*').order('created_at', { ascending: false });
      setProspectos(data || []);
    } catch {}
  }, []);

  useEffect(() => { fetchProspectos().finally(() => setLoading(false)); }, [fetchProspectos]);

  async function buscarConIA() {
    if (!zonaBusqueda.trim()) return;
    setBuscando(true); setErrorBusqueda(''); setResultadosIA([]); setSeleccionadosIA(new Set());
    try {
      const res = await fetch('/api/buscar-prospectos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zona: zonaBusqueda.trim(), tipo: tipoBusqueda }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en la búsqueda');
      // Excluir los que ya existen como prospectos
      const existentes = new Set(prospectos.map((p) => (p.nombre_local || '').toLowerCase()));
      const nuevos = (data.resultados as ResultadoIA[]).filter((r) => !existentes.has(r.nombre.toLowerCase()));
      setResultadosIA(nuevos);
      // Preseleccionar todos
      setSeleccionadosIA(new Set(nuevos.map((_, i) => i)));
      if (nuevos.length === 0) setErrorBusqueda('No se encontraron locales nuevos en esa comuna (o ya los tienes como prospectos).');
    } catch (e: unknown) {
      setErrorBusqueda(e instanceof Error ? e.message : 'Error en la búsqueda');
    }
    setBuscando(false);
  }

  async function agregarSeleccionadosIA() {
    const elegidos = resultadosIA.filter((_, i) => seleccionadosIA.has(i));
    if (elegidos.length === 0) return;
    setAgregandoIA(true);
    try {
      const { error } = await supabase.from('prospectos').insert(
        elegidos.map((r) => ({
          nombre: r.nombre,
          nombre_local: r.nombre,
          nombre_contacto: null,
          telefono: r.telefono || 'Sin teléfono',
          direccion: r.direccion,
          tipo: TIPOS.includes(r.tipo as TipoCliente) ? r.tipo : 'otro',
          estado: 'potencial',
          observaciones: r.nota ? `${r.nota} · Encontrado con IA` : 'Encontrado con IA',
          muestra_entregada: false,
        }))
      );
      if (error) throw new Error(error.message);
      setShowBuscador(false);
      await fetchProspectos();
      alert(`✅ Se agregaron ${elegidos.length} prospecto${elegidos.length !== 1 ? 's' : ''} nuevos.`);
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
    setAgregandoIA(false);
  }

  function cerrarModal() {
    setShowModal(false);
    setConfirmandoEliminar(false);
    setConfirmandoConvertir(false);
    setConfirmandoNoInteres(false);
    setConfirmandoInsistir(false);
  }

  function abrirNuevo() {
    setEditando(null); setNombreLocal(''); setNombreContacto(''); setTelefono('');
    setDireccion(''); setComuna(''); setTipo('otro'); setEstado('potencial');
    setObservaciones(''); setMuestraEntregada(false);
    setConfirmandoEliminar(false); setConfirmandoConvertir(false);
    setConfirmandoNoInteres(false); setConfirmandoInsistir(false);
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
    setConfirmandoNoInteres(false); setConfirmandoInsistir(false);
    setShowModal(true);
  }

  async function handleGuardar() {
    if (!nombreLocal || !telefono) return;
    setSaving(true);
    const direccionCompleta = comuna ? `${direccion}, ${comuna}` : direccion;
    try {
      const payload = {
        nombre: nombreLocal,
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

  async function handleNoInteres() {
    if (!editando) return;
    try {
      await supabase.from('prospectos').update({ estado: 'no_interesado', proxima_visita: null }).eq('id', editando.id);
      cerrarModal();
      await fetchProspectos();
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
  }

  async function handleInsistir() {
    if (!editando) return;
    const fecha = new Date();
    fecha.setMonth(fecha.getMonth() + 2);
    const proximaVisita = fecha.toISOString().split('T')[0];
    try {
      await supabase.from('prospectos').update({ estado: 'pendiente', proxima_visita: proximaVisita }).eq('id', editando.id);
      cerrarModal();
      await fetchProspectos();
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
  }

  const hoy = new Date().toISOString().split('T')[0];

  const filtrar = (lista: Prospecto[]) => lista.filter((p) =>
    (p.nombre_local || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.nombre_contacto || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  const paraInsistir = prospectos.filter((p) => p.proxima_visita && p.proxima_visita <= hoy);
  const potenciales = filtrar(prospectos.filter((p) => p.estado === 'potencial'));
  const contactados = filtrar(prospectos.filter((p) => p.estado === 'contactado'));
  const pendientes = filtrar(prospectos.filter((p) => p.estado === 'pendiente'));
  const cerrados = filtrar(prospectos.filter((p) => p.estado === 'cerrado'));
  const noInteresados = filtrar(prospectos.filter((p) => p.estado === 'no_interesado'));

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Prospectos</h1>
          <p className="text-sm" style={{ color: '#6b7280' }}>{prospectos.length} prospectos</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowBuscador(true)} className="px-3 py-2 rounded-lg font-semibold text-sm border" style={{ borderColor: '#9c27b0', color: '#9c27b0' }}>🔍 Buscar con IA</button>
          <button onClick={abrirNuevo} className="px-4 py-2 rounded-lg font-semibold text-sm text-white" style={{ backgroundColor: '#e53935' }}>+ Nuevo</button>
        </div>
      </div>

      {/* Alerta de seguimiento */}
      {paraInsistir.length > 0 && (
        <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#9c27b0' + '15', borderColor: '#9c27b0' + '60', borderLeftWidth: 4, borderLeftColor: '#9c27b0' }}>
          <p className="font-bold text-sm mb-2" style={{ color: '#9c27b0' }}>🔔 {paraInsistir.length} prospecto{paraInsistir.length > 1 ? 's' : ''} para volver a contactar</p>
          {paraInsistir.map((p) => (
            <button key={p.id} onClick={() => abrirEditar(p)}
              className="w-full text-left py-1.5 px-2 rounded-lg mb-1 text-sm font-semibold"
              style={{ backgroundColor: '#9c27b0' + '20', color: '#f5f5f5' }}>
              📞 {p.nombre_local} — {p.nombre_contacto}
            </button>
          ))}
        </div>
      )}

      <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar prospecto..."
        className="w-full rounded-lg px-3 py-2 mb-4 text-sm border" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

      <div className="space-y-6">
        {[
          { label: '🔵 Potenciales', lista: potenciales, color: '#2196f3' },
          { label: '🟠 Contactados', lista: contactados, color: '#ff9800' },
          { label: '🟣 Pendientes de seguimiento', lista: pendientes, color: '#9c27b0' },
          { label: '✅ Cerrados (convertidos a cliente)', lista: cerrados, color: '#4caf50' },
          { label: '❌ No interesados', lista: noInteresados, color: '#e53935' },
        ].map(({ label, lista, color }) => lista.length > 0 && (
          <div key={label}>
            <p className="text-xs font-bold uppercase mb-2" style={{ color }}>{label} ({lista.length})</p>
            <div className="space-y-2">
              {lista.map((p) => (
                <div key={p.id} className="rounded-xl border p-4 cursor-pointer" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }} onClick={() => abrirEditar(p)}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold" style={{ color: '#f5f5f5' }}>{p.nombre_local || '—'}</p>
                      <p className="text-sm" style={{ color: '#9ca3af' }}>{p.nombre_contacto}</p>
                      <p className="text-xs" style={{ color: '#6b7280' }}>{p.telefono} · {p.direccion}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#2a2a2a', color: '#9ca3af' }}>{TIPO_LABELS[p.tipo] ?? p.tipo}</span>
                        {p.proxima_visita && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{
                            backgroundColor: p.proxima_visita <= hoy ? '#e53935' + '20' : '#9c27b0' + '20',
                            color: p.proxima_visita <= hoy ? '#e53935' : '#9c27b0',
                          }}>
                            📅 {p.proxima_visita <= hoy ? '¡Contactar!' : `Insistir: ${new Date(p.proxima_visita + 'T12:00:00').toLocaleDateString('es-CL')}`}
                          </span>
                        )}
                      </div>
                    </div>
                    {p.muestra_entregada && <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ backgroundColor: '#4caf50' + '20', color: '#4caf50' }}>🎁 Muestra</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {prospectos.length === 0 && <div className="text-center py-16" style={{ color: '#6b7280' }}>No hay prospectos</div>}
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
                  {ESTADO_LABELS[e]}
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

            {/* Acciones (solo al editar) */}
            {editando && !confirmandoConvertir && !confirmandoNoInteres && !confirmandoInsistir && !confirmandoEliminar && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase" style={{ color: '#6b7280' }}>Acciones</p>

                <button onClick={() => setConfirmandoConvertir(true)}
                  className="w-full py-3 rounded-lg font-bold text-sm border"
                  style={{ color: '#4caf50', borderColor: '#4caf50' + '40', backgroundColor: '#4caf50' + '10' }}>
                  ✅ Pasar a lista de clientes
                </button>

                <button onClick={() => setConfirmandoInsistir(true)}
                  className="w-full py-3 rounded-lg font-bold text-sm border"
                  style={{ color: '#9c27b0', borderColor: '#9c27b0' + '40', backgroundColor: '#9c27b0' + '10' }}>
                  📅 Volver a insistir en 2 meses
                </button>

                <button onClick={() => setConfirmandoNoInteres(true)}
                  className="w-full py-3 rounded-lg font-bold text-sm border"
                  style={{ color: '#ff9800', borderColor: '#ff9800' + '40', backgroundColor: '#ff9800' + '10' }}>
                  ❌ No le interesó
                </button>

                <button onClick={() => setConfirmandoEliminar(true)}
                  className="w-full py-3 rounded-lg font-bold text-sm border"
                  style={{ color: '#e53935', borderColor: '#e53935' + '40', backgroundColor: '#e53935' + '10' }}>
                  🗑 Eliminar prospecto
                </button>
              </div>
            )}

            {/* Confirmar: pasar a cliente */}
            {editando && confirmandoConvertir && (
              <div className="rounded-lg border p-3" style={{ borderColor: '#4caf50' + '60', backgroundColor: '#4caf50' + '10' }}>
                <p className="text-sm font-semibold text-center mb-3" style={{ color: '#f5f5f5' }}>¿Agregar {editando.nombre_local} como cliente?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmandoConvertir(false)} className="flex-1 py-2 rounded-lg font-bold text-sm border" style={{ color: '#9ca3af', borderColor: '#2a2a2a', backgroundColor: '#1c1c1c' }}>Cancelar</button>
                  <button onClick={handleConvertirACliente} disabled={convirtiendo} className="flex-1 py-2 rounded-lg font-bold text-sm text-white disabled:opacity-40" style={{ backgroundColor: '#4caf50' }}>{convirtiendo ? 'Pasando...' : 'Sí, pasar'}</button>
                </div>
              </div>
            )}

            {/* Confirmar: insistir en 2 meses */}
            {editando && confirmandoInsistir && (
              <div className="rounded-lg border p-3" style={{ borderColor: '#9c27b0' + '60', backgroundColor: '#9c27b0' + '10' }}>
                <p className="text-sm font-semibold text-center mb-1" style={{ color: '#f5f5f5' }}>¿Marcar para volver a contactar en 2 meses?</p>
                <p className="text-xs text-center mb-3" style={{ color: '#9ca3af' }}>Se guardará la fecha de seguimiento en el prospecto</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmandoInsistir(false)} className="flex-1 py-2 rounded-lg font-bold text-sm border" style={{ color: '#9ca3af', borderColor: '#2a2a2a', backgroundColor: '#1c1c1c' }}>Cancelar</button>
                  <button onClick={handleInsistir} className="flex-1 py-2 rounded-lg font-bold text-sm text-white" style={{ backgroundColor: '#9c27b0' }}>Sí, agendar</button>
                </div>
              </div>
            )}

            {/* Confirmar: no le interesó */}
            {editando && confirmandoNoInteres && (
              <div className="rounded-lg border p-3" style={{ borderColor: '#ff9800' + '60', backgroundColor: '#ff9800' + '10' }}>
                <p className="text-sm font-semibold text-center mb-3" style={{ color: '#f5f5f5' }}>¿Marcar {editando.nombre_local} como no interesado?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmandoNoInteres(false)} className="flex-1 py-2 rounded-lg font-bold text-sm border" style={{ color: '#9ca3af', borderColor: '#2a2a2a', backgroundColor: '#1c1c1c' }}>Cancelar</button>
                  <button onClick={handleNoInteres} className="flex-1 py-2 rounded-lg font-bold text-sm text-white" style={{ backgroundColor: '#ff9800' }}>Sí, marcar</button>
                </div>
              </div>
            )}

            {/* Confirmar: eliminar */}
            {editando && confirmandoEliminar && (
              <div className="rounded-lg border p-3" style={{ borderColor: '#e53935' + '60', backgroundColor: '#e53935' + '10' }}>
                <p className="text-sm font-semibold text-center mb-3" style={{ color: '#f5f5f5' }}>¿Eliminar a {editando.nombre_local}?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmandoEliminar(false)} className="flex-1 py-2 rounded-lg font-bold text-sm border" style={{ color: '#9ca3af', borderColor: '#2a2a2a', backgroundColor: '#1c1c1c' }}>Cancelar</button>
                  <button onClick={handleEliminar} className="flex-1 py-2 rounded-lg font-bold text-sm text-white" style={{ backgroundColor: '#e53935' }}>Sí, eliminar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal buscador IA */}
      {showBuscador && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 overflow-y-auto max-h-[90vh]" style={{ backgroundColor: '#141414' }}>
            <div className="flex justify-between items-center mb-1">
              <h2 className="font-bold text-lg" style={{ color: '#f5f5f5' }}>🔍 Buscar Prospectos con IA</h2>
              <button onClick={() => setShowBuscador(false)} style={{ color: '#6b7280' }}>✕</button>
            </div>
            <p className="text-xs mb-4" style={{ color: '#6b7280' }}>Busca negocios reales de una comuna y agrégalos como prospectos</p>

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Comuna</label>
            <select value={zonaBusqueda} onChange={(e) => setZonaBusqueda(e.target.value)}
              className="w-full rounded-lg px-3 py-2 mb-3 text-sm border"
              style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: zonaBusqueda ? '#f5f5f5' : '#6b7280' }}>
              <option value="">Seleccionar comuna...</option>
              {COMUNAS_SANTIAGO.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Tipo de negocio</label>
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { key: 'todos', label: 'Todos' },
                { key: 'carniceria', label: '🥩 Carnicerías' },
                { key: 'botilleria', label: '🍷 Botillerías' },
                { key: 'otro', label: '🏪 Minimarkets' },
              ].map((t) => (
                <button key={t.key} onClick={() => setTipoBusqueda(t.key)}
                  className="px-3 py-1.5 rounded-full border text-xs font-medium"
                  style={{
                    borderColor: tipoBusqueda === t.key ? '#9c27b0' : '#2a2a2a',
                    backgroundColor: tipoBusqueda === t.key ? '#9c27b020' : 'transparent',
                    color: tipoBusqueda === t.key ? '#9c27b0' : '#9ca3af',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            <button onClick={buscarConIA} disabled={buscando || !zonaBusqueda.trim()}
              className="w-full py-3 rounded-lg font-bold text-sm text-white disabled:opacity-40 mb-4"
              style={{ backgroundColor: '#9c27b0' }}>
              {buscando ? 'Buscando negocios...' : 'Buscar'}
            </button>

            {buscando && (
              <div className="flex items-center justify-center gap-2 py-4">
                <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm" style={{ color: '#9c27b0' }}>Consultando el mapa de negocios...</p>
              </div>
            )}

            {errorBusqueda && <p className="text-xs p-3 rounded-lg mb-3" style={{ backgroundColor: '#ff980015', color: '#ff9800' }}>{errorBusqueda}</p>}

            {resultadosIA.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase" style={{ color: '#6b7280' }}>
                    {resultadosIA.length} encontrados · {seleccionadosIA.size} seleccionados
                  </p>
                  <button onClick={() => setSeleccionadosIA(seleccionadosIA.size === resultadosIA.length ? new Set() : new Set(resultadosIA.map((_, i) => i)))}
                    className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#2a2a2a', color: '#9ca3af' }}>
                    {seleccionadosIA.size === resultadosIA.length ? 'Ninguno' : 'Todos'}
                  </button>
                </div>
                <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                  {resultadosIA.map((r, i) => {
                    const sel = seleccionadosIA.has(i);
                    return (
                      <button key={i} onClick={() => {
                        setSeleccionadosIA((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i); else next.add(i);
                          return next;
                        });
                      }}
                        className="w-full flex items-start gap-3 p-3 rounded-lg border text-left"
                        style={{ borderColor: sel ? '#9c27b0' : '#2a2a2a', backgroundColor: sel ? '#9c27b010' : '#1c1c1c' }}>
                        <div className="w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 mt-0.5"
                          style={{ borderColor: sel ? '#9c27b0' : '#4b5563', backgroundColor: sel ? '#9c27b0' : 'transparent' }}>
                          {sel && <span className="text-white text-xs font-bold">✓</span>}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>{r.nombre}</p>
                          <p className="text-xs" style={{ color: '#6b7280' }}>
                            {TIPO_LABELS[r.tipo as TipoCliente] ?? 'Otro'} · {r.direccion}
                            {r.telefono ? ` · 📞 ${r.telefono}` : ''}
                          </p>
                          {r.nota && <p className="text-xs" style={{ color: '#6b7280' }}>{r.nota}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button onClick={agregarSeleccionadosIA} disabled={agregandoIA || seleccionadosIA.size === 0}
                  className="w-full py-3 rounded-lg font-bold text-sm text-white disabled:opacity-40"
                  style={{ backgroundColor: '#e53935' }}>
                  {agregandoIA ? 'Agregando...' : `Agregar ${seleccionadosIA.size} como prospectos`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
