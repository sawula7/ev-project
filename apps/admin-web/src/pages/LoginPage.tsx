import React, { useState } from 'react';
import { setAdminToken } from '../services/api';

export default function LoginPage() {
  const [token, setToken] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (token.trim()) { setAdminToken(token.trim()); window.location.reload(); }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <form onSubmit={handleSubmit} style={{ background: '#fff', padding: 32, borderRadius: 12, width: 360 }}>
        <h2 style={{ marginBottom: 16 }}>Admin Login</h2>
        <p style={{ color: '#666', marginBottom: 16, fontSize: 14 }}>Paste a valid admin JWT token to access the dashboard.</p>
        <textarea style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ddd', marginBottom: 12, height: 80 }}
          value={token} onChange={(e) => setToken(e.target.value)} placeholder="Bearer token..." />
        <button style={{ width: '100%', background: '#1e293b', color: '#fff', padding: 12, border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Enter
        </button>
      </form>
    </div>
  );
}
