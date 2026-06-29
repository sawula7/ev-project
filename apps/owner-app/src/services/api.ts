import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('owner_auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function ownerLogin(email: string, password: string) {
  const res = await api.post('/auth/owner/login', { email, password });
  return res.data.data as { token: string };
}

export async function ownerRegister(email: string, password: string, name: string, businessName?: string) {
  const res = await api.post('/auth/owner/register', { email, password, name, businessName });
  return res.data.data as { token: string };
}

export async function getMe() {
  const res = await api.get('/owner/me');
  return res.data.data as { owner: OwnerData; wallet: { balance: number; currency: string } };
}

export async function getMyChargers() {
  const res = await api.get('/owner/chargers');
  return res.data.data as ChargerData[];
}

export async function claimCharger(serialNumber: string, claimCode: string) {
  const res = await api.post('/owner/chargers/claim', { serialNumber, claimCode });
  return res.data.data as { chargerId: string };
}

export async function updateCharger(id: string, data: Partial<{ pricePerKwh: number; connectorType: string; location: { lat: number; lng: number; address: string } }>) {
  const res = await api.patch(`/owner/chargers/${id}`, data);
  return res.data.data as ChargerData;
}

export async function getMySessions() {
  const res = await api.get('/owner/sessions');
  return res.data.data as SessionData[];
}

export async function requestPayout(amount: number) {
  const res = await api.post('/owner/payouts/request', { amount });
  return res.data.data as { payoutId: string; status: string };
}

export async function getMyPayouts() {
  const res = await api.get('/owner/payouts');
  return res.data.data as PayoutData[];
}

export interface OwnerData { _id: string; name: string; email: string; kycVerified: boolean; }
export interface ChargerData { _id: string; serialNumber: string; status: string; location: { lat: number; lng: number; address: string }; connectorType: string; pricePerKwh: number; }
export interface SessionData { _id: string; chargerId: any; status: string; startTime?: string; stopTime?: string; energyDeliveredWh: number; grossAmount: number; ownerPayoutAmount: number; }
export interface PayoutData { _id: string; requestedAmount: number; status: string; createdAt: string; bankTransferReference?: string; }
