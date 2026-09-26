import QRCode from "qrcode";

export async function saveQrPayloadAsPng(
  payload: string,
  filename: string,
  size = 512,
): Promise<boolean> {
  try {
    const dataUrl = await QRCode.toDataURL(payload, {
      width: size,
      margin: 2,
      color: { dark: "#171717", light: "#ffffff" },
      errorCorrectionLevel: "H",
    });
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch {
    return false;
  }
}
