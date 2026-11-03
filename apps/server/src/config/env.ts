import { z } from 'zod';

/** A blank line in .env (`KEY=`) counts as unset. */
const optionalString = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z
    .string({ error: 'is required' })
    .regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://'),
  CLIENT_ORIGIN: z.url({ error: 'is required and must be a URL, e.g. http://localhost:5173' }),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  JWT_ACCESS_SECRET: z.string({ error: 'is required' }).min(32, 'must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  // 12 in every real environment; the test config lowers it so the suite stays fast.
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  // How many proxies sit in front of the server (Express's `trust proxy`), so req.ip is the visitor's address
  // and per-IP rate limits count people, not the proxy. 0 when the server is reached directly (local dev).
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  // Optional outside production, so local dev runs without a Google client or a Resend account.
  GOOGLE_CLIENT_ID: optionalString,
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  // Room file uploads. Without them, outside production, uploads are off and links still work.
  CLOUDINARY_CLOUD_NAME: optionalString,
  CLOUDINARY_API_KEY: optionalString,
  CLOUDINARY_API_SECRET: optionalString,
  // Error tracking. Blank turns Sentry off (local dev, tests); production logs a warning at boot instead of failing.
  SENTRY_DSN: optionalString.pipe(z.url({ error: 'must be a URL (the DSN from Sentry)' }).optional()),
  // Tags each event with the deployed commit. Render sets RENDER_GIT_COMMIT itself.
  SENTRY_RELEASE: optionalString,
  RENDER_GIT_COMMIT: optionalString,
});

const REQUIRED_IN_PRODUCTION = [
  'GOOGLE_CLIENT_ID',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const;

/** The value .env.example ships with. Booting production with it would let anyone sign access tokens. */
export const EXAMPLE_JWT_SECRET = 'change-me-to-a-long-random-string-of-48-bytes';

const envSchemaChecked = envSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  for (const key of REQUIRED_IN_PRODUCTION) {
    if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'is required in production' });
  }
  // The refresh cookie is Secure, and reset links point here, so production must be served over https.
  if (!env.CLIENT_ORIGIN.startsWith('https://')) {
    ctx.addIssue({ code: 'custom', path: ['CLIENT_ORIGIN'], message: 'must use https in production' });
  }
  if (env.JWT_ACCESS_SECRET === EXAMPLE_JWT_SECRET) {
    ctx.addIssue({
      code: 'custom',
      path: ['JWT_ACCESS_SECRET'],
      message: 'is still the .env.example value; generate a new secret',
    });
  }
});

export type Env = z.infer<typeof envSchema> & {
  /** SENTRY_RELEASE, else the deployed commit, else undefined. */
  release: string | undefined;
};

export type ParseEnvResult = { ok: true; env: Env } | { ok: false; problems: string[] };

export function parseEnv(source: Record<string, string | undefined>): ParseEnvResult {
  const result = envSchemaChecked.safeParse(source);
  if (result.success) {
    const release = result.data.SENTRY_RELEASE ?? result.data.RENDER_GIT_COMMIT;
    return { ok: true, env: { ...result.data, release } };
  }
  const problems = result.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`);
  return { ok: false, problems };
}

function loadEnv(): Env {
  const result = parseEnv(process.env);
  if (result.ok) return result.env;
  console.error(
    [
      'Invalid environment configuration:',
      ...result.problems.map((problem) => `  - ${problem}`),
      'Copy .env.example to .env at the repo root and fill in the values.',
    ].join('\n'),
  );
  process.exit(1);
}

export const env = loadEnv();
