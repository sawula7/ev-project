import React, { useEffect, useState } from 'react';
import { getPayouts, completePayout } from '../services/api';

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [refs, setRefs] = useState<Record<string, string>>({});

  function load() { getPayouts('requested').then(setPayouts); }
  useEffect(load, []);

  async function handleComplete(payoutId: string) {
    const ref = refs[payoutId];
    if (!ref) { alert('Enter a bank transfer reference first'); return; }
    try {
      await completePayout(payoutId, ref);
      load();
    } catch (e: any) { alert(e?.response?.data?.error ?? 'Error'); }
  }

  return (
    <div>
      <h1 style={h1}>Pending Payouts</h1>
      {payouts.length === 0 && <p style={{ color: '#9ca3af' }}>No pending payouts</p>}
      {payouts.map(p => (
        <div key={p._id} style={card}>
          <div>
            <strong>{(p.ownerId as any)?.name ?? 'Unknown'}</strong>
            <span style={{ marginLeft: 12, color: '#666' }}>{(p.ownerId as any)?.email}</span>
          </div>
          <div style={{ marginTop: 6 }}>Amount: <strong>LKR {(p.requestedAmount / 100).toFixed(2)}</strong></div>
          <div style={{ marginTop: 4, color: '#666', fontSize: 13 }}>
            Bank: {(p.ownerId as any)?.bankAccount?.bankName ?? '—'} / {(p.ownerId as any)?.bankAccount?.accountNumber ?? '—'}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <input style={input} placeholder="Bank transfer reference" value={refs[p._id] ?? ''}
              onChange={e => setRefs(r => ({ ...r, [p._id]: e.target.value }))} />
            <button style={btn} onClick={() => handleComplete(p._id)}>Mark Complete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

const h1: React.CSSProperties = { fontSize: 22, fontWeight: 700, marginBottom: 24 };
const card: React.CSSProperties = { background: '#fff', borderRadius: 10, padding: 20, marginBottom: 16 };
const input: React.CSSProperties = { flex: 1, padding: 10, borderRadius: 6, border: '1px solid #ddd' };
const btn: React.CSSProperties = { background: '#1a7f37', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: 6, cursor: 'pointer' };
