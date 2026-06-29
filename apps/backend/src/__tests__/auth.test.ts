// Set required env vars before importing config
process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';

import { hashPassword, verifyPassword, signToken, verifyToken } from '../services/auth';

describe('auth service', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('supersecret123');
    expect(hash).not.toBe('supersecret123');
    expect(await verifyPassword('supersecret123', hash)).toBe(true);
    expect(await verifyPassword('wrongpassword', hash)).toBe(false);
  });

  it('signs and verifies a JWT', () => {
    const payload = { sub: 'user123', role: 'driver' as const };
    const token = signToken(payload);
    const decoded = verifyToken(token);
    expect(decoded.sub).toBe('user123');
    expect(decoded.role).toBe('driver');
  });

  it('rejects a tampered token', () => {
    const token = signToken({ sub: 'user123', role: 'driver' });
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(() => verifyToken(tampered)).toThrow();
  });
});
