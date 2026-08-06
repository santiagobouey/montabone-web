import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import AuthGate from '@/components/AuthGate';

export const metadata: Metadata = {
  title: 'Montabone Gestión',
  description: 'Sistema de gestión Cecinas Montabone',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="flex h-screen overflow-hidden" style={{ backgroundColor: '#0a0a0a' }}>
        <AuthGate>
          <Sidebar />
          <main className="flex-1 overflow-y-auto" style={{ backgroundColor: '#0a0a0a' }}>
            {children}
          </main>
        </AuthGate>
      </body>
    </html>
  );
}
