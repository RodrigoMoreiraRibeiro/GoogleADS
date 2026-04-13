import { Buffer } from 'node:buffer';

import { z } from 'zod';

const PLACEHOLDER_SECRET_PATTERNS = [
  /change-me/i,
  /replace-me/i,
  /example/i,
  /dummy/i,
];

const BOOLEAN_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const BOOLEAN_FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

const envBoolean = z.union([z.boolean(), z.string()]).transform((value, ctx) => {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (BOOLEAN_TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (BOOLEAN_FALSE_VALUES.has(normalized)) {
    return false;
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Expected a boolean-like environment value.',
  });

  return z.NEVER;
});

const commaSeparatedStringArray = z
  .union([z.array(z.string()), z.string()])
  .transform((value) => {
    if (Array.isArray(value)) {
      return value.map((item) => item.trim()).filter(Boolean);
    }

    return value
      .split(/[,\s]+/u)
      .map((item) => item.trim())
      .filter(Boolean);
  });

const optionalTrimmedString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length === 0 ? undefined : trimmedValue;
}, z.string().trim().min(1).optional());

const apiEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'staging', 'production'])
      .default('development'),
    APP_ENV: z.enum(['development', 'staging', 'production']).default(
      'development',
    ),
    APP_DEBUG: envBoolean.default(true),
    API_PORT: z.coerce.number().int().positive().default(3000),
    API_HOST: z.string().trim().min(1).default('0.0.0.0'),
    API_PREFIX: z.string().trim().min(1).default('api'),
    API_TRUST_PROXY: envBoolean.default(false),
    API_REQUEST_BODY_LIMIT_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(5 * 1024 * 1024)
      .default(1_048_576),
    APP_BASE_URL: z.string().url(),
    WEB_BASE_URL: z.string().url(),
    SESSION_COOKIE_NAME: z.string().trim().min(1).default('__Host-sid'),
    CSRF_COOKIE_NAME: z.string().trim().min(1).default('__Host-xsrf'),
    APP_COOKIE_SECRET: z.string().trim().min(32),
    APP_ENCRYPTION_KEY: z.string().trim().min(1),
    APP_PREVIOUS_ENCRYPTION_KEY: optionalTrimmedString,
    APP_HASH_PEPPER: z.string().trim().min(32),
    APP_ENCRYPTION_ALGORITHM: z.enum(['AES-256-GCM']).default('AES-256-GCM'),
    DATABASE_URL: z.string().trim().min(1),
    DATABASE_MIGRATION_URL: optionalTrimmedString,
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    DATABASE_POOL_MIN: z.coerce.number().int().nonnegative().default(1),
    DATABASE_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    SESSION_IDLE_TTL_MINUTES: z.coerce.number().int().positive().default(480),
    SESSION_ABSOLUTE_TTL_MINUTES: z.coerce
      .number()
      .int()
      .positive()
      .default(1_440),
    STEP_UP_AUTH_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    AUTH_ENFORCE_MFA_FOR_PRIVILEGED_USERS: envBoolean.default(true),
    AUTH_MAX_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
    AUTH_LOGIN_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
    AUTH_LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
    GOOGLE_CLIENT_ID: z.string().trim().min(1),
    GOOGLE_CLIENT_SECRET: z.string().trim().min(1),
    GOOGLE_ADS_DEVELOPER_TOKEN: z.string().trim().min(1),
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: optionalTrimmedString,
    GOOGLE_ADS_REDIRECT_URI: z.string().url(),
    GOOGLE_OAUTH_SCOPES: commaSeparatedStringArray.default([
      'https://www.googleapis.com/auth/adwords',
    ]),
    GOOGLE_OAUTH_ACCESS_TYPE: z.enum(['offline', 'online']).default('offline'),
    GOOGLE_OAUTH_PROMPT: z.enum(['consent', 'select_account', 'none']).default(
      'consent',
    ),
    GOOGLE_OAUTH_STATE_TTL_MINUTES: z.coerce
      .number()
      .int()
      .positive()
      .default(10),
    GOOGLE_ADS_API_VERSION: z.string().trim().min(1).default('v21'),
    GOOGLE_ADS_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    GOOGLE_ADS_MAX_RETRIES: z.coerce.number().int().positive().default(3),
    GOOGLE_ADS_RETRY_BASE_DELAY_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(1_000),
    TENANT_RESOLUTION_STRATEGY: z
      .enum(['path', 'subdomain'])
      .default('path'),
    TENANT_ENFORCE_MEMBERSHIP: envBoolean.default(true),
    TENANT_BLOCK_CROSS_ACCESS: envBoolean.default(true),
    TENANT_REQUIRE_SCOPED_KEYS: envBoolean.default(true),
    REPORT_STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    REPORT_STORAGE_PATH: z.string().trim().min(1).default('storage/reports'),
    REPORT_TEMP_PATH: z.string().trim().min(1).default('storage/tmp'),
    REPORT_DEFAULT_FORMAT: z.enum(['pdf', 'html', 'pptx']).default('pdf'),
    REPORT_EXPIRES_IN_HOURS: z.coerce.number().int().positive().default(72),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    LOG_FORMAT: z.enum(['pretty', 'json']).default('json'),
    LOG_REDACT_SENSITIVE: envBoolean.default(true),
    AUDIT_LOG_ENABLED: envBoolean.default(true),
    SECURITY_EVENT_LOG_ENABLED: envBoolean.default(true),
    AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
    SECURITY_EVENT_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(365),
    QUEUE_DRIVER: z.enum(['database', 'redis']).default('database'),
    QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(1),
    SCHEDULER_ENABLED: envBoolean.default(true),
    WORKER_ENABLED: envBoolean.default(true),
    JOB_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
    JOB_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(1_000),
    JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    SYNC_SCHEDULE_CRON: z.string().trim().min(1).default('*/15 * * * *'),
    SYNC_RECENT_REPROCESS_DAYS: z.coerce.number().int().positive().default(14),
    SYNC_INITIAL_BACKFILL_DAYS: z.coerce.number().int().positive().default(90),
    SYNC_MAX_ACCOUNTS_PER_RUN: z.coerce.number().int().positive().default(5),
    RATE_LIMIT_REPORTS_PER_HOUR: z.coerce.number().int().positive().default(10),
    RATE_LIMIT_MANUAL_SYNC_PER_HOUR: z.coerce
      .number()
      .int()
      .positive()
      .default(2),
    RATE_LIMIT_EXPORTS_PER_HOUR: z.coerce.number().int().positive().default(10),
  })
  .superRefine((env, ctx) => {
    const isProductionLike =
      env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';
    const appUrl = new URL(env.APP_BASE_URL);
    const webUrl = new URL(env.WEB_BASE_URL);
    const redirectUrl = new URL(env.GOOGLE_ADS_REDIRECT_URI);

    if (env.DATABASE_POOL_MIN > env.DATABASE_POOL_MAX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_POOL_MIN'],
        message: 'DATABASE_POOL_MIN cannot be greater than DATABASE_POOL_MAX.',
      });
    }

    if (
      env.SESSION_IDLE_TTL_MINUTES > env.SESSION_ABSOLUTE_TTL_MINUTES
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SESSION_IDLE_TTL_MINUTES'],
        message:
          'SESSION_IDLE_TTL_MINUTES cannot exceed SESSION_ABSOLUTE_TTL_MINUTES.',
      });
    }

    if (redirectUrl.origin !== appUrl.origin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_ADS_REDIRECT_URI'],
        message:
          'GOOGLE_ADS_REDIRECT_URI must use the same origin as APP_BASE_URL.',
      });
    }

    if (
      env.GOOGLE_ADS_LOGIN_CUSTOMER_ID !== undefined &&
      !/^\d+$/u.test(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_ADS_LOGIN_CUSTOMER_ID'],
        message: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID must contain only digits.',
      });
    }

    if (isProductionLike) {
      if (appUrl.protocol !== 'https:' || webUrl.protocol !== 'https:') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['APP_BASE_URL'],
          message:
            'APP_BASE_URL and WEB_BASE_URL must use HTTPS in staging and production.',
        });
      }

      if (env.APP_DEBUG) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['APP_DEBUG'],
          message: 'APP_DEBUG must be false in staging and production.',
        });
      }

      if (env.LOG_FORMAT !== 'json') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['LOG_FORMAT'],
          message: 'LOG_FORMAT must be json in staging and production.',
        });
      }
    }

    validateSecret(
      env.APP_COOKIE_SECRET,
      'APP_COOKIE_SECRET',
      ctx,
      isProductionLike,
    );
    validateSecret(
      env.APP_HASH_PEPPER,
      'APP_HASH_PEPPER',
      ctx,
      isProductionLike,
    );
    validateSecret(
      env.GOOGLE_CLIENT_SECRET,
      'GOOGLE_CLIENT_SECRET',
      ctx,
      false,
    );
    validateSecret(
      env.GOOGLE_ADS_DEVELOPER_TOKEN,
      'GOOGLE_ADS_DEVELOPER_TOKEN',
      ctx,
      false,
    );

    if (env.APP_COOKIE_SECRET === env.APP_HASH_PEPPER) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APP_HASH_PEPPER'],
        message: 'APP_HASH_PEPPER must differ from APP_COOKIE_SECRET.',
      });
    }

    validateEncryptionKey(env.APP_ENCRYPTION_KEY, 'APP_ENCRYPTION_KEY', ctx);

    if (env.APP_PREVIOUS_ENCRYPTION_KEY !== undefined) {
      validateEncryptionKey(
        env.APP_PREVIOUS_ENCRYPTION_KEY,
        'APP_PREVIOUS_ENCRYPTION_KEY',
        ctx,
      );
    }
  });

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;

export function getApiEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): ApiEnvironment {
  return apiEnvironmentSchema.parse(source);
}

function validateSecret(
  value: string,
  field: string,
  ctx: z.RefinementCtx,
  requireStrongLength = true,
): void {
  if (PLACEHOLDER_SECRET_PATTERNS.some((pattern) => pattern.test(value))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [field],
      message: `${field} cannot use placeholder values.`,
    });
  }

  if (requireStrongLength && value.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [field],
      message: `${field} must have at least 32 characters.`,
    });
  }
}

function validateEncryptionKey(
  value: string,
  field: string,
  ctx: z.RefinementCtx,
): void {
  const byteLength = getKeyByteLength(value);

  if (byteLength === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [field],
      message:
        `${field} must be a 32-byte key encoded as base64 (base64:...) or hex.`,
    });
    return;
  }

  if (byteLength !== 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [field],
      message: `${field} must decode to exactly 32 bytes.`,
    });
  }
}

function getKeyByteLength(value: string): number | null {
  try {
    if (value.startsWith('base64:')) {
      return Buffer.from(value.slice('base64:'.length), 'base64').byteLength;
    }

    if (/^[a-f0-9]{64}$/iu.test(value)) {
      return Buffer.from(value, 'hex').byteLength;
    }
  } catch {
    return null;
  }

  return null;
}
