/**
 * Garde-fou : les valeurs des enums Prisma (source de vérité DB) doivent
 * rester alignées avec les constantes partagées dans `@mata/shared/constants`
 * (consommées par les schemas Zod côté API et les selects côté front).
 *
 * Si on ajoute une valeur dans `schema.prisma` sans la répliquer dans
 * `packages/shared/src/constants/enums.ts`, ce test échoue immédiatement
 * et signale la désynchronisation.
 *
 * Référence : ARCHITECTURE.md §6, CLAUDE.md §G2.
 */
import {
  DELIVERY_PERIODS,
  OFFER_STATUSES,
  OFFER_UNITS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYOUT_STATUSES,
  PICKUP_STATUSES,
  PRICING_BASES,
  PRICING_MODELS,
  PRICING_SCOPES,
  PRODUCER_STATUSES,
  PRODUCER_TYPES,
  SITE_STATUSES,
  SITE_TYPES,
  TELECONSULT_CLOSE_REASONS,
} from '@mata/shared/constants';
import {
  DeliveryPeriod,
  OfferStatus,
  OfferUnit,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PayoutStatus,
  PickupStatus,
  PricingBase,
  PricingModel,
  PricingScope,
  ProducerStatus,
  ProducerType,
  SiteStatus,
  SiteType,
  TeleconsultCloseReason,
} from '@prisma/client';
import { describe, expect, it } from 'vitest';

function valuesOf<T extends Record<string, string>>(enumObj: T): string[] {
  return Object.values(enumObj).sort();
}

describe('Coherence enums Prisma ↔ @mata/shared/constants', () => {
  it('ProducerType', () => {
    expect(valuesOf(ProducerType)).toEqual([...PRODUCER_TYPES].sort());
  });
  it('ProducerStatus', () => {
    expect(valuesOf(ProducerStatus)).toEqual([...PRODUCER_STATUSES].sort());
  });
  it('SiteType', () => {
    expect(valuesOf(SiteType)).toEqual([...SITE_TYPES].sort());
  });
  it('SiteStatus', () => {
    expect(valuesOf(SiteStatus)).toEqual([...SITE_STATUSES].sort());
  });
  it('OfferStatus', () => {
    expect(valuesOf(OfferStatus)).toEqual([...OFFER_STATUSES].sort());
  });
  it('OfferUnit', () => {
    expect(valuesOf(OfferUnit)).toEqual([...OFFER_UNITS].sort());
  });
  it('PricingModel', () => {
    expect(valuesOf(PricingModel)).toEqual([...PRICING_MODELS].sort());
  });
  it('PricingScope', () => {
    expect(valuesOf(PricingScope)).toEqual([...PRICING_SCOPES].sort());
  });
  it('PricingBase', () => {
    expect(valuesOf(PricingBase)).toEqual([...PRICING_BASES].sort());
  });
  it('OrderStatus', () => {
    expect(valuesOf(OrderStatus)).toEqual([...ORDER_STATUSES].sort());
  });
  it('DeliveryPeriod', () => {
    expect(valuesOf(DeliveryPeriod)).toEqual([...DELIVERY_PERIODS].sort());
  });
  it('PaymentStatus', () => {
    expect(valuesOf(PaymentStatus)).toEqual([...PAYMENT_STATUSES].sort());
  });
  it('PayoutStatus', () => {
    expect(valuesOf(PayoutStatus)).toEqual([...PAYOUT_STATUSES].sort());
  });
  it('TeleconsultCloseReason', () => {
    expect(valuesOf(TeleconsultCloseReason)).toEqual([...TELECONSULT_CLOSE_REASONS].sort());
  });
  it('PickupStatus', () => {
    expect(valuesOf(PickupStatus)).toEqual([...PICKUP_STATUSES].sort());
  });
  it('PaymentMethod', () => {
    expect(valuesOf(PaymentMethod)).toEqual([...PAYMENT_METHODS].sort());
  });
});
