'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const nav = [
  { href: '/', label: 'Inicio', icon: '🏠' },
  { href: '/pedidos', label: 'Pedidos', icon: '📦' },
  { href: '/clientes', label: 'Clientes', icon: '👥' },
  { href: '/prospectos', label: 'Prospectos', icon: '🎯' },
  { href: '/inventario', label: 'Inventario', icon: '🗃️' },
  { href: '/cobros', label: 'Cobros', icon: '💰' },
  { href: '/gastos', label: 'Gastos', icon: '🧾' },
  { href: '/reportes', label: 'Reportes', icon: '📊' },
];

export default function Sidebar() {
  const pathname = usePathname();

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
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => {
            const active = pathname === item.href;
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
      </aside>

      {/* Bottom nav mobile */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t flex"
        style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}
      >
        {nav.slice(0, 5).map((item) => {
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
