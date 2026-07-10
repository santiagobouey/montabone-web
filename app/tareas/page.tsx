'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Tarea {
  id: string;
  texto: string;
  completada: boolean;
  created_at: string;
  completada_at: string | null;
}

interface Influencer {
  id: string;
  nombre: string;
  contactado: boolean;
  created_at: string;
  contactado_at: string | null;
}

export default function TareasPage() {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [nueva, setNueva] = useState('');
  const [nuevoInf, setNuevoInf] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingInf, setSavingInf] = useState(false);

  const fetchTareas = useCallback(async () => {
    const { data } = await supabase.from('tareas').select('*').order('created_at', { ascending: false });
    setTareas((data || []) as Tarea[]);
  }, []);

  const fetchInfluencers = useCallback(async () => {
    const { data } = await supabase.from('influencers').select('*').order('created_at', { ascending: false });
    setInfluencers((data || []) as Influencer[]);
  }, []);

  useEffect(() => {
    Promise.all([fetchTareas(), fetchInfluencers()]).finally(() => setLoading(false));
  }, [fetchTareas, fetchInfluencers]);

  // ------ Tareas ------
  async function agregar() {
    const texto = nueva.trim();
    if (!texto) return;
    setSaving(true);
    await supabase.from('tareas').insert({ texto });
    setNueva('');
    await fetchTareas();
    setSaving(false);
  }

  async function toggle(t: Tarea) {
    setTareas((prev) => prev.map((x) => x.id === t.id ? { ...x, completada: !t.completada } : x));
    await supabase.from('tareas').update({
      completada: !t.completada,
      completada_at: !t.completada ? new Date().toISOString() : null,
    }).eq('id', t.id);
    await fetchTareas();
  }

  async function eliminar(id: string) {
    setTareas((prev) => prev.filter((x) => x.id !== id));
    await supabase.from('tareas').delete().eq('id', id);
  }

  async function limpiarCompletadas() {
    const ids = tareas.filter((t) => t.completada).map((t) => t.id);
    if (ids.length === 0) return;
    setTareas((prev) => prev.filter((t) => !t.completada));
    await supabase.from('tareas').delete().in('id', ids);
  }

  // ------ Influencers ------
  async function agregarInf() {
    const nombre = nuevoInf.trim();
    if (!nombre) return;
    setSavingInf(true);
    await supabase.from('influencers').insert({ nombre });
    setNuevoInf('');
    await fetchInfluencers();
    setSavingInf(false);
  }

  async function toggleInf(inf: Influencer) {
    setInfluencers((prev) => prev.map((x) => x.id === inf.id ? { ...x, contactado: !inf.contactado } : x));
    await supabase.from('influencers').update({
      contactado: !inf.contactado,
      contactado_at: !inf.contactado ? new Date().toISOString() : null,
    }).eq('id', inf.id);
    await fetchInfluencers();
  }

  async function eliminarInf(id: string) {
    setInfluencers((prev) => prev.filter((x) => x.id !== id));
    await supabase.from('influencers').delete().eq('id', id);
  }

  async function limpiarContactados() {
    const ids = influencers.filter((i) => i.contactado).map((i) => i.id);
    if (ids.length === 0) return;
    setInfluencers((prev) => prev.filter((i) => !i.contactado));
    await supabase.from('influencers').delete().in('id', ids);
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  const pendientes = tareas.filter((t) => !t.completada);
  const completadas = tareas.filter((t) => t.completada);
  const porContactar = influencers.filter((i) => !i.contactado);
  const contactados = influencers.filter((i) => i.contactado);

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Pendientes</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
          {pendientes.length} por hacer · {porContactar.length} influencer{porContactar.length !== 1 ? 's' : ''} por contactar
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 items-start">

        {/* ===== Columna 1: Tareas ===== */}
        <div>
          <p className="text-sm font-bold mb-3" style={{ color: '#f5f5f5' }}>📝 Cosas por hacer</p>

          <div className="flex gap-2 mb-4">
            <input
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }}
              placeholder="ej: Llamar al proveedor..."
              className="flex-1 min-w-0 rounded-lg px-3 py-3 text-sm border"
              style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', color: '#f5f5f5' }}
            />
            <button onClick={agregar} disabled={saving || !nueva.trim()}
              className="px-4 rounded-lg font-bold text-sm text-white disabled:opacity-40 flex-shrink-0"
              style={{ backgroundColor: '#e53935' }}>
              +
            </button>
          </div>

          {pendientes.length > 0 && (
            <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#ff9800' }}>⏳ Por hacer ({pendientes.length})</p>
              </div>
              {pendientes.map((t, i) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: i < pendientes.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
                  <button onClick={() => toggle(t)}
                    className="w-6 h-6 rounded-full border-2 flex-shrink-0"
                    style={{ borderColor: '#4b5563' }}
                    aria-label="Marcar como lista" />
                  <p className="flex-1 text-sm" style={{ color: '#f5f5f5' }}>{t.texto}</p>
                  <button onClick={() => eliminar(t.id)} className="text-sm flex-shrink-0 px-1" style={{ color: '#4b5563' }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {pendientes.length === 0 && (
            <div className="text-center py-8 mb-4 rounded-xl border" style={{ color: '#4caf50', backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
              <p className="text-2xl mb-1">🎉</p>
              <p className="font-bold text-sm">¡Todo listo!</p>
            </div>
          )}

          {completadas.length > 0 && (
            <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: '#2a2a2a' }}>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#4caf50' }}>✅ Listas ({completadas.length})</p>
                <button onClick={limpiarCompletadas} className="text-xs px-2 py-1 rounded border"
                  style={{ borderColor: '#2a2a2a', color: '#6b7280' }}>
                  Borrar todas
                </button>
              </div>
              {completadas.map((t, i) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: i < completadas.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
                  <button onClick={() => toggle(t)}
                    className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: '#4caf50' }}
                    aria-label="Desmarcar">
                    <span className="text-white text-xs font-bold">✓</span>
                  </button>
                  <p className="flex-1 text-sm line-through" style={{ color: '#6b7280' }}>{t.texto}</p>
                  <button onClick={() => eliminar(t.id)} className="text-sm flex-shrink-0 px-1" style={{ color: '#4b5563' }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== Columna 2: Influencers ===== */}
        <div>
          <p className="text-sm font-bold mb-3" style={{ color: '#f5f5f5' }}>📣 Influencers por contactar</p>

          <div className="flex gap-2 mb-4">
            <input
              value={nuevoInf}
              onChange={(e) => setNuevoInf(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') agregarInf(); }}
              placeholder="ej: @parrillero.cl, Juan Asados..."
              className="flex-1 min-w-0 rounded-lg px-3 py-3 text-sm border"
              style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', color: '#f5f5f5' }}
            />
            <button onClick={agregarInf} disabled={savingInf || !nuevoInf.trim()}
              className="px-4 rounded-lg font-bold text-sm text-white disabled:opacity-40 flex-shrink-0"
              style={{ backgroundColor: '#9c27b0' }}>
              +
            </button>
          </div>

          {porContactar.length > 0 && (
            <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#9c27b0' }}>📞 Por contactar ({porContactar.length})</p>
              </div>
              {porContactar.map((inf, i) => (
                <div key={inf.id} className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: i < porContactar.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
                  <button onClick={() => toggleInf(inf)}
                    className="w-6 h-6 rounded-full border-2 flex-shrink-0"
                    style={{ borderColor: '#9c27b0' }}
                    aria-label="Marcar como contactado" />
                  <p className="flex-1 text-sm" style={{ color: '#f5f5f5' }}>{inf.nombre}</p>
                  <button onClick={() => eliminarInf(inf.id)} className="text-sm flex-shrink-0 px-1" style={{ color: '#4b5563' }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {porContactar.length === 0 && (
            <div className="text-center py-8 mb-4 rounded-xl border" style={{ color: '#6b7280', backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
              <p className="text-2xl mb-1">📣</p>
              <p className="text-sm">No hay influencers por contactar</p>
            </div>
          )}

          {contactados.length > 0 && (
            <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: '#2a2a2a' }}>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#4caf50' }}>✅ Contactados ({contactados.length})</p>
                <button onClick={limpiarContactados} className="text-xs px-2 py-1 rounded border"
                  style={{ borderColor: '#2a2a2a', color: '#6b7280' }}>
                  Borrar todos
                </button>
              </div>
              {contactados.map((inf, i) => (
                <div key={inf.id} className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: i < contactados.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
                  <button onClick={() => toggleInf(inf)}
                    className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: '#4caf50' }}
                    aria-label="Desmarcar">
                    <span className="text-white text-xs font-bold">✓</span>
                  </button>
                  <p className="flex-1 text-sm line-through" style={{ color: '#6b7280' }}>{inf.nombre}</p>
                  <button onClick={() => eliminarInf(inf.id)} className="text-sm flex-shrink-0 px-1" style={{ color: '#4b5563' }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
