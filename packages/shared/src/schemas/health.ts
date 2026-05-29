import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  timestamp: z.string().datetime(),
  checks: z.object({
    db: z.enum(['ok', 'down', 'unknown']),
    keycloak: z.enum(['ok', 'down', 'skipped']),
  }),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
