'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

interface FacturaCosto {
  id: string;
  monto: number;
  neto: number;
  iva: number;
  proveedor: string | null;
  descripcion: string | null;
  archivo_url: string | null;
  archivo_nombre: string | null;
  pagada: boolean;
  created_at: string;
}

export default function ProveedoresPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [neto, setNeto] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [proveedorNuevo, setProveedorNuevo] = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [analizado, setAnalizado] = useState(false);
  const [historial, setHistorial] = useState<FacturaCosto[]>([]);
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([]);
  const [facturaAEliminar, setFacturaAEliminar] = useState<FacturaCosto | null>(null);

  const fetchDatos = useCallback(async () => {
    const [cRes, pRes] = await Promise.all([
      supabase.from('costos_factura').select('id, monto, neto, iva, proveedor, descripcion, archivo_url, archivo_nombre, pagada, created_at').is('periodo_id', null).order('created_at', { ascending: false }),
      supabase.from('proveedores').select('id, nombre').order('nombre'),
    ]);
    setHistorial((cRes.data || []) as FacturaCosto[]);
    setProveedores(pRes.data || []);
  }, []);

  useEffect(() => { fetchDatos().finally(() => setLoading(false)); }, [fetchDatos]);

  const netoNum = neto ? parseInt(neto) : 0;
  const ivaNum = Math.round(netoNum * 0.19);
  const totalNum = netoNum + ivaNum;
  const totalPagado = historial.reduce((s, f) => s + f.monto, 0);
  const totalPorPagar = historial.filter((f) => !f.pagada).reduce((s, f) => s + f.monto, 0);
  const totalYaPagado = historial.filter((f) => f.pagada).reduce((s, f) => s + f.monto, 0);

  async function analizarArchivo(file: File) {
    setArchivo(file);
    setAnalizado(false);
    setAnalizando(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/leer-factura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType: file.type }),
      });
      if (!res.ok) throw new Error('No se pudo analizar');
      const datos = await res.json();

      if (datos.neto) setNeto(String(datos.neto));
      else if (datos.total) setNeto(String(Math.round(datos.total / 1.19)));

      if (datos.contraparte) {
        const nombre = String(datos.contraparte);
        const match = proveedores.find((p) => p.nombre.toLowerCase() === nombre.toLowerCase() || nombre.toLowerCase().includes(p.nombre.toLowerCase()) || p.nombre.toLowerCase().includes(nombre.toLowerCase()));
        if (match) { setProveedor(match.nombre); setProveedorNuevo(false); }
        else { setProveedor(nombre); setProveedorNuevo(true); }
      }
      if (datos.numero) setDescripcion(`Factura N° ${datos.numero}`);
      setAnalizado(true);
    } catch {
      // Si falla, el usuario llena los datos a mano
    }
    setAnalizando(false);
  }

  async function guardar() {
    if (netoNum <= 0) return;
    setSaving(true);
    try {
      let archivoUrl: string | null = null;
      let archivoNombre: string | null = null;
      if (archivo) {
        const ext = archivo.name.split('.').pop();
        const path = `proveedores/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('facturas').upload(path, archivo);
        if (upErr) throw upErr;
        archivoUrl = supabase.storage.from('facturas').getPublicUrl(path).data.publicUrl;
        archivoNombre = archivo.name;
      }

      await supabase.from('costos_factura').insert({
        monto: totalNum, neto: netoNum, iva: ivaNum,
        proveedor: proveedor.trim() || null, descripcion: descripcion || null,
        archivo_url: archivoUrl, archivo_nombre: archivoNombre,
      });

      // Guardar proveedor nuevo para reutilizarlo
      if (proveedor.trim() && !proveedores.some((p) => p.nombre.toLowerCase() === proveedor.trim().toLowerCase())) {
        await supabase.from('proveedores').insert({ nombre: proveedor.trim() });
      }

      setNeto(''); setProveedor(''); setProveedorNuevo(false); setDescripcion(''); setArchivo(null); setAnalizado(false);
      await fetchDatos();
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
    setSaving(false);
  }

  async function eliminar() {
    if (!facturaAEliminar) return;
    await supabase.from('costos_factura').delete().eq('id', facturaAEliminar.id);
    setFacturaAEliminar(null);
    await fetchDatos();
  }

  async function togglePagada(f: FacturaCosto) {
    const nuevo = !f.pagada;
    setHistorial((prev) => prev.map((x) => x.id === f.id ? { ...x, pagada: nuevo } : x)); // optimista
    await supabase.from('costos_factura').update({ pagada: nuevo }).eq('id', f.id);
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Proveedores</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Sube las facturas de tus proveedores. Cuentan como costo (utilidad = ventas − costos).</p>
      </div>

      {/* Total pagado */}
      <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderLeftWidth: 4, borderColor: '#2a2a2a', borderLeftColor: '#e53935' }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>🧾 Total en costos (período actual)</p>
        <p className="text-3xl font-extrabold" style={{ color: '#e53935' }}>{fmt(totalPagado)}</p>
        <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{historial.length} factura{historial.length !== 1 ? 's' : ''} de proveedor</p>
      </div>

      {/* Pagado vs por pagar */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: '#4caf50' }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>✅ Pagado</p>
          <p className="text-xl font-extrabold" style={{ color: '#4caf50' }}>{fmt(totalYaPagado)}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: '#ff9800' }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>⏳ Por pagar</p>
          <p className="text-xl font-extrabold" style={{ color: '#ff9800' }}>{fmt(totalPorPagar)}</p>
        </div>
      </div>

      {/* Formulario nueva factura */}
      <div className="rounded-xl border p-4 mb-6" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: '#6b7280' }}>➕ Factura de proveedor</p>

        {/* Subir factura y leer con IA */}
        <div className="rounded-lg border p-3 mb-4" style={{ borderColor: analizado ? '#4caf50' : '#2a2a2a', backgroundColor: analizado ? '#4caf5010' : '#1c1c1c' }}>
          <label className="block text-xs font-semibold uppercase mb-2" style={{ color: '#6b7280' }}>📎 Sube la factura y se llena solo</label>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) analizarArchivo(f); }}
            className="w-full text-sm" style={{ color: '#9ca3af' }} disabled={analizando} />
          {analizando && (
            <div className="flex items-center gap-2 mt-2">
              <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs" style={{ color: '#ff9800' }}>Leyendo factura con IA...</p>
            </div>
          )}
          {analizado && <p className="text-xs mt-2" style={{ color: '#4caf50' }}>✓ Datos extraídos — revisa que estén correctos</p>}
          {archivo && !analizando && <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{archivo.name}</p>}
        </div>

        <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Proveedor</label>
        {!proveedorNuevo ? (
          <select value={proveedores.some((p) => p.nombre === proveedor) ? proveedor : ''}
            onChange={(e) => { if (e.target.value === '__nuevo__') { setProveedorNuevo(true); setProveedor(''); } else setProveedor(e.target.value); }}
            className="w-full rounded-lg px-3 py-2 mb-3 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: proveedor ? '#f5f5f5' : '#6b7280' }}>
            <option value="">— Seleccionar proveedor —</option>
            {proveedores.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
            <option value="__nuevo__">➕ Nuevo proveedor...</option>
          </select>
        ) : (
          <div className="flex gap-2 mb-3">
            <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} autoFocus placeholder="Nombre del proveedor"
              className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#4caf50', color: '#f5f5f5' }} />
            <button onClick={() => { setProveedorNuevo(false); setProveedor(''); }} className="px-3 rounded-lg border text-xs flex-shrink-0" style={{ borderColor: '#2a2a2a', color: '#6b7280' }}>Lista</button>
          </div>
        )}

        <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Monto neto</label>
        <div className="flex items-center gap-2 mb-3">
          <span style={{ color: '#6b7280' }}>$</span>
          <input type="number" value={neto} onChange={(e) => setNeto(e.target.value)} placeholder="ej: 1.260.504"
            className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
        </div>

        {/* Desglose IVA / Total */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-lg p-2 text-center" style={{ backgroundColor: '#1c1c1c' }}>
            <p className="text-xs" style={{ color: '#6b7280' }}>Neto</p>
            <p className="text-sm font-bold" style={{ color: '#9ca3af' }}>{fmt(netoNum)}</p>
          </div>
          <div className="rounded-lg p-2 text-center" style={{ backgroundColor: '#1c1c1c' }}>
            <p className="text-xs" style={{ color: '#6b7280' }}>IVA 19%</p>
            <p className="text-sm font-bold" style={{ color: '#ff9800' }}>{fmt(ivaNum)}</p>
          </div>
          <div className="rounded-lg p-2 text-center" style={{ backgroundColor: '#4caf5015' }}>
            <p className="text-xs" style={{ color: '#6b7280' }}>Total</p>
            <p className="text-sm font-extrabold" style={{ color: '#4caf50' }}>{fmt(totalNum)}</p>
          </div>
        </div>

        <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Descripción (opcional)</label>
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="ej: Insumos, carne, envases..."
          className="w-full rounded-lg px-3 py-2 text-sm border mb-3" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

        <button onClick={guardar} disabled={saving || netoNum <= 0 || analizando}
          className="w-full py-3 rounded-lg font-bold text-sm text-white disabled:opacity-40"
          style={{ backgroundColor: guardado ? '#4caf50' : '#e53935' }}>
          {saving ? 'Guardando...' : guardado ? '✓ Guardado' : 'Guardar factura'}
        </button>
      </div>

      {/* Historial */}
      {historial.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>📋 Facturas del período actual</p>
          </div>
          {historial.map((f, i) => (
            <div key={f.id} className="flex items-center justify-between px-4 py-3 gap-2" style={{ borderBottom: i < historial.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>{f.proveedor || 'Sin proveedor'} · {fmt(f.monto)}</p>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full border"
                    style={{ color: f.pagada ? '#4caf50' : '#ff9800', backgroundColor: (f.pagada ? '#4caf50' : '#ff9800') + '20', borderColor: (f.pagada ? '#4caf50' : '#ff9800') + '40' }}>
                    {f.pagada ? '✅ Pagada' : '⏳ Por pagar'}
                  </span>
                </div>
                {(f.neto > 0 || f.iva > 0) && (
                  <p className="text-xs" style={{ color: '#6b7280' }}>Neto {fmt(f.neto)} + IVA {fmt(f.iva)}</p>
                )}
                <p className="text-xs truncate" style={{ color: '#6b7280' }}>{f.descripcion || 'Sin descripción'} · {new Date(f.created_at).toLocaleDateString('es-CL')}</p>
                {f.archivo_url && (
                  <a href={f.archivo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs mt-1 px-2 py-0.5 rounded border" style={{ borderColor: '#2196f340', color: '#2196f3' }}>📎 Ver factura</a>
                )}
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                <button onClick={() => togglePagada(f)}
                  className="px-3 h-8 rounded-lg flex items-center justify-center border text-xs font-semibold whitespace-nowrap"
                  style={{ borderColor: (f.pagada ? '#ff9800' : '#4caf50') + '60', color: f.pagada ? '#ff9800' : '#4caf50', backgroundColor: (f.pagada ? '#ff9800' : '#4caf50') + '10' }}>
                  {f.pagada ? '↩ Por pagar' : '✓ Pagar'}
                </button>
                <button onClick={() => setFacturaAEliminar(f)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center border text-base self-end"
                  style={{ borderColor: '#e5393520', backgroundColor: '#e5393510' }}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal eliminar */}
      {facturaAEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: '#141414' }}>
            <p className="text-lg font-bold mb-2" style={{ color: '#f5f5f5' }}>¿Eliminar factura?</p>
            <p className="text-sm mb-4" style={{ color: '#6b7280' }}>Se eliminará la factura de {fmt(facturaAEliminar.monto)}.</p>
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
