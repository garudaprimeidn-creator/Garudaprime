import React, { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Monitor, Shield, RefreshCw, LogOut } from "lucide-react";
import {
  getSessionMeta, validateSession, refreshSessionToken, rebindDeviceFingerprint,
} from "../../../lib/security/sessionManager";
import { getRecentLoginActivity, revokeOtherDeviceSessions, type LoginActivityRecord } from "../../../lib/firebase/firestoreService";
import { showAppToast } from "../../../app/appToast";

type Props = {
  uid: string;
  labels: {
    title: string;
    active: string;
    expired: string;
    device: string;
    lastLogin: string;
    refresh: string;
    signOut: string;
    secure: string;
    hijackWarning: string;
    revokeOthers?: string;
    revokeOthersDone?: (n: number) => string;
  };
  onRequestSignOut?: () => void;
  onForceSignOut?: () => void;
  compact?: boolean;
};

export const SessionManager = ({ uid, labels, onRequestSignOut, onForceSignOut, compact }: Props) => {
  const [valid, setValid] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [activity, setActivity] = useState<LoginActivityRecord[]>([]);

  const load = useCallback(async () => {
    const check = validateSession();
    setValid(check.valid);
    if (check.reason === "fingerprint_mismatch") {
      rebindDeviceFingerprint();
      setValid(true);
    }
    const rows = await getRecentLoginActivity(uid, 3);
    setActivity(rows);
  }, [uid, onForceSignOut, onRequestSignOut]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshSessionToken();
    await load();
    setRefreshing(false);
  };

  const meta = getSessionMeta();
  const last = activity[0];

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs gp-muted">
        <Shield className={`w-3.5 h-3.5 ${valid ? "text-emerald-400" : "text-amber-400"}`} />
        <span>{valid ? labels.secure : labels.expired}</span>
      </div>
    );
  }

  return (
    <div className="gp-session-card">
      <div className="gp-session-card__head">
        <p className="gp-session-card__title">
          <Monitor className="w-4 h-4 gp-read-emerald" strokeWidth={2} />
          {labels.title}
        </p>
        <span className={`gp-badge-read shrink-0 ${valid ? "gp-badge-read--emerald" : "gp-badge-read--amber"}`}>
          {valid ? labels.active : labels.expired}
        </span>
      </div>

      {last && (
        <div className="gp-session-card__meta">
          <p>{labels.lastLogin}: {last.device} / {last.browser}</p>
          {last.location !== "Unknown" && <p>{last.location}</p>}
        </div>
      )}

      {meta && (
        <p className="gp-session-card__device gp-num">
          {labels.device}: {meta.fingerprint.slice(0, 12)}…
        </p>
      )}

      <div className="gp-session-card__actions">
        <motion.button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          whileTap={{ scale: 0.97 }}
          className="gp-session-card__btn gp-session-card__btn--secondary"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {labels.refresh}
        </motion.button>
        {labels.revokeOthers && (
          <motion.button
            type="button"
            disabled={revoking}
            onClick={async () => {
              setRevoking(true);
              try {
                const n = await revokeOtherDeviceSessions(uid);
                if (labels.revokeOthersDone) {
                  showAppToast(labels.revokeOthersDone(n), n > 0 ? "success" : "info");
                }
              } catch {
                showAppToast(labels.hijackWarning, "error");
              } finally {
                setRevoking(false);
              }
            }}
            whileTap={{ scale: 0.97 }}
            className="gp-session-card__btn gp-session-card__btn--secondary"
          >
            <Shield className="w-3.5 h-3.5" />
            {revoking ? "…" : labels.revokeOthers}
          </motion.button>
        )}
        {onRequestSignOut && (
          <motion.button
            type="button"
            onClick={onRequestSignOut}
            whileTap={{ scale: 0.97 }}
            className="gp-session-card__btn gp-session-card__btn--danger"
          >
            <LogOut className="w-3.5 h-3.5" />
            {labels.signOut}
          </motion.button>
        )}
      </div>
    </div>
  );
};

export const useSessionGuard = (onInvalid: () => void) => {
  useEffect(() => {
    const check = validateSession();
    if (!check.valid && check.reason === "no_session") {
      onInvalid();
      return;
    }
    if (check.reason === "fingerprint_mismatch") {
      rebindDeviceFingerprint();
    }
  }, [onInvalid]);
};
