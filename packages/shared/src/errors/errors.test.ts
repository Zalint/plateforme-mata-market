import { describe, expect, it } from 'vitest';
import { DomainError } from './index.js';

describe('DomainError', () => {
  it('mappe le code vers le bon statut HTTP par défaut', () => {
    expect(new DomainError('NOT_FOUND', 'x').statusCode).toBe(404);
    expect(new DomainError('CONFLICT', 'x').statusCode).toBe(409);
    expect(new DomainError('UNAUTHORIZED', 'x').statusCode).toBe(401);
    expect(new DomainError('FORBIDDEN', 'x').statusCode).toBe(403);
    expect(new DomainError('VALIDATION', 'x').statusCode).toBe(422);
    expect(new DomainError('RATE_LIMITED', 'x').statusCode).toBe(429);
    expect(new DomainError('EXTERNAL_FAILURE', 'x').statusCode).toBe(502);
    expect(new DomainError('INTERNAL', 'x').statusCode).toBe(500);
  });

  it('permet un override du statut HTTP et garde les détails', () => {
    const err = new DomainError('VALIDATION', 'pricing.invalid', {
      statusCode: 400,
      details: { field: 'producer_share', reason: 'negative' },
    });
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ field: 'producer_share', reason: 'negative' });
    expect(err.code).toBe('VALIDATION');
  });
});
