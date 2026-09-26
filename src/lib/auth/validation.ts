/** Client-side auth form validation, returns i18n toast keys per field */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type RegisterFieldErrors = Partial<Record<"fullName" | "email" | "phone" | "password", string>>;

export const isValidEmail = (email: string) => EMAIL_RE.test(email.trim());

export const isStrongPassword = (password: string) =>
  password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);

export const isValidPhoneLocal = (local: string) => {
  const digits = local.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
};

export const validateRegisterForm = (data: {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}): RegisterFieldErrors => {
  const errors: RegisterFieldErrors = {};
  const name = data.fullName.trim();

  if (name.length < 2) errors.fullName = "nameRequired";
  else if (name.length > 80) errors.fullName = "nameTooLong";

  if (!data.email.trim()) errors.email = "invalidEmailAddr";
  else if (!isValidEmail(data.email)) errors.email = "invalidEmailAddr";

  if (data.phone.trim() && !isValidPhoneLocal(data.phone)) errors.phone = "invalidPhone";

  if (!isStrongPassword(data.password)) errors.password = "passwordWeak";

  return errors;
};

export const isAppleSignInLikelyUnsupported = () => {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
};
