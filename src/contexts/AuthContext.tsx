import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { clearWalletConnectedNotifSession } from "../lib/notifications/notificationService";
import {
  signInEmail, registerEmail, signInGoogle, signInApple, signOutFirebase,
  resetPasswordEmail, subscribeAuth, completeOAuthRedirect, resendEmailVerification,
  canResendEmailVerification,
  reloadCurrentUser, type MockUser,
} from "../lib/firebase/authService";
import {
  getUserProfile, saveConnectedWallet, saveKycVerification, saveWalletRecord,
  upsertOAuthProfile, updateUserProfile, logLoginActivity, touchLastLogin,
  registerUserDeviceSession,
  subscribeUserProfile, getConnectedWalletDocs, deleteConnectedWalletDoc,
  setPrimaryWalletAddress, withFirestoreTimeout,
  type ConnectedWalletDoc,
  type UserProfile,
} from "../lib/firebase/firestoreService";
import {
  connectWallet, signMessage, verifyWalletSignature, createWalletAuthMessage, formatAddress,
  clearConnectedWalletSession,
  getStoredWallet,
  storeConnectedWalletSession,
  type ConnectedWallet, type WalletProvider, type WalletAuthStep,
} from "../lib/web3/walletService";
import { grantGarudaSignWindow } from "../lib/web3/garudaWalletSignGate";
import {
  isValidGarudaRecoveryPhrase,
  listPhraseSigningAccounts,
  normalizeRecoveryPhrase,
  resolveRecoveryPrivateKey,
  type PhraseSigningAccount,
} from "../lib/wallet/garudaRecoveryPhrase";
import { privateKeyToAccount } from "viem/accounts";
import { bindEmbeddedWalletOnServer } from "../lib/firebase/embeddedWalletApi";
import { connectEmbeddedWallet } from "../lib/web3/embeddedWalletService";
import { restoreConnectedWalletSession } from "../lib/web3/restoreWalletSession";
import {
  autoActivateGarudaPrimeWallet,
  ensureGarudaNativeSigningReady,
  syncGarudaPrimeWalletIdentity,
} from "../lib/web3/garudaNativeProvision";
import { clearGarudaServerAddressCache, cacheGarudaServerAddress } from "../lib/web3/garudaNativeSession";
import { unlinkGarudaNativeAlias } from "../lib/web3/garudaWalletBridge";
import {
  clearPhraseWalletSigner,
  persistAndRegisterPhraseWallet,
  PHRASE_WALLET_PROVIDER,
  restorePhraseWalletSigner,
} from "../lib/web3/phraseWalletBridge";
import {
  dedupeConnectedWalletDocs,
  normalizeWalletAddress,
  resolveFirestoreWalletProvider,
  resolveLockedWalletProvider,
  isGarudaPrimePersistedWalletType,
  syncWalletProviderLocksFromFirestore,
  resolvePrimaryWalletAddress,
  resolvePersistedWalletType,
  resolveStoredWalletProvider,
} from "../lib/web3/connectedWalletUtils";
import {
  clearAddressProviderLock,
  clearAllWalletProviderLocks,
  loadPrimaryWalletLock,
  primaryWalletLockForRow,
  resolveAddressLockedProvider,
  saveAddressProviderLock,
  savePrimaryWalletLock,
} from "../lib/web3/primaryWalletLock";
import { secureRemove, WALLET_KEY } from "../lib/security/secureStorage";
import {
  connectKycPort, completeKycPortOAuthFromUrl, startKycPortVerification,
  refreshKycPortVerification, mapKycStatusToTier, syncKycPortUserToApp,
  refreshKycPortFromStoredToken, kycPortUidForUser, resumeKycPortOAuth,
  isKycPortConnectionPending, startKycPortVerifyOAuth, tryFinalizeKycPortOAuth,
  type KycPortAuthSession,
} from "../lib/kyc/kycportService";
import { fetchKycPortReachability, resolveKycPortOAuthReady } from "../lib/kyc/kycportApi";
import { isKycPortAssuranceVerified } from "../lib/kyc/kycportStatus";
import {
  hasSession, ONBOARDING_KEY, secureSet, PLAIN_UID_KEY,
} from "../lib/security/secureStorage";
import { clearAppEntryFromUrl, readAppEntry, readAppFlow } from "../lib/app/appEntry";
import { clearBootBlockers, clearStaleOAuthPending, sanitizeBootAuthState } from "../lib/app/bootCleanup";
import {
  markAccountSetupDone, needsAccountSetup, persistPendingAuthPhase, readPendingAuthPhase,
  clearPendingAuthPhase, resolveSessionPhase, persistAccountPreview, readAccountPreview,
  clearRegistrationWallet,
  clearRegistrationStep, isAccountSetupDoneOnDevice,
  persistRegistrationStep, readRegistrationStep, markRegistrationWalletLinked,
} from "../lib/auth/accountSetup";
import { pickText } from "../lib/auth/userFields";
import { clearOAuthPending, isOAuthPending } from "../lib/auth/oauthTransition";
import { hideInstantAuthGate } from "../lib/auth/authGateOverlay";
import {
  establishSession, destroySession, validateSession,
  refreshSessionToken, initCsrfToken, getSessionUidAsync, getSessionUidSync, rebindDeviceFingerprint,
} from "../lib/security/sessionManager";
import {
  needsMfaChallenge, markMfaVerified, markMfaPending, clearMfaSession,
  loadSecurityPrefs, setAppPin, setTwoFactorEnabledLocal, setBiometricEnabledLocal,
  syncSecurityPrefsToFirestore, sanitizeSecurityPrefs, loadPasskeyCredential,
} from "../lib/security/securityStore";
import { isFirebaseConfigured, auth as firebaseAuth } from "../lib/firebase/config";
import { initializeNewUserSession } from "../lib/user/userAppData";
import { bindReferralCodeClient, applyPendingReferralCode } from "../lib/referral/referralService";
import { getPendingReferralCode, normalizeReferralCode, clearPendingReferralCode, hasReferralInUrl, clearReferralGuestLanding, isReferralEntryActive, bootstrapReferralEntry } from "../lib/referral/referralRef";
import { isReferralProgramAvailable } from "../lib/referral/referralProgramGate";
import { onAuthStateChanged, signInWithCustomToken, type User } from "firebase/auth";
import { exchangeWalletAuthToken, isWalletAuthApiConfigured } from "../lib/firebase/walletAuthApi";
import { exchangeKycPortAuthToken, isKycPortAuthApiConfigured } from "../lib/firebase/kycportAuthApi";
import {
  clearKycPortOAuth,
  clearKycPortPendingExchange,
  clearKycPortTokensAfterAuth,
  loadKycPortPendingExchange,
  getKycPortAccessToken,
} from "../lib/kyc/kycportStorage";
import { getKycPortConfig } from "../lib/kyc/kycportConfig";
import { showAppToast } from "../app/appToast";
import { resolveFirebaseAuthToast, type ToastEntry } from "../lib/firebase/authErrors";
import { disconnectWalletConnect } from "../lib/web3/walletConnectProvider";
import { APP_I18N } from "../app/i18n";
import {
  runKycPortCallbackBridge,
  isKycPortResumePath,
  cleanKycPortOAuthPath,
  isKycPortCallbackPath,
  setKycPortAwaiting,
} from "../lib/kyc/kycportOAuthFlow";
import { notifyKycProfileSync } from "../lib/kyc/kycProfileSync";
import { clearKycPortVerifySessionId } from "../lib/kyc/kycportVerifySession";
import { warmupPayHubAuthToken } from "../lib/payhub/payHubApi";

const ID_AUTH_TOAST = APP_I18N.id.toast as unknown as Record<string, ToastEntry>;

export type AppPhase = "splash" | "onboarding" | "auth" | "oauth-resume" | "verify" | "register" | "mfa" | "app";

export type AuthUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  phone: string | null;
  avatar?: string | null;
  isDemo: boolean;
  emailVerified?: boolean;
  walletAddress?: string | null;
  kycStatus?: string;
  role?: string;
};

type AuthContextValue = {
  phase: AppPhase;
  setPhase: (p: AppPhase) => void;
  user: AuthUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  sessionRestoring: boolean;
  authGateActive: boolean;
  connectedWallet: ConnectedWallet | null;
  walletAuthStep: WalletAuthStep;
  isFirebaseReady: boolean;
  onboardingDone: boolean;
  emailVerificationPending: boolean;
  canResendEmailVerification: boolean;
  completeSplash: () => void;
  completeOnboarding: () => void;
  signIn: (email: string, password: string, remember?: boolean) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshEmailVerification: () => Promise<boolean>;
  signInWithWallet: (provider: WalletProvider) => Promise<void>;
  signInWithGarudaRecovery: (phrase: string, pin: string) => Promise<void>;
  signInWithKycPort: () => Promise<void>;
  resumeKycPortConnection: () => Promise<void>;
  kycportConnectionPending: boolean;
  kycportLoading: boolean;
  startKycPortVerificationFlow: () => Promise<{ sessionId: string; status: string; isDemo: boolean; verified?: boolean; verificationUrl?: string }>;
  refreshKycPortStatus: (sessionId: string) => Promise<{ status: string; tier: number; verified: boolean }>;
  refreshUserProfile: () => Promise<void>;
  /** Handles /auth/kycport/callback, exchange code, sync, enter app. */
  processKycPortOAuthCallback: () => Promise<"app" | "register" | "auth">;
  register: (data: RegisterData) => Promise<void>;
  connectWeb3Wallet: (provider: WalletProvider) => Promise<ConnectedWallet>;
  linkWeb3Wallet: (provider: WalletProvider, options?: { makePrimary?: boolean; forceNewSession?: boolean }) => Promise<ConnectedWallet>;
  linkEmbeddedGarudaWallet: (options?: { otpSession?: string }) => Promise<ConnectedWallet>;
  linkGarudaPhraseWallet: (phrase: string) => Promise<ConnectedWallet>;
  setPrimaryWeb3Wallet: (
    address: string,
    options?: { walletType?: string | null; network?: string | null; docId?: string | null },
  ) => Promise<ConnectedWallet>;
  disconnectWeb3Wallet: (address: string, docId?: string) => Promise<void>;
  completeRegistration: (data: RegistrationCompleteData) => Promise<void>;
  enterApp: () => void;
  signOut: () => Promise<void>;
  restoreSession: () => Promise<void>;
  updateProfile: (patch: { fullName?: string; email?: string; phone?: string }) => Promise<void>;
  completeMfaLogin: () => void;
  mfaUid: string | null;
};

export type RegisterData = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  referral?: string;
};

export type RegistrationCompleteData = {
  walletMode: "otp" | "external";
  walletAddress?: string;
  kycCompleted: boolean;
  biometricEnabled: boolean;
  pin: string;
  twoFactorEnabled: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

const toAuthUser = (user: User | MockUser, profile: UserProfile | null, isDemo: boolean): AuthUser => ({
  uid: user.uid,
  email: pickText(profile?.email, user.email),
  displayName: pickText(profile?.fullName, "displayName" in user ? user.displayName : null),
  phone: pickText(profile?.phone, "phoneNumber" in user ? user.phoneNumber : null),
  avatar: profile?.avatar ?? ("photoURL" in user ? user.photoURL ?? null : null),
  isDemo,
  emailVerified: "emailVerified" in user && typeof user.emailVerified === "boolean"
    ? user.emailVerified
    : true,
  walletAddress: profile?.walletAddress ?? null,
  kycStatus: profile?.kycStatus,
  role: profile?.role,
});

const profileToAuthUser = (profile: UserProfile, uid: string, isDemo = false): AuthUser => ({
  uid,
  email: pickText(profile.email),
  displayName: pickText(profile.fullName),
  phone: pickText(profile.phone),
  avatar: profile.avatar ?? null,
  isDemo,
  emailVerified: true,
  walletAddress: profile.walletAddress ?? null,
  kycStatus: profile.kycStatus,
  role: profile.role,
});

const waitForFirebaseUser = async (timeoutMs = 1_200): Promise<User | null> => {
  const auth = firebaseAuth;
  if (!isFirebaseConfigured || !auth) return null;
  try {
    await auth.authStateReady();
  } catch {
    /* demo / offline */
  }
  if (auth.currentUser) return auth.currentUser;

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      unsub();
      resolve(auth.currentUser ?? null);
    }, timeoutMs);
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        window.clearTimeout(timer);
        unsub();
        resolve(fbUser);
      }
    });
  });
};

const buildCachedAuthUser = (): AuthUser | null => {
  if (typeof window === "undefined") return null;
  if (!validateSession().valid) return null;
  const uid = getSessionUidSync() ?? localStorage.getItem(PLAIN_UID_KEY);
  if (!uid) return null;
  const preview = readAccountPreview(uid);
  return {
    uid,
    email: preview?.email ?? null,
    displayName: preview?.displayName ?? null,
    phone: preview?.phone ?? null,
    isDemo: false,
    emailVerified: true,
  };
};

const resolveReferralGuestPhase = (): AppPhase | null => {
  if (typeof window === "undefined") return null;
  if (!isReferralProgramAvailable()) return null;
  bootstrapReferralEntry();
  const fromUrl = hasReferralInUrl();
  if (!fromUrl && !getPendingReferralCode()) return null;

  const session = validateSession();
  const pending = readPendingAuthPhase();
  const storedSession = hasSession();
  const isCompleteSession = storedSession && session.valid && pending !== "register" && pending !== "verify";
  if (isCompleteSession) return null;

  return "auth";
};

const resolveWalletOtpResumePhase = (): AppPhase | null => {
  if (readAppFlow() !== "wallet-otp") return null;

  const session = validateSession();
  if (!session.valid) return null;

  const uid = session.uid ?? getSessionUidSync();
  if (!uid || isAccountSetupDoneOnDevice(uid)) return null;

  const preview = readAccountPreview(uid);
  const regStep = readRegistrationStep();
  if (!preview && regStep !== "wallet") return null;

  persistPendingAuthPhase("register");
  if (regStep !== "wallet") persistRegistrationStep("wallet");
  return "register";
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [phase, setPhaseState] = useState<AppPhase>(() => {
    if (typeof window === "undefined") return "splash";
    initCsrfToken();

    const referralPhase = resolveReferralGuestPhase();
    if (referralPhase) return referralPhase;

    if (typeof window !== "undefined" && isKycPortCallbackPath()) return "auth";
    if (isOAuthPending()) return "auth";

    const session = validateSession();
    if (session.valid) {
      const uid = session.uid ?? getSessionUidSync();
      const pending = readPendingAuthPhase();
      if (pending && uid) return pending;
      if (pending) clearPendingAuthPhase();

      const walletOtpResume = resolveWalletOtpResumePhase();
      if (walletOtpResume) return walletOtpResume;

      return "app";
    }

    const entry = readAppEntry();
    const onboardingComplete = !!localStorage.getItem(ONBOARDING_KEY);
    if (entry === "onboarding" && !onboardingComplete) return "onboarding";
    return "auth";
  });
  const [user, setUser] = useState<AuthUser | null>(() => buildCachedAuthUser());
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionRestoring, setSessionRestoring] = useState(() => {
    if (typeof window === "undefined") return false;
    return isOAuthPending();
  });
  const [authGateActive, setAuthGateActive] = useState(false);
  const [connectedWallet, setConnectedWallet] = useState<ConnectedWallet | null>(() => getStoredWallet());
  const primaryWalletSwitchRef = useRef(false);
  const pendingPrimaryWalletRef = useRef<string | null>(null);
  const restoreInFlightRef = useRef(false);
  const [walletAuthStep, setWalletAuthStep] = useState<WalletAuthStep>("idle");
  const [emailVerificationPending, setEmailVerificationPending] = useState(false);
  const [kycportConnectionPending, setKycportConnectionPending] = useState(
    () => isKycPortConnectionPending(),
  );
  const [kycportLoading, setKycportLoading] = useState(false);
  const onboardingDone = typeof window !== "undefined" && !!localStorage.getItem(ONBOARDING_KEY);
  const googleSignInPending = useRef(false);
  const [mfaUid, setMfaUid] = useState<string | null>(null);

  const resolvePhaseWithMfa = useCallback((uid: string, basePhase: AppPhase): AppPhase => {
    if (basePhase !== "app") return basePhase;
    sanitizeSecurityPrefs(uid);
    if (needsMfaChallenge(uid)) {
      markMfaPending();
      setMfaUid(uid);
      return "mfa";
    }
    return basePhase;
  }, []);

  const completeMfaLogin = useCallback(() => {
    markMfaVerified();
    setMfaUid(null);
    clearPendingAuthPhase();
    setPhaseState("app");
  }, []);

  const setPhase = useCallback((next: AppPhase) => {
    const normalized = next === "verify" ? "register" : next;
    if (normalized === "register") {
      persistPendingAuthPhase("register");
    } else {
      clearPendingAuthPhase();
    }
    setPhaseState(normalized);
  }, []);

  const loadProfile = useCallback(async (uid: string) => {
    const profile = await withFirestoreTimeout(
      "getUserProfile",
      getUserProfile(uid),
      8_000,
    ).catch(() => null);
    setUserProfile((prev) => {
      const kycChanged =
        prev?.kycStatus !== profile?.kycStatus || prev?.kycTier !== profile?.kycTier;
      if (kycChanged && profile) {
        queueMicrotask(() => notifyKycProfileSync({ uid }));
      }
      return profile;
    });
    return profile;
  }, []);

  const resolvePostAuthPhase = useCallback((
    authUser: AuthUser,
    profile: UserProfile | null,
    options?: { authMethod?: string; skipSetup?: boolean },
  ): AppPhase => {
    if (needsAccountSetup(authUser.uid, profile, options)) return "register";
    return "app";
  }, []);

  const finishAuth = useCallback(async (
    authUser: AuthUser,
    remember = true,
    options?: { authMethod?: string; skipSetup?: boolean; isNewRegister?: boolean },
  ) => {
    const authMethod = options?.authMethod;
    persistAccountPreview({
      uid: authUser.uid,
      displayName: authUser.displayName,
      email: authUser.email,
      phone: authUser.phone,
    });
    setUser(authUser);
    setEmailVerificationPending(!authUser.isDemo && authUser.emailVerified === false);
    warmupPayHubAuthToken();
    setSessionRestoring(false);
    clearOAuthPending();
    clearReferralGuestLanding();
    sanitizeSecurityPrefs(authUser.uid);

    await establishSession(authUser.uid, remember);

    const quickPhase = resolvePostAuthPhase(authUser, null, {
      authMethod,
      skipSetup: options?.skipSetup,
    });

    if (quickPhase === "register") {
      persistPendingAuthPhase("register");
      hideInstantAuthGate();
      setAuthGateActive(false);
      setPhaseState("register");
    } else {
      // Wait for Firestore profile before mounting main app, avoids blank shell / error boundary.
      setSessionRestoring(true);
    }

    if (options?.isNewRegister) {
      initializeNewUserSession(authUser.uid);
    }

    void (async () => {
      let profile: UserProfile | null = null;
      try {
        profile = await loadProfile(authUser.uid);
      } catch {
        /* profile load optional */
      }
      const fbUser = await waitForFirebaseUser().catch(() => null);
      const emailVerified = fbUser?.uid === authUser.uid
        ? fbUser.emailVerified
        : (typeof authUser.emailVerified === "boolean" ? authUser.emailVerified : true);
      const merged = profile ? toAuthUser(
        { uid: authUser.uid, email: authUser.email, displayName: authUser.displayName,
          phoneNumber: authUser.phone, photoURL: authUser.avatar, emailVerified },
        profile,
        authUser.isDemo,
      ) : { ...authUser, emailVerified };

      setUser(merged);
      setEmailVerificationPending(!merged.isDemo && Boolean(merged.email) && merged.emailVerified === false);

      const restored = await restoreConnectedWalletSession(authUser.uid, profile);
      if (restored) setConnectedWallet(restored);

      if (!needsAccountSetup(authUser.uid, profile, options)) {
        void autoActivateGarudaPrimeWallet(authUser.uid, { profileAddress: profile?.walletAddress });
      }

      try {
        await touchLastLogin(authUser.uid);
      } catch {
        /* optional */
      }
      void registerUserDeviceSession(
        authUser.uid,
        options?.authMethod ?? profile?.authMethod ?? profile?.provider ?? "session",
      );
      const nextPhase = resolvePostAuthPhase(merged, profile, {
        authMethod: options?.authMethod ?? profile?.authMethod ?? profile?.provider,
        skipSetup: options?.skipSetup,
      });

      setSessionRestoring(false);
      hideInstantAuthGate();
      setAuthGateActive(false);

      if (nextPhase === "register") {
        persistPendingAuthPhase("register");
        persistAccountPreview({
          uid: merged.uid,
          displayName: merged.displayName,
          email: merged.email,
          phone: merged.phone,
        });
        setPhaseState("register");
      } else {
        clearPendingAuthPhase();
        setPhaseState(resolvePhaseWithMfa(merged.uid, "app"));
      }
      clearOAuthPending();
      if (options?.isNewRegister && isReferralProgramAvailable()) {
        void applyPendingReferralCode();
      }
    })();
  }, [loadProfile, resolvePostAuthPhase, resolvePhaseWithMfa]);

  const finishKycPortAuth = useCallback(async (session: KycPortAuthSession) => {
    let uid = kycPortUidForUser(session.user.id);
    let kycUser = session.user;

    if (
      !session.isDemo
      && isFirebaseConfigured
      && firebaseAuth
      && isKycPortAuthApiConfigured()
    ) {
      const accessToken = session.accessToken ?? getKycPortAccessToken() ?? undefined;
      const pendingExchange = loadKycPortPendingExchange();
      const canExchange = Boolean(accessToken || pendingExchange?.code);

      if (canExchange) {
        try {
          const authResult = await exchangeKycPortAuthToken(
            accessToken
              ? { accessToken }
              : {
                code: pendingExchange!.code,
                codeVerifier: pendingExchange!.codeVerifier,
                redirectUri: pendingExchange!.redirectUri || getKycPortConfig().redirectUri,
                nonce: pendingExchange!.nonce,
              },
          );
          clearKycPortPendingExchange();
          clearKycPortOAuth();
          clearKycPortTokensAfterAuth();
          const cred = await signInWithCustomToken(firebaseAuth, authResult.customToken);
          uid = cred.user.uid;
          kycUser = {
            id: authResult.user.id || authResult.user.email,
            email: authResult.user.email,
            fullName: authResult.user.fullName,
            phone: authResult.user.phone,
            kycStatus: authResult.user.kycStatus,
            kycTier: authResult.user.kycTier,
            verifiedAt: authResult.user.verifiedAt ?? undefined,
          };
        } catch (exchangeErr) {
          const msg = exchangeErr instanceof Error ? exchangeErr.message : "";
          if (msg.includes("502") || msg.includes("504")) {
            throw Object.assign(
              new Error(
                typeof ID_AUTH_TOAST.kycportExchangeFailed === "string"
                  ? ID_AUTH_TOAST.kycportExchangeFailed
                  : "API KYC Port sedang gangguan. Status Verified belum bisa disinkronkan, coba lagi nanti.",
              ),
              { code: "kycport/exchange-failed" },
            );
          }
          throw exchangeErr;
        }
      }
    }

    await syncKycPortUserToApp(uid, kycUser, session.isDemo);
    await logLoginActivity(uid, "kycport", true);
    await finishAuth({
      uid,
      email: kycUser.email || null,
      displayName: kycUser.fullName,
      phone: kycUser.phone || null,
      isDemo: session.isDemo,
      emailVerified: true,
      kycStatus: kycUser.kycStatus,
    }, true, { authMethod: "kycport" });
  }, [finishAuth]);

  const restoreSession = useCallback(async () => {
    if (restoreInFlightRef.current) return;
    restoreInFlightRef.current = true;

    try {
    if (isReferralEntryActive()) {
      setSessionRestoring(false);
      return;
    }

    let check = validateSession();
    if (!check.valid && check.reason === "fingerprint_mismatch") {
      const uid = check.uid ?? getSessionUidSync();
      const strict = uid ? loadSecurityPrefs(uid).strictDeviceLock : true;
      if (strict) {
        destroySession();
        clearMfaSession();
        setSessionRestoring(false);
        setUser(null);
        setUserProfile(null);
        setPhaseState(onboardingDone ? "auth" : "onboarding");
        return;
      }
      rebindDeviceFingerprint();
      check = validateSession();
    }

    let uid = check.uid ?? getSessionUidSync() ?? localStorage.getItem(PLAIN_UID_KEY);
    if (!uid) {
      uid = await Promise.race([
        getSessionUidAsync(),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 800)),
      ]);
    }
    if (!uid) {
      setSessionRestoring(false);
      setPhaseState(onboardingDone ? "auth" : "onboarding");
      return;
    }

    const preview = readAccountPreview(uid);
    setUser((prev) => prev ?? {
      uid,
      email: preview?.email ?? null,
      displayName: preview?.displayName ?? null,
      phone: preview?.phone ?? null,
      isDemo: false,
      emailVerified: true,
    });
    setSessionRestoring(false);

    const pending = readPendingAuthPhase();
    if (pending === "register") {
      setPhaseState("register");
    } else {
      clearPendingAuthPhase();
      setPhaseState(resolvePhaseWithMfa(uid, "app"));
      setAuthGateActive(false);
      hideInstantAuthGate();
    }

    try {
      const [profile] = await Promise.all([
        loadProfile(uid),
        waitForFirebaseUser().then(() => refreshSessionToken()),
      ]);
      rebindDeviceFingerprint();
      const fbUser = firebaseAuth?.currentUser ?? null;

      const resolvedUser = fbUser?.uid === uid
        ? toAuthUser(fbUser, profile, false)
        : profile
          ? profileToAuthUser(profile, uid)
          : null;

      if (resolvedUser) {
        setUser(resolvedUser);
        setEmailVerificationPending(
          !resolvedUser.isDemo
          && Boolean(resolvedUser.email)
          && resolvedUser.emailVerified === false,
        );
        persistAccountPreview({
          uid: resolvedUser.uid,
          displayName: resolvedUser.displayName,
          email: resolvedUser.email,
          phone: resolvedUser.phone,
        });
      }

      const restored = await restoreConnectedWalletSession(uid, profile);
      if (restored) {
        setConnectedWallet(restored);
        if (restored.provider === PHRASE_WALLET_PROVIDER) {
          await restorePhraseWalletSigner();
        }
      }

      const nextPhase = resolveSessionPhase(uid, profile, resolvedUser);
      if (nextPhase === "app") {
        const phraseAddr = await restorePhraseWalletSigner();
        if (!phraseAddr && restored?.provider !== PHRASE_WALLET_PROVIDER) {
          void autoActivateGarudaPrimeWallet(uid, { profileAddress: profile?.walletAddress });
        }
      }
      sanitizeSecurityPrefs(uid);
      if (nextPhase === "register") {
        persistPendingAuthPhase("register");
        setPhaseState("register");
      } else {
        clearPendingAuthPhase();
        setPhaseState(resolvePhaseWithMfa(uid, nextPhase));
      }
      setAuthGateActive(false);
      hideInstantAuthGate();
      void registerUserDeviceSession(uid, profile?.loginProvider ?? profile?.authMethod ?? "session");
    } catch {
      /* keep optimistic session, background sync optional */
    }
    } finally {
      restoreInFlightRef.current = false;
    }
  }, [loadProfile, onboardingDone, resolvePhaseWithMfa]);

  useEffect(() => {
    if (phase !== "app" || !user?.uid || user.isDemo) return;
    void registerUserDeviceSession(user.uid, userProfile?.loginProvider ?? userProfile?.authMethod ?? "session");
  }, [phase, user?.uid, user?.isDemo, userProfile?.loginProvider, userProfile?.authMethod]);

  /** Warm Garuda native signer in background, hanya jika dompet utama bertipe Garuda Prime. */
  useEffect(() => {
    if (phase !== "app" || !user?.uid || user.isDemo) return;
    warmupPayHubAuthToken();
    if (needsAccountSetup(user.uid, userProfile)) return;
    if (primaryWalletSwitchRef.current || pendingPrimaryWalletRef.current) return;

    const primaryAddr = resolvePrimaryWalletAddress(userProfile?.walletAddress);
    if (!primaryAddr) return;

    void getConnectedWalletDocs(user.uid).then((docs) => {
      if (primaryWalletSwitchRef.current) return;
      const match = dedupeConnectedWalletDocs(docs).find(
        (row) => row.walletAddress.toLowerCase() === primaryAddr,
      );
      const provider = match
        ? resolveFirestoreWalletProvider(match)
        : resolveAddressLockedProvider(primaryAddr);
      if (provider !== "embedded:garuda") {
        if (provider === PHRASE_WALLET_PROVIDER) {
          void restorePhraseWalletSigner();
        }
        return;
      }
      void autoActivateGarudaPrimeWallet(user.uid, { profileAddress: primaryAddr });
    }).catch(() => undefined);
  }, [phase, user?.uid, user?.isDemo, userProfile?.walletAddress]);

  useEffect(() => {
    if (phase === "register" || phase === "verify") return;
    if (primaryWalletSwitchRef.current) return;

    const uid = user?.uid;
    const profileAddr = userProfile?.walletAddress?.trim();
    if (!uid || !profileAddr) return;

    const primary = resolvePrimaryWalletAddress(profileAddr);
    if (!primary) return;

    let cancelled = false;
    void (async () => {
      try {
        const docs = dedupeConnectedWalletDocs(await getConnectedWalletDocs(uid).catch(() => []));
        if (cancelled || primaryWalletSwitchRef.current) return;
        syncWalletProviderLocksFromFirestore(docs);
        const match = docs.find((d) => d.walletAddress.toLowerCase() === primary);
        const sessionAddress = match?.walletAddress ?? profileAddr;
        const provider = match
          ? resolveFirestoreWalletProvider(match)
          : "walletconnect";
        const wallet = storeConnectedWalletSession({
          address: sessionAddress,
          provider,
          network: match?.network ?? "SDA Sidra Network",
        });
        if (match) {
          savePrimaryWalletLock(primaryWalletLockForRow(match, provider));
        }
        setConnectedWallet((prev) => {
          if (
            prev?.address?.toLowerCase() === primary
            && prev?.provider === wallet.provider
            && prev?.network === wallet.network
          ) {
            return prev;
          }
          return wallet;
        });
      } catch (err) {
        console.warn("[AuthContext] wallet session sync failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, user?.uid, userProfile?.walletAddress]);

  useEffect(() => {
    sanitizeBootAuthState();
    clearAppEntryFromUrl();
    clearBootBlockers();
    if (hasSession() && validateSession().valid && isOAuthPending()) {
      clearOAuthPending();
    }
    if (isKycPortConnectionPending()) {
      setKycportConnectionPending(true);
    }
    const check = validateSession();
    if (check.valid && phase === "auth") {
      void restoreSession();
    }
  }, []);

  useEffect(() => {
    if (phase !== "register" && phase !== "verify") return;
    const check = validateSession();
    if (check.valid) return;
    clearPendingAuthPhase();
    clearOAuthPending();
    setSessionRestoring(false);
    setLoading(false);
    setUser(null);
    setUserProfile(null);
    setPhaseState(onboardingDone ? "auth" : "onboarding");
  }, [phase, onboardingDone]);

  useEffect(() => {
    if (isKycPortCallbackPath()) return;
    if (isOAuthPending()) return;
    if (isReferralEntryActive()) return;
    const check = validateSession();
    if (!check.valid && !hasSession()) return;
    void restoreSession();
  }, [restoreSession]);

  /** Stale SESSION_KEY without valid session left users on blank "app" shell */
  useEffect(() => {
    if (phase !== "app" || user?.uid || sessionRestoring) return;
    const timer = window.setTimeout(() => {
      const check = validateSession();
      if (!check.valid) {
        if (hasSession()) destroySession();
        setUser(null);
        setUserProfile(null);
        setPhaseState(onboardingDone ? "auth" : "onboarding");
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [phase, user?.uid, sessionRestoring, onboardingDone]);

  useEffect(() => {
    if (!isReferralEntryActive()) return;
    setPhaseState("auth");
    setConnectedWallet(null);
    setUser(null);
    setUserProfile(null);
    setSessionRestoring(false);
    void (async () => {
      await disconnectWalletConnect();
      try {
        await signOutFirebase();
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    if (!isReferralEntryActive()) return;
    if (phase === "register" || phase === "verify" || phase === "app") {
      setPhaseState("auth");
      setSessionRestoring(false);
    }
  }, [phase]);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let cancelled = false;

    if (isReferralEntryActive()) {
      clearOAuthPending();
      hideInstantAuthGate();
      setAuthGateActive(false);
      setLoading(false);
      setPhaseState("auth");
      return;
    }

    clearStaleOAuthPending();

    const oauthBoot = isOAuthPending();
    if (oauthBoot) {
      hideInstantAuthGate();
      setAuthGateActive(false);
      setPhaseState("auth");
      setLoading(true);
    }

    completeOAuthRedirect()
      .then(async (result) => {
        if (cancelled) return;
        if (!result) {
          const fbUser = await waitForFirebaseUser();
          if (cancelled) return;
          if (fbUser && isOAuthPending()) {
            const profile = await getUserProfile(fbUser.uid);
            const providerId = fbUser.providerData[0]?.providerId ?? "";
            const authMethod = providerId.includes("apple") ? "apple" : "google";
            await finishAuth(toAuthUser(fbUser, profile, false), true, { authMethod });
            return;
          }
          if (isOAuthPending()) {
            clearOAuthPending();
            hideInstantAuthGate();
            setAuthGateActive(false);
            setPhaseState("auth");
          }
          return;
        }
        const providerId = "providerData" in result.user
          ? result.user.providerData[0]?.providerId ?? ""
          : "";
        const authMethod = providerId.includes("apple") ? "apple" : "google";
        const authUser = toAuthUser(result.user, null, result.isDemo);
        persistAccountPreview({
          uid: authUser.uid,
          displayName: authUser.displayName,
          email: authUser.email,
          phone: authUser.phone,
        });
        setUser(authUser);
        setSessionRestoring(false);
        setPhaseState("register");
        await finishAuth(authUser, true, { authMethod });
      })
      .catch((err) => {
        if (cancelled) return;
        clearOAuthPending();
        hideInstantAuthGate();
        setAuthGateActive(false);
        setPhaseState((current) => (current === "register" ? "auth" : current));
        showAppToast(
          resolveFirebaseAuthToast(err, ID_AUTH_TOAST),
          "error",
        );
      })
      .finally(() => {
        if (!cancelled && oauthBoot) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [finishAuth]);

  useEffect(() => {
    if (!isKycPortResumePath()) return;
    cleanKycPortOAuthPath();
    let cancelled = false;
    resumeKycPortOAuth("login")
      .then(async (session) => {
        if (cancelled || !session) return;
        await finishKycPortAuth(session);
        setKycportConnectionPending(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Autentikasi KYCPORT gagal";
        showAppToast(message, "error");
      });
    return () => { cancelled = true; };
  }, [finishKycPortAuth]);

  /** Auto-finish KYC Port when token/code already available (no resume banner on login). */
  const autoFinalizeKycPortLogin = useCallback(async () => {
    try {
      const session = await tryFinalizeKycPortOAuth("login");
      if (!session) return;
      await finishKycPortAuth(session);
      setKycportConnectionPending(false);
      setKycPortAwaiting(false);
    } catch {
      /* user can tap KYC Port Sidra to resume popup OAuth */
    }
  }, [finishKycPortAuth]);

  useEffect(() => {
    if (phase !== "auth" && !kycportConnectionPending) return;
    void autoFinalizeKycPortLogin();
  }, [phase, kycportConnectionPending, autoFinalizeKycPortLogin]);

  useEffect(() => {
    if (phase !== "auth" && !kycportConnectionPending) return;
    const onFocus = () => { void autoFinalizeKycPortLogin(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [phase, kycportConnectionPending, autoFinalizeKycPortLogin]);

  const processKycPortOAuthCallback = useCallback(async (): Promise<"app" | "register" | "auth"> => {
    setLoading(true);
    setKycportConnectionPending(true);
    setKycPortAwaiting(true);
    hideInstantAuthGate();
    document.documentElement.classList.remove("gp-oauth-pending");
    document.getElementById("gp-oauth-boot-overlay")?.setAttribute("hidden", "");

    try {
      const result = await Promise.race([
        completeKycPortOAuthFromUrl(),
        new Promise<null>((_, reject) => {
          window.setTimeout(
            () => reject(Object.assign(new Error("KYC Port timeout"), { code: "kycport/timeout" })),
            45_000,
          );
        }),
      ]);

      if (!result) {
        throw Object.assign(
          new Error("Callback KYC Port tidak lengkap. Mulai lagi dari Garuda Prime."),
          { code: "kycport/incomplete" },
        );
      }

      if (result.returnMode === "verify") {
        const uid = user?.uid ?? kycPortUidForUser(result.session.user.id);
        await syncKycPortUserToApp(uid, result.session.user, result.session.isDemo);
        const profile = await loadProfile(uid);
        clearKycPortVerifySessionId();
        if (profile) {
          setUser((prev) => prev ? {
            ...prev,
            uid,
            kycStatus: profile.kycStatus,
            displayName: profile.fullName ?? prev.displayName,
            email: profile.email ?? prev.email,
            phone: profile.phone ?? prev.phone,
          } : prev);
        }
        notifyKycProfileSync({ uid });
        const nextPhase = user && !needsAccountSetup(uid, profile, { authMethod: "kycport" })
          ? "app"
          : "register";
        setPhase(nextPhase);
        setKycportConnectionPending(false);
        setKycPortAwaiting(false);
        return nextPhase;
      }

      await finishKycPortAuth(result.session);
      setKycportConnectionPending(false);
      setKycPortAwaiting(false);
      return "app";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Autentikasi KYCPORT gagal";
      const code = err && typeof err === "object" && "code" in err
        ? String((err as { code: string }).code)
        : "";
      setKycportConnectionPending(
        code === "kycport/pending"
        || code === "kycport/exchange-pending"
        || code === "kycport/invalid-state"
        || code === "kycport/incomplete"
        || code === "kycport/timeout"
        || Boolean(loadKycPortPendingExchange()),
      );
      setKycPortAwaiting(true);
      showAppToast(
        code === "kycport/invalid-state" || code === "kycport/incomplete" || code === "kycport/timeout"
          ? message
          : resolveFirebaseAuthToast(err, ID_AUTH_TOAST),
        code === "kycport/exchange-pending" ? "info" : "error",
      );
      setPhase(user ? "app" : "auth");
      throw err;
    } finally {
      setLoading(false);
      cleanKycPortOAuthPath();
    }
  }, [finishKycPortAuth, loadProfile, user, setPhase]);

  useEffect(() => {
    let cancelled = false;
    refreshKycPortFromStoredToken()
      .then(async (session) => {
        if (cancelled || !session || session.isDemo) return;
        const uid = kycPortUidForUser(session.user.id);
        const currentUid = user?.uid ?? await getSessionUidAsync();
        if (!currentUid || currentUid !== uid) return;
        await syncKycPortUserToApp(uid, session.user, false);
        const profile = await loadProfile(uid);
        if (profile && user) {
          setUser((prev) => prev ? {
            ...prev,
            kycStatus: profile.kycStatus,
            displayName: profile.fullName ?? prev.displayName,
          } : prev);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [user?.uid, loadProfile, user]);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return subscribeAuth(async (fbUser) => {
      if (isReferralEntryActive()) return;
      if (!fbUser || !hasSession()) return;
      const profile = await getUserProfile(fbUser.uid);
      const authUser = toAuthUser(fbUser, profile, false);
      setUserProfile(profile);
      setUser(authUser);
      setEmailVerificationPending(!fbUser.emailVerified && !!fbUser.email);
      setPhaseState((current) => {
        if (current !== "app") return current;
        const next = resolveSessionPhase(fbUser.uid, profile, authUser);
        if (next === "register" || next === "verify") {
          persistPendingAuthPhase(next);
          persistAccountPreview({
            uid: authUser.uid,
            displayName: authUser.displayName,
            email: authUser.email,
            phone: authUser.phone,
          });
          return next;
        }
        return current;
      });
    });
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid || user.isDemo) return;
    let prevStatus = userProfile?.kycStatus;
    return subscribeUserProfile(user.uid, (profile) => {
      if (!profile) return;
      const pendingPrimary = pendingPrimaryWalletRef.current;
      const incomingPrimary = profile.walletAddress?.trim().toLowerCase() ?? "";
      const lockPrimary = loadPrimaryWalletLock()?.address?.trim().toLowerCase() ?? "";
      const switching = Boolean(primaryWalletSwitchRef.current || pendingPrimary);

      const preserveWalletAddress = Boolean(
        switching
        && incomingPrimary
        && (pendingPrimary ?? lockPrimary)
        && incomingPrimary !== (pendingPrimary ?? lockPrimary),
      );

      const resolvedWalletAddress = preserveWalletAddress
        ? (pendingPrimary ?? loadPrimaryWalletLock()?.address ?? profile.walletAddress)
        : profile.walletAddress;

      if (
        !switching
        && incomingPrimary
        && lockPrimary
        && incomingPrimary !== lockPrimary
      ) {
        void getConnectedWalletDocs(user.uid).then((docs) => {
          const match = dedupeConnectedWalletDocs(docs).find(
            (row) => row.walletAddress.toLowerCase() === incomingPrimary,
          );
          if (match) {
            savePrimaryWalletLock(primaryWalletLockForRow(
              match,
              resolveFirestoreWalletProvider(match),
            ));
          }
        }).catch(() => undefined);
      }

      setUserProfile((prev) => {
        if (preserveWalletAddress && resolvedWalletAddress) {
          return { ...profile, walletAddress: resolvedWalletAddress };
        }
        if (pendingPrimary && incomingPrimary === pendingPrimary) {
          pendingPrimaryWalletRef.current = null;
        }
        return profile;
      });
      setUser((prev) => prev ? {
        ...prev,
        kycStatus: profile.kycStatus,
        displayName: pickText(profile.fullName, prev.displayName),
        email: pickText(profile.email, prev.email),
        phone: pickText(profile.phone, prev.phone),
        walletAddress: preserveWalletAddress
          ? (resolvedWalletAddress ?? prev.walletAddress ?? profile.walletAddress)
          : (profile.walletAddress ?? prev.walletAddress),
      } : prev);
      if (prevStatus === "pending" && profile.kycStatus === "verified") {
        const verifiedMsg = ID_AUTH_TOAST.kycVerified;
        showAppToast(
          typeof verifiedMsg === "string" ? verifiedMsg : "KYC terverifikasi",
          "success",
        );
        notifyKycProfileSync({ uid: user.uid });
      }
      prevStatus = profile.kycStatus;
    });
  }, [user?.uid, user?.isDemo, userProfile?.kycStatus]);

  const completeSplash = useCallback(() => {
    const referralPhase = resolveReferralGuestPhase();
    if (referralPhase) {
      setPhaseState(referralPhase);
      return;
    }

    const session = validateSession();
    if (session.valid) {
      const cached = buildCachedAuthUser();
      if (cached) {
        setUser((prev) => prev ?? cached);
      }
      setPhaseState("app");
      void restoreSession();
      return;
    }
    if (hasSession()) destroySession();
    setPhaseState(onboardingDone ? "auth" : "onboarding");
  }, [onboardingDone, restoreSession]);

  /** Legacy splash hook, app boots directly to onboarding/auth/app; keep for safety. */
  useEffect(() => {
    if (phase !== "splash") return;
    const timer = window.setTimeout(completeSplash, 400);
    return () => window.clearTimeout(timer);
  }, [phase, completeSplash]);

  useEffect(() => {
    if (!sessionRestoring) return;
    const timer = window.setTimeout(() => setSessionRestoring(false), 2_000);
    return () => window.clearTimeout(timer);
  }, [sessionRestoring]);

  const completeOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, "1");
    clearAppEntryFromUrl();
    setPhaseState("auth");
  }, []);

  const signIn = useCallback(async (email: string, password: string, remember = true) => {
    setLoading(true);
    try {
      const { user: u, isDemo } = await signInEmail(email, password);
      await finishAuth(toAuthUser(u, null, isDemo), remember, { authMethod: "email" });
    } finally {
      setLoading(false);
    }
  }, [finishAuth]);

  const resetPassword = useCallback(async (email: string) => {
    setLoading(true);
    try {
      await resetPasswordEmail(email);
    } finally {
      setLoading(false);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (googleSignInPending.current) return;
    googleSignInPending.current = true;
    setLoading(true);
    try {
      const result = await signInGoogle();
      if (!result) {
        persistPendingAuthPhase("register");
        setPhaseState("register");
        return;
      }
      await finishAuth(toAuthUser(result.user, null, result.isDemo), true, { authMethod: "google" });
    } catch (e) {
      hideInstantAuthGate();
      clearOAuthPending();
      setAuthGateActive(false);
      throw e;
    } finally {
      googleSignInPending.current = false;
      setLoading(false);
    }
  }, [finishAuth]);

  const signInWithApple = useCallback(async () => {
    setLoading(true);
    try {
      const result = await signInApple();
      if (!result) {
        persistPendingAuthPhase("register");
        setPhaseState("register");
        return;
      }
      await finishAuth(toAuthUser(result.user, null, result.isDemo), true, { authMethod: "apple" });
    } catch (e) {
      hideInstantAuthGate();
      clearOAuthPending();
      setAuthGateActive(false);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [finishAuth]);

  const resendVerificationEmail = useCallback(async () => {
    setLoading(true);
    try {
      await resendEmailVerification();
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshEmailVerification = useCallback(async () => {
    const fbUser = await reloadCurrentUser();
    if (!fbUser) return false;
    const verified = fbUser.emailVerified;
    setUser((prev) => prev ? { ...prev, emailVerified: verified } : prev);
    setEmailVerificationPending(!verified && !!fbUser.email);
    return verified;
  }, []);

  const signInWithWallet = useCallback(async (provider: WalletProvider) => {
    setLoading(true);
    setWalletAuthStep("connecting");
    try {
      const wallet = await connectWallet(provider, { skipNetworkSwitch: true });
      setConnectedWallet(wallet);
      setWalletAuthStep("signing");
      const { message, serverNonce } = await createWalletAuthMessage(wallet.address);
      const signature = await signMessage(wallet.address, message, provider);
      setWalletAuthStep("verifying");
      const valid = await verifyWalletSignature(wallet.address, message, signature);
      if (!valid) {
        throw Object.assign(new Error("Invalid wallet signature"), { code: "wallet/invalid-signature" });
      }
      setWalletAuthStep("linking");

      let uid = `wallet_${wallet.address.slice(2, 10).toLowerCase()}`;
      if (serverNonce && isFirebaseConfigured && firebaseAuth && isWalletAuthApiConfigured()) {
        try {
          const customToken = await exchangeWalletAuthToken({
            address: wallet.address,
            message,
            signature,
            provider,
          });
          const cred = await signInWithCustomToken(firebaseAuth, customToken);
          uid = cred.user.uid;
        } catch (apiErr) {
          console.warn("[signInWithWallet] custom token exchange failed, using wallet uid", apiErr);
        }
      }

      const { profile: savedProfile } = await upsertOAuthProfile(uid, {
        fullName: formatAddress(wallet.address),
        email: "",
        phone: "",
        provider: "wallet",
        authMethod: "wallet",
        loginProvider: provider,
      });
      try {
        await saveConnectedWallet(uid, {
          address: wallet.address,
          provider,
          network: wallet.network,
        });
        await saveWalletRecord(uid, {
          address: wallet.address,
          provider,
          network: wallet.network,
        });
      } catch (syncErr) {
        console.warn("[signInWithWallet] wallet record sync failed", syncErr);
      }
      try {
        await logLoginActivity(uid, provider, true);
      } catch {
        /* optional */
      }
      setWalletAuthStep("success");
      const walletLabel = formatAddress(wallet.address);
      if (savedProfile?.email?.includes("@") && savedProfile?.walletAddress?.trim().startsWith("0x")) {
        markAccountSetupDone(uid);
      }
      await finishAuth({
        uid,
        email: savedProfile?.email || null,
        displayName: savedProfile?.fullName || walletLabel,
        phone: savedProfile?.phone || null,
        isDemo: false,
        walletAddress: wallet.address,
        kycStatus: savedProfile?.kycStatus,
      }, true, { authMethod: provider });
    } catch (e) {
      setWalletAuthStep("idle");
      throw e;
    } finally {
      setLoading(false);
      setTimeout(() => setWalletAuthStep("idle"), 1200);
    }
  }, [finishAuth]);

  const signInWithGarudaRecovery = useCallback(async (phrase: string, pin: string) => {
    if (pin.length < 4) {
      throw Object.assign(new Error("PIN must be at least 4 digits"), { code: "auth/pin-too-short" });
    }
    setLoading(true);
    setWalletAuthStep("signing");
    try {
      const normalized = normalizeRecoveryPhrase(phrase);
      if (!isValidGarudaRecoveryPhrase(normalized)) {
        throw Object.assign(new Error("Invalid recovery phrase"), { code: "wallet/invalid-phrase" });
      }

      try {
        await signOutFirebase();
      } catch {
        /* clear stale email/oauth session before wallet login */
      }

      const candidates = listPhraseSigningAccounts(normalized);
      let signed: {
        candidate: PhraseSigningAccount;
        message: string;
        serverNonce: boolean;
        signature: string;
      } | null = null;

      for (const candidate of candidates) {
        const { message, serverNonce } = await createWalletAuthMessage(candidate.checksum);
        const signature = await candidate.account.signMessage({ message });
        const valid = await verifyWalletSignature(candidate.checksum, message, signature);
        if (valid) {
          signed = { candidate, message, serverNonce, signature };
          break;
        }
      }

      if (!signed) {
        throw Object.assign(new Error("Invalid wallet signature"), { code: "wallet/invalid-signature" });
      }

      const { candidate, message, serverNonce, signature } = signed;
      const checksum = candidate.checksum;
      const { privateKey } = resolveRecoveryPrivateKey(normalized, checksum);
      await persistAndRegisterPhraseWallet(checksum, privateKey);

      let uid = `wallet_${checksum.slice(2, 10).toLowerCase()}`;
      if (serverNonce && isFirebaseConfigured && firebaseAuth && isWalletAuthApiConfigured()) {
        try {
          const customToken = await exchangeWalletAuthToken({
            address: checksum,
            message,
            signature,
            provider: PHRASE_WALLET_PROVIDER,
          });
          const cred = await signInWithCustomToken(firebaseAuth, customToken);
          uid = cred.user.uid;
        } catch (apiErr) {
          console.warn("[signInWithGarudaRecovery] custom token exchange failed", apiErr);
          /* Continue with local wallet uid, login still works without Firebase token */
        }
      }

      await setAppPin(pin);
      grantGarudaSignWindow();

      const wallet = storeConnectedWalletSession({
        address: checksum,
        provider: PHRASE_WALLET_PROVIDER,
        network: "SDA Sidra Network",
      });
      setConnectedWallet(wallet);

      const { profile: savedProfile } = await upsertOAuthProfile(uid, {
        fullName: formatAddress(checksum),
        email: "",
        phone: "",
        provider: "wallet",
        authMethod: PHRASE_WALLET_PROVIDER,
        loginProvider: PHRASE_WALLET_PROVIDER,
      });
      try {
        await saveConnectedWallet(uid, {
          address: checksum,
          provider: PHRASE_WALLET_PROVIDER,
          network: "SDA Sidra Network",
        });
        await saveWalletRecord(uid, {
          address: checksum,
          provider: PHRASE_WALLET_PROVIDER,
          network: "SDA Sidra Network",
        });
        savePrimaryWalletLock(primaryWalletLockForRow(
          { id: "phrase_wallet", uid, walletAddress: checksum, walletType: PHRASE_WALLET_PROVIDER, network: "SDA Sidra Network" },
          PHRASE_WALLET_PROVIDER,
        ));
      } catch (syncErr) {
        console.warn("[signInWithGarudaRecovery] wallet sync failed", syncErr);
      }
      try {
        await logLoginActivity(uid, PHRASE_WALLET_PROVIDER, true);
      } catch {
        /* optional */
      }

      setWalletAuthStep("success");
      persistAccountPreview({
        uid,
        displayName: savedProfile?.fullName || formatAddress(checksum),
        email: savedProfile?.email || null,
        phone: savedProfile?.phone || null,
      });
      if (savedProfile?.email?.includes("@") && savedProfile?.walletAddress?.trim().startsWith("0x")) {
        markAccountSetupDone(uid);
      }
      await finishAuth({
        uid,
        email: savedProfile?.email || null,
        displayName: savedProfile?.fullName || formatAddress(checksum),
        phone: savedProfile?.phone || null,
        isDemo: false,
        walletAddress: checksum,
        kycStatus: savedProfile?.kycStatus,
      }, true, { authMethod: PHRASE_WALLET_PROVIDER });
    } catch (e) {
      setWalletAuthStep("idle");
      throw e;
    } finally {
      setLoading(false);
      setTimeout(() => setWalletAuthStep("idle"), 1200);
    }
  }, [finishAuth]);

  const signInWithKycPort = useCallback(async () => {
    setKycportLoading(true);
    setKycportConnectionPending(true);
    try {
      const health = await fetchKycPortReachability().catch(() => null);
      if (health?.apiDegraded) {
        showAppToast(
          typeof ID_AUTH_TOAST.kycportApiDegraded === "string"
            ? ID_AUTH_TOAST.kycportApiDegraded
            : "API KYC Port sedang gangguan (502). Login bisa dicoba, sinkron status mungkin gagal sementara.",
          "info",
        );
      }

      const session = await connectKycPort();
      await finishKycPortAuth(session);
      setKycportConnectionPending(false);
      setKycPortAwaiting(false);
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e
        ? String((e as { code: string }).code)
        : "";
      if (code === "kycport/redirecting") {
        return;
      }
      if (code === "kycport/pending" || code === "kycport/exchange-pending") {
        setKycportConnectionPending(true);
        setKycPortAwaiting(true);
        showAppToast(
          typeof ID_AUTH_TOAST.kycportLoginPending === "string"
            ? ID_AUTH_TOAST.kycportLoginPending
            : "Selesaikan login di jendela KYC Port, lalu tap Connect KYCPort lagi.",
          "info",
        );
        return;
      }
      if (code === "kycport/unavailable" || code === "kycport/exchange-failed") {
        showAppToast(
          resolveFirebaseAuthToast(e, ID_AUTH_TOAST),
          "error",
        );
        return;
      }
      throw e;
    } finally {
      setKycportLoading(false);
    }
  }, [finishKycPortAuth]);

  const resumeKycPortConnection = useCallback(async () => {
    setLoading(true);
    try {
      const session = await resumeKycPortOAuth("login");
      if (!session) {
        setKycportConnectionPending(true);
        showAppToast(
          typeof ID_AUTH_TOAST.kycportLoginPending === "string"
            ? ID_AUTH_TOAST.kycportLoginPending
            : "Selesaikan izin di jendela KYC Port, lalu tap Lanjutkan lagi.",
          "info",
        );
        return;
      }
      await finishKycPortAuth(session);
      setKycportConnectionPending(false);
      setKycPortAwaiting(false);
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e
        ? String((e as { code: string }).code)
        : "";
      if (code !== "kycport/pending") {
        showAppToast(
          e instanceof Error ? e.message : "Gagal menyambungkan KYC Port",
          "error",
        );
      }
      setKycportConnectionPending(true);
    } finally {
      setLoading(false);
    }
  }, [finishKycPortAuth]);

  const startKycPortVerificationFlow = useCallback(async () => {
    setLoading(true);
    try {
      const health = await fetchKycPortReachability().catch(() => null);
      if (health?.apiDegraded) {
        showAppToast(
          typeof ID_AUTH_TOAST.kycportApiDegraded === "string"
            ? ID_AUTH_TOAST.kycportApiDegraded
            : "Server KYC Port sedang gangguan (502). Data tetap tersimpan, sinkron dari Garuda Prime setelah mengisi.",
          "info",
        );
      }

      if (await resolveKycPortOAuthReady()) {
        const session = await startKycPortVerifyOAuth();
        if (!session) {
          throw Object.assign(
            new Error("Login KYCPORT belum selesai. Selesaikan di portal KYCPORT"),
            { code: "kycport/pending" },
          );
        }
        if (user) {
          await syncKycPortUserToApp(user.uid, session.user, session.isDemo);
          await loadProfile(user.uid);
          setUser((prev) => prev ? {
            ...prev,
            kycStatus: session.user.kycStatus,
            displayName: session.user.fullName || prev.displayName,
            email: session.user.email || prev.email,
            phone: session.user.phone || prev.phone,
          } : prev);
        }
        const verified = isKycPortAssuranceVerified(session.user.kycStatus);
        return {
          sessionId: session.referenceId,
          status: session.user.kycStatus,
          isDemo: session.isDemo,
          verified,
          verificationUrl: verified ? undefined : "https://www.kycport.com/verify",
        };
      }

      const result = await startKycPortVerification();
      const verified = isKycPortAssuranceVerified(result.status);
      return {
        sessionId: result.sessionId,
        status: result.status,
        isDemo: result.isDemo,
        verified,
        verificationUrl: result.verificationUrl,
      };
    } finally {
      setLoading(false);
    }
  }, [user, loadProfile]);

  const refreshKycPortStatus = useCallback(async (sessionId: string) => {
    const result = await refreshKycPortVerification(sessionId);
    const tier = mapKycStatusToTier(result.status, result.tier);
    const verified = isKycPortAssuranceVerified(result.status);
    if (user && verified) {
      const kycportId = userProfile?.kycportUserId
        ?? (user.uid.startsWith("kycport_") ? user.uid.slice("kycport_".length) : user.uid);
      await syncKycPortUserToApp(user.uid, {
        id: kycportId,
        email: user.email ?? "",
        fullName: user.displayName ?? "KYCPort User",
        phone: user.phone ?? "",
        kycStatus: result.status,
        kycTier: tier,
      }, user.isDemo);
      await loadProfile(user.uid);
    }
    return { status: result.status, tier, verified };
  }, [user, userProfile?.kycportUserId, loadProfile]);

  const refreshUserProfile = useCallback(async () => {
    if (!user?.uid || user.isDemo) return;
    try {
      const session = await refreshKycPortFromStoredToken();
      if (session) {
        await syncKycPortUserToApp(user.uid, session.user, session.isDemo);
      }
      await loadProfile(user.uid);
    } catch {
      /* keep cached profile */
    }
  }, [user?.uid, user?.isDemo, loadProfile]);

  const register = useCallback(async (data: RegisterData) => {
    setLoading(true);
    try {
      const { user: u, isDemo, emailVerificationSent } = await registerEmail(data.email, data.password, {
        fullName: data.fullName,
        phone: data.phone,
      });
      const authUser = toAuthUser(u, null, isDemo);
      initializeNewUserSession(u.uid);
      clearConnectedWalletSession();
      clearAllWalletProviderLocks();
      clearGarudaServerAddressCache();
      clearRegistrationWallet();
      await loadProfile(u.uid);
      const code = isReferralProgramAvailable()
        ? normalizeReferralCode(data.referral?.trim() || getPendingReferralCode() || "")
        : "";
      if (code) {
        const result = await bindReferralCodeClient(code);
        if (result.ok) clearPendingReferralCode();
      }
      setEmailVerificationPending(Boolean(emailVerificationSent) && !authUser.emailVerified);
      persistAccountPreview({
        uid: u.uid,
        displayName: pickText(data.fullName, authUser.displayName),
        email: pickText(data.email, authUser.email),
        phone: pickText(data.phone, authUser.phone),
      });
      await finishAuth(authUser, true, { authMethod: "email", isNewRegister: true });
    } finally {
      setLoading(false);
    }
  }, [finishAuth, loadProfile]);

  const linkWeb3Wallet = useCallback(async (
    provider: WalletProvider,
    options?: { makePrimary?: boolean; forceNewSession?: boolean },
  ) => {
    if (!user?.uid) {
      throw Object.assign(new Error("Not signed in"), { code: "auth/not-signed-in" });
    }
    setWalletAuthStep("connecting");
    try {
      const existing = dedupeConnectedWalletDocs(await getConnectedWalletDocs(user.uid));
      const makePrimary = options?.makePrimary ?? existing.length === 0;
      const forceNewSession = options?.forceNewSession ?? existing.length > 0;

      const wallet = await connectWallet(provider, {
        skipNetworkSwitch: true,
        forceNewWalletConnectSession: forceNewSession,
      });

      const normalizedAddr = normalizeWalletAddress(wallet.address).toLowerCase();
      if (existing.some((d) => d.walletAddress.toLowerCase() === normalizedAddr)) {
        throw Object.assign(
          new Error("Wallet already linked to this account"),
          { code: "wallet/already-linked" },
        );
      }

      setWalletAuthStep("signing");
      const { message } = await createWalletAuthMessage(wallet.address);
      const signature = await signMessage(wallet.address, message, provider);
      setWalletAuthStep("verifying");
      const valid = await verifyWalletSignature(wallet.address, message, signature);
      if (!valid) {
        throw Object.assign(new Error("Invalid wallet signature"), { code: "wallet/invalid-signature" });
      }

      setWalletAuthStep("linking");
      const persistedType = resolvePersistedWalletType(wallet.address, provider);
      await saveConnectedWallet(user.uid, {
        address: wallet.address,
        provider: persistedType,
        network: wallet.network,
      }, { makePrimary });

      const lockedProvider = resolveLockedWalletProvider({
        id: normalizedAddr,
        uid: user.uid,
        walletAddress: wallet.address,
        walletType: persistedType,
        network: wallet.network,
      });
      saveAddressProviderLock(wallet.address, lockedProvider, persistedType, {
        force: lockedProvider === "metamask" || lockedProvider === "trustwallet",
      });

      if (makePrimary) {
        const normalized = storeConnectedWalletSession({
          address: normalizeWalletAddress(wallet.address),
          provider: lockedProvider,
          network: wallet.network,
        });
        savePrimaryWalletLock(primaryWalletLockForRow(
          { id: normalizedAddr, uid: user.uid, walletAddress: wallet.address, walletType: persistedType, network: wallet.network },
          lockedProvider,
        ));
        setConnectedWallet(normalized);
      } else {
        const primary = resolvePrimaryWalletAddress(userProfile?.walletAddress, connectedWallet?.address);
        const match = existing.find((d) => d.walletAddress.toLowerCase() === primary?.toLowerCase());
        if (primary) {
          setConnectedWallet(storeConnectedWalletSession({
            address: match?.walletAddress ?? userProfile?.walletAddress ?? primary,
            provider: match ? resolveStoredWalletProvider(match) : (connectedWallet?.provider ?? "walletconnect"),
            network: match?.network ?? connectedWallet?.network,
          }));
        }
      }

      await loadProfile(user.uid);
      setWalletAuthStep("success");
      return wallet;
    } finally {
      setWalletAuthStep("idle");
    }
  }, [user, userProfile?.walletAddress, connectedWallet, loadProfile]);

  const connectWeb3Wallet = useCallback(async (provider: WalletProvider) => {
    return linkWeb3Wallet(provider, { makePrimary: true });
  }, [linkWeb3Wallet]);

  const linkEmbeddedGarudaWallet = useCallback(async (options?: { otpSession?: string }) => {
    if (!user?.uid) {
      throw Object.assign(new Error("Not signed in"), { code: "auth/not-signed-in" });
    }
    primaryWalletSwitchRef.current = true;
    setWalletAuthStep("connecting");
    try {
      const result = await connectEmbeddedWallet(user.uid, { otpSession: options?.otpSession });
      const checksum = normalizeWalletAddress(result.address);
      if (!checksum) {
        throw Object.assign(new Error("Garuda wallet address tidak valid"), {
          code: "embedded/invalid-address",
        });
      }
      cacheGarudaServerAddress(checksum);
      setWalletAuthStep("linking");
      const wallet = storeConnectedWalletSession({
        address: checksum,
        provider: "embedded:garuda",
        network: "SDA Sidra Network",
      });
      setConnectedWallet(wallet);
      setUserProfile((prev) => (prev ? { ...prev, walletAddress: checksum } : prev));
      setUser((prev) => (prev ? { ...prev, walletAddress: checksum } : prev));
      try {
        await saveWalletRecord(user.uid, {
          address: checksum,
          provider: "embedded:garuda",
          network: "SDA Sidra Network",
        });
      } catch (err) {
        console.warn("[linkEmbeddedGarudaWallet] wallet record sync failed", err);
      }
      void autoActivateGarudaPrimeWallet(user.uid, { profileAddress: checksum, includePayHub: false }).catch(() => null);
      try {
        await loadProfile(user.uid);
      } catch (err) {
        console.warn("[linkEmbeddedGarudaWallet] profile reload failed", err);
      }
      if (firebaseAuth?.currentUser) {
        const idToken = await firebaseAuth.currentUser.getIdToken();
        await bindEmbeddedWalletOnServer(checksum, idToken).catch(() => null);
      }
      savePrimaryWalletLock(primaryWalletLockForRow(
        { id: "embedded_garuda", uid: user.uid, walletAddress: checksum, walletType: "embedded:garuda", network: "SDA Sidra Network" },
        "embedded:garuda",
      ));
      setWalletAuthStep("success");
      return wallet;
    } catch (err) {
      throw err;
    } finally {
      await new Promise<void>((resolve) => {
        queueMicrotask(() => {
          window.setTimeout(() => {
            primaryWalletSwitchRef.current = false;
            resolve();
          }, 2500);
        });
      });
      setWalletAuthStep("idle");
    }
  }, [user, loadProfile]);

  const linkGarudaPhraseWallet = useCallback(async (phrase: string) => {
    if (!user?.uid) {
      throw Object.assign(new Error("Not signed in"), { code: "auth/not-signed-in" });
    }
    const normalized = normalizeRecoveryPhrase(phrase);
    if (!isValidGarudaRecoveryPhrase(normalized)) {
      throw Object.assign(new Error("Invalid recovery phrase"), { code: "wallet/invalid-phrase" });
    }
    const { privateKey } = resolveRecoveryPrivateKey(normalized);
    const account = privateKeyToAccount(privateKey);
    const checksum = normalizeWalletAddress(account.address);
    if (!checksum) {
      throw Object.assign(new Error("Garuda wallet address tidak valid"), {
        code: "embedded/invalid-address",
      });
    }

    primaryWalletSwitchRef.current = true;
    setWalletAuthStep("linking");
    try {
      grantGarudaSignWindow();
      cacheGarudaServerAddress(checksum);
      const wallet = storeConnectedWalletSession({
        address: checksum,
        provider: "embedded:garuda",
        network: "SDA Sidra Network",
      });
      setConnectedWallet(wallet);
      setUserProfile((prev) => (prev ? { ...prev, walletAddress: checksum } : prev));
      setUser((prev) => (prev ? { ...prev, walletAddress: checksum } : prev));
      await saveConnectedWallet(user.uid, {
        address: checksum,
        provider: "embedded:garuda",
        network: "SDA Sidra Network",
      }, { makePrimary: true });
      await saveWalletRecord(user.uid, {
        address: checksum,
        provider: "embedded:garuda",
        network: "SDA Sidra Network",
      });
      await autoActivateGarudaPrimeWallet(user.uid, { profileAddress: checksum });
      await loadProfile(user.uid);
      if (firebaseAuth?.currentUser) {
        const idToken = await firebaseAuth.currentUser.getIdToken();
        await bindEmbeddedWalletOnServer(checksum, idToken).catch(() => null);
      }
      savePrimaryWalletLock(primaryWalletLockForRow(
        { id: "embedded_garuda", uid: user.uid, walletAddress: checksum, walletType: "embedded:garuda", network: "SDA Sidra Network" },
        "embedded:garuda",
      ));
      setWalletAuthStep("success");
      return wallet;
    } catch (err) {
      throw err;
    } finally {
      await new Promise<void>((resolve) => {
        queueMicrotask(() => {
          window.setTimeout(() => {
            primaryWalletSwitchRef.current = false;
            resolve();
          }, 2500);
        });
      });
      setWalletAuthStep("idle");
    }
  }, [user, loadProfile]);

  const persistPrimaryWalletBackground = useCallback((
    uid: string,
    checksum: string,
    normalized: string,
    activeRow: ConnectedWalletDoc,
    lockedProvider: WalletProvider,
    options?: { walletType?: string | null; network?: string | null; docId?: string | null },
  ) => {
    const firestoreDocId = options?.docId?.trim()
      && !["profile_wallet", "local_wallet"].includes(options.docId.trim())
      ? options.docId.trim()
      : undefined;

    void (async () => {
      try {
        let match: ConnectedWalletDoc | undefined;
        try {
          const docs = dedupeConnectedWalletDocs(
            await withFirestoreTimeout("getConnectedWalletDocs", getConnectedWalletDocs(uid)),
          );
          match = docs.find((d) => d.walletAddress.toLowerCase() === normalized);
        } catch (err) {
          console.warn("[AuthContext] primary wallet doc lookup", err);
        }

        if (!match) {
          const sessionMatches = connectedWallet?.address?.toLowerCase() === normalized;
          const storedType = options?.walletType?.trim()
            || (sessionMatches ? (connectedWallet?.provider ?? "walletconnect") : "walletconnect");
          const walletType = resolvePersistedWalletType(checksum, storedType);
          await withFirestoreTimeout(
            "saveConnectedWallet",
            saveConnectedWallet(
              uid,
              {
                address: checksum,
                provider: walletType,
                network: options?.network ?? connectedWallet?.network ?? "SDA Sidra Network",
              },
              { makePrimary: true },
            ),
          );
        } else {
          await setPrimaryWalletAddress(uid, activeRow.walletAddress, {
            docId: firestoreDocId ?? match.id,
          });
        }

        if (lockedProvider === "embedded:garuda" && isGarudaPrimePersistedWalletType(activeRow.walletType)) {
          try {
            const serverAddr = await ensureGarudaNativeSigningReady(uid, activeRow.walletAddress);
            if (serverAddr.toLowerCase() !== normalized) {
              await syncGarudaPrimeWalletIdentity(uid, serverAddr, activeRow.walletAddress, { makePrimary: false });
              const refreshed = dedupeConnectedWalletDocs(
                await withFirestoreTimeout("getConnectedWalletDocs", getConnectedWalletDocs(uid)),
              );
              const corrected = refreshed.find((d) => d.walletAddress.toLowerCase() === serverAddr.toLowerCase());
              if (corrected) {
                const correctedProvider = resolveFirestoreWalletProvider(corrected);
                saveAddressProviderLock(
                  corrected.walletAddress,
                  correctedProvider,
                  corrected.walletType?.trim() || correctedProvider,
                  { force: true },
                );
                savePrimaryWalletLock(primaryWalletLockForRow(corrected, correctedProvider));
                const correctedWallet = storeConnectedWalletSession({
                  address: corrected.walletAddress,
                  provider: correctedProvider,
                  network: corrected.network ?? options?.network ?? connectedWallet?.network,
                });
                if (primaryWalletSwitchRef.current && pendingPrimaryWalletRef.current === normalized) {
                  setUserProfile((prev) => (prev ? { ...prev, walletAddress: corrected.walletAddress } : prev));
                  setUser((prev) => (prev ? { ...prev, walletAddress: corrected.walletAddress } : prev));
                  setConnectedWallet(correctedWallet);
                  await setPrimaryWalletAddress(uid, corrected.walletAddress, { docId: corrected.id });
                }
              }
            }
          } catch {
            /* keep user-selected row */
          }
          if (isGarudaPrimePersistedWalletType(activeRow.walletType)) {
            await autoActivateGarudaPrimeWallet(uid, { profileAddress: activeRow.walletAddress, includePayHub: false });
          }
        } else {
          const profile = await loadProfile(uid).catch(() => null);
          const confirmed = profile?.walletAddress?.trim().toLowerCase() ?? "";
          if (confirmed !== normalized) {
            await setPrimaryWalletAddress(uid, activeRow.walletAddress, { docId: firestoreDocId ?? match?.id }).catch(() => undefined);
          }
        }
      } catch (err) {
        console.warn("[AuthContext] primary wallet background persist", err);
      }
    })();
  }, [connectedWallet, loadProfile]);

  const setPrimaryWeb3Wallet = useCallback(async (
    address: string,
    options?: { walletType?: string | null; network?: string | null; docId?: string | null },
  ) => {
    if (!user?.uid) {
      throw Object.assign(new Error("Not signed in"), { code: "auth/not-signed-in" });
    }
    const checksum = normalizeWalletAddress(address);
    if (!checksum) {
      throw Object.assign(new Error("Invalid wallet address"), { code: "embedded/invalid-address" });
    }
    const normalized = checksum.toLowerCase();
    const sessionMatches = connectedWallet?.address?.toLowerCase() === normalized;
    const storedType = options?.walletType?.trim()
      || (sessionMatches ? (connectedWallet?.provider ?? "walletconnect") : "walletconnect");
    const walletType = options?.walletType?.trim()
      || resolvePersistedWalletType(checksum, storedType);
    const activeRow: ConnectedWalletDoc = {
      id: options?.docId?.trim() || `switch_${normalized}`,
      uid: user.uid,
      walletAddress: checksum,
      walletType,
      network: options?.network ?? connectedWallet?.network ?? "SDA Sidra Network",
    };

    primaryWalletSwitchRef.current = true;
    pendingPrimaryWalletRef.current = normalized;

    try {
      const lockedProvider = resolveLockedWalletProvider(activeRow);
      const provider = lockedProvider;
      if (provider !== "embedded:garuda") {
        unlinkGarudaNativeAlias(activeRow.walletAddress);
      }
      saveAddressProviderLock(
        activeRow.walletAddress,
        provider,
        activeRow.walletType?.trim() || provider,
        { force: true },
      );

      const wallet = storeConnectedWalletSession({
        address: activeRow.walletAddress,
        provider,
        network: activeRow.network,
      });

      savePrimaryWalletLock(primaryWalletLockForRow(activeRow, provider));

      setUserProfile((prev) => (prev ? { ...prev, walletAddress: activeRow.walletAddress } : prev));
      setUser((prev) => (prev ? { ...prev, walletAddress: activeRow.walletAddress } : prev));
      setConnectedWallet(wallet);

      persistPrimaryWalletBackground(
        user.uid,
        checksum,
        normalized,
        activeRow,
        lockedProvider,
        options,
      );

      return wallet;
    } catch (err) {
      pendingPrimaryWalletRef.current = null;
      primaryWalletSwitchRef.current = false;
      throw err;
    } finally {
      window.setTimeout(() => {
        pendingPrimaryWalletRef.current = null;
        primaryWalletSwitchRef.current = false;
      }, 800);
    }
  }, [user, connectedWallet, persistPrimaryWalletBackground]);

  const disconnectWeb3Wallet = useCallback(async (address: string, docId?: string) => {
    if (!user?.uid) throw Object.assign(new Error("Not signed in"), { code: "auth/not-signed-in" });
    const uid = user.uid;
    const normalized = address.toLowerCase();
    const isPrimaryWallet = resolvePrimaryWalletAddress(userProfile?.walletAddress, connectedWallet?.address).toLowerCase() === normalized;
    const isActiveSession = connectedWallet?.address?.toLowerCase() === normalized;

    if (isPrimaryWallet) {
      clearAllWalletProviderLocks();
    } else {
      clearAddressProviderLock(address);
    }

    if (isActiveSession) {
      setConnectedWallet(null);
      secureRemove(WALLET_KEY);
      try {
        await disconnectWalletConnect();
      } catch {
        /* session may already be closed */
      }
    }

    const firestoreDocId = docId && docId !== "local_wallet" ? docId : undefined;
    try {
      if (firestoreDocId) {
        await deleteConnectedWalletDoc(uid, firestoreDocId);
      } else {
        const docs = await getConnectedWalletDocs(uid);
        const match = docs.find((d) => d.walletAddress.toLowerCase() === normalized);
        if (match) {
          await deleteConnectedWalletDoc(uid, match.id);
        } else if (userProfile?.walletAddress?.toLowerCase() === normalized) {
          await updateUserProfile(uid, { walletAddress: null });
        }
      }
    } catch {
      if (userProfile?.walletAddress?.toLowerCase() === normalized) {
        try {
          await updateUserProfile(uid, { walletAddress: null });
        } catch {
          /* optional profile sync */
        }
      }
    }

    try {
      await loadProfile(uid);
      if (isActiveSession) {
        const profile = await getUserProfile(uid);
        if (profile?.walletAddress) {
          const docs = await getConnectedWalletDocs(uid);
          const match = docs.find(
            (d) => d.walletAddress.toLowerCase() === profile.walletAddress!.toLowerCase(),
          );
          const provider = match ? resolveFirestoreWalletProvider(match) : "walletconnect";
          if (match) {
            savePrimaryWalletLock(primaryWalletLockForRow(match, provider));
          }
          setConnectedWallet(storeConnectedWalletSession({
            address: profile.walletAddress,
            provider,
            network: match?.network,
          }));
        }
      }
    } catch {
      /* keep cached profile */
    }
  }, [user, connectedWallet, userProfile?.walletAddress, loadProfile]);

  const completeRegistration = useCallback(async (data: RegistrationCompleteData) => {
    if (!user?.uid) {
      throw new Error("Sesi login tidak ditemukan, silakan masuk kembali.");
    }
    const uid = user.uid;
    setLoading(true);
    try {
      if (data.pin.length >= 4) {
        await setAppPin(data.pin);
      }

      if (!data.twoFactorEnabled) {
        setTwoFactorEnabledLocal(uid, false);
      }
      if (!data.biometricEnabled) {
        setBiometricEnabledLocal(uid, false);
      }

      const addr = data.walletAddress ?? connectedWallet?.address;
      if (addr) {
        try {
          await saveWalletRecord(uid, {
            address: addr,
            provider: connectedWallet?.provider ?? "walletconnect",
            network: "SDA Sidra Network",
          });
          await updateUserProfile(uid, {
            walletAddress: addr,
            ...(data.biometricEnabled && loadPasskeyCredential(uid)
              ? { biometricEnabled: true }
              : {}),
          });
        } catch (err) {
          console.warn("[completeRegistration] wallet/profile sync failed", err);
        }
      } else {
        try {
          await updateUserProfile(uid, {
            ...(data.biometricEnabled && loadPasskeyCredential(uid)
              ? { biometricEnabled: true }
              : {}),
          });
        } catch (err) {
          console.warn("[completeRegistration] profile sync failed", err);
        }
      }

      if (data.kycCompleted) {
        try {
          await saveKycVerification(uid, { status: "pending", tier: 1, provider: "KYCPORT" });
        } catch (err) {
          console.warn("[completeRegistration] KYC sync failed", err);
        }
      }

      await establishSession(uid);
      initializeNewUserSession(uid);
      markAccountSetupDone(uid);
      clearRegistrationStep();
      sanitizeSecurityPrefs(uid);
      try {
        await loadProfile(uid);
      } catch (err) {
        console.warn("[completeRegistration] profile reload failed", err);
      }
    } finally {
      setLoading(false);
    }
  }, [user, connectedWallet, loadProfile]);

  const enterApp = useCallback(() => {
    const uid = user?.uid;
    if (uid && isAccountSetupDoneOnDevice(uid)) {
      clearPendingAuthPhase();
      const next = resolvePhaseWithMfa(uid, "app");
      if (next === "mfa") {
        setPhaseState("mfa");
      } else {
        setPhase("app");
      }
      return;
    }
    if (
      uid
      && needsAccountSetup(uid, userProfile, {
        authMethod: userProfile?.authMethod ?? userProfile?.provider,
      })
    ) {
      setPhase("register");
      return;
    }
    const next = uid ? resolvePhaseWithMfa(uid, "app") : "app";
    if (next === "mfa") {
      setPhaseState("mfa");
    } else {
      setPhase("app");
    }
  }, [user, userProfile, setPhase, resolvePhaseWithMfa]);

  const signOut = useCallback(async () => {
    const uid = user?.uid;
    await signOutFirebase();
    clearWalletConnectedNotifSession(uid);
    destroySession();
    clearAllWalletProviderLocks();
    clearConnectedWalletSession();
    clearGarudaServerAddressCache();
    clearMfaSession();
    clearPendingAuthPhase();
    clearOAuthPending();
    setKycPortAwaiting(false);
    clearKycPortOAuth();
    setMfaUid(null);
    setUser(null);
    setUserProfile(null);
    setConnectedWallet(null);
    setWalletAuthStep("idle");
    setEmailVerificationPending(false);
    setKycportConnectionPending(false);
    hideInstantAuthGate();
    clearBootBlockers();
    setPhaseState("auth");
  }, [user?.uid]);

  const updateProfile = useCallback(async (patch: {
    fullName?: string;
    email?: string;
    phone?: string;
  }) => {
    const uid = user?.uid;
    if (!uid) throw Object.assign(new Error("Not signed in"), { code: "auth/not-signed-in" });

    const normalized = {
      ...(patch.fullName !== undefined ? { fullName: patch.fullName.trim() } : {}),
      ...(patch.email !== undefined ? { email: patch.email.trim() } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone.trim() } : {}),
    };
    if (!Object.keys(normalized).length) return;

    await updateUserProfile(uid, normalized);
    const profile = await loadProfile(uid);
    setUser((prev) => prev ? {
      ...prev,
      displayName: profile?.fullName ?? normalized.fullName ?? prev.displayName,
      email: profile?.email ?? normalized.email ?? prev.email,
      phone: profile?.phone ?? normalized.phone ?? prev.phone,
    } : prev);
  }, [user?.uid, loadProfile]);

  const emailResendAvailable = canResendEmailVerification();

  const value = useMemo(() => ({
    phase, setPhase, user, userProfile, loading, sessionRestoring, authGateActive, connectedWallet, walletAuthStep,
    isFirebaseReady: isFirebaseConfigured,
    onboardingDone, emailVerificationPending, canResendEmailVerification: emailResendAvailable,
    completeSplash, completeOnboarding,
    signIn, resetPassword, signInWithGoogle, signInWithApple,
    resendVerificationEmail, refreshEmailVerification,
    signInWithWallet, signInWithGarudaRecovery, signInWithKycPort, resumeKycPortConnection, kycportConnectionPending, kycportLoading,
    startKycPortVerificationFlow, refreshKycPortStatus, refreshUserProfile, processKycPortOAuthCallback,
    register, connectWeb3Wallet, linkWeb3Wallet, linkEmbeddedGarudaWallet, linkGarudaPhraseWallet, setPrimaryWeb3Wallet, disconnectWeb3Wallet, completeRegistration, enterApp, signOut, restoreSession, updateProfile,
    completeMfaLogin, mfaUid,
  }), [
    phase, user, userProfile, loading, sessionRestoring, authGateActive, connectedWallet, walletAuthStep, onboardingDone, emailVerificationPending, emailResendAvailable,
    completeSplash, completeOnboarding,
    signIn, resetPassword, signInWithGoogle, signInWithApple,
    resendVerificationEmail, refreshEmailVerification,
    signInWithWallet, signInWithGarudaRecovery, signInWithKycPort, resumeKycPortConnection, kycportConnectionPending, kycportLoading,
    startKycPortVerificationFlow, refreshKycPortStatus, refreshUserProfile, processKycPortOAuthCallback,
    register, connectWeb3Wallet, linkWeb3Wallet, linkEmbeddedGarudaWallet, linkGarudaPhraseWallet, setPrimaryWeb3Wallet, disconnectWeb3Wallet, completeRegistration, enterApp, signOut, restoreSession, updateProfile,
    completeMfaLogin, mfaUid,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
