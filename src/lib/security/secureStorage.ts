const PREFIX = "gp_secure_";
const CRYPTO_KEY_NAME = "gp_aes_key_v1";

const fallbackEncode = (value: string) => btoa(encodeURIComponent(value));
const fallbackDecode = (value: string) => decodeURIComponent(atob(value));

const getOrCreateKey = async (): Promise<CryptoKey | null> => {
  if (!crypto.subtle) return null;
  try {
    const stored = localStorage.getItem(CRYPTO_KEY_NAME);
    if (stored) {
      const raw = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
      return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    }
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const exported = await crypto.subtle.exportKey("raw", key);
    localStorage.setItem(CRYPTO_KEY_NAME, btoa(String.fromCharCode(...new Uint8Array(exported))));
    return key;
  } catch {
    return null;
  }
};

const encrypt = async (value: string): Promise<string> => {
  const key = await getOrCreateKey();
  if (!key) return fallbackEncode(value);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.length);
  return `v1:${btoa(String.fromCharCode(...combined))}`;
};

const decrypt = async (value: string): Promise<string> => {
  if (!value.startsWith("v1:")) return fallbackDecode(value);
  const key = await getOrCreateKey();
  if (!key) return fallbackDecode(value.slice(3));
  const raw = Uint8Array.from(atob(value.slice(3)), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const data = raw.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(plain);
};

const cache = new Map<string, string>();

export const secureSet = (key: string, value: string) => {
  try {
    encrypt(value).then((encoded) => {
      localStorage.setItem(`${PREFIX}${key}`, encoded);
      cache.set(key, value);
    });
    cache.set(key, value);
  } catch { /* quota */ }
};

export const secureGet = (key: string): string | null => {
  if (cache.has(key)) return cache.get(key)!;
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return null;
    if (raw.startsWith("v1:")) {
      decrypt(raw).then((v) => cache.set(key, v)).catch(() => {});
      return cache.get(key) ?? null;
    }
    const decoded = fallbackDecode(raw);
    cache.set(key, decoded);
    return decoded;
  } catch {
    return null;
  }
};

/** Async read for encrypted values not yet in cache */
export const secureGetAsync = async (key: string): Promise<string | null> => {
  if (cache.has(key)) return cache.get(key)!;
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return null;
    const decoded = raw.startsWith("v1:") ? await decrypt(raw) : fallbackDecode(raw);
    cache.set(key, decoded);
    return decoded;
  } catch {
    return null;
  }
};

export const secureRemove = (key: string) => {
  localStorage.removeItem(`${PREFIX}${key}`);
  cache.delete(key);
};

export const SESSION_KEY = "garuda_prime_session";
export const REMEMBER_KEY = "garuda_prime_remember";
export const PLAIN_UID_KEY = "garuda_prime_uid";
export const ONBOARDING_KEY = "garuda_prime_onboarding_done";
export const PIN_KEY = "garuda_prime_pin";
export const WALLET_KEY = "garuda_prime_wallet";

export const hasSession = () => localStorage.getItem(SESSION_KEY) === "1";

/** Preload session-critical encrypted values only (fast boot) */
export const hydrateSessionKeys = async (): Promise<void> => {
  if (typeof localStorage === "undefined") return;
  await Promise.all(
    ["uid", "session_fp", "token_exp", "id_token"].map((key) =>
      secureGetAsync(key).then(() => undefined).catch(() => undefined),
    ),
  );
};

/** @deprecated Use sessionManager.establishSession */
export const setSession = (uid: string, remember = true) => {
  localStorage.setItem(SESSION_KEY, "1");
  localStorage.setItem(PLAIN_UID_KEY, uid);
  secureSet("uid", uid);
  if (remember) localStorage.setItem(REMEMBER_KEY, "1");
};

/** @deprecated Use sessionManager.destroySession */
export const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(PLAIN_UID_KEY);
  secureRemove("uid");
};
