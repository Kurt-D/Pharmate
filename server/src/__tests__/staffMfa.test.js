import { generateTotpSecret, totpCode, verifyTotp } from '../services/staffMfa.js';

describe('staff TOTP verification', () => {
  test('accepts a current authenticator code and rejects replay', async () => {
    const secret = generateTotpSecret();
    const now = 1_800_000_000_000;
    const validCode = totpCode(secret, Math.floor(now / 30_000));
    const counter = verifyTotp(secret, validCode, now);
    expect(counter).not.toBeNull();
    expect(verifyTotp(secret, validCode, now, counter)).toBeNull();
  });
});
