'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

interface ProductoCosto {
  id: string;
  nombre: string;
  formato: string;
  precio: number;
  costo: number;
  stock: number;
}

export default function CostosPage() {
  const [productos, setProductos] = useState<ProductoCosto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [costos, setCostos] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState(false);

  const fetchProductos = useCallback(async () => {
    const { data } = await supabase.from('productos').select('id, nombre, formato, precio, costo, stock').order('nombre');
    const prods = (data || []) as ProductoCosto[];
    setProductos(prods);
    const map: Record<string, string> = {};
    for (const p of prods) map[p.id] = p.costo ? String(p.costo) : '';
    setCostos(map);
  }, []);

  useEffect(() => { fetchProductos().finally(() => setLoading(false)); }, [fetchProductos]);

  async function guardar() {
    setSaving(true);
    try {
      await Promise.all(productos.map((prod) =>
        supabase.from('productos').update({ costo: costos[prod.id] ? parseInt(costos[prod.id]) : 0 }).eq('id', prod.id)
      ));
      await fetchProductos();
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch {}
    setSaving(false);
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  const costoTotalInventario = productos.reduce((s, p) => {
    const c = costos[p.id] ? parseInt(costos[p.id]) : 0;
    return s + c * p.stock;
  }, 0);

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Costos</h1>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Cuánto pagas por cada producto</p>
        </div>
        <button onClick={guardar} disabled={saving} className="px-4 py-2 rounded-lg font-bold text-sm text-white disabled:opacity-40" style={{ backgroundColor: guardado ? '#4caf50' : '#e53935' }}>
          {saving ? 'Guardando...' : guardado ? '✓ Guardado' : 'Guardar'}
        </button>
      </div>

      <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <p className="text-xs" style={{ color: '#6b7280' }}>Valor del inventario a costo (stock actual)</p>
        <p className="text-2xl font-extrabold" style={{ color: '#ff9800' }}>{fmt(costoTotalInventario)}</p>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <div className="grid grid-cols-12 px-4 py-2 border-b text-xs font-bold uppercase" style={{ borderColor: '#2a2a2a', color: '#6b7280' }}>
          <div className="col-span-6">Producto</div>
          <div className="col-span-3 text-right">Precio venta</div>
          <div className="col-span-3 text-right">Costo</div>
        </div>
        {productos.map((prod) => {
          const costoNum = costos[prod.id] ? parseInt(costos[prod.id]) : 0;
          const margen = prod.precio > 0 && costoNum > 0 ? Math.round(((prod.precio - costoNum) / prod.precio) * 100) : null;
          return (
            <div key={prod.id} className="grid grid-cols-12 items-center px-4 py-3 border-b last:border-0" style={{ borderColor: '#2a2a2a' }}>
              <div className="col-span-6 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: '#f5f5f5' }}>{prod.nombre}</p>
                <p className="text-xs" style={{ color: '#6b7280' }}>
                  {prod.formato}
                  {margen !== null && <> · <span style={{ color: margen >= 30 ? '#4caf50' : margen >= 15 ? '#ff9800' : '#e53935' }}>{margen}% margen</span></>}
                </p>
              </div>
              <div className="col-span-3 text-right text-sm" style={{ color: '#9ca3af' }}>{fmt(prod.precio)}</div>
              <div className="col-span-3 flex items-center justify-end gap-1">
                <span className="text-xs" style={{ color: '#6b7280' }}>$</span>
                <input
                  type="number"
                  value={costos[prod.id] ?? ''}
                  onChange={(e) => setCostos(prev => ({ ...prev, [prod.id]: e.target.value }))}
                  placeholder="0"
                  className="w-24 rounded px-2 py-1 text-sm text-right border"
                  style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {productos.length === 0 && (
        <div className="text-center py-12" style={{ color: '#6b7280' }}>
          <p className="text-3xl mb-2">🧾</p>
          <p>No hay productos todavía</p>
        </div>
      )}
    </div>
  );
}
