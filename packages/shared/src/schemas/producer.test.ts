import { describe, expect, it } from 'vitest';
import {
  BankDetailsClearSchema,
  BankDetailsEncryptedSchema,
  ProducerDocumentSchema,
  ProducerProfileCreateSchema,
} from './producer.js';

describe('BankDetailsClearSchema', () => {
  it('accepte des coordonnées complètes', () => {
    const ok = BankDetailsClearSchema.safeParse({
      holder: 'Mor Diop',
      iban: 'SN08SN0100100123456789012345',
      bic: 'BSENSNDAXXX',
      bankName: 'BOA Sénégal',
    });
    expect(ok.success).toBe(true);
  });

  it('accepte sans BIC (optionnel)', () => {
    const ok = BankDetailsClearSchema.safeParse({
      holder: 'Mor Diop',
      iban: 'SN08SN0100100123456789012345',
      bankName: 'BOA Sénégal',
    });
    expect(ok.success).toBe(true);
  });

  it('rejette un holder vide ou IBAN avec lowercase / espaces', () => {
    expect(
      BankDetailsClearSchema.safeParse({
        holder: '',
        iban: 'SN08SN0100100123456789012345',
        bankName: 'BOA',
      }).success,
    ).toBe(false);
    expect(
      BankDetailsClearSchema.safeParse({
        holder: 'Mor',
        iban: 'sn08sn0100100123456789012345',
        bankName: 'BOA',
      }).success,
    ).toBe(false);
    expect(
      BankDetailsClearSchema.safeParse({
        holder: 'Mor',
        iban: 'SN08 SN01 0010 0123 4567 8901 2345',
        bankName: 'BOA',
      }).success,
    ).toBe(false);
  });
});

describe('BankDetailsEncryptedSchema', () => {
  it('exige les champs cryptographiques + alg/v littéraux', () => {
    const ok = BankDetailsEncryptedSchema.safeParse({
      ciphertext: 'abc',
      iv: 'iv1',
      tag: 'tag1',
      alg: 'aes-256-gcm',
      v: 1,
    });
    expect(ok.success).toBe(true);
  });

  it('refuse un alg différent ou une version inconnue', () => {
    expect(
      BankDetailsEncryptedSchema.safeParse({
        ciphertext: 'a',
        iv: 'i',
        tag: 't',
        alg: 'aes-128-cbc',
        v: 1,
      }).success,
    ).toBe(false);
    expect(
      BankDetailsEncryptedSchema.safeParse({
        ciphertext: 'a',
        iv: 'i',
        tag: 't',
        alg: 'aes-256-gcm',
        v: 2,
      }).success,
    ).toBe(false);
  });
});

describe('ProducerDocumentSchema', () => {
  it('accepte un document valide', () => {
    expect(
      ProducerDocumentSchema.safeParse({
        type: 'cni',
        publicId: 'mata/producers/abc123',
        uploadedAt: '2026-05-29T14:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('rejette un type hors whitelist', () => {
    expect(
      ProducerDocumentSchema.safeParse({
        type: 'passport',
        publicId: 'abc',
        uploadedAt: '2026-05-29T14:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('ProducerProfileCreateSchema', () => {
  it('exige type + zoneId, refuse zoneId non-UUID', () => {
    expect(
      ProducerProfileCreateSchema.safeParse({
        type: 'poultry',
        zoneId: '550e8400-e29b-41d4-a716-446655440000',
      }).success,
    ).toBe(true);

    expect(
      ProducerProfileCreateSchema.safeParse({
        type: 'poultry',
        zoneId: 'pout',
      }).success,
    ).toBe(false);
  });
});
