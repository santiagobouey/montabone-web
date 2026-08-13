'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const ESTADOS = ['pendiente', 'preparado', 'entregado', 'pagado'];
const ESTADO_COLORS: Record<string, string> = {
  pendiente: '#ff9800', preparado: '#2196f3', entregado: '#4caf50', pagado: '#6b7280',
};

interface ItemForm { descripcion: string; kilos: string; precioKilo: string; }
interface Venta {
  id: string; cliente_id: string | null; cliente_nombre: string | null; fecha: string; estado: string;
  neto: number; con_iva: boolean; total: number; costo: number; observaciones: string | null;
  archivo_url: string | null; archivo_nombre: string | null; periodo_id: string | null;
  cliente: { nombre: string } | null;
  items: { descripcion: string; kilos: number; precio_kilo: number; subtotal: number }[];
}

export default function VentaMayorPage() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [clientes, setClientes] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editando, setEditando] = useState<Venta | null>(null);
  const [ventaAEliminar, setVentaAEliminar] = useState<Venta | null>(null);

  // Form
  const [clienteId, setClienteId] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteNuevo, setClienteNuevo] = useState(false);
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [estado, setEstado] = useState('pendiente');
  const [items, setItems] = useState<ItemForm[]>([{ descripcion: '', kilos: '', precioKilo: '' }]);
  const [costo, setCosto] = useState('');
  const [conIva, setConIva] = useState(false);
  const [observaciones, setObservaciones] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);

  const fetchDatos = useCallback(async () => {
    const [vRes, cRes] = await Promise.all([
      supabase.from('ventas_mayor').select('*, cliente:clientes(nombre), items:items_venta_mayor(descripcion, kilos, precio_kilo, subtotal)').order('fecha', { ascending: false }),
      supabase.from('clientes').select('id, nombre').order('nombre'),
    ]);
    setVentas((vRes.data || []) as Venta[]);
    setClientes(cRes.data || []);
  }, []);

  useEffect(() => { fetchDatos().finally(() => setLoading(false)); }, [fetchDatos]);

  const neto = items.reduce((s, i) => s + (parseFloat(i.kilos || '0') * parseInt(i.precioKilo || '0')), 0);
  const total = conIva ? Math.round(neto * 1.19) : neto;
  const costoNum = costo ? parseInt(costo) : 0;
  const utilForm = total - costoNum;

  function abrirNueva() {
    setEditando(null);
    setClienteId(''); setClienteNombre(''); setClienteNuevo(false);
    setFecha(new Date().toISOString().split('T')[0]); setEstado('pendiente');
    setItems([{ descripcion: '', kilos: '', precioKilo: '' }]);
    setCosto(''); setConIva(false); setObservaciones(''); setArchivo(null);
    setShowModal(true);
  }

  function abrirEditar(v: Venta) {
    setEditando(v);
    setClienteId(v.cliente_id || '');
    setClienteNombre(v.cliente_nombre || '');
    setClienteNuevo(!v.cliente_id && !!v.cliente_nombre);
    setFecha(v.fecha); setEstado(v.estado);
    setItems((v.items || []).map((i) => ({ descripcion: i.descripcion, kilos: String(i.kilos), precioKilo: String(i.precio_kilo) })));
    setCosto(v.costo ? String(v.costo) : '');
    setConIva(v.con_iva); setObservaciones(v.observaciones || ''); setArchivo(null);
    setShowModal(true);
  }

  async function guardar() {
    const itemsValidos = items.filter((i) => i.descripcion.trim() && parseFloat(i.kilos || '0') > 0);
    if (itemsValidos.length === 0) return;
    setSaving(true);
    try {
      let archivoUrl: string | null = editando?.archivo_url ?? null;
      let archivoNombre: string | null = editando?.archivo_nombre ?? null;
      if (archivo) {
        const ext = archivo.name.split('.').pop();
        const path = `mayor/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('facturas').upload(path, archivo);
        if (upErr) throw upErr;
        archivoUrl = supabase.storage.from('facturas').getPublicUrl(path).data.publicUrl;
        archivoNombre = archivo.name;
      }

      const payload = {
        cliente_id: clienteNuevo ? null : (clienteId || null),
        cliente_nombre: clienteNuevo ? (clienteNombre.trim() || null) : null,
        fecha, estado, neto, con_iva: conIva, total, costo: costoNum,
        observaciones: observaciones || null,
        archivo_url: archivoUrl, archivo_nombre: archivoNombre,
      };

      let ventaId: string;
      if (editando) {
        const { error } = await supabase.from('ventas_mayor').update(payload).eq('id', editando.id);
        if (error) throw error;
        ventaId = editando.id;
        await supabase.from('items_venta_mayor').delete().eq('venta_id', ventaId);
      } else {
        const { data, error } = await supabase.from('ventas_mayor').insert(payload).select('id').single();
        if (error || !data) throw new Error(error?.message || 'No se creó');
        ventaId = data.id;
      }

      const { error: ie } = await supabase.from('items_venta_mayor').insert(
        itemsValidos.map((i) => {
          const kilos = parseFloat(i.kilos), pk = parseInt(i.precioKilo || '0');
          return { venta_id: ventaId, descripcion: i.descripcion.trim(), kilos, precio_kilo: pk, subtotal: Math.round(kilos * pk) };
        })
      );
      if (ie) throw ie;

      setShowModal(false);
      setEditando(null);
      await fetchDatos();
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
    setSaving(false);
  }

  async function cambiarEstado(id: string, nuevo: string) {
    await supabase.from('ventas_mayor').update({ estado: nuevo }).eq('id', id);
    await fetchDatos();
  }

  async function eliminar() {
    if (!ventaAEliminar) return;
    await supabase.from('ventas_mayor').delete().eq('id', ventaAEliminar.id);
    setVentaAEliminar(null);
    await fetchDatos();
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  const totalVentas = ventas.reduce((s, v) => s + v.total, 0);
  const totalCostos = ventas.reduce((s, v) => s + v.costo, 0);
  const totalUtil = totalVentas - totalCostos;

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Venta por Mayor</h1>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Ventas por kilo con costo y factura</p>
        </div>
        <button onClick={abrirNueva} className="px-4 py-2 rounded-lg font-bold text-sm text-white flex-shrink-0" style={{ backgroundColor: '#e53935' }}>
          + Nueva
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border p-3" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: '#4caf50' }}>
          <p className="text-xs" style={{ color: '#6b7280' }}>📈 Ventas</p>
          <p className="text-lg font-extrabold" style={{ color: '#4caf50' }}>{fmt(totalVentas)}</p>
        </div>
        <div className="rounded-xl border p-3" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: '#e53935' }}>
          <p className="text-xs" style={{ color: '#6b7280' }}>🧾 Costos</p>
          <p className="text-lg font-extrabold" style={{ color: '#e53935' }}>{fmt(totalCostos)}</p>
        </div>
        <div className="rounded-xl border p-3" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', borderLeftWidth: 4, borderLeftColor: '#2196f3' }}>
          <p className="text-xs" style={{ color: '#6b7280' }}>💰 Utilidad</p>
          <p className="text-lg font-extrabold" style={{ color: totalUtil < 0 ? '#e53935' : '#2196f3' }}>{fmt(totalUtil)}</p>
        </div>
      </div>

      {/* Lista */}
      {ventas.length === 0 ? (
        <div className="text-center py-12" style={{ color: '#6b7280' }}>
          <p className="text-3xl mb-2">⚖️</p>
          <p>No hay ventas por mayor registradas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ventas.map((v) => {
            const color = ESTADO_COLORS[v.estado] || '#6b7280';
            const util = v.total - v.costo;
            return (
              <div key={v.id} className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
                <div className="flex justify-between items-start mb-2">
                  <div className="min-w-0">
                    <p className="font-bold" style={{ color: '#f5f5f5' }}>{v.cliente?.nombre || v.cliente_nombre || 'Sin cliente'}</p>
                    <p className="text-xs" style={{ color: '#6b7280' }}>{new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-CL')}</p>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ color, backgroundColor: color + '20' }}>{v.estado.toUpperCase()}</span>
                </div>
                {(v.items || []).map((it, i) => (
                  <div key={i} className="flex justify-between text-sm py-1 border-b" style={{ borderColor: '#2a2a2a' }}>
                    <span style={{ color: '#9ca3af' }}>{it.descripcion} — {it.kilos} kg × {fmt(it.precio_kilo)}/kg</span>
                    <span style={{ color: '#f5f5f5' }}>{fmt(it.subtotal)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center mt-3 flex-wrap gap-2">
                  <div>
                    <p className="font-extrabold text-lg" style={{ color: '#f5f5f5' }}>{fmt(v.total)} <span className="text-xs" style={{ color: '#6b7280' }}>{v.con_iva ? '(c/IVA)' : ''}</span></p>
                    <p className="text-xs" style={{ color: '#6b7280' }}>Costo {fmt(v.costo)} · Utilidad <span style={{ color: util < 0 ? '#e53935' : '#4caf50' }}>{fmt(util)}</span></p>
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    {v.archivo_url && <a href={v.archivo_url} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#2196f340', color: '#2196f3' }}>📎 Factura</a>}
                    <button onClick={() => abrirEditar(v)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#2a2a2a', color: '#9ca3af' }}>✏️</button>
                    <button onClick={() => setVentaAEliminar(v)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#e5393520', color: '#e53935' }}>🗑</button>
                  </div>
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {ESTADOS.filter((e) => e !== v.estado).map((e) => (
                    <button key={e} onClick={() => cambiarEstado(v.id, e)} className="text-xs px-2 py-1 rounded border"
                      style={{ borderColor: ESTADO_COLORS[e] + '60', color: ESTADO_COLORS[e], backgroundColor: ESTADO_COLORS[e] + '10' }}>
                      → {e}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 overflow-y-auto max-h-[90vh]" style={{ backgroundColor: '#141414' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg" style={{ color: '#f5f5f5' }}>{editando ? '✏️ Editar' : '⚖️ Nueva'} Venta por Mayor</h2>
              <button onClick={() => { setShowModal(false); setEditando(null); }} style={{ color: '#6b7280' }}>✕</button>
            </div>

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Cliente</label>
            {!clienteNuevo ? (
              <select value={clienteId} onChange={(e) => { if (e.target.value === '__nuevo__') { setClienteNuevo(true); setClienteId(''); } else setClienteId(e.target.value); }}
                className="w-full rounded-lg px-3 py-2 mb-3 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: clienteId ? '#f5f5f5' : '#6b7280' }}>
                <option value="">— Seleccionar cliente —</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                <option value="__nuevo__">➕ Escribir otro</option>
              </select>
            ) : (
              <div className="flex gap-2 mb-3">
                <input value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} autoFocus placeholder="Nombre del cliente"
                  className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
                <button onClick={() => { setClienteNuevo(false); setClienteNombre(''); }} className="px-3 rounded-lg border text-xs" style={{ borderColor: '#2a2a2a', color: '#6b7280' }}>Lista</button>
              </div>
            )}

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full rounded-lg px-3 py-2 mb-3 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

            <label className="block text-xs font-semibold uppercase mb-2" style={{ color: '#6b7280' }}>Productos (por kilo)</label>
            {items.map((it, idx) => (
              <div key={idx} className="mb-2 p-3 rounded-lg border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a' }}>
                <div className="flex gap-2 mb-2">
                  <input value={it.descripcion} onChange={(e) => setItems((p) => p.map((x, i) => i === idx ? { ...x, descripcion: e.target.value } : x))}
                    placeholder="Producto (ej: Longaniza a granel)"
                    className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
                  {items.length > 1 && (
                    <button onClick={() => setItems((p) => p.filter((_, i) => i !== idx))} className="w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#e5393520', color: '#e53935' }}>🗑</button>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  <div className="flex-1">
                    <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Kilos</p>
                    <input type="number" value={it.kilos} onChange={(e) => setItems((p) => p.map((x, i) => i === idx ? { ...x, kilos: e.target.value } : x))} placeholder="0"
                      className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Precio x kilo</p>
                    <input type="number" value={it.precioKilo} onChange={(e) => setItems((p) => p.map((x, i) => i === idx ? { ...x, precioKilo: e.target.value } : x))} placeholder="0"
                      className="w-full rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
                  </div>
                  <div className="text-right pt-4">
                    <p className="text-sm font-bold" style={{ color: '#9c27b0' }}>{fmt(parseFloat(it.kilos || '0') * parseInt(it.precioKilo || '0'))}</p>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={() => setItems((p) => [...p, { descripcion: '', kilos: '', precioKilo: '' }])} className="text-xs px-3 py-1.5 rounded-lg border mb-3" style={{ borderColor: '#2a2a2a', color: '#9ca3af' }}>+ Agregar producto</button>

            <button onClick={() => setConIva(!conIva)} className="w-full flex items-center justify-between p-3 rounded-lg border mb-3" style={{ backgroundColor: conIva ? '#9c27b010' : '#1c1c1c', borderColor: conIva ? '#9c27b0' : '#2a2a2a' }}>
              <span className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>Vender con IVA (19%)</span>
              <div className="w-10 h-5 rounded-full flex items-center px-0.5" style={{ backgroundColor: conIva ? '#9c27b0' : '#2a2a2a' }}>
                <div className="w-4 h-4 rounded-full bg-white" style={{ transform: conIva ? 'translateX(20px)' : 'translateX(0)' }} />
              </div>
            </button>

            <div className="p-3 rounded-lg mb-3" style={{ backgroundColor: '#1c1c1c' }}>
              <div className="flex justify-between text-sm"><span style={{ color: '#6b7280' }}>Neto</span><span style={{ color: '#f5f5f5' }}>{fmt(neto)}</span></div>
              {conIva && <div className="flex justify-between text-sm"><span style={{ color: '#6b7280' }}>IVA</span><span style={{ color: '#f5f5f5' }}>{fmt(total - neto)}</span></div>}
              <div className="flex justify-between font-bold mt-1"><span style={{ color: '#6b7280' }}>TOTAL VENTA</span><span className="text-lg" style={{ color: '#4caf50' }}>{fmt(total)}</span></div>
            </div>

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Precio de compra (costo total)</label>
            <input type="number" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Lo que te costó"
              className="w-full rounded-lg px-3 py-2 mb-2 text-sm border" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />
            <p className="text-xs mb-3" style={{ color: utilForm < 0 ? '#e53935' : '#4caf50' }}>Utilidad de esta venta: {fmt(utilForm)}</p>

            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Factura (PDF o foto, opcional)</label>
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] || null)} className="w-full text-sm mb-1" style={{ color: '#9ca3af' }} />
            {editando?.archivo_nombre && !archivo && <p className="text-xs mb-2" style={{ color: '#6b7280' }}>Actual: {editando.archivo_nombre}</p>}
            <div className="mb-3" />

            <label className="block text-xs font-semibold uppercase mb-2" style={{ color: '#6b7280' }}>Estado</label>
            <div className="flex gap-2 mb-4 flex-wrap">
              {ESTADOS.map((e) => (
                <button key={e} onClick={() => setEstado(e)} className="flex-1 py-2 rounded-lg border text-xs font-semibold"
                  style={{ backgroundColor: estado === e ? ESTADO_COLORS[e] : 'transparent', borderColor: estado === e ? ESTADO_COLORS[e] : '#2a2a2a', color: estado === e ? 'white' : '#6b7280' }}>
                  {e.charAt(0).toUpperCase() + e.slice(1)}
                </button>
              ))}
            </div>

            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Observaciones..." rows={2}
              className="w-full rounded-lg px-3 py-2 mb-4 text-sm border resize-none" style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

            <button onClick={guardar} disabled={saving || neto <= 0}
              className="w-full py-3 rounded-lg font-bold text-sm text-white disabled:opacity-40" style={{ backgroundColor: '#e53935' }}>
              {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar venta'}
            </button>
          </div>
        </div>
      )}

      {/* Modal eliminar */}
      {ventaAEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: '#141414' }}>
            <p className="text-lg font-bold mb-2" style={{ color: '#f5f5f5' }}>¿Eliminar venta?</p>
            <p className="text-sm mb-4" style={{ color: '#6b7280' }}>Se eliminará la venta de {fmt(ventaAEliminar.total)}.</p>
            <div className="flex gap-3">
              <button onClick={() => setVentaAEliminar(null)} className="flex-1 py-3 rounded-lg font-bold text-sm border" style={{ borderColor: '#2a2a2a', color: '#6b7280' }}>Cancelar</button>
              <button onClick={eliminar} className="flex-1 py-3 rounded-lg font-bold text-sm text-white" style={{ backgroundColor: '#e53935' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
