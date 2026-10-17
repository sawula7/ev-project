import type { Charger } from '@ev/db';

// Strips OCPP secrets (authorizationKey, claimCode) and reshapes the flat
// lat/lng/address columns into the nested `location` object the apps expect.
export function toPublicCharger(charger: Charger) {
  const { authorizationKey, claimCode, lat, lng, address, ...rest } = charger;
  return {
    ...rest,
    location: { lat: lat ?? 0, lng: lng ?? 0, address: address ?? '' },
  };
}
