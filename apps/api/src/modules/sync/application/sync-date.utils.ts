export function startOfUtcDay(input: Date): Date {
  return new Date(
    Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()),
  );
}

export function addUtcDays(input: Date, days: number): Date {
  const output = new Date(input);
  output.setUTCDate(output.getUTCDate() + days);
  return startOfUtcDay(output);
}

export function minDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

export function maxDate(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

export function isAfterOrEqual(left: Date, right: Date): boolean {
  return left.getTime() >= right.getTime();
}

export function isBeforeOrEqual(left: Date, right: Date): boolean {
  return left.getTime() <= right.getTime();
}
