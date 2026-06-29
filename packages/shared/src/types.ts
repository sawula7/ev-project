// ─── Enums ───────────────────────────────────────────────────────────────────

export enum ChargerStatus {
  UNCLAIMED = 'unclaimed',
  IDLE = 'idle',
  CHARGING = 'charging',
  FAULTED = 'faulted',
  OFFLINE = 'offline',
}

export enum SessionStatus {
  INITIATED = 'initiated',
  ACTIVE = 'active',
  STOPPING = 'stopping',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum LedgerEntryType {
  TOPUP = 'TOPUP',
  SESSION_PAYMENT = 'SESSION_PAYMENT',
  COMMISSION = 'COMMISSION',
  PAYOUT = 'PAYOUT',
  REFUND = 'REFUND',
}

export enum PayoutStatus {
  REQUESTED = 'requested',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// ─── API response shapes ──────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Shared DTO types (used by both mobile apps and admin) ───────────────────

export interface ChargerDto {
  id: string;
  serialNumber: string;
  status: ChargerStatus;
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  connectorType: string;
  pricePerKwh: number; // integer, smallest unit
  ownerId?: string;
}

export interface SessionDto {
  id: string;
  chargerId: string;
  driverId: string;
  status: SessionStatus;
  startTime: string;
  stopTime?: string;
  energyDeliveredWh: number;
  grossAmount: number; // integer
  commissionAmount: number; // integer
  ownerPayoutAmount: number; // integer
}

export interface WalletDto {
  id: string;
  balance: number; // integer, smallest unit
  currency: string;
}
