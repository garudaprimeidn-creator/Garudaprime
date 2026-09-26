const OAUTH_PENDING_KEY = "gp_oauth_pending";

export const markOAuthPending = () => {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(OAUTH_PENDING_KEY, "1");
};

export const clearOAuthPending = () => {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(OAUTH_PENDING_KEY);
};

export const isOAuthPending = () =>
  typeof window !== "undefined"
  && sessionStorage.getItem(OAUTH_PENDING_KEY) === "1";
