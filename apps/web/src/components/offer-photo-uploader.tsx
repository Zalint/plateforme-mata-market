'use client';

import { Icon } from '@mata/ui';
import { useState } from 'react';
import { uploadToCloudinary, useAttachOfferPhotos, useUploadSignature } from '../lib/api';

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

type Photo = { id: string; cloudinaryPublicId: string; position: number };

type Props = {
  offerId: string;
  existing: Photo[];
};

/**
 * OfferPhotoUploader · ajoute des photos à une offre.
 *
 * Flow (3 étapes server-orchestrated) :
 *   1. POST /v1/uploads/signature       → signature SHA1 + folder figé serveur
 *   2. POST cloudinary.com/.../upload   → upload direct browser (multipart)
 *   3. PUT /v1/offers/:id/photos        → attache les public_id à l'offre
 *
 * API_SECRET Cloudinary jamais côté client (cf. CLAUDE.md §G5).
 */
export function OfferPhotoUploader({ offerId, existing }: Props): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSignature = useUploadSignature();
  const attach = useAttachOfferPhotos();

  async function handleFile(file: File): Promise<void> {
    if (!CLOUD_NAME) {
      setError('Configuration incomplète : NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME manquant.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sig = await requestSignature.mutateAsync({ kind: 'offer', offerId });
      const { publicId } = await uploadToCloudinary(sig, file);
      // Append à la liste existante (l'API remplace tout, donc on conserve les anciens)
      const allPublicIds = [...existing.map((p) => p.cloudinaryPublicId), publicId];
      await attach.mutateAsync({ id: offerId, publicIds: allPublicIds });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload échoué');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(publicId: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const remaining = existing.map((p) => p.cloudinaryPublicId).filter((id) => id !== publicId);
      if (remaining.length === 0) {
        setError('Au moins une photo doit rester (API min=1).');
        return;
      }
      await attach.mutateAsync({ id: offerId, publicIds: remaining });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression échouée');
    } finally {
      setBusy(false);
    }
  }

  function urlFor(publicId: string): string {
    if (!CLOUD_NAME) return '';
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_fill,w_240,h_240/${publicId}.jpg`;
  }

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {existing.map((p) => (
          <div
            key={p.id}
            className="relative aspect-square rounded-xl overflow-hidden bg-stone-100"
          >
            {CLOUD_NAME ? (
              // biome-ignore lint/performance/noImgElement: Cloudinary URL externe — pas via next/image au MVP
              <img
                src={urlFor(p.cloudinaryPublicId)}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-stone-400">
                {p.cloudinaryPublicId.split('/').pop()}
              </div>
            )}
            <button
              type="button"
              onClick={() => handleRemove(p.cloudinaryPublicId)}
              disabled={busy}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/95 shadow-soft flex items-center justify-center text-stone-700 hover:text-red-700 disabled:opacity-50"
              aria-label="Supprimer la photo"
            >
              <Icon name="x" className="w-3 h-3" />
            </button>
          </div>
        ))}
        <label className="aspect-square rounded-xl border-2 border-dashed border-stone-300 flex flex-col items-center justify-center text-stone-400 hover:border-mata-300 hover:text-mata-700 cursor-pointer transition">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              // Reset input pour permettre re-upload du même fichier
              e.target.value = '';
            }}
          />
          <Icon name="camera" className="w-6 h-6" />
          <span className="text-[10px] font-medium mt-1">{busy ? 'Upload…' : 'Ajouter'}</span>
        </label>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-700 bg-red-50 px-2 py-1.5 rounded-md">{error}</p>
      )}
      {!CLOUD_NAME && (
        <p className="mt-2 text-xs text-amber-700 bg-amber-50 px-2 py-1.5 rounded-md">
          Photos désactivées : configurer NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME pour activer.
        </p>
      )}
    </div>
  );
}
