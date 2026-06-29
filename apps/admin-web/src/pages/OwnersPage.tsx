import React, { useEffect, useState } from 'react';
import { getOwners, verifyKyc } from '../services/api';

export default function OwnersPage() {
  const [owners, setOwners] = useState<any[]>([]);

  function load() { getOwners().then(setOwners); }
  useEffect(load, []);

  async function toggleKyc(ownerId: string, current: boolean) {
    await verifyKyc(ownerId, !current);
    load();
  }

  return (
    <div>
      <h1 style={h1}>Owners</h1>
      <table style={table}>
        <thead><tr>{['Name', 'Email', 'KYC', 'Action'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {owners.map(o => (
            <tr key={o._id}>
              <td style={td}>{o.name}</td>
              <td style={td}>{o.email}</td>
              <td style={td}>
                <span style={{ color: o.kycVerified ? '#1a7f37' : '#ef4444', fontWeight: 600 }}>
                  {o.kycVerified ? 'Verified' : 'Pending'}
                </span>
              </td>
              <td style={td}>
                <button style={btn} onClick={() => toggleKyc(o._id, o.kycVerified)}>
                  {o.kycVerified ? 'Revoke KYC' : 'Verify KYC'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const h1: React.CSSProperties = { fontSize: 22, fontWeight: 700, marginBottom: 24 };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, overflow: 'hidden' };
const th: React.CSSProperties = { background: '#f8fafc', padding: '10px 14px', textAlign: 'left', fontSize: 13, color: '#64748b' };
const td: React.CSSProperties = { padding: '12px 14px', borderTop: '1px solid #f1f5f9', fontSize: 14 };
const btn: React.CSSProperties = { background: '#1e293b', color: '#fff', padding: '6px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 };
