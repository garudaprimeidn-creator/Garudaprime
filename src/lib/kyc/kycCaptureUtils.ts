import { isMobileUserAgent, isStandalonePwa } from "../auth/oauthEnvironment";

/** Prefer OS camera sheet on mobile / installed PWA, more reliable than getUserMedia in WebView. */
export const preferNativeKycCapture = (): boolean =>
  typeof window !== "undefined" && (isStandalonePwa() || isMobileUserAgent());

export const attachStreamToVideo = async (
  video: HTMLVideoElement,
  stream: MediaStream,
  maxAttempts = 30,
): Promise<boolean> => {
  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.muted = true;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await video.play();
      return video.videoWidth > 0;
    } catch {
      await new Promise((r) => window.setTimeout(r, 50));
    }
  }
  return false;
};

export const requestSelfieMediaStream = async (): Promise<MediaStream> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException("Camera not supported", "NotSupportedError");
  }

  const constraints: MediaStreamConstraints[] = [
    {
      video: {
        facingMode: { ideal: "user" },
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
      },
      audio: false,
    },
    { video: { facingMode: "user" }, audio: false },
    { video: true, audio: false },
  ];

  let lastError: unknown;
  for (const constraint of constraints) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraint);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new DOMException("Camera failed", "NotReadableError");
};

export const requestDocumentMediaStream = async (): Promise<MediaStream> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException("Camera not supported", "NotSupportedError");
  }

  const constraints: MediaStreamConstraints[] = [
    {
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920, min: 640 },
        height: { ideal: 1080, min: 480 },
      },
      audio: false,
    },
    { video: { facingMode: "environment" }, audio: false },
    { video: true, audio: false },
  ];

  let lastError: unknown;
  for (const constraint of constraints) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraint);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new DOMException("Camera failed", "NotReadableError");
};
