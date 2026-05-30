import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DomainError } from '@mata/shared/errors';
import type { BankDetailsEncrypted } from '@mata/shared/schemas';
import { env } from '../env.js';

/**
 * Chiffrement applicatif AES-256-GCM.
 *
 * Utilisé au Lot 2 pour `producer_profiles.bank_details`, manipulable plus tard
 * pour tout payload sensible (codes téléconseiller au Lot 6, par exemple).
 *
 * Format en DB (cf. BankDetailsEncryptedSchema dans `@mata/shared`) :
 *   { ciphertext: base64, iv: base64, tag: base64, alg: 'aes-256-gcm', v: 1 }
 *
 * Garanties :
 *  - Confidentialité  : AES-256 (clé 256 bits)
 *  - Authenticité     : GCM auth tag 128 bits — toute modification du
 *                       ciphertext, du tag, de l'IV ou de la clé fait
 *                       lever une erreur au déchiffrement.
 *  - Nonce            : IV 96 bits aléatoire à chaque chiffrement.
 *                       Pas de risque de réutilisation tant qu'on n'a pas
 *                       atteint 2^32 chiffrements avec la même clé.
 *  - Versioning       : `v: 1` figé pour permettre rotation future
 *                       (passage à AES-SIV ou rotation de clé).
 *
 * Référence : CLAUDE.md §G4 « bank_details chiffré applicativement »,
 *             §G8 « Chiffrement applicatif » + ARCHITECTURE.md §9.
 */

const ALG = 'aes-256-gcm' as const;
const KEY_LENGTH = 32; // bytes (256 bits)
const IV_LENGTH = 12; // bytes (96 bits, recommandation NIST pour GCM)
const VERSION = 1 as const;

let cachedKey: Buffer | null = null;

/**
 * Décode `env.ENCRYPTION_KEY` (base64) en buffer 32 bytes. Met en cache pour
 * éviter de re-décoder à chaque appel. Lève DomainError si la clé est absente
 * ou mal formée — appelé au plus tard à la première opération crypto.
 *
 * En `NODE_ENV=test`, les tests qui ont besoin de chiffrer passent par
 * `encryptWithKey` / `decryptWithKey` (clé fournie en arg), pour ne pas
 * polluer `process.env`.
 */
function requireEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  if (!env.ENCRYPTION_KEY) {
    throw new DomainError('INTERNAL', 'ENCRYPTION_KEY env var manquante');
  }
  const buf = decodeKey(env.ENCRYPTION_KEY);
  cachedKey = buf;
  return buf;
}

/**
 * Décode une clé base64 et vérifie sa longueur. Exporté pour permettre aux
 * tests d'instancier une clé jetable sans toucher à l'env.
 */
export function decodeKey(base64: string): Buffer {
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    throw new DomainError('INTERNAL', "ENCRYPTION_KEY n'est pas du base64 valide");
  }
  if (buf.length !== KEY_LENGTH) {
    throw new DomainError(
      'INTERNAL',
      `ENCRYPTION_KEY doit décoder en ${KEY_LENGTH} bytes (reçu ${buf.length})`,
    );
  }
  return buf;
}

// ─────────────────────────────────────────────────────────────────
// API avec clé explicite (utilisée par les tests, et en interne)

export function encryptWithKey(key: Buffer, plaintext: string): BankDetailsEncrypted {
  if (key.length !== KEY_LENGTH) {
    throw new DomainError('INTERNAL', `Clé de chiffrement invalide (${key.length} bytes)`);
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALG, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    alg: ALG,
    v: VERSION,
  };
}

export function decryptWithKey(key: Buffer, payload: BankDetailsEncrypted): string {
  if (key.length !== KEY_LENGTH) {
    throw new DomainError('INTERNAL', `Clé de chiffrement invalide (${key.length} bytes)`);
  }
  if (payload.alg !== ALG) {
    throw new DomainError('INTERNAL', `Algorithme non supporté : ${payload.alg}`);
  }
  if (payload.v !== VERSION) {
    throw new DomainError('INTERNAL', `Version de payload non supportée : ${payload.v}`);
  }
  const decipher = createDecipheriv(ALG, key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  try {
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch (cause) {
    // GCM auth fail : ciphertext, tag, iv ou clé modifié.
    throw new DomainError('INTERNAL', 'Déchiffrement échoué (authentification GCM)', { cause });
  }
}

// ─────────────────────────────────────────────────────────────────
// API par défaut (utilise env.ENCRYPTION_KEY)

export function encrypt(plaintext: string): BankDetailsEncrypted {
  return encryptWithKey(requireEncryptionKey(), plaintext);
}

export function decrypt(payload: BankDetailsEncrypted): string {
  return decryptWithKey(requireEncryptionKey(), payload);
}

/**
 * Réservé aux tests : invalide le cache de clé pour forcer re-lecture
 * de `env.ENCRYPTION_KEY` au prochain appel.
 */
export function _resetKeyCacheForTests(): void {
  cachedKey = null;
}
