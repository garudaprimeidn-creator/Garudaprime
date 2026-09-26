import { normalizeProvinceName } from "./indonesiaRegions";

export type KtpOcrExtract = {
  addressLine1?: string;
  city?: string;
  province?: string;
  rawText?: string;
};

export function parseKtpAddressFromText(text: string): KtpOcrExtract {
  const lines = text.replace(/\r/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const joined = lines.join("\n");
  const upper = joined.toUpperCase();

  const extract = (patterns: RegExp[]): string | undefined => {
    for (const re of patterns) {
      const m = joined.match(re) ?? upper.match(re);
      if (m?.[1]?.trim()) return m[1].trim();
    }
    return undefined;
  };

  const addressLine1 = extract([
    /ALAMAT\s*[:\.]?\s*(.+?)(?:\n|RT\/RW|RT\s*\/\s*RW|$)/i,
    /ADDRESS\s*[:\.]?\s*(.+?)(?:\n|RT\/RW|$)/i,
  ]);

  const city = extract([
    /(?:KABUPATEN\/KOTA|KAB\.\/KOTA|KABUPATEN|KOTA)\s*[:\.]?\s*(.+?)(?:\n|PROVINSI|$)/i,
    /(?:KECAMATAN)\s*[:\.]?\s*.+?\n(?:KABUPATEN\/KOTA|KAB\.|KOTA)\s*[:\.]?\s*(.+?)(?:\n|PROVINSI|$)/i,
  ]);

  const provinceRaw = extract([
    /PROVINSI\s*[:\.]?\s*(.+?)$/im,
    /PROV\.\s*[:\.]?\s*(.+?)$/im,
  ]);

  return {
    addressLine1,
    city: city?.replace(/^(KABUPATEN|KAB\.|KOTA)\s*/i, "").trim(),
    province: provinceRaw ? normalizeProvinceName(provinceRaw) : undefined,
    rawText: joined.slice(0, 2000),
  };
}

export async function scanKtpAddressFromImage(dataUrl: string): Promise<KtpOcrExtract> {
  if (!dataUrl.startsWith("data:image")) {
    return { rawText: "PDF, OCR tidak tersedia untuk PDF di perangkat ini" };
  }

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("ind+eng", 1, { logger: () => {} });
  try {
    const { data } = await worker.recognize(dataUrl);
    return parseKtpAddressFromText(data.text);
  } finally {
    await worker.terminate();
  }
}
