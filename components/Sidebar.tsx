'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const NAV = [
  { href: '/', label: 'Inicio', icon: '🏠' },
  { href: '/pedidos', label: 'Pedidos', icon: '📦' },
  { href: '/clientes', label: 'Clientes', icon: '👥' },
  { href: '/datos-clientes', label: 'Datos Clientes', icon: '📇' },
  { href: '/estado-cuenta', label: 'Estado de Cuenta', icon: '🧾' },
  { href: '/prospectos', label: 'Prospectos', icon: '🎯' },
  { href: '/venta-mayor', label: 'Venta por Mayor', icon: '⚖️' },
  { href: '/ventas-mes', label: 'Venta Mensual', icon: '📈' },
  { href: '/proyeccion', label: 'Proyección', icon: '🔮' },
  { href: '/ventas-eventos', label: 'Eventos', icon: '🎪' },
  { href: '/inventario', label: 'Inventario', icon: '🗃️' },
  { href: '/merma', label: 'Merma', icon: '📉' },
  { href: '/costos', label: 'Proveedores', icon: '🏭' },
  { href: '/facturas', label: 'Facturas', icon: '🧾' },
  { href: '/cobros', label: 'Cobros', icon: '💰' },
  { href: '/gastos', label: 'Gastos', icon: '🧾' },
  { href: '/periodos', label: 'Períodos', icon: '🔒' },
  { href: '/tareas', label: 'Pendientes', icon: '✅' },
  { href: '/reportes', label: 'Reportes', icon: '📊' },
  { href: '/respaldo', label: 'Respaldo', icon: '💾' },
];

type NavItem = typeof NAV[number];
const STORAGE_KEY = 'montabone_nav_orden';
// Debe coincidir con LOGIN_ACTIVO en AuthGate.tsx
const LOGIN_ACTIVO = false;

// Aplica el orden guardado y agrega ítems nuevos que no estén en él
function aplicarOrden(guardado: string[]): NavItem[] {
  const porHref = new Map(NAV.map((n) => [n.href, n]));
  const ordenados: NavItem[] = [];
  for (const href of guardado) {
    const item = porHref.get(href);
    if (item) { ordenados.push(item); porHref.delete(href); }
  }
  // Los que quedaron (nuevos) se agregan al final en su orden original
  for (const n of NAV) if (porHref.has(n.href)) ordenados.push(n);
  return ordenados;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [items, setItems] = useState<NavItem[]>(NAV);
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(aplicarOrden(JSON.parse(raw)));
    } catch {}
  }, []);

  function guardar(nuevos: NavItem[]) {
    setItems(nuevos);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevos.map((i) => i.href))); } catch {}
  }

  function mover(index: number, dir: -1 | 1) {
    const destino = index + dir;
    if (destino < 0 || destino >= items.length) return;
    const copia = [...items];
    [copia[index], copia[destino]] = [copia[destino], copia[index]];
    guardar(copia);
  }

  function resetear() {
    setItems(NAV);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  return (
    <>
      {/* Sidebar desktop */}
      <aside
        className="hidden md:flex flex-col w-56 h-screen border-r"
        style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}
      >
        <div className="p-4 border-b flex items-center justify-center" style={{ borderColor: '#2a2a2a' }}>
          <Image src="/logo.jpg" alt="Montabone" width={130} height={130} style={{ objectFit: 'contain', borderRadius: 8 }} />
        </div>

        {/* Botón editar orden */}
        <div className="px-3 pt-3 flex items-center justify-between">
          <button onClick={() => setEditando(!editando)}
            className="text-xs px-2 py-1 rounded border"
            style={{ borderColor: editando ? '#e53935' : '#2a2a2a', color: editando ? '#e53935' : '#6b7280' }}>
            {editando ? '✓ Listo' : '↕ Ordenar menú'}
          </button>
          {editando && (
            <button onClick={resetear} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#2a2a2a', color: '#6b7280' }}>
              Restaurar
            </button>
          )}
        </div>

        <nav className="flex-1 min-h-0 p-3 space-y-1 overflow-y-auto">
          {items.map((item, i) => {
            const active = pathname === item.href;
            if (editando) {
              return (
                <div key={item.href} className="flex items-center gap-1 px-2 py-1.5 rounded-lg" style={{ backgroundColor: '#1c1c1c' }}>
                  <span className="text-sm">{item.icon}</span>
                  <span className="flex-1 text-sm truncate" style={{ color: '#9ca3af' }}>{item.label}</span>
                  <button onClick={() => mover(i, -1)} disabled={i === 0}
                    className="w-6 h-6 rounded flex items-center justify-center text-xs disabled:opacity-20"
                    style={{ backgroundColor: '#2a2a2a', color: '#f5f5f5' }}>▲</button>
                  <button onClick={() => mover(i, 1)} disabled={i === items.length - 1}
                    className="w-6 h-6 rounded flex items-center justify-center text-xs disabled:opacity-20"
                    style={{ backgroundColor: '#2a2a2a', color: '#f5f5f5' }}>▼</button>
                </div>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium"
                style={{
                  backgroundColor: active ? '#e53935' + '20' : 'transparent',
                  color: active ? '#e53935' : '#9ca3af',
                  borderLeft: active ? '3px solid #e53935' : '3px solid transparent',
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Cerrar sesión */}
        {LOGIN_ACTIVO && (
          <div className="p-3 border-t" style={{ borderColor: '#2a2a2a' }}>
            <button onClick={() => supabase.auth.signOut()}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium"
              style={{ color: '#6b7280' }}>
              <span>🚪</span><span>Cerrar sesión</span>
            </button>
          </div>
        )}
      </aside>

      {/* Bottom nav mobile */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t flex"
        style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}
      >
        {items.slice(0, 5).map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center py-2 gap-0.5"
              style={{ color: active ? '#e53935' : '#6b7280' }}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-xs">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
