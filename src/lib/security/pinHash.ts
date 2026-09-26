const PBKDF2_ITERATIONS = 120_000;

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const fromB64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

export const isHashedPin = (stored: string) => stored.startsWith("pbkdf2$");

export async function hashAppPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(new Uint8Array(bits))}`;
}

export async function verifyAppPinHash(pin: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (!isHashedPin(stored)) return pin === stored;

  const [, iterRaw, saltB64, hashB64] = stored.split("$");
  const iterations = Number(iterRaw);
  if (!iterations || !saltB64 || !hashB64) return false;

  const salt = fromB64(saltB64);
  const expected = fromB64(hashB64);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const actual = new Uint8Array(bits);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}
