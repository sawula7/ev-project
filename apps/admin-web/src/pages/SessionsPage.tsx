import React, { useEffect, useState } from 'react';
import { getSessions } from '../services/api';

export default function SessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    getSessions(page).then((d: any) => { setSessions(d.data); setTotal(d.meta?.total ?? 0); });
  }, [page]);

  return (
    <div>
      <h1 style={h1}>Sessions ({total})</h1>
      <table style={table}>
        <thead><tr>{['Driver', 'Charger', 'Status', 'Energy (kWh)', 'Gross (LKR)', 'Start'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {sessions.map(s => (
            <tr key={s._id}>
              <td style={td}>{s.driverId?.name ?? s.driverId}</td>
              <td style={td}>{s.chargerId?.serialNumber ?? s.chargerId}</td>
              <td style={td}>{s.status}</td>
              <td style={td}>{(s.energyDeliveredWh / 1000).toFixed(2)}</td>
              <td style={td}>{(s.grossAmount / 100).toFixed(2)}</td>
              <td style={td}>{s.startTime ? new Date(s.startTime).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button style={btn} disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
        <span style={{ padding: '8px 12px' }}>Page {page}</span>
        <button style={btn} onClick={() => setPage(p => p + 1)}>Next</button>
      </div>
    </div>
  );
}

const h1: React.CSSProperties = { fontSize: 22, fontWeight: 700, marginBottom: 24 };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, overflow: 'hidden' };
const th: React.CSSProperties = { background: '#f8fafc', padding: '10px 14px', textAlign: 'left', fontSize: 13, color: '#64748b' };
const td: React.CSSProperties = { padding: '12px 14px', borderTop: '1px solid #f1f5f9', fontSize: 14 };
const btn: React.CSSProperties = { background: '#1e293b', color: '#fff', padding: '8px 16px', border: 'none', borderRadius: 6, cursor: 'pointer' };
