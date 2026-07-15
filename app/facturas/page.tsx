'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

type Tipo = 'emitida' | 'compra';

type Categoria = 'productos' | 'materiales' | 'rebaja_iva';

interface Factura {
  id: string;
  tipo: Tipo;
  categoria: Categoria | null;
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

const CATEGORIAS: { key: Categoria; label: string; color: string }[] = [
  { key: 'productos', label: '🥩 Productos', color: '#e53935' },
  { key: 'materiales', label: '🛠️ Materiales de trabajo', color: '#2196f3' },
  { key: 'rebaja_iva', label: '🧾 Rebaja de IVA', color: '#ff9800' },
];

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function FacturasPage() {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [facturaAEliminar, setFacturaAEliminar] = useState<Factura | null>(null);
  const [editandoFactura, setEditandoFactura] = useState<Factura | null>(null);
  const hoyDate = new Date();
  const [mesFiltro, setMesFiltro] = useState(hoyDate.getMonth());
  const [anioFiltro, setAnioFiltro] = useState(hoyDate.getFullYear());
  const [showSelectorMes, setShowSelectorMes] = useState(false);
  const [clientes, setClientes] = useState<{ id: string; nombre: string; rut: string | null; razon_social: string | null; giro: string | null }[]>([]);
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string; rut: string | null; razon_social: string | null; giro: string | null; direccion: string | null }[]>([]);
  const [contraparteNueva, setContraparteNueva] = useState(false);
  const [datosContraparte, setDatosContraparte] = useState<{ rut: string | null; razon_social: string | null; giro: string | null; direccion: string | null } | null>(null);

  // Form
  const [tipo, setTipo] = useState<Tipo>('compra');
  const [categoria, setCategoria] = useState<Categoria>('productos');
  const [neto, setNeto] = useState('');
  const [contraparte, setContraparte] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [analizado, setAnalizado] = useState(false);

  const netoNum = neto ? parseInt(neto) : 0;
  const ivaNum = Math.round(netoNum * 0.19);
  const totalNum = netoNum + ivaNum;

  const fetchFacturas = useCallback(async () => {
    const { data } = await supabase.from('facturas').select('*').order('fecha', { ascending: false });
    setFacturas((data || []) as Factura[]);
  }, []);

  const fetchListas = useCallback(async () => {
    const [cliRes, provRes] = await Promise.all([
      supabase.from('clientes').select('id, nombre, rut, razon_social, giro').order('nombre'),
      supabase.from('proveedores').select('id, nombre, rut, razon_social, giro, direccion').order('nombre'),
    ]);
    setClientes(cliRes.data || []);
    setProveedores(provRes.data || []);
  }, []);

  useEffect(() => { Promise.all([fetchFacturas(), fetchListas()]).finally(() => setLoading(false)); }, [fetchFacturas, fetchListas]);

  function abrirNueva(t: Tipo) {
    setEditandoFactura(null);
    setTipo(t); setCategoria('productos'); setNeto(''); setContraparte(''); setDescripcion('');
    setFecha(new Date().toISOString().split('T')[0]); setArchivo(null);
    setAnalizando(false); setAnalizado(false); setContraparteNueva(false);
    setDatosContraparte(null);
    setShowModal(true);
  }

  function abrirEditar(f: Factura) {
    setEditandoFactura(f);
    setTipo(f.tipo);
    setCategoria((f.categoria || 'productos') as Categoria);
    setNeto(String(f.neto > 0 ? f.neto : Math.round(f.monto / 1.19)));
    const lista = f.tipo === 'emitida' ? clientes : proveedores;
    const enLista = f.contraparte && lista.some((x) => x.nombre === f.contraparte);
    setContraparte(f.contraparte || '');
    setContraparteNueva(!!f.contraparte && !enLista);
    setDescripcion(f.descripcion || '');
    setFecha(f.fecha);
    setArchivo(null);
    setAnalizando(false); setAnalizado(false);
    setDatosContraparte(null);
    setShowModal(true);
  }

  async function analizarArchivo(file: File) {
    setArchivo(file);
    setAnalizado(false);
    setAnalizando(true);
    try {
      // Convertir a base64
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

      const tipoDetectado: Tipo = datos.tipo === 'emitida' ? 'emitida' : 'compra';
      setTipo(tipoDetectado);
      if (datos.neto) setNeto(String(datos.neto));
      else if (datos.total) setNeto(String(Math.round(datos.total / 1.19)));
      if (datos.contraparte) {
        const nombre = String(datos.contraparte);
        const lista = tipoDetectado === 'emitida' ? clientes : proveedores;
        const match = lista.find((x) => x.nombre.toLowerCase() === nombre.toLowerCase() || nombre.toLowerCase().includes(x.nombre.toLowerCase()) || x.nombre.toLowerCase().includes(nombre.toLowerCase()));
        if (match) {
          setContraparte(match.nombre);
          setContraparteNueva(false);
        } else {
          setContraparte(nombre);
          setContraparteNueva(true);
        }
      }
      if (datos.fecha && /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) setFecha(datos.fecha);
      if (datos.numero) setDescripcion(`Factura N° ${datos.numero}`);
      setDatosContraparte({
        rut: datos.contraparte_rut || null,
        razon_social: datos.contraparte_razon_social || null,
        giro: datos.contraparte_giro || null,
        direccion: datos.contraparte_direccion || null,
      });
      setAnalizado(true);
    } catch {
      // Si falla el análisis, el usuario llena los datos a mano
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
        const path = `${tipo}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('facturas').upload(path, archivo, { upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('facturas').getPublicUrl(path);
        archivoUrl = pub.publicUrl;
        archivoNombre = archivo.name;
      }
      const payload: Record<string, unknown> = {
        tipo, categoria: tipo === 'compra' ? categoria : null,
        monto: totalNum, neto: netoNum, iva: ivaNum, contraparte: contraparte || null,
        descripcion: descripcion || null, fecha,
      };
      if (archivoUrl) { payload.archivo_url = archivoUrl; payload.archivo_nombre = archivoNombre; }

      if (editandoFactura) {
        const { error } = await supabase.from('facturas').update(payload).eq('id', editandoFactura.id);
        if (error) throw error;
      } else {
        payload.archivo_url = archivoUrl; payload.archivo_nombre = archivoNombre;
        const { error } = await supabase.from('facturas').insert(payload);
        if (error) throw error;
      }

      // Sincronizar datos de la contraparte con clientes / proveedores
      if (contraparte) {
        if (tipo === 'compra') {
          const provExistente = proveedores.find((p) => p.nombre.toLowerCase() === contraparte.toLowerCase());
          if (!provExistente) {
            // Proveedor nuevo: se guarda con todos los datos leídos de la factura
            await supabase.from('proveedores').insert({
              nombre: contraparte,
              rut: datosContraparte?.rut || null,
              razon_social: datosContraparte?.razon_social || null,
              giro: datosContraparte?.giro || null,
              direccion: datosContraparte?.direccion || null,
            });
          } else if (datosContraparte) {
            // Completar datos que le falten al proveedor (sin pisar los existentes)
            const cambios: Record<string, string> = {};
            if (!provExistente.rut && datosContraparte.rut) cambios.rut = datosContraparte.rut;
            if (!provExistente.razon_social && datosContraparte.razon_social) cambios.razon_social = datosContraparte.razon_social;
            if (!provExistente.giro && datosContraparte.giro) cambios.giro = datosContraparte.giro;
            if (!provExistente.direccion && datosContraparte.direccion) cambios.direccion = datosContraparte.direccion;
            if (Object.keys(cambios).length > 0) await supabase.from('proveedores').update(cambios).eq('id', provExistente.id);
          }
        } else if (tipo === 'emitida' && datosContraparte) {
          // Completar la ficha del cliente (Datos Clientes) con lo leído de la factura
          const cliExistente = clientes.find((c) => c.nombre.toLowerCase() === contraparte.toLowerCase());
          if (cliExistente) {
            const cambios: Record<string, string> = {};
            if (!cliExistente.rut && datosContraparte.rut) cambios.rut = datosContraparte.rut;
            if (!cliExistente.razon_social && datosContraparte.razon_social) cambios.razon_social = datosContraparte.razon_social;
            if (!cliExistente.giro && datosContraparte.giro) cambios.giro = datosContraparte.giro;
            if (Object.keys(cambios).length > 0) await supabase.from('clientes').update(cambios).eq('id', cliExistente.id);
          }
        }
      }

      setShowModal(false);
      await Promise.all([fetchFacturas(), fetchListas()]);
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

  // Facturas del mes seleccionado
  const mesStr = `${anioFiltro}-${String(mesFiltro + 1).padStart(2, '0')}`;
  const delMes = facturas.filter((f) => f.fecha.startsWith(mesStr));

  const totalEmitidas = delMes.filter((f) => f.tipo === 'emitida').reduce((s, f) => s + f.monto, 0);
  // Las de "rebaja de IVA" no cuentan como gasto de compra: solo aportan su IVA al crédito
  const totalCompras = delMes.filter((f) => f.tipo === 'compra' && (f.categoria || 'productos') !== 'rebaja_iva').reduce((s, f) => s + f.monto, 0);

  // IVA: si la factura no tiene iva guardado (registros antiguos), se estima desde el total
  const ivaDe = (f: Factura) => (f.iva > 0 ? f.iva : f.monto - Math.round(f.monto / 1.19));
  const ivaDebito = delMes.filter((f) => f.tipo === 'emitida').reduce((s, f) => s + ivaDe(f), 0);
  const ivaCredito = delMes.filter((f) => f.tipo === 'compra').reduce((s, f) => s + ivaDe(f), 0);
  const ivaAPagar = ivaDebito - ivaCredito;

  const colorTipo = (t: Tipo) => (t === 'emitida' ? '#4caf50' : '#e53935');

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Facturas</h1>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Sube y guarda tus facturas emitidas y de compra</p>
        </div>
      </div>

      {/* Selector de mes */}
      <button onClick={() => setShowSelectorMes(!showSelectorMes)}
        className="w-full flex items-center justify-between rounded-xl border px-4 py-3 mb-4"
        style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <p className="font-bold" style={{ color: '#f5f5f5' }}>📅 {MESES[mesFiltro]} {anioFiltro}</p>
        <span style={{ color: '#6b7280' }}>{showSelectorMes ? '▲' : '▼'}</span>
      </button>
      {showSelectorMes && (
        <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setAnioFiltro(anioFiltro - 1)} className="w-8 h-8 rounded-lg border" style={{ borderColor: '#2a2a2a', color: '#f5f5f5' }}>‹</button>
            <p className="font-bold" style={{ color: '#f5f5f5' }}>{anioFiltro}</p>
            <button onClick={() => setAnioFiltro(anioFiltro + 1)} className="w-8 h-8 rounded-lg border" style={{ borderColor: '#2a2a2a', color: '#f5f5f5' }}>›</button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {MESES.map((m, i) => (
              <button key={m} onClick={() => { setMesFiltro(i); setShowSelectorMes(false); }}
                className="py-2 rounded-lg text-xs font-semibold border"
                style={{
                  borderColor: mesFiltro === i ? '#e53935' : '#2a2a2a',
                  backgroundColor: mesFiltro === i ? '#e5393520' : 'transparent',
                  color: mesFiltro === i ? '#e53935' : '#9ca3af',
                }}>
                {m.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* IVA a pagar */}
      <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: ivaAPagar > 0 ? '#ff9800' : '#4caf50' }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#6b7280' }}>🏛️ IVA a pagar (F29) — {MESES[mesFiltro]}</p>
        <p className="text-3xl font-extrabold" style={{ color: ivaAPagar > 0 ? '#ff9800' : '#4caf50' }}>
          {ivaAPagar > 0 ? fmt(ivaAPagar) : ivaAPagar < 0 ? `${fmt(Math.abs(ivaAPagar))} a favor` : fmt(0)}
        </p>
        <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
          IVA débito (ventas) {fmt(ivaDebito)} − IVA crédito (compras) {fmt(ivaCredito)}
        </p>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <p className="text-xs" style={{ color: '#6b7280' }}>📤 Emitidas (a clientes)</p>
          <p className="text-2xl font-extrabold" style={{ color: '#4caf50' }}>{fmt(totalEmitidas)}</p>
          <p className="text-xs" style={{ color: '#6b7280' }}>IVA {fmt(ivaDebito)}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
          <p className="text-xs" style={{ color: '#6b7280' }}>📥 Compra (pagadas)</p>
          <p className="text-2xl font-extrabold" style={{ color: '#e53935' }}>{fmt(totalCompras)}</p>
          <p className="text-xs" style={{ color: '#6b7280' }}>IVA {fmt(ivaCredito)}</p>
        </div>
      </div>

      {/* Compras por categoría */}
      <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>📥 Compras por categoría — {MESES[mesFiltro]}</p>
        </div>
        <div className="grid grid-cols-3 divide-x" style={{ borderColor: '#2a2a2a' }}>
          {CATEGORIAS.map((cat) => {
            const deCat = delMes.filter((f) => f.tipo === 'compra' && (f.categoria || 'productos') === cat.key);
            const esRebaja = cat.key === 'rebaja_iva';
            const total = esRebaja
              ? deCat.reduce((s, f) => s + ivaDe(f), 0)
              : deCat.reduce((s, f) => s + f.monto, 0);
            return (
              <div key={cat.key} className="p-3 text-center" style={{ borderColor: '#2a2a2a' }}>
                <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{cat.label}</p>
                <p className="text-lg font-extrabold" style={{ color: cat.color }}>{fmt(total)}</p>
                <p className="text-xs" style={{ color: '#6b7280' }}>{esRebaja ? 'IVA rebajado' : 'gasto'} · {deCat.length} fact.</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Botón subir */}
      <button onClick={() => abrirNueva('compra')} className="w-full py-4 rounded-xl font-bold text-sm text-white mb-4" style={{ backgroundColor: '#e53935' }}>
        📎 Subir factura — la IA detecta todo automáticamente
      </button>

      {/* Listas por categoría */}
      {delMes.length === 0 ? (
        <div className="text-center py-12" style={{ color: '#6b7280' }}>
          <p className="text-3xl mb-2">🧾</p>
          <p>No hay facturas en {MESES[mesFiltro]}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {[
            { titulo: '📤 Facturas Emitidas (a clientes)', color: '#4caf50', lista: delMes.filter((f) => f.tipo === 'emitida') },
            ...CATEGORIAS.map((cat) => ({
              titulo: `📥 ${cat.label}`,
              color: cat.color,
              lista: delMes.filter((f) => f.tipo === 'compra' && (f.categoria || 'productos') === cat.key),
            })),
          ].map((seccion) => seccion.lista.length > 0 && (
            <div key={seccion.titulo}>
              <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: seccion.color }}>
                {seccion.titulo} ({seccion.lista.length})
              </p>
              <div className="space-y-3">
                {seccion.lista.map((f) => (
                  <div key={f.id} className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: seccion.color }}>
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => abrirEditar(f)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center border text-base"
                          style={{ borderColor: '#2a2a2a', backgroundColor: '#1c1c1c' }}>✏️</button>
                        <button onClick={() => setFacturaAEliminar(f)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center border text-base"
                          style={{ borderColor: '#e5393520', backgroundColor: '#e5393510' }}>🗑️</button>
                      </div>
                    </div>
                  </div>
                ))}
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
              <h2 className="font-bold text-lg" style={{ color: '#f5f5f5' }}>{editandoFactura ? '✏️ Editar Factura' : '📎 Subir Factura'}</h2>
              <button onClick={() => setShowModal(false)} style={{ color: '#6b7280' }}>✕</button>
            </div>

            {/* Subir archivo primero: se analiza con IA */}
            <div className="rounded-lg border p-3 mb-4" style={{ borderColor: analizado ? '#4caf50' : '#2a2a2a', backgroundColor: analizado ? '#4caf5010' : '#1c1c1c' }}>
              <label className="block text-xs font-semibold uppercase mb-2" style={{ color: '#6b7280' }}>📎 Sube la factura (PDF o foto) y se llena solo</label>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) analizarArchivo(f); }}
                className="w-full text-sm" style={{ color: '#9ca3af' }} disabled={analizando} />
              {analizando && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs" style={{ color: '#ff9800' }}>Leyendo factura con IA...</p>
                </div>
              )}
              {analizado && (
                <p className="text-xs mt-2" style={{ color: '#4caf50' }}>
                  ✓ Detectada como factura {tipo === 'emitida' ? 'EMITIDA (venta a cliente)' : 'DE COMPRA (pagada a proveedor)'} — revisa los datos y guarda
                </p>
              )}
              {archivo && !analizando && <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{archivo.name}</p>}
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

            {tipo === 'compra' && (
              <>
                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Categoría de la compra</label>
                <div className="flex gap-2 mb-4">
                  {CATEGORIAS.map((cat) => (
                    <button key={cat.key} onClick={() => setCategoria(cat.key)}
                      className="flex-1 py-2 px-1 rounded-lg border text-xs font-semibold"
                      style={{
                        borderColor: categoria === cat.key ? cat.color : '#2a2a2a',
                        backgroundColor: categoria === cat.key ? cat.color + '20' : 'transparent',
                        color: categoria === cat.key ? cat.color : '#9ca3af',
                      }}>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </>
            )}

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

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>{tipo === 'emitida' ? 'Cliente' : 'Proveedor'}</label>
            {!contraparteNueva ? (
              <select
                value={(tipo === 'emitida' ? clientes : proveedores).some((x) => x.nombre === contraparte) ? contraparte : ''}
                onChange={(e) => {
                  if (e.target.value === '__nuevo__') { setContraparteNueva(true); setContraparte(''); }
                  else setContraparte(e.target.value);
                }}
                className="w-full rounded-lg px-3 py-2 text-sm border mb-3"
                style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: contraparte ? '#f5f5f5' : '#6b7280' }}>
                <option value="">— Seleccionar {tipo === 'emitida' ? 'cliente' : 'proveedor'} —</option>
                {(tipo === 'emitida' ? clientes : proveedores).map((x) => (
                  <option key={x.id} value={x.nombre}>{x.nombre}</option>
                ))}
                <option value="__nuevo__">➕ {tipo === 'emitida' ? 'Otro (escribir)' : 'Nuevo proveedor...'}</option>
              </select>
            ) : (
              <div className="flex gap-2 mb-3">
                <input value={contraparte} onChange={(e) => setContraparte(e.target.value)} autoFocus
                  placeholder={tipo === 'emitida' ? 'Nombre del cliente' : 'Nombre del nuevo proveedor'}
                  className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm border"
                  style={{ backgroundColor: '#1c1c1c', borderColor: tipo === 'compra' ? '#4caf50' : '#2a2a2a', color: '#f5f5f5' }} />
                <button onClick={() => { setContraparteNueva(false); setContraparte(''); }}
                  className="px-3 rounded-lg border text-xs flex-shrink-0" style={{ borderColor: '#2a2a2a', color: '#6b7280' }}>
                  Lista
                </button>
              </div>
            )}
            {contraparteNueva && tipo === 'compra' && contraparte && (
              <p className="text-xs mb-3 -mt-2" style={{ color: '#4caf50' }}>✓ Se guardará como proveedor nuevo para la próxima vez</p>
            )}

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm border mb-3" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Descripción (opcional)</label>
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="ej: N° factura, detalle..."
              className="w-full rounded-lg px-3 py-2 text-sm border mb-3" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

            <button onClick={guardar} disabled={saving || netoNum <= 0 || analizando}
              className="w-full py-3 rounded-lg font-bold text-sm text-white disabled:opacity-40"
              style={{ backgroundColor: colorTipo(tipo) }}>
              {saving ? 'Guardando...' : editandoFactura ? 'Guardar cambios' : 'Guardar factura'}
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
