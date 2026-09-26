import React, { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import {
  Shield, Fingerprint, ShieldCheck, Smartphone, ChevronRight,
  AlertTriangle, KeyRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SessionManager } from "../auth/components/SessionManager";
import { ToolInfoBox } from "../../app/ToolGuideSheet";
import {
  TwoFactorSetupSheet, BiometricSetupSheet, SecurityChallengeSheet, PinManageSheet,
} from "./SecuritySheets";
import { clearPasskeyCredential, clearTotpSecret, hasAppPin } from "../../lib/security/securityStore";
import { GarudaWalletSecurityPanel } from "./GarudaWalletSecurityPanel";

type SecLabels = Record<string, string>;

const securityScore = (opts: {
  twoFactor: boolean;
  biometric: boolean;
  strict: boolean;
  pin: boolean;
}) => {
  let score = 15;
  if (opts.pin) score += 35;
  if (opts.twoFactor) score += 30;
  if (opts.biometric) score += 10;
  if (opts.strict) score += 10;
  return Math.min(score, 100);
};

const scoreTone = (score: number, sec: SecLabels) => {
  if (score >= 80) return { label: sec.secScoreStrong, tone: "strong" as const };
  if (score >= 55) return { label: sec.secScoreMedium, tone: "medium" as const };
  return { label: sec.secScoreWeak, tone: "weak" as const };
};

const RING_SIZE = 76;
const RING_STROKE = 5;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;
const RING_CENTER = RING_SIZE / 2;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

const SecurityScoreRing = ({
  score,
  tone,
}: {
  score: number;
  tone: "strong" | "medium" | "weak";
}) => {
  const reducedMotion = useReducedMotion();
  const [displayScore, setDisplayScore] = useState(reducedMotion ? score : 0);
  const [ringReady, setRingReady] = useState(!!reducedMotion);
  const [popping, setPopping] = useState(false);
  const [scoreUpdating, setScoreUpdating] = useState(false);
  const prevScoreRef = useRef(score);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    if (reducedMotion) {
      setDisplayScore(score);
      setRingReady(true);
      prevScoreRef.current = score;
      return;
    }

    if (hasAnimatedRef.current && score !== prevScoreRef.current) {
      setScoreUpdating(true);
    }

    const from = hasAnimatedRef.current ? prevScoreRef.current : 0;
    const to = score;
    const duration = hasAnimatedRef.current ? 850 : 1300;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setDisplayScore(Math.round(from + (to - from) * easeOutCubic(t)));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        prevScoreRef.current = to;
        hasAnimatedRef.current = true;
        setPopping(true);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score, reducedMotion]);

  useEffect(() => {
    if (!popping) return;
    const id = window.setTimeout(() => setPopping(false), 480);
    return () => window.clearTimeout(id);
  }, [popping]);

  useEffect(() => {
    if (reducedMotion) return;
    const id = requestAnimationFrame(() => setRingReady(true));
    return () => cancelAnimationFrame(id);
  }, [reducedMotion]);

  const strokeOffset = ringReady ? RING_C - (score / 100) * RING_C : RING_C;

  return (
    <div
      className={`gp-security-hero__ring-wrap${popping ? " gp-security-hero__ring-wrap--pop" : ""}${ringReady ? " gp-security-hero__ring-wrap--ready" : ""}${scoreUpdating ? " gp-security-hero__ring-wrap--update" : ""}`}
    >
      <span className="gp-security-hero__ring-shimmer" aria-hidden />
      <svg
        className="gp-security-hero__ring-svg"
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        aria-hidden
      >
        <circle
          className="gp-security-hero__ring-track"
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_R}
          fill="none"
          strokeWidth={RING_STROKE}
        />
        <circle
          className={`gp-security-hero__ring-progress gp-security-hero__ring-progress--${tone}`}
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_R}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={strokeOffset}
          transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
        />
      </svg>
      <span className="gp-security-hero__score" aria-live="polite">{displayScore}</span>
    </div>
  );
};

const SecuritySwitch = ({ on }: { on: boolean }) => (
  <span className={`gp-security-switch${on ? " gp-security-switch--on" : ""}`} aria-hidden>
    <span className="gp-security-switch__knob" />
  </span>
);

const SecurityRow = ({
  icon: Icon,
  iconTone = "emerald",
  title,
  desc,
  onClick,
  disabled,
  trailing,
  showChevron,
}: {
  icon: LucideIcon;
  iconTone?: "emerald" | "cyan" | "amber" | "neutral";
  title: string;
  desc?: string;
  onClick?: () => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
  showChevron?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="gp-security-row"
  >
    <span className={`gp-security-row__icon gp-security-row__icon--${iconTone}`}>
      <Icon className="w-4 h-4" strokeWidth={2} />
    </span>
    <span className="gp-security-row__body">
      <span className="gp-security-row__title">{title}</span>
      {desc && <span className="gp-security-row__desc">{desc}</span>}
    </span>
    <span className="gp-security-row__trail">
      {trailing}
      {showChevron && <ChevronRight className="w-4 h-4 gp-muted shrink-0" strokeWidth={2} />}
    </span>
  </button>
);

const SecuritySection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="gp-security-section">
    <div className="gp-security-section__head">
      <h3 className="gp-security-section__title">{title}</h3>
      <span className="gp-security-section__line" aria-hidden />
    </div>
    <div className="gp-security-section__card">{children}</div>
  </section>
);

export const SecuritySettingsPanel = ({
  user,
  profileEmail,
  profileName,
  pd,
  tp,
  sm,
  sec,
  twoFactorEnabled,
  biometricEnabled,
  strictDeviceLock,
  isKycVerified,
  setTwoFactorEnabled,
  setBiometricEnabled,
  setStrictDeviceLock,
  refreshSecurityPrefs,
  resetPassword,
  openToolPanel,
  showToast,
  signOut,
  onOpenKyc,
  onRequestLogout,
  requireSecurityStep,
}: {
  user: { uid: string; email?: string | null; displayName?: string | null };
  profileEmail: string;
  profileName: string;
  pd: Record<string, string>;
  tp: Record<string, string>;
  sm: Record<string, string>;
  sec: SecLabels;
  twoFactorEnabled: boolean;
  biometricEnabled: boolean;
  strictDeviceLock: boolean;
  isKycVerified: boolean;
  setTwoFactorEnabled: (v: boolean) => void;
  setBiometricEnabled: (v: boolean) => void;
  setStrictDeviceLock: (v: boolean) => void;
  refreshSecurityPrefs: () => void;
  resetPassword: (email: string) => Promise<void>;
  openToolPanel: (tool: "devices") => void;
  showToast: (msg: string, type?: "info" | "success" | "warning" | "error") => void;
  signOut: () => void;
  onOpenKyc: () => void;
  onRequestLogout: () => void;
  requireSecurityStep: () => Promise<boolean>;
}) => {
  const [activeSheet, setActiveSheet] = useState<null | "pin" | "2fa-setup" | "biometric" | "2fa-disable">(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [pinActive, setPinActive] = useState(hasAppPin);

  const closeSheet = () => setActiveSheet(null);

  useEffect(() => {
    if (activeSheet !== "pin") setPinActive(hasAppPin());
  }, [activeSheet]);

  const score = useMemo(
    () => securityScore({
      twoFactor: twoFactorEnabled,
      biometric: biometricEnabled,
      strict: strictDeviceLock,
      pin: pinActive,
    }),
    [twoFactorEnabled, biometricEnabled, strictDeviceLock, pinActive],
  );
  const { label: scoreLabel, tone: scoreToneKey } = scoreTone(score, sec);

  const handleTwoFactor = () => {
    if (twoFactorEnabled) setActiveSheet("2fa-disable");
    else setActiveSheet("2fa-setup");
  };

  const handleBiometric = () => {
    if (biometricEnabled) {
      clearPasskeyCredential(user.uid);
      setBiometricEnabled(false);
      refreshSecurityPrefs();
      showToast(sec.biometricOff, "info");
    } else {
      setActiveSheet("biometric");
    }
  };

  const handlePasswordReset = async () => {
    const email = user.email ?? profileEmail;
    if (!email) {
      showToast(sec.passwordResetFail, "error");
      return;
    }
    setPasswordBusy(true);
    try {
      await resetPassword(email);
      showToast(sec.passwordResetSent, "success");
    } catch {
      showToast(sec.passwordResetFail, "error");
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <div className="gp-security-panel gp-security-panel--premium gp-panel-stack">
      <div className="gp-security-panel__ambient" aria-hidden>
        <span className="gp-security-panel__glow gp-security-panel__glow--gold" />
        <span className="gp-security-panel__glow gp-security-panel__glow--emerald" />
        <span className="gp-security-panel__grid" />
      </div>

      <div className="gp-security-premium-badge">
        <Shield className="w-3.5 h-3.5" strokeWidth={2.25} />
        <span>{sec.secPremiumBadge}</span>
      </div>

      <div className={`gp-security-hero gp-security-hero--premium gp-security-hero--${scoreToneKey}`}>
        <span className="gp-security-hero__glow" aria-hidden />
        <SecurityScoreRing score={score} tone={scoreToneKey} />
        <div className="gp-security-hero__copy">
          <p className="gp-security-hero__label">{sec.secScoreLabel}</p>
          <p className="gp-security-hero__status">{scoreLabel}</p>
          <ul className="gp-security-hero__checks">
            <li className={pinActive ? "is-on" : ""}>{sec.secPinHero}</li>
            <li className={twoFactorEnabled ? "is-on" : ""}>{pd.twoFactor}</li>
            <li className={biometricEnabled ? "is-on" : ""}>{tp.biometric}</li>
            <li className={strictDeviceLock ? "is-on" : ""}>{sec.strictDevice}</li>
          </ul>
        </div>
      </div>

      <ToolInfoBox info={pd.securityInfo} features={[]} compact tone="gold" />

      <SecuritySection title={sec.secSectionPin}>
        <p className="gp-security-pin-note">{sec.secPinRegRule}</p>
        <SecurityRow
          icon={KeyRound}
          iconTone="amber"
          title={sec.secPinTitle}
          desc={pinActive ? sec.secPinDescSet : sec.secPinDescMissing}
          onClick={() => setActiveSheet("pin")}
          trailing={
            <span className={`gp-wallet-sec-pill${pinActive ? " gp-wallet-sec-pill--on" : ""}`}>
              {pinActive ? sec.secPinActionChange : sec.secPinActionSet}
            </span>
          }
          showChevron
        />
      </SecuritySection>

      <SecuritySection title={sec.secSectionAuth}>
        <SecurityRow
          icon={Shield}
          iconTone="emerald"
          title={pd.twoFactor}
          desc={sec.secTwoFactorDesc}
          onClick={handleTwoFactor}
          trailing={<SecuritySwitch on={twoFactorEnabled} />}
        />
        <SecurityRow
          icon={Fingerprint}
          iconTone="cyan"
          title={tp.biometric}
          desc={sec.secBiometricDesc}
          onClick={handleBiometric}
          trailing={<SecuritySwitch on={biometricEnabled} />}
        />
      </SecuritySection>

      <GarudaWalletSecurityPanel
        uid={user.uid}
        labels={sec}
        showToast={showToast}
        requireSecurityStep={requireSecurityStep}
      />

      <SecuritySection title={sec.secSectionProtection}>
        <SecurityRow
          icon={ShieldCheck}
          iconTone="amber"
          title={sec.strictDevice}
          desc={sec.strictDeviceDesc}
          onClick={() => setStrictDeviceLock(!strictDeviceLock)}
          trailing={<SecuritySwitch on={strictDeviceLock} />}
        />
        <div className="gp-security-session-wrap">
          <SessionManager
            uid={user.uid}
            labels={sm}
            onRequestSignOut={onRequestLogout}
            onForceSignOut={signOut}
          />
        </div>
      </SecuritySection>

      <SecuritySection title={sec.secSectionAccount}>
        <SecurityRow
          icon={KeyRound}
          iconTone="neutral"
          title={pd.changePassword}
          desc={sec.secPasswordDesc}
          onClick={() => void handlePasswordReset()}
          disabled={passwordBusy}
          showChevron
        />
        <SecurityRow
          icon={Smartphone}
          iconTone="neutral"
          title={pd.activeSessions}
          desc={sec.secDevicesDesc}
          onClick={() => openToolPanel("devices")}
          showChevron
        />
      </SecuritySection>

      {!isKycVerified && (
        <div className="gp-security-callout">
          <AlertTriangle className="gp-security-callout__icon w-4 h-4 shrink-0 mt-0.5" strokeWidth={2} />
          <div className="min-w-0">
            <p className="gp-security-callout__title">{tp.kycSecurityHint}</p>
            <button
              type="button"
              onClick={onOpenKyc}
              className="gp-security-callout__action"
            >
              {pd.kycVerificationTitle} →
            </button>
          </div>
        </div>
      )}

      <TwoFactorSetupSheet
        open={activeSheet === "2fa-setup"}
        onClose={closeSheet}
        uid={user.uid}
        accountLabel={user.email ?? profileEmail}
        labels={{
          title: sec.twoFactorSetupTitle,
          intro: sec.twoFactorSetupIntro,
          scanHint: sec.twoFactorScanHint,
          enable: sec.twoFactorEnable,
          enabling: sec.twoFactorEnabling,
          invalidCode: sec.invalidCode,
          stepQr: sec.twoFactorStepQr,
          stepVerify: sec.twoFactorStepVerify,
          next: sec.sheetNext,
          back: sec.sheetBack,
        }}
        onEnabled={() => {
          refreshSecurityPrefs();
          showToast(sec.twoFactorOn, "success");
        }}
      />
      <BiometricSetupSheet
        open={activeSheet === "biometric"}
        onClose={closeSheet}
        uid={user.uid}
        displayName={user.displayName ?? profileName}
        labels={{
          title: sec.biometricSetupTitle,
          intro: sec.biometricSetupIntro,
          enable: sec.biometricEnable,
          enabling: sec.biometricEnabling,
          unsupported: sec.biometricUnsupported,
          failed: sec.biometricFailed,
        }}
        onEnabled={() => {
          refreshSecurityPrefs();
          showToast(sec.biometricOn, "success");
        }}
      />
      <SecurityChallengeSheet
        open={activeSheet === "2fa-disable"}
        onClose={closeSheet}
        uid={user.uid}
        labels={{
          title: sec.disable2faTitle,
          intro: sec.disable2faBody,
          totpLabel: sec.challengeTotp,
          pinLabel: sec.challengePin,
          biometric: sec.challengeBiometric,
          confirm: sec.challengeConfirm,
          invalid: sec.invalidCode,
        }}
        onVerified={() => {
          clearTotpSecret(user.uid);
          setTwoFactorEnabled(false);
          refreshSecurityPrefs();
          closeSheet();
          showToast(sec.twoFactorDisableConfirm, "info");
        }}
      />

      <PinManageSheet
        open={activeSheet === "pin"}
        onClose={closeSheet}
        labels={{
          createTitle: sec.secPinSheetCreateTitle,
          changeTitle: sec.secPinSheetChangeTitle,
          intro: sec.secPinSheetIntro,
          current: sec.secPinSheetCurrent,
          newPin: sec.secPinSheetNew,
          confirm: sec.secPinSheetConfirm,
          save: sec.secPinSheetSave,
          saving: sec.secPinSheetSaving,
          mismatch: sec.secPinMismatch,
          tooShort: sec.secPinTooShort,
          wrong: sec.secPinWrong,
          next: sec.sheetNext,
          back: sec.sheetBack,
        }}
        onSaved={() => {
          setPinActive(true);
          showToast(sec.secPinSaved, "success");
        }}
      />

    </div>
  );
};
