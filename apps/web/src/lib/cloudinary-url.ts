const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

/**
 * Construit une URL de vignette Cloudinary (carré rogné `c_fill`) depuis un
 * `public_id`. Retourne `null` si le cloud name n'est pas configuré ou si le
 * publicId est absent — l'appelant retombe alors sur l'emoji de catégorie.
 *
 * Même schéma d'URL que `offer-photo-uploader.tsx` (transformation à la volée
 * côté Cloudinary, pas de stockage de variantes).
 */
export function cloudinaryThumb(publicId: string | undefined, size = 480): string | null {
  if (!CLOUD_NAME || !publicId) return null;
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_fill,w_${size},h_${size}/${publicId}.jpg`;
}
