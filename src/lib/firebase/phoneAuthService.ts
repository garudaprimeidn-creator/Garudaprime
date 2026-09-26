import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "./config";
import { logLoginActivity } from "./firestoreService";
import { sendDemoPhoneOtp, verifyDemoPhoneOtp } from "../auth/phoneOtpService";
import type { AuthResult, MockUser } from "./authService";
import { isDemoAuthAllowed } from "../env/production";

let confirmation: ConfirmationResult | null = null;
let recaptcha: RecaptchaVerifier | null = null;
let recaptchaReady: Promise<void> | null = null;

const mockPhoneUser = (phone: string): MockUser => ({
  uid: `phone_${phone.replace(/\D/g, "")}`,
  email: null,
  displayName: phone,
  phoneNumber: phone,
});

const clearRecaptcha = () => {
  try {
    recaptcha?.clear();
  } catch {
    /* ignore */
  }
  recaptcha = null;
  recaptchaReady = null;
};

export const initPhoneRecaptcha = (containerId: string): Promise<void> => {
  if (!isFirebaseConfigured || !auth) return Promise.resolve();
  if (recaptchaReady) return recaptchaReady;

  recaptchaReady = (async () => {
    clearRecaptcha();
    const el = document.getElementById(containerId);
    if (!el) throw new Error("Recaptcha container not found");

    recaptcha = new RecaptchaVerifier(auth, containerId, {
      size: "invisible",
      callback: () => {},
      "expired-callback": () => {
        clearRecaptcha();
      },
    });
    await recaptcha.render();
  })();

  return recaptchaReady.catch((e) => {
    clearRecaptcha();
    throw e;
  });
};

export const sendPhoneOtp = async (phone: string): Promise<{ isDemo: boolean }> => {
  if (!isFirebaseConfigured || !auth) {
    if (!isDemoAuthAllowed()) {
      throw Object.assign(new Error("Phone authentication unavailable"), { code: "auth/service-unavailable" });
    }
    await sendDemoPhoneOtp(phone);
    return { isDemo: true };
  }

  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw Object.assign(new Error("Invalid phone"), { code: "auth/invalid-phone-number" });
  }

  await initPhoneRecaptcha("gp-recaptcha");
  if (!recaptcha) throw new Error("Recaptcha not ready");

  try {
    confirmation = await signInWithPhoneNumber(auth, phone, recaptcha);
    return { isDemo: false };
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "auth/captcha-check-failed" || code === "auth/missing-recaptcha-token") {
      clearRecaptcha();
      await initPhoneRecaptcha("gp-recaptcha");
      if (recaptcha) {
        confirmation = await signInWithPhoneNumber(auth, phone, recaptcha);
        return { isDemo: false };
      }
    }
    clearRecaptcha();
    throw e;
  }
};

export const verifyPhoneOtp = async (phone: string, otp: string): Promise<AuthResult> => {
  if (!isFirebaseConfigured || !auth) {
    if (!isDemoAuthAllowed()) {
      throw Object.assign(new Error("Phone authentication unavailable"), { code: "auth/service-unavailable" });
    }
    const ok = verifyDemoPhoneOtp(phone, otp);
    if (!ok) throw Object.assign(new Error("Invalid OTP"), { code: "auth/invalid-verification-code" });
    const user = mockPhoneUser(phone);
    await logLoginActivity(user.uid, "phone", true);
    return { user, isDemo: true };
  }

  if (!confirmation) {
    throw Object.assign(new Error("OTP expired"), { code: "auth/code-expired" });
  }

  try {
    const cred = await confirmation.confirm(otp);
    await logLoginActivity(cred.user.uid, "phone", true).catch(() => {});
    confirmation = null;
    clearRecaptcha();
    return { user: cred.user as User, isDemo: false };
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "auth/invalid-verification-code") {
      throw Object.assign(e instanceof Error ? e : new Error("Invalid OTP"), { code: "auth/invalid-verification-code" });
    }
    confirmation = null;
    throw e;
  }
};

export const resetPhoneOtpSession = () => {
  confirmation = null;
};
