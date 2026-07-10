'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface DatosCliente {
  id: string;
  nombre: string;
  razon_social: string | null;
  rut: string | null;
  giro: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  nombre_contacto: string | null;
  tipo: string | null;
}

const TIPO_LABELS: Record<string, string> = {
  carniceria: 'Carnicería', distribuidor: 'Distribuidor', restaurante: 'Restaurante',
  supermercado: 'Supermercado', particular: 'Particular', botilleria: 'Botillería', otro: 'Otro',
};

export default function DatosClientesPage() {
  const [clientes, setClientes] = useState<DatosCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<DatosCliente | null>(null);
  const [saving, setSaving] = useState(false);

  // Form
  const [razonSocial, setRazonSocial] = useState('');
  const [rut, setRut] = useState('');
  const [giro, setGiro] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [nombreContacto, setNombreContacto] = useState('');

  const fetchClientes = useCallback(async () => {
    const { data } = await supabase.from('clientes')
      .select('id, nombre, razon_social, rut, giro, direccion, telefono, email, nombre_contacto, tipo')
      .order('nombre');
    setClientes((data || []) as DatosCliente[]);
  }, []);

  useEffect(() => { fetchClientes().finally(() => setLoading(false)); }, [fetchClientes]);

  function abrirEditar(c: DatosCliente) {
    setEditando(c);
    setRazonSocial(c.razon_social || '');
    setRut(c.rut || '');
    setGiro(c.giro || '');
    setDireccion(c.direccion || '');
    setTelefono(c.telefono || '');
    setEmail(c.email || '');
    setNombreContacto(c.nombre_contacto || '');
  }

  async function guardar() {
    if (!editando) return;
    setSaving(true);
    try {
      await supabase.from('clientes').update({
        razon_social: razonSocial || null,
        rut: rut || null,
        giro: giro || null,
        direccion: direccion || null,
        telefono: telefono || null,
        email: email || null,
        nombre_contacto: nombreContacto || null,
      }).eq('id', editando.id);
      setEditando(null);
      await fetchClientes();
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
    setSaving(false);
  }

  function exportarCSV() {
    const encabezado = ['Nombre', 'Razón Social', 'RUT', 'Giro', 'Dirección', 'Teléfono', 'Email', 'Contacto', 'Tipo'];
    const filas = clientes.map((c) => [
      c.nombre, c.razon_social || '', c.rut || '', c.giro || '', c.direccion || '',
      c.telefono || '', c.email || '', c.nombre_contacto || '', TIPO_LABELS[c.tipo || ''] || c.tipo || '',
    ]);
    const contenido = [encabezado, ...filas]
      .map((fila) => fila.map((celda) => `"${String(celda).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'datos-clientes.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  const filtrados = clientes.filter((c) =>
    (c.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (c.razon_social || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (c.rut || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  const sinDatos = clientes.filter((c) => !c.rut || !c.razon_social).length;

  const Dato = ({ label, valor }: { label: string; valor: string | null }) => (
    <div>
      <p className="text-xs" style={{ color: '#6b7280' }}>{label}</p>
      <p className="text-sm font-semibold" style={{ color: valor ? '#f5f5f5' : '#4b5563' }}>{valor || '—'}</p>
    </div>
  );

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Datos Clientes</h1>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Ficha completa para facturación: RUT, razón social, giro y contacto</p>
        </div>
        <button onClick={exportarCSV} className="px-3 py-2 rounded-lg text-xs font-bold border flex-shrink-0" style={{ borderColor: '#2196f3', color: '#2196f3' }}>
          ⬇️ CSV
        </button>
      </div>

      {sinDatos > 0 && (
        <p className="text-xs p-3 rounded-lg mb-4" style={{ backgroundColor: '#ff980015', color: '#ff9800' }}>
          ⚠️ {sinDatos} cliente{sinDatos !== 1 ? 's' : ''} sin RUT o razón social — completa sus datos para poder facturar.
        </p>
      )}

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="🔍 Buscar por nombre, razón social o RUT..."
        className="w-full rounded-lg px-3 py-3 text-sm border mb-4"
        style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', color: '#f5f5f5' }}
      />

      <div className="space-y-3">
        {filtrados.map((c) => {
          const completo = c.rut && c.razon_social;
          return (
            <div key={c.id} className="rounded-xl border p-4 cursor-pointer" onClick={() => abrirEditar(c)}
              style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: completo ? '#4caf50' : '#ff9800' }}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-bold" style={{ color: '#f5f5f5' }}>{c.nombre}</p>
                  <p className="text-xs" style={{ color: '#6b7280' }}>{TIPO_LABELS[c.tipo || ''] || c.tipo || '—'}</p>
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-full" style={{
                  backgroundColor: completo ? '#4caf5020' : '#ff980020',
                  color: completo ? '#4caf50' : '#ff9800',
                }}>
                  {completo ? '✓ Completo' : 'Faltan datos'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Dato label="Razón social" valor={c.razon_social} />
                <Dato label="RUT" valor={c.rut} />
                <Dato label="Giro" valor={c.giro} />
                <Dato label="Dirección" valor={c.direccion} />
                <Dato label="Teléfono" valor={c.telefono} />
                <Dato label="Email" valor={c.email} />
                <Dato label="Contacto" valor={c.nombre_contacto} />
              </div>
            </div>
          );
        })}
        {filtrados.length === 0 && (
          <div className="text-center py-12" style={{ color: '#6b7280' }}>No hay clientes</div>
        )}
      </div>

      {/* Modal editar */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 overflow-y-auto max-h-[90vh]" style={{ backgroundColor: '#141414' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg" style={{ color: '#f5f5f5' }}>📇 {editando.nombre}</h2>
              <button onClick={() => setEditando(null)} style={{ color: '#6b7280' }}>✕</button>
            </div>

            {[
              { label: 'Razón Social', value: razonSocial, set: setRazonSocial, placeholder: 'ej: Comercial La Alianza SpA' },
              { label: 'RUT', value: rut, set: setRut, placeholder: 'ej: 76.123.456-7' },
              { label: 'Giro', value: giro, set: setGiro, placeholder: 'ej: Venta al por menor de carnes' },
              { label: 'Dirección', value: direccion, set: setDireccion, placeholder: 'Calle, número, comuna' },
              { label: 'Teléfono', value: telefono, set: setTelefono, placeholder: '+56 9 ...' },
              { label: 'Email', value: email, set: setEmail, placeholder: 'correo@ejemplo.cl' },
              { label: 'Nombre de contacto', value: nombreContacto, set: setNombreContacto, placeholder: 'Persona con quien tratas' },
            ].map(({ label, value, set, placeholder }) => (
              <div key={label} className="mb-3">
                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>{label}</label>
                <input value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder}
                  className="w-full rounded-lg px-3 py-2 text-sm border"
                  style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
              </div>
            ))}

            <button onClick={guardar} disabled={saving}
              className="w-full py-3 rounded-lg font-bold text-white text-sm disabled:opacity-40 mt-2"
              style={{ backgroundColor: '#e53935' }}>
              {saving ? 'Guardando...' : 'GUARDAR'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
