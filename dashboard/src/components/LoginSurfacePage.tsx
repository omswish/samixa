'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { DashboardSurface } from '../lib/dashboard-surface';

export default function LoginSurfacePage({ surface }: { surface: DashboardSurface }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/auth/session', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          return null;
        }

        return response.json();
      })
      .then((payload) => {
        if (!cancelled && payload?.session) {
          window.location.replace('/');
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ password })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Login failed.' }));
        throw new Error(payload.error || 'Login failed.');
      }

      window.location.replace('/');
    } catch (err: any) {
      setError(err?.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background:
          'radial-gradient(circle at top left, rgba(21,101,192,0.18), transparent 42%), linear-gradient(135deg, #f7f4ef 0%, #ece4d8 100%)'
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: 'min(420px, 100%)',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '0.8rem', letterSpacing: '0.16em', fontWeight: 800, color: '#1565c0' }}>
            {surface === 'admin' ? 'ADMIN ACCESS' : 'OPERATOR ACCESS'}
          </div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', color: 'var(--text-primary)' }}>Utkal IT Dashboard</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {surface === 'admin'
              ? 'Enter the admin password for the admin control portal.'
              : 'Enter the operator password for the live operator dashboard.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-primary)', fontWeight: 700 }}>
            {surface === 'admin' ? 'Admin password' : 'Operator password'}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              style={{
                borderRadius: '14px',
                border: '1px solid rgba(141,110,99,0.18)',
                background: 'rgba(255,255,255,0.78)',
                padding: '12px 14px',
                fontSize: '0.98rem',
                color: 'var(--text-primary)'
              }}
              required
            />
          </label>

          {error ? (
            <div
              style={{
                borderRadius: '12px',
                padding: '10px 12px',
                background: 'rgba(198,40,40,0.08)',
                border: '1px solid rgba(198,40,40,0.12)',
                color: '#b3261e',
                fontSize: '0.9rem'
              }}
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              border: 0,
              borderRadius: '14px',
              padding: '12px 16px',
              background: loading ? 'rgba(21,101,192,0.45)' : '#1565c0',
              color: '#fff',
              fontWeight: 800,
              letterSpacing: '0.08em',
              cursor: loading ? 'wait' : 'pointer'
            }}
          >
            {loading ? 'SIGNING IN...' : surface === 'admin' ? 'OPEN ADMIN PORTAL' : 'OPEN OPERATOR DASHBOARD'}
          </button>
        </form>
      </div>
    </main>
  );
}
