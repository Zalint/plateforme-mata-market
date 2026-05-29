import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeKey, decryptWithKey, encryptWithKey } from './crypto.js';

function makeKey(): Buffer {
  return randomBytes(32);
}

describe('encryptWithKey / decryptWithKey', () => {
  it('roundtrip : decrypt(encrypt(x)) === x', () => {
    const key = makeKey();
    const plaintext = JSON.stringify({
      holder: 'Mor Diop',
      iban: 'SN08SN0100100123456789012345',
      bankName: 'BOA Sénégal',
    });
    const enc = encryptWithKey(key, plaintext);
    expect(decryptWithKey(key, enc)).toBe(plaintext);
  });

  it('produit un IV différent à chaque appel (pas de réutilisation)', () => {
    const key = makeKey();
    const a = encryptWithKey(key, 'même message');
    const b = encryptWithKey(key, 'même message');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('produit un payload conforme au schema (alg + v figés)', () => {
    const enc = encryptWithKey(makeKey(), 'x');
    expect(enc.alg).toBe('aes-256-gcm');
    expect(enc.v).toBe(1);
    expect(typeof enc.ciphertext).toBe('string');
    expect(typeof enc.iv).toBe('string');
    expect(typeof enc.tag).toBe('string');
  });

  it('rejette une clé de mauvaise longueur', () => {
    expect(() => encryptWithKey(Buffer.alloc(16), 'x')).toThrow(/Clé de chiffrement invalide/);
    expect(() => encryptWithKey(Buffer.alloc(64), 'x')).toThrow(/Clé de chiffrement invalide/);
  });

  it('decrypt avec mauvaise clé → erreur GCM auth', () => {
    const enc = encryptWithKey(makeKey(), 'secret');
    expect(() => decryptWithKey(makeKey(), enc)).toThrow(/Déchiffrement échoué/);
  });

  it('decrypt avec tag modifié → erreur GCM auth', () => {
    const key = makeKey();
    const enc = encryptWithKey(key, 'secret');
    const tampered = { ...enc, tag: Buffer.from('a'.repeat(16)).toString('base64') };
    expect(() => decryptWithKey(key, tampered)).toThrow(/Déchiffrement échoué/);
  });

  it('decrypt avec ciphertext modifié → erreur GCM auth', () => {
    const key = makeKey();
    const enc = encryptWithKey(key, 'message original');
    // Modifier le premier byte du ciphertext
    const ctBuf = Buffer.from(enc.ciphertext, 'base64');
    ctBuf[0] = ctBuf[0] ^ 0xff;
    const tampered = { ...enc, ciphertext: ctBuf.toString('base64') };
    expect(() => decryptWithKey(key, tampered)).toThrow(/Déchiffrement échoué/);
  });

  it('rejette un alg inconnu ou une version non supportée', () => {
    const key = makeKey();
    const enc = encryptWithKey(key, 'x');
    expect(() =>
      decryptWithKey(key, { ...enc, alg: 'aes-128-cbc' as unknown as typeof enc.alg }),
    ).toThrow(/Algorithme non supporté/);
    expect(() => decryptWithKey(key, { ...enc, v: 2 as unknown as typeof enc.v })).toThrow(
      /Version de payload non supportée/,
    );
  });
});

describe('decodeKey', () => {
  it('décode une clé base64 de 32 bytes', () => {
    const raw = randomBytes(32);
    const b64 = raw.toString('base64');
    const decoded = decodeKey(b64);
    expect(decoded.equals(raw)).toBe(true);
  });

  it('rejette une clé de mauvaise longueur', () => {
    expect(() => decodeKey(randomBytes(16).toString('base64'))).toThrow(/doit décoder en 32 bytes/);
    expect(() => decodeKey(randomBytes(64).toString('base64'))).toThrow(/doit décoder en 32 bytes/);
  });
});
