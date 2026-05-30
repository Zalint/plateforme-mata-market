import pino from 'pino';
import { env } from '../env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'mata-api', env: env.NODE_ENV },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-bictorys-signature"]',
      '*.password',
      '*.code',
      '*.secret',
      '*.apiKey',
      '*.bankDetails',
      // Bictorys (Lot 5)
      '*.bictorysApiSecret',
      '*.webhookSecret',
      '*.signature',
      '*.providerSignature',
      // Téléconseil (Lot 6) — code 6 chiffres + hash bcrypt
      '*.codeHash',
      '*.code_hash',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
});
