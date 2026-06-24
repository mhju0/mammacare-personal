const DEFAULT_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const inFlight = new Map<string, Promise<unknown>>();

export function readSessionCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;

    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!entry || typeof entry.expiresAt !== "number" || Date.now() > entry.expiresAt) {
      sessionStorage.removeItem(key);
      return null;
    }

    return entry.value;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

export function writeSessionCache<T>(
  key: string,
  value: T,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  try {
    const entry: CacheEntry<T> = {
      expiresAt: Date.now() + ttlMs,
      value,
    };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Storage quota/private mode failures should not break page rendering.
  }
}

export async function dedupeRequest<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const request = fetcher().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, request);
  return request;
}
