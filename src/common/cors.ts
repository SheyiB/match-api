export function resolveCorsOrigin(): string | string[] {
  const raw = process.env.CORS_ORIGIN;

  if (!raw || raw === '*') {
    return '*';
  }

  return raw.split(',').map((origin) => origin.trim());
}
