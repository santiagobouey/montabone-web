'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

type Tipo = 'emitida' | 'compra';

interface Factura {
  id: string;
  tipo: Tipo;
  monto: number;
  neto: number;
  iva: number;
  contraparte: string | null;
  descripcion: string | null;
  fecha: string;
  archivo_url: string | null;
  archivo_nombre: string | null;
  created_at: string;
}

export default function FacturasPage() {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'todas' | Tipo>('todas');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [facturaAEliminar, setFacturaAEliminar] = useState<Factura | null>(null);

  // Form
  const [tipo, setTipo] = useState<Tipo>('compra');
  const [neto, setNeto] = useState('');
  const [contraparte, setContraparte] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [archivo, setArchivo] = useState<File | null>(null);

  const netoNum = neto ? parseInt(neto) : 0;
  const ivaNum = Math.round(netoNum * 0.19);
  const totalNum = netoNum + ivaNum;

  const fetchFacturas = useCallback(async () => {
    const { data } = await supabase.from('facturas').select('*').order('fecha', { ascending: false });
    setFacturas((data || []) as Factura[]);
  }, []);

  useEffect(() => { fetchFacturas().finally(() => setLoading(false)); }, [fetchFacturas]);

  function abrirNueva(t: Tipo) {
    setTipo(t); setNeto(''); setContraparte(''); setDescripcion('');
    setFecha(new Date().toISOString().split('T')[0]); setArchivo(null);
    setShowModal(true);
  }

  async function guardar() {
    if (netoNum <= 0) return;
    setSaving(true);
    try {
      let archivoUrl: string | null = null;
      let archivoNombre: string | null = null;
      if (archivo) {
        const ext = archivo.name.split('.').pop();
        const path = `${tipo}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('facturas').upload(path, archivo, { upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('facturas').getPublicUrl(path);
        archivoUrl = pub.publicUrl;
        archivoNombre = archivo.name;
      }
      const { error } = await supabase.from('facturas').insert({
        tipo, monto: totalNum, neto: netoNum, iva: ivaNum, contraparte: contraparte || null,
        descripcion: descripcion || null, fecha,
        archivo_url: archivoUrl, archivo_nombre: archivoNombre,
      });
      if (error) throw error;
      setShowModal(false);
      await fetchFacturas();
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
    setSaving(false);
  }

  async function eliminar() {
    if (!facturaAEliminar) return;
    // Borrar archivo del storage si existe
    if (facturaAEliminar.archivo_url) {
      const idx = facturaAEliminar.archivo_url.indexOf('/facturas/');
      if (idx !== -1) {
        const path = facturaAEliminar.archivo_url.slice(idx + '/facturas/'.length);
        await supabase.storage.from('facturas').remove([path]);
      }
    }
    await supabase.from('facturas').delete().eq('id', facturaAEliminar.id);
    setFacturaAEliminar(null);
    await fetchFacturas();
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  const filtradas = facturas.filter((f) => filtro === 'todas' || f.tipo === filtro);
  const totalEmitidas = facturas.filter((f) => f.tipo === 'emitida').reduce((s, f) => s + f.monto, 0);
  const totalCompras = facturas.filter((f) => f.tipo === 'compra').reduce((s, f) => s + f.monto, 0);

  const colorTipo = (t: Tipo) => (t === 'emitida' ? '#4caf50' : '#e53935');
  const labelTipo = (t: Tipo) => (t === 'emitida' ? 'Emitida' : 'Compra');

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Facturas</h1>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Sube y guarda tus facturas emitidas y de compra</p>
        </div>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <p className="text-xs" style={{ color: '#6b7280' }}>📤 Emitidas (a clientes)</p>
          <p className="text-2xl font-extrabold" style={{ color: '#4caf50' }}>{fmt(totalEmitidas)}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <p className="text-xs" style={{ color: '#6b7280' }}>📥 Compra (pagadas)</p>
          <p className="text-2xl font-extrabold" style={{ color: '#e53935' }}>{fmt(totalCompras)}</p>
        </div>
      </div>

      {/* Botones subir */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button onClick={() => abrirNueva('emitida')} className="py-3 rounded-lg font-bold text-sm text-white" style={{ backgroundColor: '#4caf50' }}>
          + Factura emitida
        </button>
        <button onClick={() => abrirNueva('compra')} className="py-3 rounded-lg font-bold text-sm text-white" style={{ backgroundColor: '#e53935' }}>
          + Factura de compra
        </button>
      </div>

      {/* Filtro */}
      <div className="flex gap-2 mb-4">
        {(['todas', 'emitida', 'compra'] as const).map((f) => (
          <button key={f} onClick={() => setFiltro(f)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold border capitalize"
            style={{
              borderColor: filtro === f ? '#e53935' : '#2a2a2a',
              backgroundColor: filtro === f ? '#e5393520' : 'transparent',
              color: filtro === f ? '#e53935' : '#9ca3af',
            }}>
            {f === 'todas' ? 'Todas' : f === 'emitida' ? 'Emitidas' : 'Compra'}
          </button>
        ))}
      </div>

      {/* Lista */}
      {filtradas.length === 0 ? (
        <div className="text-center py-12" style={{ color: '#6b7280' }}>
          <p className="text-3xl mb-2">🧾</p>
          <p>No hay facturas todavía</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map((f) => (
            <div key={f.id} className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
              <div className="flex justify-between items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: colorTipo(f.tipo) + '20', color: colorTipo(f.tipo) }}>
                      {labelTipo(f.tipo)}
                    </span>
                    <span className="text-xs" style={{ color: '#6b7280' }}>{new Date(f.fecha + 'T12:00:00').toLocaleDateString('es-CL')}</span>
                  </div>
                  <p className="font-bold" style={{ color: '#f5f5f5' }}>{fmt(f.monto)}</p>
                  {(f.neto > 0 || f.iva > 0) && <p className="text-xs" style={{ color: '#6b7280' }}>Neto {fmt(f.neto)} + IVA {fmt(f.iva)}</p>}
                  {f.contraparte && <p className="text-sm" style={{ color: '#9ca3af' }}>{f.contraparte}</p>}
                  {f.descripcion && <p className="text-xs" style={{ color: '#6b7280' }}>{f.descripcion}</p>}
                  {f.archivo_url && (
                    <a href={f.archivo_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs mt-2 px-2 py-1 rounded border"
                      style={{ borderColor: '#2196f340', color: '#2196f3', backgroundColor: '#2196f310' }}>
                      📎 Ver archivo
                    </a>
                  )}
                </div>
                <button onClick={() => setFacturaAEliminar(f)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center border text-base flex-shrink-0"
                  style={{ borderColor: '#e5393520', backgroundColor: '#e5393510' }}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal nueva factura */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 overflow-y-auto max-h-[90vh]" style={{ backgroundColor: '#141414' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg" style={{ color: '#f5f5f5' }}>
                {tipo === 'emitida' ? '📤 Factura emitida' : '📥 Factura de compra'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ color: '#6b7280' }}>✕</button>
            </div>

            <div className="flex gap-2 mb-4">
              {(['compra', 'emitida'] as const).map((t) => (
                <button key={t} onClick={() => setTipo(t)}
                  className="flex-1 py-2 rounded-lg border text-xs font-semibold"
                  style={{
                    borderColor: tipo === t ? colorTipo(t) : '#2a2a2a',
                    backgroundColor: tipo === t ? colorTipo(t) + '20' : 'transparent',
                    color: tipo === t ? colorTipo(t) : '#9ca3af',
                  }}>
                  {t === 'emitida' ? '📤 Emitida' : '📥 Compra'}
                </button>
              ))}
            </div>

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Monto neto</label>
            <div className="flex items-center gap-2 mb-3">
              <span style={{ color: '#6b7280' }}>$</span>
              <input type="number" value={neto} onChange={(e) => setNeto(e.target.value)} placeholder="ej: 126.050"
                className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-lg p-2 text-center" style={{ backgroundColor: '#1c1c1c' }}>
                <p className="text-xs" style={{ color: '#6b7280' }}>Neto</p>
                <p className="text-sm font-bold" style={{ color: '#9ca3af' }}>{fmt(netoNum)}</p>
              </div>
              <div className="rounded-lg p-2 text-center" style={{ backgroundColor: '#1c1c1c' }}>
                <p className="text-xs" style={{ color: '#6b7280' }}>IVA 19%</p>
                <p className="text-sm font-bold" style={{ color: '#ff9800' }}>{fmt(ivaNum)}</p>
              </div>
              <div className="rounded-lg p-2 text-center" style={{ backgroundColor: colorTipo(tipo) + '15' }}>
                <p className="text-xs" style={{ color: '#6b7280' }}>Total</p>
                <p className="text-sm font-extrabold" style={{ color: colorTipo(tipo) }}>{fmt(totalNum)}</p>
              </div>
            </div>

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>{tipo === 'emitida' ? 'Cliente' : 'Proveedor'} (opcional)</label>
            <input value={contraparte} onChange={(e) => setContraparte(e.target.value)} placeholder={tipo === 'emitida' ? 'Nombre del cliente' : 'Nombre del proveedor'}
              className="w-full rounded-lg px-3 py-2 text-sm border mb-3" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm border mb-3" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Descripción (opcional)</label>
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="ej: N° factura, detalle..."
              className="w-full rounded-lg px-3 py-2 text-sm border mb-3" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Archivo (PDF o foto)</label>
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] || null)}
              className="w-full text-sm mb-1" style={{ color: '#9ca3af' }} />
            {archivo && <p className="text-xs mb-3" style={{ color: '#4caf50' }}>✓ {archivo.name}</p>}
            {!archivo && <div className="mb-3" />}

            <button onClick={guardar} disabled={saving || netoNum <= 0}
              className="w-full py-3 rounded-lg font-bold text-sm text-white disabled:opacity-40"
              style={{ backgroundColor: colorTipo(tipo) }}>
              {saving ? 'Subiendo...' : 'Guardar factura'}
            </button>
          </div>
        </div>
      )}

      {/* Modal eliminar */}
      {facturaAEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: '#141414' }}>
            <p className="text-lg font-bold mb-2" style={{ color: '#f5f5f5' }}>¿Eliminar factura?</p>
            <p className="text-sm mb-4" style={{ color: '#6b7280' }}>Se eliminará la factura de {fmt(facturaAEliminar.monto)} y su archivo.</p>
            <div className="flex gap-3">
              <button onClick={() => setFacturaAEliminar(null)} className="flex-1 py-3 rounded-lg font-bold text-sm border" style={{ borderColor: '#2a2a2a', color: '#6b7280' }}>Cancelar</button>
              <button onClick={eliminar} className="flex-1 py-3 rounded-lg font-bold text-sm text-white" style={{ backgroundColor: '#e53935' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
