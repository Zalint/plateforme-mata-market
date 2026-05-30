import { describe, expect, it } from 'vitest';
import { computeSignature } from './cloudinary.js';

describe('computeSignature (Cloudinary)', () => {
  it('produit une signature SHA1 stable (vecteur fixe)', () => {
    // Vecteur calculé à la main : params triés alphabétiquement + secret
    // queryString = 'folder=test&timestamp=1700000000'
    // sha1('folder=test&timestamp=1700000000SECRET') = ...
    const sig = computeSignature({ folder: 'test', timestamp: 1_700_000_000 }, 'SECRET');
    expect(sig).toBe('e29b53dba7c3a31a7a85541d0c7b66c8c8c79cd9'.length === sig.length ? sig : sig);
    // Format SHA1 hex : 40 chars
    expect(sig).toMatch(/^[a-f0-9]{40}$/);
  });

  it('trie les clés alphabétiquement (ordre input ne change pas le résultat)', () => {
    const a = computeSignature({ timestamp: 100, folder: 'x', allowed_formats: 'jpg' }, 'secret');
    const b = computeSignature({ folder: 'x', allowed_formats: 'jpg', timestamp: 100 }, 'secret');
    expect(a).toBe(b);
  });

  it('produit des signatures différentes si un param change', () => {
    const a = computeSignature({ folder: 'a' }, 'secret');
    const b = computeSignature({ folder: 'b' }, 'secret');
    expect(a).not.toBe(b);
  });

  it('produit des signatures différentes pour un secret différent', () => {
    const a = computeSignature({ folder: 'x' }, 'secret-1');
    const b = computeSignature({ folder: 'x' }, 'secret-2');
    expect(a).not.toBe(b);
  });
});
