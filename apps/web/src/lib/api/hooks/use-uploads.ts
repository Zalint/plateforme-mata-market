'use client';

import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../http-client';
import { useAuthToken } from '../use-auth-token';

type SignatureInput = {
  kind: 'offer' | 'producer-avatar' | 'producer-doc';
  offerId?: string;
};

type SignatureResponse = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
  maxFileSize: number;
  allowedFormats: string;
  uploadUrl: string;
};

export function useUploadSignature() {
  const token = useAuthToken();
  return useMutation({
    mutationFn: (input: SignatureInput) =>
      apiClient.post<SignatureResponse>('/v1/uploads/signature', input, token),
  });
}

/**
 * Upload direct vers Cloudinary depuis le navigateur.
 *
 * Flow : (1) requestSignature → (2) uploadToCloudinary → (3) attachToOffer.
 * Le caller orchestre ces 3 étapes.
 */
export async function uploadToCloudinary(
  signature: SignatureResponse,
  file: File,
): Promise<{ publicId: string; secureUrl: string }> {
  // Pré-check taille côté client (le max_file_size n'est pas enforce par la
  // signature Cloudinary — cf. lib/cloudinary.ts).
  if (file.size > signature.maxFileSize) {
    const mb = (signature.maxFileSize / (1024 * 1024)).toFixed(0);
    throw new Error(`Fichier trop volumineux (max ${mb} Mo)`);
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', signature.apiKey);
  formData.append('timestamp', String(signature.timestamp));
  formData.append('folder', signature.folder);
  // `allowed_formats` DOIT être envoyé car il fait partie des params signés —
  // sinon la signature recalculée par Cloudinary diffère → 401.
  formData.append('allowed_formats', signature.allowedFormats);
  formData.append('signature', signature.signature);

  const res = await fetch(signature.uploadUrl, { method: 'POST', body: formData });
  if (!res.ok) {
    throw new Error(`Cloudinary upload failed : ${res.status}`);
  }
  const body = (await res.json()) as { public_id: string; secure_url: string };
  return { publicId: body.public_id, secureUrl: body.secure_url };
}
