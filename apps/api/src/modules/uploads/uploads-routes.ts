import { DomainError } from '@mata/shared/errors';
import { UuidSchema } from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { signUpload } from '../../lib/cloudinary.js';
import { requireRole, requireUser } from '../auth/index.js';

/**
 * Routes uploads · signature Cloudinary pour upload direct browser.
 *
 * Une signature = autorisation temporaire pour le navigateur d'uploader UN
 * fichier dans UN folder défini par le serveur. Le client ne peut donc pas :
 *  - changer le folder
 *  - changer max_file_size / allowed_formats (inclus dans la signature)
 *
 * Référence : ARCHITECTURE.md §7 + CLAUDE.md §G5 « Cloudinary ».
 */

const SignatureInputSchema = z.object({
  // Le client demande un scope : 'offer' (photo d'offre) ou 'producer' (avatar).
  // Le serveur construit le folder en interne à partir de ça + ids.
  kind: z.enum(['offer', 'producer-avatar', 'producer-doc']),
  offerId: UuidSchema.optional(), // requis si kind='offer'
});

const SignatureResponseSchema = z.object({
  cloudName: z.string(),
  apiKey: z.string(),
  timestamp: z.number(),
  folder: z.string(),
  signature: z.string(),
  maxFileSize: z.number(),
  allowedFormats: z.string(),
  uploadUrl: z.string().url(),
});

export async function uploadsRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/v1/uploads/signature',
    {
      schema: {
        body: SignatureInputSchema,
        response: { 200: SignatureResponseSchema },
      },
    },
    async (req) => {
      requireRole(req, 'producer');
      const user = requireUser(req);

      const folder = buildFolder(user.id, req.body);
      const payload = signUpload({ folder });
      return payload;
    },
  );
}

function buildFolder(userId: string, input: z.infer<typeof SignatureInputSchema>): string {
  switch (input.kind) {
    case 'offer':
      if (!input.offerId) {
        throw new DomainError('VALIDATION', 'offerId requis pour kind=offer');
      }
      return `mata/offers/${userId}/${input.offerId}`;
    case 'producer-avatar':
      return `mata/producers/${userId}/avatar`;
    case 'producer-doc':
      return `mata/producers/${userId}/docs`;
  }
}
