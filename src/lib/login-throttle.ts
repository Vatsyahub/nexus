/**
 * Wrong-password pause, keyed by email. Passwords stay hashed;
 * this map only remembers how many recent tries failed.
 * The first several misses are immediate. After that, the next try waits.
 * A correct password is still accepted once its turn runs.
 */

export const LOGIN_FAILURES_BEFORE_WAIT = 5;
export const LOGIN_WAIT_BASE_MS = 5_000;
export const LOGIN_WAIT_MAX_MS = 30_000;

type Bucket = {
  failures: number;
  waitUntil: number;
};

const buckets = new Map<string, Bucket>();
const tails = new Map<string, Promise<unknown>>();

export function loginEmailKey(email: string): string {
  return email.toLowerCase().trim();
}

/** Wait that starts after this many failures. Zero until the threshold. */
export function waitMsForFailureCount(failures: number): number {
  if (failures < LOGIN_FAILURES_BEFORE_WAIT) return 0;
  const steps = failures - LOGIN_FAILURES_BEFORE_WAIT;
  const wait = LOGIN_WAIT_BASE_MS * 2 ** steps;
  return Math.min(LOGIN_WAIT_MAX_MS, wait);
}

export function noteLoginFailure(email: string, now = Date.now()): number {
  const key = loginEmailKey(email);
  const prev = buckets.get(key) ?? { failures: 0, waitUntil: 0 };
  const failures = prev.failures + 1;
  const wait = waitMsForFailureCount(failures);
  buckets.set(key, {
    failures,
    waitUntil: wait > 0 ? now + wait : 0,
  });
  return wait;
}

export function clearLoginFailures(email: string) {
  buckets.delete(loginEmailKey(email));
}

export function loginWaitRemaining(email: string, now = Date.now()): number {
  const bucket = buckets.get(loginEmailKey(email));
  if (!bucket) return 0;
  return Math.max(0, bucket.waitUntil - now);
}

export function loginFailureCount(email: string): number {
  return buckets.get(loginEmailKey(email))?.failures ?? 0;
}

/**
 * One try per email at a time. After several misses, the next try
 * waits out the pause before the password is checked.
 */
export async function runLoginAttempt<T>(
  email: string,
  attempt: () => Promise<T>
): Promise<T> {
  const key = loginEmailKey(email);
  const prev = tails.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  tails.set(
    key,
    prev.then(() => gate).catch(() => undefined)
  );
  await prev.catch(() => undefined);
  try {
    const wait = loginWaitRemaining(key);
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    return await attempt();
  } finally {
    release();
  }
}
