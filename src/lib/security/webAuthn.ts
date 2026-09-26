/** WebAuthn / platform passkey (Face ID, Touch ID, Windows Hello) */

const rpId = () => window.location.hostname || "localhost";

const toB64 = (buf: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

const fromB64 = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export const isWebAuthnSupported = (): boolean =>
  typeof window !== "undefined"
  && typeof PublicKeyCredential !== "undefined"
  && typeof navigator.credentials?.create === "function";

export const registerPlatformPasskey = async (
  uid: string,
  displayName: string,
): Promise<string> => {
  if (!isWebAuthnSupported()) {
    throw Object.assign(new Error("WebAuthn not supported"), { code: "security/webauthn-unsupported" });
  }
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Garuda Prime", id: rpId() },
      user: {
        id: new TextEncoder().encode(uid),
        name: displayName,
        displayName: displayName,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },
        { alg: -257, type: "public-key" },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
      attestation: "none",
    },
  }) as PublicKeyCredential | null;

  if (!cred) {
    throw Object.assign(new Error("Passkey registration cancelled"), { code: "security/webauthn-cancelled" });
  }
  return toB64(cred.rawId);
};

export const authenticatePlatformPasskey = async (credentialIdB64: string): Promise<boolean> => {
  if (!isWebAuthnSupported()) return false;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: rpId(),
      allowCredentials: [{
        id: fromB64(credentialIdB64),
        type: "public-key",
        transports: ["internal", "hybrid"],
      }],
      userVerification: "required",
      timeout: 60_000,
    },
  });
  return Boolean(assertion);
};
