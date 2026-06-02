import { describe, expect, it } from 'vitest';
import { isValidOrderTransition, ORDER_STATUSES, ORDER_TRANSITIONS } from '../constants/enums.js';
import {
  IdempotencyKeySchema,
  OrderCancelInputSchema,
  OrderCreateSchema,
  OrderStatusTransitionInputSchema,
} from './order.js';

const validItem = {
  offerId: '11111111-1111-1111-1111-111111111111',
  quantity: 5,
};

const validDelivery = {
  zoneId: '22222222-2222-2222-2222-222222222222',
  addressLine: 'Almadies, Villa 12',
  slotDate: '2026-06-15',
  slotPeriod: 'morning' as const,
};

describe('OrderCreateSchema', () => {
  it('accepte 1 item + livraison valide', () => {
    expect(() =>
      OrderCreateSchema.parse({ items: [validItem], delivery: validDelivery }),
    ).not.toThrow();
  });

  it('accepte plusieurs items distincts', () => {
    expect(() =>
      OrderCreateSchema.parse({
        items: [validItem, { offerId: '33333333-3333-3333-3333-333333333333', quantity: 3 }],
        delivery: validDelivery,
      }),
    ).not.toThrow();
  });

  it('refuse 2 lignes avec le même offerId (doit être consolidé)', () => {
    expect(() =>
      OrderCreateSchema.parse({
        items: [validItem, validItem],
        delivery: validDelivery,
      }),
    ).toThrow(/Une même offre ne peut apparaître deux fois/);
  });

  it('refuse items vide', () => {
    expect(() => OrderCreateSchema.parse({ items: [], delivery: validDelivery })).toThrow();
  });

  it('refuse quantity <= 0', () => {
    expect(() =>
      OrderCreateSchema.parse({
        items: [{ ...validItem, quantity: 0 }],
        delivery: validDelivery,
      }),
    ).toThrow();
  });

  it('refuse addressLine trop courte', () => {
    expect(() =>
      OrderCreateSchema.parse({
        items: [validItem],
        delivery: { ...validDelivery, addressLine: 'XY' },
      }),
    ).toThrow();
  });
});

describe('OrderStatusTransitionInputSchema', () => {
  it('accepte un status valide', () => {
    expect(() => OrderStatusTransitionInputSchema.parse({ to: 'confirmed' })).not.toThrow();
  });

  it('refuse un status inconnu', () => {
    expect(() => OrderStatusTransitionInputSchema.parse({ to: 'shipped' })).toThrow();
  });
});

describe('OrderCancelInputSchema', () => {
  it('exige une raison', () => {
    expect(() => OrderCancelInputSchema.parse({})).toThrow();
  });

  it('refuse raison trop courte', () => {
    expect(() => OrderCancelInputSchema.parse({ reason: 'NO' })).toThrow();
  });

  it('accepte raison valide', () => {
    expect(() =>
      OrderCancelInputSchema.parse({ reason: 'Rupture de stock chez le producteur' }),
    ).not.toThrow();
  });
});

describe('IdempotencyKeySchema', () => {
  it('accepte un UUID', () => {
    expect(() => IdempotencyKeySchema.parse('123e4567-e89b-12d3-a456-426614174000')).not.toThrow();
  });

  it('refuse une string non-UUID', () => {
    expect(() => IdempotencyKeySchema.parse('abc-123')).toThrow();
  });
});

describe('ORDER_TRANSITIONS · matrice state machine', () => {
  it('chaque status est défini dans la matrice', () => {
    for (const s of ORDER_STATUSES) {
      expect(ORDER_TRANSITIONS[s]).toBeDefined();
    }
  });

  it('delivered et cancelled sont terminaux', () => {
    expect(ORDER_TRANSITIONS.delivered).toEqual([]);
    expect(ORDER_TRANSITIONS.cancelled).toEqual([]);
  });

  // Cycle simplifié à 4 états (pivot téléconseiller, Lot 0) : les tournées
  // sont découplées du statut commande. collecting/collected/stored sont
  // orphelins (conservés dans l'enum Postgres mais sans transition).
  it('cycle nominal complet : created → confirmed → delivering → delivered', () => {
    expect(isValidOrderTransition('created', 'confirmed')).toBe(true);
    expect(isValidOrderTransition('confirmed', 'delivering')).toBe(true);
    expect(isValidOrderTransition('delivering', 'delivered')).toBe(true);
  });

  it('statuts orphelins (collecting/collected/stored) sans transition sortante', () => {
    expect(ORDER_TRANSITIONS.collecting).toEqual([]);
    expect(ORDER_TRANSITIONS.collected).toEqual([]);
    expect(ORDER_TRANSITIONS.stored).toEqual([]);
  });

  it('cancel possible jusqu’en livraison (created, confirmed, delivering)', () => {
    expect(isValidOrderTransition('created', 'cancelled')).toBe(true);
    expect(isValidOrderTransition('confirmed', 'cancelled')).toBe(true);
    expect(isValidOrderTransition('delivering', 'cancelled')).toBe(true);
    // Plus possible une fois livré.
    expect(isValidOrderTransition('delivered', 'cancelled')).toBe(false);
  });

  it('aucune transition vers un statut antérieur (pas de retour arrière)', () => {
    expect(isValidOrderTransition('confirmed', 'created')).toBe(false);
    expect(isValidOrderTransition('delivered', 'delivering')).toBe(false);
    expect(isValidOrderTransition('cancelled', 'created')).toBe(false);
  });

  it('aucune transition depuis delivered ou cancelled', () => {
    expect(isValidOrderTransition('delivered', 'confirmed')).toBe(false);
    expect(isValidOrderTransition('cancelled', 'confirmed')).toBe(false);
  });
});
