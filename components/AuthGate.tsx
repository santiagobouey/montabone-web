'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<'cargando' | 'dentro' | 'fuera'>('cargando');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEstado(data.session ? 'dentro' : 'fuera'));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEstado(session ? 'dentro' : 'fuera');
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEntrando(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError('Correo o contraseña incorrectos');
      setEntrando(false);
    }
    // Si es correcto, onAuthStateChange cambia el estado a 'dentro'
  }

  if (estado === 'cargando') {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (estado === 'fuera') {
    return (
      <div className="w-full h-full flex items-center justify-center p-4" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-6">
            <Image src="/logo.jpg" alt="Montabone" width={120} height={120} style={{ objectFit: 'contain', borderRadius: 12 }} />
          </div>
          <div className="rounded-2xl border p-6" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
            <h1 className="text-xl font-bold mb-1 text-center" style={{ color: '#f5f5f5' }}>Montabone Gestión</h1>
            <p className="text-sm text-center mb-5" style={{ color: '#6b7280' }}>Ingresa con tu cuenta</p>
            <form onSubmit={entrar}>
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Correo</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username"
                placeholder="tu@correo.cl"
                className="w-full rounded-lg px-3 py-2.5 mb-3 text-sm border"
                style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>Contraseña</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-lg px-3 py-2.5 mb-4 text-sm border"
                style={{ backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', color: '#f5f5f5' }} />

              {error && <p className="text-xs mb-3 p-2 rounded-lg text-center" style={{ backgroundColor: '#e5393515', color: '#e53935' }}>{error}</p>}

              <button type="submit" disabled={entrando || !email || !password}
                className="w-full py-3 rounded-lg font-bold text-sm text-white disabled:opacity-40"
                style={{ backgroundColor: '#e53935' }}>
                {entrando ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
