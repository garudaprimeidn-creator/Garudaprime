/** RFC 6238 TOTP (Authenticator app), no external deps */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const generateTotpSecret = (length = 20): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) {
    out += BASE32[bytes[i] % 32];
  }
  return out;
};

export const base32Decode = (input: string): Uint8Array => {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  const bits: number[] = [];
  for (const ch of clean) {
    const val = BASE32.indexOf(ch);
    if (val < 0) continue;
    for (let i = 4; i >= 0; i--) bits.push((val >> i) & 1);
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    bytes.push(byte);
  }
  return new Uint8Array(bytes);
};

const counterBytes = (counter: number): Uint8Array => {
  const buf = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  return buf;
};

const hmacSha1 = async (key: Uint8Array, message: Uint8Array): Promise<Uint8Array> => {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, message);
  return new Uint8Array(sig);
};

const dynamicTruncate = (hmac: Uint8Array): number => {
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return code % 1_000_000;
};

export const totpAt = async (secret: string, counter: number): Promise<string> => {
  const key = base32Decode(secret);
  const hmac = await hmacSha1(key, counterBytes(counter));
  return String(dynamicTruncate(hmac)).padStart(6, "0");
};

export const verifyTotp = async (secret: string, token: string, window = 1): Promise<boolean> => {
  const clean = token.replace(/\D/g, "");
  if (clean.length !== 6) return false;
  const step = 30;
  const counter = Math.floor(Date.now() / 1000 / step);
  for (let w = -window; w <= window; w++) {
    const code = await totpAt(secret, counter + w);
    if (code === clean) return true;
  }
  return false;
};

export const buildTotpUri = (secret: string, account: string, issuer = "Garuda Prime"): string =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

export const formatTotpSecret = (secret: string): string =>
  secret.replace(/(.{4})/g, "$1 ").trim();
