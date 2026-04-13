const REDACTED_VALUE = '[REDACTED]';
const CIRCULAR_VALUE = '[Circular]';

const SENSITIVE_KEY_PATTERNS = [
  /token/iu,
  /secret/iu,
  /password/iu,
  /cookie/iu,
  /authorization/iu,
  /api[-_]?key/iu,
  /client[-_]?secret/iu,
  /refresh[-_]?token/iu,
  /access[-_]?token/iu,
  /id[-_]?token/iu,
  /mfa/iu,
  /otp/iu,
];

const SENSITIVE_STRING_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(bearer\s+)[a-z0-9._~+/=-]+/giu, `$1${REDACTED_VALUE}`],
  [/(basic\s+)[a-z0-9._~+/=-]+/giu, `$1${REDACTED_VALUE}`],
  [/(access[_-]?token=)[^&\s]+/giu, `$1${REDACTED_VALUE}`],
  [/(refresh[_-]?token=)[^&\s]+/giu, `$1${REDACTED_VALUE}`],
  [/(client[_-]?secret=)[^&\s]+/giu, `$1${REDACTED_VALUE}`],
  [/(developer[_-]?token=)[^&\s]+/giu, `$1${REDACTED_VALUE}`],
  [/(password=)[^&\s]+/giu, `$1${REDACTED_VALUE}`],
];

export function redactSensitiveString(value: string): string {
  return SENSITIVE_STRING_PATTERNS.reduce(
    (sanitizedValue, [pattern, replacement]) =>
      sanitizedValue.replace(pattern, replacement),
    value,
  );
}

export function redactSensitiveData<T>(value: T): T {
  return redactValue(value, new WeakSet()) as T;
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return redactSensitiveString(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return CIRCULAR_VALUE;
  }

  seen.add(value);

  const redactedObject: Record<string, unknown> = {};

  for (const [key, fieldValue] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      redactedObject[key] = REDACTED_VALUE;
      continue;
    }

    redactedObject[key] = redactValue(fieldValue, seen);
  }

  return redactedObject;
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}
