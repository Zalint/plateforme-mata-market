import { createHash } from 'node:crypto';
import { DomainError } from '@mata/shared/errors';
import { env } from '../env.js';

/**
 * Helpers Cloudinary · génération de signature pour upload direct browser.
 *
 * Pattern (cf. ARCHITECTURE.md §7) :
 *  1. Front demande `/v1/uploads/signature` (folder figé serveur, max_size,
 *     formats restreints)
 *  2. Navigateur uploade directement vers `https://api.cloudinary.com/.../upload`
 *     avec FormData {file, signature, timestamp, api_key, folder, ...}
 *  3. Front transmet `public_id` retourné à l'API métier (ex: attachPhotos)
 *  4. (Lot 6+) API valide existence via cloudinary.api.resource avant DB write
 *
 * INVARIANTS DE SÉCURITÉ :
 *  - `API_SECRET` ne quitte JAMAIS le serveur
 *  - `folder` est figé côté serveur (le client ne choisit pas où il upload)
 *  - `allowed_formats` est inclus dans la signature (Cloudinary refuse les
 *    formats non autorisés). NB : `max_file_size` n'est PAS un paramètre d'upload
 *    Cloudinary — on ne le signe donc PAS (sinon la signature ne correspond plus
 *    aux params réellement envoyés → 401). La taille est contrôlée côté client
 *    (pré-check) via `maxFileSize` renvoyé dans le payload.
 *
 * Référence : CLAUDE.md §G5 « Cloudinary : upload direct navigateur avec
 *             signature serveur. Jamais API_SECRET côté client. »
 */

export type UploadSignaturePayload = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
  maxFileSize: number;
  allowedFormats: string;
  uploadUrl: string;
};

export type SignUploadInput = {
  folder: string; // ex: `mata/offers/${userId}/${offerId}`
  maxFileSize?: number; // octets, défaut 5 Mo
  allowedFormats?: readonly string[]; // défaut ['jpg', 'jpeg', 'png', 'webp']
};

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_FORMATS = ['jpg', 'jpeg', 'png', 'webp'] as const;

function requireCloudinaryConfig(): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
} {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new DomainError(
      'EXTERNAL_FAILURE',
      'Cloudinary non configuré (CLOUDINARY_CLOUD_NAME, _API_KEY, _API_SECRET requis)',
    );
  }
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
  };
}

/**
 * Génère une signature Cloudinary v1 (SHA1).
 *
 * Algorithme : SHA1(querystring_alphabétique_des_paramètres + api_secret)
 * où le querystring exclut `file`, `cloud_name`, `api_key`, `resource_type` et `signature`.
 *
 * Cf. https://cloudinary.com/documentation/signatures
 */
export function signUpload(input: SignUploadInput): UploadSignaturePayload {
  const { cloudName, apiKey, apiSecret } = requireCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const maxFileSize = input.maxFileSize ?? DEFAULT_MAX_BYTES;
  const allowedFormats = (input.allowedFormats ?? DEFAULT_FORMATS).join(',');

  // Paramètres signés (ordre alphabétique). DOIT correspondre EXACTEMENT aux
  // params envoyés par le client à Cloudinary (hors file/api_key/signature),
  // sinon Cloudinary recalcule une signature différente → 401. `max_file_size`
  // n'est pas un param d'upload Cloudinary → exclu de la signature.
  const params: Record<string, string | number> = {
    allowed_formats: allowedFormats,
    folder: input.folder,
    timestamp,
  };
  const signature = computeSignature(params, apiSecret);

  return {
    cloudName,
    apiKey,
    timestamp,
    folder: input.folder,
    signature,
    maxFileSize,
    allowedFormats,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
  };
}

/**
 * Exposé pour les tests : pure function, pas de dépendance env.
 */
export function computeSignature(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const sortedKeys = Object.keys(params).sort();
  const queryString = sortedKeys.map((k) => `${k}=${params[k]}`).join('&');
  return createHash('sha1')
    .update(queryString + apiSecret)
    .digest('hex');
}
