import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import ChargersPage from './pages/ChargersPage';
import SessionsPage from './pages/SessionsPage';
import OwnersPage from './pages/OwnersPage';
import PayoutsPage from './pages/PayoutsPage';
import ReconciliationPage from './pages/ReconciliationPage';
import LoginPage from './pages/LoginPage';
import { getAdminToken } from './services/api';

function Nav() {
  return (
    <nav style={nav}>
      <span style={brand}>EV Admin</span>
      <Link style={link} to="/chargers">Chargers</Link>
      <Link style={link} to="/sessions">Sessions</Link>
      <Link style={link} to="/owners">Owners</Link>
      <Link style={link} to="/payouts">Payouts</Link>
      <Link style={link} to="/reconciliation">Reconciliation</Link>
    </nav>
  );
}

function App() {
  const token = getAdminToken();
  if (!token) return <BrowserRouter><Routes><Route path="*" element={<LoginPage />} /></Routes></BrowserRouter>;

  return (
    <BrowserRouter>
      <Nav />
      <div style={{ padding: 24 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/chargers" />} />
          <Route path="/chargers" element={<ChargersPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/owners" element={<OwnersPage />} />
          <Route path="/payouts" element={<PayoutsPage />} />
          <Route path="/reconciliation" element={<ReconciliationPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

const nav: React.CSSProperties = { background: '#1e293b', color: '#fff', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 24 };
const brand: React.CSSProperties = { fontWeight: 700, fontSize: 18, marginRight: 16 };
const link: React.CSSProperties = { color: '#94a3b8', textDecoration: 'none', fontSize: 14 };

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
