const VERIFY_SESSION_KEY = "kycport_verify_session_id";

export const saveKycPortVerifySessionId = (sessionId: string) => {
  try {
    sessionStorage.setItem(VERIFY_SESSION_KEY, sessionId);
  } catch {
    /* ignore */
  }
};

export const loadKycPortVerifySessionId = (): string | null => {
  try {
    return sessionStorage.getItem(VERIFY_SESSION_KEY);
  } catch {
    return null;
  }
};

export const clearKycPortVerifySessionId = () => {
  try {
    sessionStorage.removeItem(VERIFY_SESSION_KEY);
  } catch {
    /* ignore */
  }
};
