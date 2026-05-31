import type { User, Zone } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { userService } from '../user-service.js';

/**
 * Test d'intégration · création de comptes par un admin (Lot 9) sur vraie
 * Postgres. Keycloak est MOCKÉ (hors testcontainer). Prisma jamais mocké (§G6).
 *
 * Vérifie :
 *  1. Rôle simple (client_pro) → user créé avec le bon rôle + audit user.create.
 *  2. Rôle producer → délègue à producerService : user + profil `pending`.
 *  3. CONFLICT si le téléphone est déjà pris.
 */

let createCalls = 0;
vi.mock('../../../lib/keycloak-admin.js', () => ({
  keycloakAdmin: {
    createUser: vi.fn(async () => {
      createCalls += 1;
      return `kc-user-${createCalls}-${Date.now()}`;
    }),
    deleteUser: vi.fn(async () => {}),
  },
  generateTempPassword: () => 'TempPwd2',
}));

import { keycloakAdmin } from '../../../lib/keycloak-admin.js';

const PREFIX = 'integ:user-create';
const ZONE_SLUG = 'user-create-zone';
const PHONE_CLIENT = '+221770007001';
const PHONE_PRODUCER = '+221770007002';
const PHONE_TAKEN = '+221770007003';
const TEST_PHONES = [PHONE_CLIENT, PHONE_PRODUCER, PHONE_TAKEN];

let admin: User;
let zone: Zone;

beforeAll(async () => {
  zone = await prisma.zone.upsert({
    where: { slug: ZONE_SLUG },
    update: {},
    create: { slug: ZONE_SLUG, name: 'User create', region: 'Thiès' },
  });
  admin = await prisma.user.create({
    data: { keycloakId: `${PREFIX}:admin`, displayName: 'Admin U', role: 'admin' },
  });
});

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { actorUserId: admin.id } });
  await prisma.producerProfile.deleteMany({ where: { zoneId: zone.id } });
  await prisma.user.deleteMany({ where: { phone: { in: TEST_PHONES } } });
  vi.clearAllMocks();
  createCalls = 0;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: admin.id } });
  await prisma.zone.delete({ where: { id: zone.id } });
  await prisma.$disconnect();
});

describe('userService.createByAdmin', () => {
  it('crée un client_pro avec le bon rôle + audit user.create', async () => {
    const res = await userService.createByAdmin({
      actorUserId: admin.id,
      input: { displayName: 'Resto Neuf', phone: PHONE_CLIENT, role: 'client_pro' },
    });
    expect(res.role).toBe('client_pro');
    expect(res.tempPassword).toHaveLength(8);
    expect(keycloakAdmin.createUser).toHaveBeenCalledWith({
      phone: PHONE_CLIENT,
      displayName: 'Resto Neuf',
      tempPassword: res.tempPassword,
      realmRole: 'client_pro',
    });

    const user = await prisma.user.findUnique({ where: { phone: PHONE_CLIENT } });
    expect(user?.role).toBe('client_pro');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'user.create', targetId: user?.id },
    });
    expect(audit?.actorUserId).toBe(admin.id);
  });

  it('crée un producteur (délégation) avec profil pending', async () => {
    const res = await userService.createByAdmin({
      actorUserId: admin.id,
      input: {
        displayName: 'Prod Neuf',
        phone: PHONE_PRODUCER,
        role: 'producer',
        type: 'poultry',
        zoneId: zone.id,
      },
    });
    expect(res.role).toBe('producer');
    expect(res.tempPassword).toHaveLength(8);

    const user = await prisma.user.findUnique({ where: { phone: PHONE_PRODUCER } });
    expect(user?.role).toBe('producer');
    const profile = await prisma.producerProfile.findUnique({ where: { userId: user?.id } });
    expect(profile?.status).toBe('pending');
  });

  it('refuse (VALIDATION) un producteur sans type/zone', async () => {
    await expect(
      userService.createByAdmin({
        actorUserId: admin.id,
        input: { displayName: 'Sans zone', phone: PHONE_PRODUCER, role: 'producer' },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('refuse (CONFLICT) si le téléphone est déjà pris', async () => {
    await prisma.user.create({
      data: {
        keycloakId: `${PREFIX}:existing`,
        displayName: 'Déjà là',
        role: 'client_particulier',
        phone: PHONE_TAKEN,
      },
    });
    await expect(
      userService.createByAdmin({
        actorUserId: admin.id,
        input: { displayName: 'Autre', phone: PHONE_TAKEN, role: 'teleconsultant' },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(keycloakAdmin.createUser).not.toHaveBeenCalled();
  });
});
