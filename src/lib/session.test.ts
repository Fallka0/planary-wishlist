import { describe, expect, it } from 'vitest';
import { sessionFromTokens } from './session';

function token(claims: object) {
  const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const bytes = new TextEncoder().encode(JSON.stringify(claims));
  return `${b64('{"alg":"HS256"}')}.${b64(String.fromCharCode(...bytes))}.sig`;
}

describe('sessionFromTokens', () => {
  it('reads the planary-auth claims, names in UTF-8', () => {
    const s = sessionFromTokens(token({ sub: 'u1', email: 'noa@example.ch', name: 'Noëmi Brünner', exp: 2000000000 }), 'r1');
    expect(s).toEqual({
      accessToken: expect.any(String),
      refreshToken: 'r1',
      userId: 'u1',
      email: 'noa@example.ch',
      name: 'Noëmi Brünner',
      expiresAt: 2000000000,
    });
  });

  it('falls back to the email for the name', () => {
    expect(sessionFromTokens(token({ sub: 'u1', email: 'noa@example.ch', exp: 1 }), null)?.name).toBe('noa');
  });

  it('rejects tokens without a user or expiry', () => {
    expect(sessionFromTokens(token({ email: 'x@y.ch', exp: 1 }), null)).toBeNull();
    expect(sessionFromTokens(token({ sub: 'u1' }), null)).toBeNull();
    expect(sessionFromTokens('not-a-token', null)).toBeNull();
  });
});
