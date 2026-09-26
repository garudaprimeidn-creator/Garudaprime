import { Html5Qrcode } from "html5-qrcode";
import { decodeQrFromImageElement } from "./decodeQrFrame";

let fileScannerHost: HTMLDivElement | null = null;
let fileScanner: Html5Qrcode | null = null;

function getFileScanner(): Html5Qrcode {
  if (!fileScannerHost) {
    fileScannerHost = document.createElement("div");
    fileScannerHost.id = "gp-qr-file-decode-host";
    fileScannerHost.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px;overflow:hidden;";
    document.body.appendChild(fileScannerHost);
  }
  if (!fileScanner) {
    fileScanner = new Html5Qrcode(fileScannerHost.id, { verbose: false });
  }
  return fileScanner;
}

/** Decode QR from image file, html5-qrcode (ZXing) with jsQR fallback. */
export async function decodeQrFromFile(
  file: File,
  canvas: HTMLCanvasElement,
): Promise<string | null> {
  try {
    const scanner = getFileScanner();
    const text = await scanner.scanFile(file, true);
    if (text?.trim()) return text.trim();
  } catch {
    /* fall through to canvas decode */
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return decodeQrFromImageElement(img, canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}
