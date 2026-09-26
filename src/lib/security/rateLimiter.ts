/** Client-side anti brute-force, complements Firebase Auth lockout */

const PREFIX = "gp_rl_";
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 30 * 60 * 1000;

type Bucket = { attempts: number; lockedUntil: number };

const read = (key: string): Bucket => {
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return { attempts: 0, lockedUntil: 0 };
    return JSON.parse(raw) as Bucket;
  } catch {
    return { attempts: 0, lockedUntil: 0 };
  }
};

const write = (key: string, bucket: Bucket) => {
  localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(bucket));
};

export class RateLimitError extends Error {
  code = "auth/too-many-requests";
  retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super("Too many attempts, try again later");
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export const checkRateLimit = (action: string, identifier: string) => {
  const key = `${action}:${identifier.toLowerCase().trim()}`;
  const bucket = read(key);
  const now = Date.now();
  if (bucket.lockedUntil > now) {
    throw new RateLimitError(bucket.lockedUntil - now);
  }
};

export const recordFailedAttempt = (action: string, identifier: string) => {
  const key = `${action}:${identifier.toLowerCase().trim()}`;
  const bucket = read(key);
  const attempts = bucket.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    write(key, { attempts: 0, lockedUntil: Date.now() + LOCKOUT_MS });
  } else {
    write(key, { attempts, lockedUntil: 0 });
  }
};

export const clearRateLimit = (action: string, identifier: string) => {
  localStorage.removeItem(`${PREFIX}${action}:${identifier.toLowerCase().trim()}`);
};
