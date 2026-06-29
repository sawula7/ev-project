import { COMMISSION_RATE_BPS } from '@ev/shared';

describe('billing math', () => {
  function computeAmounts(pricePerKwh: number, deliveredWh: number, commissionBps: number) {
    const grossAmount = Math.floor((pricePerKwh * deliveredWh) / 1000);
    const commissionAmount = Math.floor((grossAmount * commissionBps) / 10000);
    const ownerPayoutAmount = grossAmount - commissionAmount;
    return { grossAmount, commissionAmount, ownerPayoutAmount };
  }

  it('computes correct amounts for a 10 kWh session at LKR 50/kWh', () => {
    // 50 LKR/kWh = 5000 paisa/kWh (if unit is paisa)
    // 10 kWh = 10000 Wh
    const { grossAmount, commissionAmount, ownerPayoutAmount } = computeAmounts(5000, 10_000, COMMISSION_RATE_BPS);
    expect(grossAmount).toBe(50_000);
    expect(commissionAmount).toBe(5_000);
    expect(ownerPayoutAmount).toBe(45_000);
    expect(grossAmount).toBe(commissionAmount + ownerPayoutAmount);
  });

  it('never uses floats — always integer math', () => {
    const { grossAmount, commissionAmount, ownerPayoutAmount } = computeAmounts(3333, 7777, COMMISSION_RATE_BPS);
    expect(Number.isInteger(grossAmount)).toBe(true);
    expect(Number.isInteger(commissionAmount)).toBe(true);
    expect(Number.isInteger(ownerPayoutAmount)).toBe(true);
  });

  it('grossAmount equals commissionAmount + ownerPayoutAmount', () => {
    for (const [price, wh] of [[1000, 500], [9999, 12345], [1, 1]]) {
      const { grossAmount, commissionAmount, ownerPayoutAmount } = computeAmounts(price, wh, COMMISSION_RATE_BPS);
      expect(grossAmount).toBe(commissionAmount + ownerPayoutAmount);
    }
  });
});
