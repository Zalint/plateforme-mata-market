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
  OFFER_STATUSES,
  OFFER_UNITS,
  PRODUCER_STATUSES,
  PRODUCER_TYPES,
  SITE_STATUSES,
  SITE_TYPES,
} from '@mata/shared/constants';
import {
  OfferStatus,
  OfferUnit,
  ProducerStatus,
  ProducerType,
  SiteStatus,
  SiteType,
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
});
