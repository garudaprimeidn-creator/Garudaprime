import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  OAuthProvider,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type ActionCodeSettings,
  type User,
  type UserCredential,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "./config";
import { createUserProfile, logLoginActivity, upsertOAuthProfile } from "./firestoreService";
import { shouldUseOAuthRedirect, isOAuthRedirectRisky } from "../auth/oauthEnvironment";
import { markOAuthPending } from "../auth/oauthTransition";
import { waitForNextPaint } from "../auth/authGateOverlay";
import { signInGoogleInPage, getGoogleOAuthClientId } from "./googleSignInPwa";
import { isAppleSignInLikelyUnsupported } from "../auth/validation";
import { checkRateLimit, clearRateLimit, recordFailedAttempt } from "../security/rateLimiter";
import { isDemoAuthAllowed } from "../env/production";

export type AuthResult = { user: User | MockUser; isDemo: boolean; emailVerificationSent?: boolean; isNewUser?: boolean };

export type MockUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  phoneNumber: string | null;
  photoURL?: string | null;
  emailVerified?: boolean;
};

const mockUser = (data: Partial<MockUser>): MockUser => ({
  uid: `demo_${Date.now()}`,
  email: data.email ?? null,
  displayName: data.displayName ?? null,
  phoneNumber: data.phoneNumber ?? null,
  photoURL: data.photoURL ?? null,
  emailVerified: data.emailVerified ?? true,
});

const authServiceUnavailable = () =>
  Object.assign(new Error("Authentication service unavailable. Configure Firebase."), {
    code: "auth/service-unavailable",
  });

const allowDemoAuth = () => !isFirebaseConfigured || !auth ? isDemoAuthAllowed() : false;

const profileFromFirebaseUser = (user: User, authMethod: string) => ({
  fullName: user.displayName ?? user.email?.split("@")[0] ?? "Garuda User",
  email: user.email ?? "",
  phone: user.phoneNumber ?? "",
  avatar: user.photoURL ?? null,
  provider: authMethod,
  authMethod,
  loginProvider: authMethod,
  kycStatus: "none" as const,
  role: "user" as const,
  status: "active" as const,
});

const finishOAuth = async (cred: UserCredential, method: "google" | "apple"): Promise<AuthResult> => {
  let isNewUser = false;
  try {
    const upsert = await upsertOAuthProfile(cred.user.uid, profileFromFirebaseUser(cred.user, method));
    isNewUser = upsert.isNew;
  } catch {
    /* Profil Firestore opsional, jangan blokir login OAuth */
  }
  await touchLogin(cred.user.uid, method);
  return { user: cred.user, isDemo: false, isNewUser };
};

export const signInEmail = async (email: string, password: string): Promise<AuthResult> => {
  checkRateLimit("login", email);
  if (!isFirebaseConfigured || !auth) {
    if (!allowDemoAuth()) throw authServiceUnavailable();
    const user = mockUser({ email, displayName: email.split("@")[0] });
    await logLoginActivity(user.uid, "email", true);
    clearRateLimit("login", email);
    return { user, isDemo: true };
  }
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    try {
      await upsertOAuthProfile(cred.user.uid, profileFromFirebaseUser(cred.user, "email"));
    } catch { /* optional */ }
    await touchLogin(cred.user.uid, "email");
    clearRateLimit("login", email);
    return { user: cred.user, isDemo: false };
  } catch (e) {
    recordFailedAttempt("login", email);
    throw e;
  }
};

const touchLogin = async (uid: string, method: string) => {
  try {
    await logLoginActivity(uid, method, true);
  } catch {
    /* Firestore audit optional, do not block auth */
  }
};

export const registerEmail = async (
  email: string,
  password: string,
  profile: { fullName: string; phone: string },
): Promise<AuthResult> => {
  if (!isFirebaseConfigured || !auth) {
    if (!allowDemoAuth()) throw authServiceUnavailable();
    const user = mockUser({ email, displayName: profile.fullName, phoneNumber: profile.phone });
    await createUserProfile(user.uid, {
      ...profile,
      email,
      provider: "email",
      authMethod: "email",
      loginProvider: "email",
      kycStatus: "none",
      role: "user",
      status: "active",
    });
    await logLoginActivity(user.uid, "register", true);
    return { user, isDemo: true, emailVerificationSent: false };
  }
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: profile.fullName });
  await createUserProfile(cred.user.uid, {
    ...profile,
    email,
    provider: "email",
    authMethod: "email",
    loginProvider: "email",
    kycStatus: "none",
    role: "user",
    status: "active",
  });
  await sendEmailVerification(cred.user, emailVerificationActionCodeSettings());
  await logLoginActivity(cred.user.uid, "register", true);
  return { user: cred.user, isDemo: false, emailVerificationSent: true };
};

const emailVerificationActionCodeSettings = (): ActionCodeSettings => ({
  url: typeof window !== "undefined"
    ? `${window.location.origin}/`
    : "https://app.garudaprime.id/",
  handleCodeInApp: false,
});

export const canResendEmailVerification = (): boolean => {
  if (!isFirebaseConfigured || !auth?.currentUser) return allowDemoAuth();
  const user = auth.currentUser;
  return Boolean(user.email) && !user.emailVerified;
};

export const resendEmailVerification = async (): Promise<void> => {
  if (!isFirebaseConfigured || !auth?.currentUser) {
    if (!allowDemoAuth()) {
      throw Object.assign(new Error("Not signed in"), { code: "auth/not-signed-in" });
    }
    await new Promise((r) => setTimeout(r, 500));
    return;
  }
  const user = auth.currentUser;
  if (user.emailVerified) return;
  if (!user.email) {
    throw Object.assign(new Error("No email on auth session"), { code: "auth/missing-email" });
  }
  await sendEmailVerification(user, emailVerificationActionCodeSettings());
};

export const resetPasswordEmail = async (email: string): Promise<void> => {
  if (!isFirebaseConfigured || !auth) {
    if (!allowDemoAuth()) throw authServiceUnavailable();
    await new Promise((r) => setTimeout(r, 600));
    return;
  }
  await sendPasswordResetEmail(auth, email);
};

const googleProvider = () => {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  return p;
};

const appleProvider = () => {
  const p = new OAuthProvider("apple.com");
  p.addScope("email");
  p.addScope("name");
  return p;
};

export const signInGoogle = async (): Promise<AuthResult | null> => {
  if (!isFirebaseConfigured || !auth) {
    if (!allowDemoAuth()) throw authServiceUnavailable();
    const user = mockUser({
      email: "user@gmail.com",
      displayName: "Garuda User",
      photoURL: null,
    });
    await createUserProfile(user.uid, {
      fullName: user.displayName!,
      email: user.email!,
      phone: "",
      provider: "google",
      authMethod: "google",
      loginProvider: "google",
      avatar: null,
      kycStatus: "none",
      role: "user",
      status: "active",
    });
    await logLoginActivity(user.uid, "google", true);
    return { user, isDemo: true };
  }

  // In-page GIS only, never full-tab redirect when client ID is configured
  if (getGoogleOAuthClientId()) {
    const cred = await signInGoogleInPage(auth);
    return finishOAuth(cred, "google");
  }

  if (isOAuthRedirectRisky()) {
    throw Object.assign(
      new Error("Google login memerlukan VITE_GOOGLE_OAUTH_CLIENT_ID di production"),
      { code: "auth/pwa-oauth-unavailable" },
    );
  }

  if (shouldUseOAuthRedirect()) {
    await waitForNextPaint();
    markOAuthPending();
    await signInWithRedirect(auth, googleProvider());
    return null;
  }

  throw Object.assign(
    new Error("Google login unavailable, configure VITE_GOOGLE_OAUTH_CLIENT_ID"),
    { code: "auth/google-client-id-missing" },
  );
};

export const signInApple = async (): Promise<AuthResult | null> => {
  if (!isFirebaseConfigured || !auth) {
    if (!allowDemoAuth()) throw authServiceUnavailable();
    const user = mockUser({
      email: "user@icloud.com",
      displayName: "Garuda User",
      photoURL: null,
    });
    await createUserProfile(user.uid, {
      fullName: user.displayName!,
      email: user.email!,
      phone: "",
      provider: "apple",
      authMethod: "apple",
      loginProvider: "apple",
      avatar: null,
      kycStatus: "none",
      role: "user",
      status: "active",
    });
    await logLoginActivity(user.uid, "apple", true);
    return { user, isDemo: true };
  }

  if (isAppleSignInLikelyUnsupported()) {
    throw Object.assign(
      new Error("Apple Sign In requires HTTPS domain, not supported on localhost"),
      { code: "auth/apple-localhost-unsupported" },
    );
  }

  if (shouldUseOAuthRedirect()) {
    markOAuthPending();
    await signInWithRedirect(auth, appleProvider());
    return null;
  }

  try {
    const cred = await signInWithPopup(auth, appleProvider());
    return finishOAuth(cred, "apple");
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    if (
      code === "auth/popup-closed-by-user"
      || code === "auth/cancelled-popup-request"
    ) {
      throw e;
    }
    if (
      code === "auth/popup-blocked"
      || code === "auth/operation-not-allowed"
    ) {
      if (isOAuthRedirectRisky()) {
        throw Object.assign(
          new Error("Apple Sign In unavailable in installed app, open in Safari/Chrome browser"),
          { code: "auth/pwa-oauth-unavailable" },
        );
      }
      markOAuthPending();
      await signInWithRedirect(auth, appleProvider());
      return null;
    }
    throw e;
  }
};

/** Call on app/auth mount to complete Google/Apple redirect sign-in */
export const completeOAuthRedirect = async (): Promise<AuthResult | null> => {
  if (!isFirebaseConfigured || !auth) return null;
  try {
    await auth.authStateReady();
    const result = await getRedirectResult(auth);
    if (!result) return null;
    const method = result.providerId?.includes("apple") ? "apple" : "google";
    return finishOAuth(result, method as "google" | "apple");
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err
      ? String((err as { code: string }).code)
      : "";
    const message = err instanceof Error ? err.message : "";
    if (
      code.includes("missing-initial-state")
      || message.includes("missing initial state")
    ) {
      throw Object.assign(
        new Error("OAuth session expired, please try Google login again"),
        { code: "auth/oauth-redirect-state-lost" },
      );
    }
    throw err;
  }
};

export const signOutFirebase = async () => {
  if (auth) await firebaseSignOut(auth);
};

export const subscribeAuth = (cb: (user: User | null) => void) => {
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
};

export const reloadCurrentUser = async (): Promise<User | null> => {
  if (!auth?.currentUser) return null;
  await auth.currentUser.reload();
  return auth.currentUser;
};
