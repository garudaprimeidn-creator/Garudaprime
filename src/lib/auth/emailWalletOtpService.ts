const OTP_KEY = "garuda_email_wallet_otp";
const OTP_TTL_MS = 5 * 60 * 1000;

type EmailOtpRecord = {
  email: string;
  code: string;
  expiresAt: number;
  sentAt: number;
};

const readRecord = (): EmailOtpRecord | null => {
  try {
    const raw = sessionStorage.getItem(OTP_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as EmailOtpRecord;
  } catch {
    return null;
  }
};

const writeRecord = (record: EmailOtpRecord) => {
  sessionStorage.setItem(OTP_KEY, JSON.stringify(record));
};

/** Demo / dev email OTP when server wallet API unavailable */
export const sendDemoEmailWalletOtp = async (email: string): Promise<{ resendSec: number }> => {
  await new Promise((r) => setTimeout(r, 600));
  const now = Date.now();
  const prev = readRecord();
  if (prev?.email === email.toLowerCase() && now - prev.sentAt < 60_000) {
    return { resendSec: Math.ceil((60_000 - (now - prev.sentAt)) / 1000) };
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  writeRecord({
    email: email.toLowerCase(),
    code,
    expiresAt: now + OTP_TTL_MS,
    sentAt: now,
  });
  if (import.meta.env.DEV) {
    console.info("[Garuda Prime] Demo email wallet OTP:", code, "→", email);
  }
  return { resendSec: 60 };
};

export const verifyDemoEmailWalletOtp = (email: string, otp: string): boolean => {
  const record = readRecord();
  if (!record) return false;
  if (record.email !== email.trim().toLowerCase()) return false;
  if (Date.now() > record.expiresAt) return false;
  return record.code === otp.replace(/\D/g, "");
};

export const clearDemoEmailWalletOtp = () => sessionStorage.removeItem(OTP_KEY);

export const maskEmailAddress = (email: string): string => {
  const trimmed = email.trim();
  const [local, domain] = trimmed.split("@");
  if (!local || !domain) return trimmed;
  const head = local.slice(0, Math.min(2, local.length));
  const tail = local.length > 2 ? local.slice(-1) : "";
  return `${head}${"*".repeat(Math.max(3, local.length - head.length - tail.length))}${tail}@${domain}`;
};
