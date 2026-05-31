import {
  TELECONSULT_CODE_TTL_MS,
  TELECONSULT_LOCKOUT_MAX_ATTEMPTS,
  TELECONSULT_SESSION_DURATION_MS,
} from '@mata/shared/constants';
import type { User } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { codeService } from '../code-service.js';
import { sessionService } from '../session-service.js';

/**
 * Test integration teleconsult Lot 6 sur vraie Postgres.
 *
 * Verifie :
 *  1. Generation code : row insere, code clear retourne, audit code.generate
 *  2. Code dans aucune des reponses GET (anti-replay)
 *  3. Start session OK : row + audit session.start avec on_behalf_of, code marque used
 *  4. Start session code KO : message uniforme + audit action_forbidden + failed_attempts++
 *  5. Lockout : 5 echecs successifs -> 6e tente -> RATE_LIMITED + lockedUntil pose
 *  6. Session active + start nouvelle -> CONFLICT
 *  7. Close session -> audit session.end
 *  8. expireOverdue : marque sessions ou expires_at < now
 *
 * Reference : CLAUDE.md G6 + G8, ARCHITECTURE.md 9.
 */

let teleconsultant: User;
let producer: User;
let admin: User;

beforeAll(async () => {
  admin = await prisma.user.create({
    data: {
      keycloakId: 'integ:teleconsult:admin',
      username: 'admin.teleconsult.test',
      displayName: 'Admin Teleconsult Test',
      role: 'admin',
      phone: '+221770000060',
    },
  });
  teleconsultant = await prisma.user.create({
    data: {
      keycloakId: 'integ:teleconsult:tc',
      username: 'ibrahima.test',
      displayName: 'Ibrahima Test',
      role: 'teleconsultant',
      phone: '+221770000061',
    },
  });
  producer = await prisma.user.create({
    data: {
      keycloakId: 'integ:teleconsult:producer',
      username: 'mor.test',
      displayName: 'Mor Test',
      role: 'producer',
      phone: '+221770000062',
    },
  });
});

afterEach(async () => {
  // Ordre : sessions -> codes -> audits (les audits referencent users mais
  // on garde les autres users intacts).
  await prisma.teleconsultSession.deleteMany({});
  await prisma.teleconsultCode.deleteMany({});
  await prisma.outboxEvent.deleteMany({
    where: { eventType: { startsWith: 'teleconsult.' } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      actorUserId: { in: [admin.id, teleconsultant.id, producer.id] },
      action: { startsWith: 'teleconsult.' },
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { id: { in: [admin.id, teleconsultant.id, producer.id] } },
  });
});

describe('codeService.generateForProducer', () => {
  it('cree un code 6 chiffres + audit + retourne clair UNE FOIS', async () => {
    const result = await codeService.generateForProducer({
      producerUserId: producer.id,
    });

    expect(result.code).toMatch(/^\d{6}$/);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(result.expiresAt).getTime()).toBeLessThanOrEqual(
      Date.now() + TELECONSULT_CODE_TTL_MS + 1000,
    );

    const row = await prisma.teleconsultCode.findFirst({
      where: { producerUserId: producer.id },
    });
    expect(row).not.toBeNull();
    expect(row?.codeHash).not.toBe(result.code); // hashed, not plain
    expect(row?.codeHash.length).toBeGreaterThan(30); // bcrypt output ~60 chars
    expect(row?.usedAt).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'teleconsult.code.generate', actorUserId: producer.id },
    });
    expect(audit).not.toBeNull();
    // Garde-fou critique : le code en CLAIR ne doit JAMAIS apparaitre dans l'audit.
    expect(JSON.stringify(audit?.newValue)).not.toContain(result.code);
  });
});

describe('sessionService.start (success)', () => {
  it('demarre une session + audit + marque code used + session 15 min', async () => {
    const { code } = await codeService.generateForProducer({ producerUserId: producer.id });

    const session = await sessionService.start({
      teleconsultantUserId: teleconsultant.id,
      producerUsername: producer.username ?? 'mor.test',
      code,
    });

    expect(session.sessionNumber).toMatch(/^SES-\d{4}-\d{4,}$/);
    expect(session.producer.userId).toBe(producer.id);
    expect(session.producer.username).toBe('mor.test');
    expect(session.teleconsultantUserId).toBe(teleconsultant.id);
    expect(new Date(session.expiresAt).getTime() - new Date(session.startedAt).getTime()).toBe(
      TELECONSULT_SESSION_DURATION_MS,
    );

    // Code marque utilise.
    const codeRow = await prisma.teleconsultCode.findFirst({
      where: { producerUserId: producer.id },
    });
    expect(codeRow?.usedAt).not.toBeNull();

    // Audit session.start avec on_behalf_of = producer.
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'teleconsult.session.start', actorUserId: teleconsultant.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.onBehalfOfUserId).toBe(producer.id);

    // Audit ne contient PAS le code clair.
    expect(JSON.stringify(audit?.newValue)).not.toContain(code);
  });
});

describe('sessionService.start (failure)', () => {
  it('code KO -> UNAUTHORIZED message uniforme + audit action_forbidden', async () => {
    await codeService.generateForProducer({ producerUserId: producer.id });

    await expect(
      sessionService.start({
        teleconsultantUserId: teleconsultant.id,
        producerUsername: producer.username ?? 'mor.test',
        code: '000000',
      }),
    ).rejects.toThrow(/Code invalide ou expir/i);

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'teleconsult.session.action_forbidden',
        actorUserId: teleconsultant.id,
      },
    });
    expect(audit).not.toBeNull();
  });

  it('username inexistant -> UNAUTHORIZED message uniforme (anti-enumeration)', async () => {
    await expect(
      sessionService.start({
        teleconsultantUserId: teleconsultant.id,
        producerUsername: 'ghost.unknown',
        code: '123456',
      }),
    ).rejects.toThrow(/Code invalide ou expir/i);

    // Audit forbidden ecrit avec attemptedUsername (pour detection).
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'teleconsult.session.action_forbidden',
        actorUserId: teleconsultant.id,
      },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.newValue)).toContain('ghost.unknown');
  });

  it('code expire -> UNAUTHORIZED message uniforme', async () => {
    const { code } = await codeService.generateForProducer({ producerUserId: producer.id });
    // Force created_at + expires_at dans le passe (CHECK expires > created).
    await prisma.teleconsultCode.updateMany({
      where: { producerUserId: producer.id },
      data: {
        createdAt: new Date(Date.now() - 30 * 60 * 1000), // -30 min
        expiresAt: new Date(Date.now() - 15 * 60 * 1000), // -15 min
      },
    });

    await expect(
      sessionService.start({
        teleconsultantUserId: teleconsultant.id,
        producerUsername: producer.username ?? 'mor.test',
        code,
      }),
    ).rejects.toThrow(/Code invalide ou expir/i);
  });

  it('code deja utilise -> UNAUTHORIZED message uniforme', async () => {
    const { code } = await codeService.generateForProducer({ producerUserId: producer.id });
    // Marque comme utilise.
    await prisma.teleconsultCode.updateMany({
      where: { producerUserId: producer.id },
      data: { usedAt: new Date() },
    });

    await expect(
      sessionService.start({
        teleconsultantUserId: teleconsultant.id,
        producerUsername: producer.username ?? 'mor.test',
        code,
      }),
    ).rejects.toThrow(/Code invalide ou expir/i);
  });

  it('lockout : 5 echecs -> 6e tente refuse via RATE_LIMITED', async () => {
    await codeService.generateForProducer({ producerUserId: producer.id });

    // 5 tentatives KO avec un mauvais code.
    for (let i = 0; i < TELECONSULT_LOCKOUT_MAX_ATTEMPTS; i++) {
      await sessionService
        .start({
          teleconsultantUserId: teleconsultant.id,
          producerUsername: producer.username ?? 'mor.test',
          code: '000000',
        })
        .catch(() => {});
    }

    // Le lockout doit etre actif.
    const row = await prisma.teleconsultCode.findFirst({
      where: { producerUserId: producer.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.lockedUntil).not.toBeNull();
    expect(row?.lockedUntil?.getTime()).toBeGreaterThan(Date.now());

    // Nouveau code -> blocked au generate (lockout).
    await expect(codeService.generateForProducer({ producerUserId: producer.id })).rejects.toThrow(
      /Trop de tentatives/,
    );
  });
});

describe('sessionService.start (concurrent)', () => {
  it('refuse une 2e session active pour le meme teleconseiller', async () => {
    const { code: code1 } = await codeService.generateForProducer({
      producerUserId: producer.id,
    });
    await sessionService.start({
      teleconsultantUserId: teleconsultant.id,
      producerUsername: producer.username ?? 'mor.test',
      code: code1,
    });

    // Cree un 2e producteur + son code pour ne pas etre bloque par le code utilise.
    const producer2 = await prisma.user.create({
      data: {
        keycloakId: 'integ:teleconsult:producer2',
        username: 'producer2.test',
        displayName: 'Producer 2 Test',
        role: 'producer',
        phone: '+221770000063',
      },
    });
    const { code: code2 } = await codeService.generateForProducer({
      producerUserId: producer2.id,
    });

    await expect(
      sessionService.start({
        teleconsultantUserId: teleconsultant.id,
        producerUsername: 'producer2.test',
        code: code2,
      }),
    ).rejects.toThrow(/d[ée]j[àa] active/i);

    // Cleanup (audit_log doit etre wipe avant user.delete sinon FK RESTRICT)
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ actorUserId: producer2.id }, { onBehalfOfUserId: producer2.id }],
      },
    });
    await prisma.teleconsultSession.deleteMany({ where: { producerUserId: producer2.id } });
    await prisma.teleconsultCode.deleteMany({ where: { producerUserId: producer2.id } });
    await prisma.user.delete({ where: { id: producer2.id } });
  });
});

describe('sessionService.close + getActive', () => {
  it('close session -> audit + closedAt rempli + getActive null', async () => {
    const { code } = await codeService.generateForProducer({ producerUserId: producer.id });
    const session = await sessionService.start({
      teleconsultantUserId: teleconsultant.id,
      producerUsername: producer.username ?? 'mor.test',
      code,
    });

    await sessionService.close({
      sessionId: session.id,
      closedByUserId: teleconsultant.id,
      closedByRole: 'teleconsultant',
    });

    const closed = await prisma.teleconsultSession.findUnique({ where: { id: session.id } });
    expect(closed?.closedAt).not.toBeNull();
    expect(closed?.closeReason).toBe('closed_by_teleconsultant');

    const active = await sessionService.getActiveForTeleconsultant(teleconsultant.id);
    expect(active).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'teleconsult.session.end', actorUserId: teleconsultant.id },
    });
    expect(audit).not.toBeNull();

    // Idempotence : refermer la même session est un no-op réussi (pas de throw)
    // et NE DOIT PAS créer une 2e ligne d'audit teleconsult.session.end.
    await expect(
      sessionService.close({
        sessionId: session.id,
        closedByUserId: teleconsultant.id,
        closedByRole: 'teleconsultant',
      }),
    ).resolves.toMatchObject({ id: session.id });

    const endAuditCount = await prisma.auditLog.count({
      where: { action: 'teleconsult.session.end', targetId: session.id },
    });
    expect(endAuditCount).toBe(1);
  });

  it('getActiveForProducer renvoie la session active du producteur, null sinon', async () => {
    const { code } = await codeService.generateForProducer({ producerUserId: producer.id });
    const session = await sessionService.start({
      teleconsultantUserId: teleconsultant.id,
      producerUsername: producer.username ?? 'mor.test',
      code,
    });

    const mine = await sessionService.getActiveForProducer(producer.id);
    expect(mine?.id).toBe(session.id);
    // Un user sans session active comme producteur cible → null.
    expect(await sessionService.getActiveForProducer(teleconsultant.id)).toBeNull();

    // Après fermeture, plus de session active pour le producteur.
    await sessionService.close({
      sessionId: session.id,
      closedByUserId: producer.id,
      closedByRole: 'producer',
    });
    expect(await sessionService.getActiveForProducer(producer.id)).toBeNull();
  });
});

describe('sessionService.expireOverdue', () => {
  it('marque sessions expirees comme closeReason=expired', async () => {
    const { code } = await codeService.generateForProducer({ producerUserId: producer.id });
    const session = await sessionService.start({
      teleconsultantUserId: teleconsultant.id,
      producerUsername: producer.username ?? 'mor.test',
      code,
    });
    // Force startedAt + expiresAt dans le passe (CHECK expires > started).
    await prisma.teleconsultSession.update({
      where: { id: session.id },
      data: {
        startedAt: new Date(Date.now() - 30 * 60 * 1000), // -30 min
        expiresAt: new Date(Date.now() - 15 * 60 * 1000), // -15 min
      },
    });

    const result = await sessionService.expireOverdue();
    expect(result.expired).toBeGreaterThanOrEqual(1);

    const expired = await prisma.teleconsultSession.findUnique({ where: { id: session.id } });
    expect(expired?.closedAt).not.toBeNull();
    expect(expired?.closeReason).toBe('expired');
  });
});

describe('codeService.cleanupExpired', () => {
  it('purge les codes > 1h non utilises et sans session liee', async () => {
    // Cree un code et force created_at > 1h.
    await codeService.generateForProducer({ producerUserId: producer.id });
    await prisma.teleconsultCode.updateMany({
      where: { producerUserId: producer.id },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });

    const result = await codeService.cleanupExpired();
    expect(result.purged).toBeGreaterThanOrEqual(1);

    const remaining = await prisma.teleconsultCode.count({
      where: { producerUserId: producer.id },
    });
    expect(remaining).toBe(0);
  });
});
