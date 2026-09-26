export const AUTH_GATE_OVERLAY_ID = "gp-auth-gate-overlay";

const SKELETON_ROW = `
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
    <div style="width:16px;height:16px;border-radius:4px;background:rgba(228,228,231,0.35)"></div>
    <div style="flex:1">
      <div style="height:8px;width:56px;border-radius:4px;background:rgba(228,228,231,0.3);margin-bottom:6px"></div>
      <div style="height:14px;width:72%;max-width:200px;border-radius:4px;background:rgba(228,228,231,0.45)"></div>
    </div>
  </div>
`;

const buildOverlay = () => {
  const root = document.createElement("div");
  root.id = AUTH_GATE_OVERLAY_ID;
  root.setAttribute("role", "presentation");
  root.setAttribute("aria-busy", "true");
  root.className = "gp-auth-scene gp-auth-luxe";
  root.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483646",
    "display:flex",
    "flex-direction:column",
    "background:#09090b",
    "font-family:Outfit,Inter,system-ui,sans-serif",
  ].join(";");
  root.innerHTML = `
    <div style="flex:1;display:flex;flex-direction:column;padding:max(1rem,env(safe-area-inset-top)) 1.5rem 2rem">
      <div style="height:56px;margin:0 auto 1rem;width:56px;border-radius:12px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.2)"></div>
      <div style="display:flex;gap:4px;margin-bottom:0.5rem">
        <div style="flex:1;height:4px;border-radius:999px;background:#059669"></div>
        <div style="flex:1;height:4px;border-radius:999px;background:rgba(228,228,231,0.35)"></div>
        <div style="flex:1;height:4px;border-radius:999px;background:rgba(228,228,231,0.35)"></div>
        <div style="flex:1;height:4px;border-radius:999px;background:rgba(228,228,231,0.35)"></div>
        <div style="flex:1;height:4px;border-radius:999px;background:rgba(228,228,231,0.35)"></div>
        <div style="flex:1;height:4px;border-radius:999px;background:rgba(228,228,231,0.35)"></div>
      </div>
      <p style="margin:0 0 1.25rem;text-align:center;font-size:10px;color:rgba(161,161,170,0.95);letter-spacing:0.06em;text-transform:uppercase">Langkah 1 dari 6</p>
      <div style="text-align:center;margin-bottom:1rem">
        <h2 style="margin:0;font-size:1.25rem;font-weight:600;color:#fafafa;font-family:'Cormorant Garamond',serif">Konfirmasi Akun</h2>
        <p style="margin:0.5rem 0 0;font-size:0.8125rem;line-height:1.5;color:rgba(161,161,170,0.95);max-width:280px;margin-left:auto;margin-right:auto">Periksa detail akun Anda sebelum melanjutkan setup</p>
      </div>
      <div style="border-radius:1rem;border:1px solid rgba(228,228,231,0.2);background:rgba(24,24,27,0.85);padding:1rem">
        ${SKELETON_ROW}${SKELETON_ROW}${SKELETON_ROW}
      </div>
    </div>
  `;
  return root;
};

export const waitForNextPaint = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

const hideOAuthBootOverlay = () => {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("gp-oauth-pending");
  const boot = document.getElementById("gp-oauth-boot-overlay");
  if (boot) boot.setAttribute("hidden", "");
};

/** Fullscreen shell matching Konfirmasi Akun, not a spinner loading page */
export const showInstantAuthGate = () => {
  if (typeof document === "undefined") return;
  document.documentElement.classList.add("gp-oauth-pending");
  document.getElementById(AUTH_GATE_OVERLAY_ID)?.remove();
  hideOAuthBootOverlay();
  document.body.appendChild(buildOverlay());
};

export const hideInstantAuthGate = () => {
  if (typeof document === "undefined") return;
  document.getElementById(AUTH_GATE_OVERLAY_ID)?.remove();
  hideOAuthBootOverlay();
};

export const isInstantAuthGateVisible = () =>
  typeof document !== "undefined"
  && document.getElementById(AUTH_GATE_OVERLAY_ID) != null;
