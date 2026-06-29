import React, { useEffect, useState } from 'react';
import { getReconciliation } from '../services/api';

export default function ReconciliationPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getReconciliation().then(setData).finally(() => setLoading(false)); }, []);

  if (loading) return <p>Loading...</p>;
  if (!data) return <p>Error loading reconciliation data</p>;

  const ok = data.drift === 0;

  return (
    <div>
      <h1 style={h1}>Reconciliation</h1>
      <div style={{ ...statusBar, background: ok ? '#dcfce7' : '#fee2e2' }}>
        <span style={{ fontWeight: 700, color: ok ? '#166534' : '#991b1b', fontSize: 18 }}>
          {ok ? '✓ Balanced' : `⚠ Drift detected: ${data.drift}`}
        </span>
      </div>
      <div style={grid}>
        <Stat label="Total wallet balances" value={fmt(data.walletTotal)} />
        <Stat label="Total TOPUPs received" value={fmt(data.topupTotal)} />
        <Stat label="Total PAYOUTs sent" value={fmt(data.payoutTotal)} />
        <Stat label="Expected held (topups − payouts)" value={fmt(data.topupTotal - data.payoutTotal)} />
        <Stat label="Drift (wallets − expected)" value={fmt(data.drift)} highlight={!ok} />
      </div>
      <p style={{ color: '#666', marginTop: 16, fontSize: 13 }}>
        All amounts in smallest currency unit. Run reconciliation job checks this every hour automatically.
      </p>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: 20 }}>
      <div style={{ color: '#64748b', fontSize: 13, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: highlight ? '#ef4444' : '#111' }}>{value}</div>
    </div>
  );
}

function fmt(n: number) { return n.toLocaleString(); }

const h1: React.CSSProperties = { fontSize: 22, fontWeight: 700, marginBottom: 24 };
const statusBar: React.CSSProperties = { borderRadius: 10, padding: '16px 24px', marginBottom: 24 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 };
