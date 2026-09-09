import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { PrismaClient } from '@platform/database';
import type { PlatformConfig } from '@platform/config';
import type { NotificationProvider } from '@platform/notifications';

export function createAuth(db: PrismaClient, config: PlatformConfig, email: NotificationProvider) {
  return betterAuth({
    appName: config.PLATFORM_NAME,
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    database: prismaAdapter(db, { provider: 'postgresql' }),
    trustedOrigins: config.TRUSTED_ORIGINS,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => email.send({ to: user.email, subject: `Redefinir senha · ${config.PLATFORM_NAME}`, text: `Use este link para redefinir sua senha: ${url}\nSe não foi você, ignore esta mensagem.` }),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => email.send({ to: user.email, subject: `Confirme seu e-mail · ${config.PLATFORM_NAME}`, text: `Confirme seu endereço de e-mail: ${url}` }),
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, window: 60, max: 30, storage: 'database' },
    advanced: {
      ipAddress: { ipAddressHeaders: ['x-platform-client-ip'] },
      useSecureCookies: config.NODE_ENV === 'production',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: config.NODE_ENV === 'production', path: '/' },
    },
  });
}
export type PlatformAuth = ReturnType<typeof createAuth>;
