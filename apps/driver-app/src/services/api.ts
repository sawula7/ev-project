import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function driverRegister(email: string, password: string, name: string) {
  const res = await api.post('/auth/driver/register', { email, password, name });
  return res.data.data as { token: string };
}

export async function driverLogin(email: string, password: string) {
  const res = await api.post('/auth/driver/login', { email, password });
  return res.data.data as { token: string };
}

// ── Chargers ──────────────────────────────────────────────────────────────────

export async function listChargers() {
  const res = await api.get('/chargers');
  return res.data.data as ChargerData[];
}

export async function getCharger(id: string) {
  const res = await api.get(`/chargers/${id}`);
  return res.data.data as ChargerData;
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function startSession(chargerId: string, connectorId = 1) {
  const res = await api.post('/sessions/start', { chargerId, connectorId });
  return res.data.data as { sessionId: string };
}

export async function stopSession(sessionId: string) {
  await api.post(`/sessions/${sessionId}/stop`);
}

export async function getSession(sessionId: string) {
  const res = await api.get(`/sessions/${sessionId}`);
  return res.data.data as SessionData;
}

export async function listSessions() {
  const res = await api.get('/sessions');
  return res.data.data as SessionData[];
}

// ── Wallet ────────────────────────────────────────────────────────────────────

export async function getWallet() {
  const res = await api.get('/wallet');
  return res.data.data as { balance: number; currency: string };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChargerData {
  _id: string;
  serialNumber: string;
  status: string;
  location: { lat: number; lng: number; address: string };
  connectorType: string;
  pricePerKwh: number;
}

export interface SessionData {
  _id: string;
  chargerId: string;
  status: string;
  startTime?: string;
  stopTime?: string;
  energyDeliveredWh: number;
  grossAmount: number;
  accruedAmount: number;
}
