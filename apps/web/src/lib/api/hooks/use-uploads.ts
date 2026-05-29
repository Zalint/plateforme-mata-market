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
  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', signature.apiKey);
  formData.append('timestamp', String(signature.timestamp));
  formData.append('folder', signature.folder);
  formData.append('signature', signature.signature);
  // Note : max_file_size et allowed_formats sont vérifiés côté Cloudinary
  // via la signature ; les renvoyer ici n'est pas utile pour le upload.

  const res = await fetch(signature.uploadUrl, { method: 'POST', body: formData });
  if (!res.ok) {
    throw new Error(`Cloudinary upload failed : ${res.status}`);
  }
  const body = (await res.json()) as { public_id: string; secure_url: string };
  return { publicId: body.public_id, secureUrl: body.secure_url };
}
