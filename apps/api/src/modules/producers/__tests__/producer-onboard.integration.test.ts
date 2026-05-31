import type { User, Zone } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { producerService } from '../producer-service.js';

/**
 * Test d'intégration · onboarding producteur par le staff (Lot 9) sur vraie
 * Postgres.
 *
 * Le helper Keycloak Admin est MOCKÉ : Keycloak n'est pas dans le testcontainer
 * (seule Postgres l'est). Prisma n'est JAMAIS mocké (§G6) ; mocker une
 * intégration externe (Keycloak) reste permis.
 *
 * Vérifie (CLAUDE.md §G6) :
 *  1. onboardByStaff crée user (role producer) + profil `pending` + audit
 *     `producer.onboard`, et renvoie un mot de passe temporaire (une fois).
 *  2. Refus CONFLICT si le téléphone est déjà rattaché à un utilisateur
 *     (sans appeler Keycloak).
 */

let createUserCalls = 0;
vi.mock('../../../lib/keycloak-admin.js', () => ({
  keycloakAdmin: {
    createUser: vi.fn(async () => {
      createUserCalls += 1;
      return `kc-onboard-${createUserCalls}-${Date.now()}`;
    }),
    deleteUser: vi.fn(async () => {}),
  },
  generateTempPassword: () => 'TempPwd1',
}));

import { keycloakAdmin } from '../../../lib/keycloak-admin.js';

const ZONE_SLUG = 'onboard-test-pout';
const PHONE_OK = '+221770009001';
const PHONE_TAKEN = '+221770009002';
const TEST_PHONES = [PHONE_OK, PHONE_TAKEN];

let staff: User;
let zone: Zone;

beforeAll(async () => {
  zone = await prisma.zone.upsert({
    where: { slug: ZONE_SLUG },
    update: {},
    create: { slug: ZONE_SLUG, name: 'Pout (onboard test)', region: 'Thiès' },
  });
  staff = await prisma.user.create({
    data: {
      keycloakId: 'integ:onboard:staff',
      displayName: 'Téléconseiller T',
      role: 'teleconsultant',
      phone: '+221770009000',
    },
  });
});

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { actorUserId: staff.id } });
  await prisma.producerProfile.deleteMany({ where: { zoneId: zone.id } });
  await prisma.user.deleteMany({ where: { phone: { in: TEST_PHONES } } });
  vi.clearAllMocks();
  createUserCalls = 0;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: staff.id } });
  await prisma.zone.delete({ where: { id: zone.id } });
  await prisma.$disconnect();
});

describe('producerService.onboardByStaff · onboarding producteur par le staff', () => {
  it('crée user + profil pending + audit, renvoie un mdp temporaire', async () => {
    const result = await producerService.onboardByStaff({
      actorUserId: staff.id,
      input: { displayName: 'Mor Onboard', phone: PHONE_OK, type: 'poultry', zoneId: zone.id },
    });

    // Mot de passe temporaire renvoyé une fois (8 chars, non vide).
    expect(result.tempPassword).toHaveLength(8);
    expect(result.profile.status).toBe('pending');
    expect(result.profile.displayName).toBe('Mor Onboard');

    // Keycloak appelé avec les bonnes infos (et le mdp renvoyé).
    expect(keycloakAdmin.createUser).toHaveBeenCalledWith({
      phone: PHONE_OK,
      displayName: 'Mor Onboard',
      tempPassword: result.tempPassword,
      realmRole: 'producer',
    });

    // User créé en DB avec role producer + keycloakId.
    const user = await prisma.user.findUnique({ where: { phone: PHONE_OK } });
    expect(user).not.toBeNull();
    expect(user?.role).toBe('producer');
    expect(user?.keycloakId).toMatch(/^kc-onboard-/);

    // Audit producer.onboard écrit (actor = staff, target = nouveau producteur).
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'producer.onboard', targetId: result.profile.userId },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorUserId).toBe(staff.id);
  });

  it('refuse (CONFLICT) si le téléphone est déjà rattaché à un utilisateur', async () => {
    await prisma.user.create({
      data: {
        keycloakId: 'integ:onboard:existing',
        displayName: 'Déjà là',
        role: 'client_particulier',
        phone: PHONE_TAKEN,
      },
    });

    await expect(
      producerService.onboardByStaff({
        actorUserId: staff.id,
        input: { displayName: 'Autre', phone: PHONE_TAKEN, type: 'poultry', zoneId: zone.id },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // Keycloak ne doit PAS avoir été appelé (garde DB en amont).
    expect(keycloakAdmin.createUser).not.toHaveBeenCalled();
  });
});
