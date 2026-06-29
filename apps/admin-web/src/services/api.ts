import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auth — admin token is issued manually / via env for now
export function setAdminToken(token: string) { localStorage.setItem('admin_token', token); }
export function clearAdminToken() { localStorage.removeItem('admin_token'); }
export function getAdminToken() { return localStorage.getItem('admin_token'); }

// Chargers
export const getChargers = () => api.get('/admin/chargers').then(r => r.data.data);
export const provisionCharger = (data: { serialNumber: string; authorizationKey: string; connectorType?: string }) =>
  api.post('/admin/chargers', data).then(r => r.data.data);

// Sessions
export const getSessions = (page = 1) => api.get(`/admin/sessions?page=${page}`).then(r => r.data);

// Owners
export const getOwners = () => api.get('/admin/owners').then(r => r.data.data);
export const verifyKyc = (ownerId: string, verified: boolean) =>
  api.patch(`/admin/owners/${ownerId}/kyc`, { verified }).then(r => r.data);

// Drivers
export const getDrivers = () => api.get('/admin/drivers').then(r => r.data.data);

// Payouts
export const getPayouts = (status = 'requested') => api.get(`/admin/payouts?status=${status}`).then(r => r.data.data);
export const completePayout = (payoutId: string, bankTransferReference: string) =>
  api.post(`/admin/payouts/${payoutId}/complete`, { bankTransferReference }).then(r => r.data);

// Reconciliation
export const getReconciliation = () => api.get('/admin/reconciliation').then(r => r.data.data);
