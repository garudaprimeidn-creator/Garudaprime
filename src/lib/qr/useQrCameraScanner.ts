import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { decodeQrFromFile } from "./decodeQrFile";

export type QrCameraStatus =
  | "idle"
  | "starting"
  | "scanning"
  | "denied"
  | "unsupported"
  | "error";

type Options = {
  active: boolean;
  onDecode: (text: string) => boolean | void;
  facingMode?: "user" | "environment";
};

export function useQrCameraScanner({ active, onDecode, facingMode = "environment" }: Options) {
  const reactId = useId();
  const elementId = `gp-qr-live-${reactId.replace(/:/g, "")}`;
  const [status, setStatus] = useState<QrCameraStatus>("idle");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const decodedRef = useRef(false);
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  const stopStream = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner?.isScanning) {
      try {
        await scanner.stop();
      } catch {
        /* already stopped */
      }
    }
  }, []);

  const resetScan = useCallback(() => {
    decodedRef.current = false;
    try {
      scannerRef.current?.resume();
    } catch {
      /* not paused */
    }
  }, []);

  useEffect(() => {
    if (!active) {
      void stopStream();
      setStatus("idle");
      decodedRef.current = false;
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }

    let cancelled = false;
    decodedRef.current = false;
    setStatus("starting");

    const waitForMount = async (attempt = 0): Promise<HTMLElement | null> => {
      const el = document.getElementById(elementId);
      if (el) return el;
      if (attempt >= 30 || cancelled) return null;
      await new Promise((r) => window.setTimeout(r, 50));
      return waitForMount(attempt + 1);
    };

    const start = async () => {
      const mount = await waitForMount();
      if (cancelled || !mount) {
        if (!cancelled) setStatus("error");
        return;
      }

      try {
        const scanner = new Html5Qrcode(elementId, {
          verbose: false,
          useBarCodeDetectorIfSupported: true,
        });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: { ideal: facingMode } },
          {
            fps: 16,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.78);
              return { width: edge, height: edge };
            },
            disableFlip: false,
            videoConstraints: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1280, min: 640 },
              height: { ideal: 720, min: 480 },
            },
          },
          (text) => {
            if (cancelled || decodedRef.current) return;
            const decoded = text?.trim();
            if (!decoded) return;
            const consumed = onDecodeRef.current(decoded);
            if (consumed !== false) {
              decodedRef.current = true;
              try {
                scanner.pause(true);
              } catch {
                /* ignore */
              }
            }
          },
          () => undefined,
        );

        if (!cancelled) setStatus("scanning");
      } catch (err) {
        if (cancelled) return;
        const denied = err instanceof DOMException && (
          err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
        );
        setStatus(denied ? "denied" : "error");
      }
    };

    void start();

    return () => {
      cancelled = true;
      void stopStream();
    };
  }, [active, elementId, facingMode, stopStream]);

  const decodeFromImage = useCallback(async (file: File) => {
    const canvas = document.createElement("canvas");
    const decoded = await decodeQrFromFile(file, canvas);
    if (!decoded) return false;

    const consumed = onDecodeRef.current(decoded);
    if (consumed === false) return false;

    decodedRef.current = true;
    return true;
  }, []);

  const tapToFocus = useCallback(() => {
    void scannerRef.current?.applyVideoConstraints({
      // @ts-expect-error, advanced MediaTrack constraint
      advanced: [{ focusMode: "single-shot" }],
    }).catch(() => undefined);
  }, []);

  return {
    elementId,
    status,
    resetScan,
    decodeFromImage,
    stopStream,
    tapToFocus,
  };
}
