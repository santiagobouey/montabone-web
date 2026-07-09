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

export default function TareasPage() {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [loading, setLoading] = useState(true);
  const [nueva, setNueva] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchTareas = useCallback(async () => {
    const { data } = await supabase.from('tareas').select('*').order('created_at', { ascending: false });
    setTareas((data || []) as Tarea[]);
  }, []);

  useEffect(() => { fetchTareas().finally(() => setLoading(false)); }, [fetchTareas]);

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
    // Actualización optimista para que se sienta instantáneo
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

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  const pendientes = tareas.filter((t) => !t.completada);
  const completadas = tareas.filter((t) => t.completada);

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Pendientes</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
          {pendientes.length} por hacer · {completadas.length} lista{completadas.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Agregar */}
      <div className="flex gap-2 mb-6">
        <input
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }}
          placeholder="ej: Llamar al proveedor, entregar pedido..."
          className="flex-1 rounded-lg px-3 py-3 text-sm border"
          style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', color: '#f5f5f5' }}
        />
        <button onClick={agregar} disabled={saving || !nueva.trim()}
          className="px-5 rounded-lg font-bold text-sm text-white disabled:opacity-40"
          style={{ backgroundColor: '#e53935' }}>
          + Agregar
        </button>
      </div>

      {/* Por hacer */}
      {pendientes.length > 0 && (
        <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#ff9800' }}>⏳ Por hacer ({pendientes.length})</p>
          </div>
          {pendientes.map((t, i) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: i < pendientes.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
              <button onClick={() => toggle(t)}
                className="w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                style={{ borderColor: '#4b5563' }}
                aria-label="Marcar como lista" />
              <p className="flex-1 text-sm" style={{ color: '#f5f5f5' }}>{t.texto}</p>
              <button onClick={() => eliminar(t.id)} className="text-sm flex-shrink-0 px-1" style={{ color: '#4b5563' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {pendientes.length === 0 && completadas.length === 0 && (
        <div className="text-center py-12" style={{ color: '#6b7280' }}>
          <p className="text-3xl mb-2">✅</p>
          <p>No hay tareas. ¡Agrega la primera!</p>
        </div>
      )}

      {pendientes.length === 0 && completadas.length > 0 && (
        <div className="text-center py-8 mb-4" style={{ color: '#4caf50' }}>
          <p className="text-3xl mb-2">🎉</p>
          <p className="font-bold">¡Todo listo!</p>
        </div>
      )}

      {/* Completadas */}
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
  );
}
