const OTP_KEY = "garuda_phone_otp";
const OTP_TTL_MS = 5 * 60 * 1000;

type OtpRecord = {
  phone: string;
  code: string;
  expiresAt: number;
};

const readRecord = (): OtpRecord | null => {
  try {
    const raw = sessionStorage.getItem(OTP_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OtpRecord;
  } catch {
    return null;
  }
};

const writeRecord = (record: OtpRecord) => {
  sessionStorage.setItem(OTP_KEY, JSON.stringify(record));
};

export const normalizePhone = (countryCode: string, local: string) => {
  const digits = local.replace(/\D/g, "");
  const cc = countryCode.replace(/\D/g, "");
  return `+${cc}${digits}`;
};

/** Demo / dev OTP, replace with Firebase Phone Auth in production */
export const sendDemoPhoneOtp = async (phone: string): Promise<string> => {
  await new Promise((r) => setTimeout(r, 800));
  const code = String(Math.floor(100000 + Math.random() * 900000));
  writeRecord({ phone, code, expiresAt: Date.now() + OTP_TTL_MS });
  if (import.meta.env.DEV) {
    console.info("[Garuda Prime] Demo OTP:", code, "for", phone);
  }
  return code;
};

export const verifyDemoPhoneOtp = (phone: string, otp: string): boolean => {
  const record = readRecord();
  if (!record) return false;
  if (record.phone !== phone) return false;
  if (Date.now() > record.expiresAt) return false;
  return record.code === otp;
};

export const clearPhoneOtp = () => sessionStorage.removeItem(OTP_KEY);

export const otpResendSeconds = (phone: string): number => {
  const record = readRecord();
  if (!record || record.phone !== phone) return 0;
  const left = Math.ceil((record.expiresAt - Date.now()) / 1000);
  return Math.max(0, Math.min(60, left));
};
