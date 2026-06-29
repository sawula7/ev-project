import React, { useEffect, useState } from 'react';
import { getChargers, provisionCharger } from '../services/api';

export default function ChargersPage() {
  const [chargers, setChargers] = useState<any[]>([]);
  const [serial, setSerial] = useState('');
  const [authKey, setAuthKey] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => { getChargers().then(setChargers); }, []);

  async function handleProvision(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await provisionCharger({ serialNumber: serial, authorizationKey: authKey });
      setMsg(`Provisioned. Claim code: ${res.claimCode}`);
      setSerial(''); setAuthKey('');
      getChargers().then(setChargers);
    } catch { setMsg('Failed'); }
  }

  return (
    <div>
      <h1 style={h1}>Chargers</h1>

      <form onSubmit={handleProvision} style={form}>
        <h3 style={{ marginBottom: 12 }}>Provision new charger</h3>
        <input style={input} placeholder="Serial number" value={serial} onChange={e => setSerial(e.target.value)} />
        <input style={input} placeholder="Authorization key (OCPP Basic Auth password)" value={authKey} onChange={e => setAuthKey(e.target.value)} />
        <button style={btn} type="submit">Provision</button>
        {msg && <p style={{ marginTop: 8, color: '#1a7f37' }}>{msg}</p>}
      </form>

      <table style={table}>
        <thead><tr>{['Serial', 'Status', 'Owner', 'Connector', 'Price/kWh', 'Last Heartbeat'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {chargers.map(c => (
            <tr key={c._id}>
              <td style={td}>{c.serialNumber}</td>
              <td style={td}><span style={{ color: c.status === 'idle' ? '#1a7f37' : c.status === 'charging' ? '#f59e0b' : '#ef4444' }}>{c.status}</span></td>
              <td style={td}>{(c.ownerId as any)?.name ?? '—'}</td>
              <td style={td}>{c.connectorType}</td>
              <td style={td}>{c.pricePerKwh}</td>
              <td style={td}>{c.lastHeartbeat ? new Date(c.lastHeartbeat).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const h1: React.CSSProperties = { fontSize: 22, fontWeight: 700, marginBottom: 24 };
const form: React.CSSProperties = { background: '#fff', padding: 20, borderRadius: 10, marginBottom: 24, maxWidth: 480 };
const input: React.CSSProperties = { display: 'block', width: '100%', padding: 10, marginBottom: 10, borderRadius: 6, border: '1px solid #ddd' };
const btn: React.CSSProperties = { background: '#1e293b', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: 6, cursor: 'pointer' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, overflow: 'hidden' };
const th: React.CSSProperties = { background: '#f8fafc', padding: '10px 14px', textAlign: 'left', fontSize: 13, color: '#64748b' };
const td: React.CSSProperties = { padding: '12px 14px', borderTop: '1px solid #f1f5f9', fontSize: 14 };
