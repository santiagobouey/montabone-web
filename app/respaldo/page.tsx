'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const fmtFecha = () => new Date().toISOString().split('T')[0];

export default function RespaldoPage() {
  const [descargando, setDescargando] = useState(false);
  const [msg, setMsg] = useState('');

  async function descargar() {
    setDescargando(true);
    setMsg('Reuniendo tus datos...');
    try {
      const [
        clientesRes, productosRes, pedidosRes, detalleRes, eventosRes,
        facturasRes, costosRes, mermasRes, prospectosRes, periodosRes,
      ] = await Promise.all([
        supabase.from('clientes').select('nombre, razon_social, rut, giro, direccion, telefono, email, nombre_contacto, tipo').order('nombre'),
        supabase.from('productos').select('nombre, formato, stock, precio, costo, fecha_ingreso, fecha_vencimiento').order('nombre'),
        supabase.from('pedidos').select('fecha, estado, total, vendedor, cliente:clientes(nombre), detalle:detalle_pedido(cantidad, precio_unitario, producto:productos(nombre))').order('fecha', { ascending: false }),
        supabase.from('ventas_detalle').select('fecha, estado, total, nombre_comprador, vendedor, items:items_venta_detalle(cantidad, precio_unitario, producto:productos(nombre))').order('fecha', { ascending: false }),
        supabase.from('ventas_evento').select('cantidad, precio_unitario, total, producto:productos(nombre), evento:eventos(nombre, fecha)'),
        supabase.from('facturas').select('tipo, categoria, fecha, contraparte, rut, neto, iva, monto, folio, pagada, descripcion').order('fecha', { ascending: false }),
        supabase.from('costos_factura').select('created_at, monto, neto, iva, descripcion').order('created_at', { ascending: false }),
        supabase.from('mermas').select('fecha, motivo, cantidad, destino_nombre, producto:productos(nombre), cliente:clientes(nombre), influencer:influencers(nombre)').order('fecha', { ascending: false }),
        supabase.from('prospectos').select('nombre_local, nombre_contacto, telefono, direccion, tipo, estado').order('created_at', { ascending: false }),
        supabase.from('periodos').select('nombre, fecha_inicio, fecha_cierre, total_ventas, total_utilidad, total_pedidos, producto_mas_vendido').order('created_at', { ascending: false }),
      ]);

      setMsg('Armando el Excel...');
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const hoja = (nombre: string, filas: Record<string, unknown>[]) => {
        const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ '(sin datos)': '' }]);
        XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31));
      };

      // Clientes
      hoja('Clientes', (clientesRes.data || []).map((c: any) => ({
        Nombre: c.nombre, 'Razón social': c.razon_social, RUT: c.rut, Giro: c.giro,
        Dirección: c.direccion, Teléfono: c.telefono, Email: c.email, Contacto: c.nombre_contacto, Tipo: c.tipo,
      })));

      // Inventario
      hoja('Inventario', (productosRes.data || []).map((p: any) => ({
        Producto: p.nombre, Formato: p.formato, Stock: p.stock, 'Precio venta': p.precio,
        Costo: p.costo, 'F. elaboración': p.fecha_ingreso, 'F. vencimiento': p.fecha_vencimiento,
      })));

      // Pedidos
      hoja('Pedidos', (pedidosRes.data || []).map((p: any) => ({
        Fecha: p.fecha, Cliente: p.cliente?.nombre ?? '', Estado: p.estado, Vendedor: p.vendedor,
        Productos: (p.detalle || []).map((d: any) => `${d.producto?.nombre ?? '—'} x${d.cantidad}`).join(' | '),
        Total: p.total,
      })));

      // Ventas al detalle
      hoja('Ventas al detalle', (detalleRes.data || []).map((v: any) => ({
        Fecha: v.fecha, Comprador: v.nombre_comprador ?? '', Estado: v.estado, Vendedor: v.vendedor,
        Productos: (v.items || []).map((i: any) => `${i.producto?.nombre ?? '—'} x${i.cantidad}`).join(' | '),
        Total: v.total,
      })));

      // Ventas en eventos
      hoja('Ventas eventos', ((eventosRes.data || []) as any[]).map((v) => ({
        Evento: v.evento?.nombre ?? '', Fecha: v.evento?.fecha ?? '', Producto: v.producto?.nombre ?? '',
        Cantidad: v.cantidad, 'Precio unit.': v.precio_unitario, Total: v.total,
      })));

      // Facturas
      hoja('Facturas', (facturasRes.data || []).map((f: any) => ({
        Tipo: f.tipo, Categoría: f.categoria, Fecha: f.fecha, Contraparte: f.contraparte, RUT: f.rut,
        Neto: f.neto, IVA: f.iva, Total: f.monto, Folio: f.folio, Pagada: f.pagada ? 'Sí' : 'No', Descripción: f.descripcion,
      })));

      // Costos
      hoja('Costos', (costosRes.data || []).map((c: any) => ({
        Fecha: c.created_at?.split('T')[0] ?? '', Neto: c.neto, IVA: c.iva, Total: c.monto, Descripción: c.descripcion,
      })));

      // Mermas
      hoja('Mermas', (mermasRes.data || []).map((m: any) => ({
        Fecha: m.fecha, Motivo: m.motivo, Producto: m.producto?.nombre ?? '', Cantidad: m.cantidad,
        Destino: m.destino_nombre || m.influencer?.nombre || m.cliente?.nombre || '',
      })));

      // Prospectos
      hoja('Prospectos', (prospectosRes.data || []).map((p: any) => ({
        Local: p.nombre_local, Contacto: p.nombre_contacto, Teléfono: p.telefono, Dirección: p.direccion, Tipo: p.tipo, Estado: p.estado,
      })));

      // Períodos
      hoja('Períodos', (periodosRes.data || []).map((p: any) => ({
        Nombre: p.nombre, 'F. inicio': p.fecha_inicio, 'F. cierre': p.fecha_cierre,
        Ventas: p.total_ventas, Utilidad: p.total_utilidad, Pedidos: p.total_pedidos, 'Más vendido': p.producto_mas_vendido,
      })));

      XLSX.writeFile(wb, `respaldo-montabone-${fmtFecha()}.xlsx`);
      setMsg('✅ Descargado. Revisa tu carpeta de descargas.');
    } catch (e: unknown) {
      setMsg('Error: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
    setDescargando(false);
  }

  const incluye = ['Clientes', 'Inventario', 'Pedidos', 'Ventas al detalle', 'Ventas en eventos', 'Facturas', 'Costos', 'Mermas', 'Prospectos', 'Períodos'];

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#f5f5f5' }}>Respaldo</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Descarga todos tus datos en un Excel</p>
      </div>

      <div className="rounded-xl border p-5 mb-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
        <p className="text-sm mb-4" style={{ color: '#9ca3af' }}>
          Se genera un archivo <strong style={{ color: '#f5f5f5' }}>Excel</strong> con una hoja por cada sección. Útil para respaldar tu información o pasársela al contador.
        </p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {incluye.map((s) => (
            <div key={s} className="flex items-center gap-2 text-xs" style={{ color: '#6b7280' }}>
              <span style={{ color: '#4caf50' }}>✓</span> {s}
            </div>
          ))}
        </div>
        <button onClick={descargar} disabled={descargando}
          className="w-full py-3 rounded-lg font-bold text-sm text-white disabled:opacity-40"
          style={{ backgroundColor: '#4caf50' }}>
          {descargando ? 'Generando...' : '⬇️ Descargar respaldo (Excel)'}
        </button>
        {msg && <p className="text-xs mt-3 text-center" style={{ color: msg.startsWith('Error') ? '#e53935' : '#6b7280' }}>{msg}</p>}
      </div>

      <p className="text-xs" style={{ color: '#4b5563' }}>
        💡 Recomendación: descarga un respaldo cada cierto tiempo (por ejemplo, al cerrar cada período) y guárdalo en tu computador o en la nube.
      </p>
    </div>
  );
}
