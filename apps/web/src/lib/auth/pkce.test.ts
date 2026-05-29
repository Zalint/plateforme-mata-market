import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generatePkce, generateRandomState } from './pkce';

describe('pkce', () => {
  it('génère un challenge S256 dérivé du verifier', () => {
    const { verifier, challenge } = generatePkce();
    const expected = createHash('sha256')
      .update(verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(challenge).toBe(expected);
  });

  it('verifier respecte les contraintes RFC 7636 (43-128 chars, base64url)', () => {
    const { verifier } = generatePkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it('génère des states uniques', () => {
    const states = new Set(Array.from({ length: 100 }, () => generateRandomState()));
    expect(states.size).toBe(100);
  });
});
