import { z } from 'zod';

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
});

export type Env = z.infer<typeof envSchema>;

export type ParseEnvResult = { ok: true; env: Env } | { ok: false; problems: string[] };

export function parseEnv(source: Record<string, string | undefined>): ParseEnvResult {
  const result = envSchema.safeParse(source);
  if (result.success) return { ok: true, env: result.data };
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
