// Isolated unit tests for reconciliation math — no DB required

describe('reconciliation math', () => {
  function calcDrift(walletTotal: number, topupTotal: number, payoutTotal: number) {
    return walletTotal - (topupTotal - payoutTotal);
  }

  it('reports zero drift when balanced', () => {
    expect(calcDrift(90_000, 100_000, 10_000)).toBe(0);
  });

  it('detects positive drift (wallet > ledger — double credit bug)', () => {
    expect(calcDrift(91_000, 100_000, 10_000)).toBe(1_000);
  });

  it('detects negative drift (wallet < ledger — missed credit or extra payout)', () => {
    expect(calcDrift(89_000, 100_000, 10_000)).toBe(-1_000);
  });

  it('zero balances produce zero drift', () => {
    expect(calcDrift(0, 0, 0)).toBe(0);
  });
});
