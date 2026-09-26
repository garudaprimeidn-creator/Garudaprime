/** 38 provinsi Indonesia, untuk validasi alamat KYC */
export const INDONESIA_PROVINCES = [
  "Aceh",
  "Bali",
  "Banten",
  "Bengkulu",
  "DI Yogyakarta",
  "DKI Jakarta",
  "Gorontalo",
  "Jambi",
  "Jawa Barat",
  "Jawa Tengah",
  "Jawa Timur",
  "Kalimantan Barat",
  "Kalimantan Selatan",
  "Kalimantan Tengah",
  "Kalimantan Timur",
  "Kalimantan Utara",
  "Kepulauan Bangka Belitung",
  "Kepulauan Riau",
  "Lampung",
  "Maluku",
  "Maluku Utara",
  "Nusa Tenggara Barat",
  "Nusa Tenggara Timur",
  "Papua",
  "Papua Barat",
  "Papua Barat Daya",
  "Papua Pegunungan",
  "Papua Selatan",
  "Papua Tengah",
  "Riau",
  "Sulawesi Barat",
  "Sulawesi Selatan",
  "Sulawesi Tengah",
  "Sulawesi Tenggara",
  "Sulawesi Utara",
  "Sumatera Barat",
  "Sumatera Selatan",
  "Sumatera Utara",
] as const;

/** Prefix 2 digit kode pos → provinsi yang umum (simplified, non-exhaustive) */
const POSTAL_PREFIX_PROVINCES: Record<string, string[]> = {
  "10": ["DKI Jakarta", "Banten"],
  "11": ["DKI Jakarta", "Banten"],
  "12": ["DKI Jakarta", "Jawa Barat"],
  "13": ["Banten", "Jawa Barat"],
  "14": ["Jawa Barat", "Banten"],
  "15": ["Jawa Barat", "Banten"],
  "16": ["Jawa Barat", "Banten"],
  "17": ["Banten"],
  "18": ["Lampung", "Bengkulu"],
  "19": ["Bangka Belitung", "Kepulauan Bangka Belitung"],
  "20": ["Riau", "Kepulauan Riau"],
  "21": ["Riau", "Kepulauan Riau"],
  "22": ["Sumatera Utara"],
  "23": ["Sumatera Utara", "Aceh"],
  "24": ["Sumatera Utara"],
  "25": ["Sumatera Utara", "Aceh"],
  "26": ["Aceh"],
  "27": ["Aceh"],
  "28": ["Riau"],
  "29": ["Riau", "Kepulauan Riau"],
  "30": ["Sumatera Selatan"],
  "31": ["Jambi", "Sumatera Selatan"],
  "32": ["Bengkulu", "Jambi"],
  "33": ["Lampung"],
  "34": ["Kepulauan Bangka Belitung"],
  "35": ["Jambi"],
  "36": ["Bengkulu"],
  "37": ["Sumatera Selatan"],
  "40": ["Jawa Barat"],
  "41": ["Jawa Barat"],
  "42": ["Jawa Barat"],
  "43": ["Jawa Barat"],
  "44": ["Jawa Barat"],
  "45": ["Jawa Barat"],
  "46": ["Jawa Barat"],
  "50": ["Jawa Tengah", "DI Yogyakarta"],
  "51": ["Jawa Tengah"],
  "52": ["Jawa Tengah", "DI Yogyakarta"],
  "53": ["Jawa Tengah"],
  "54": ["Jawa Tengah", "DI Yogyakarta"],
  "55": ["DI Yogyakarta", "Jawa Tengah"],
  "56": ["Jawa Tengah"],
  "57": ["Jawa Tengah"],
  "58": ["Jawa Tengah"],
  "59": ["Jawa Tengah"],
  "60": ["Jawa Timur"],
  "61": ["Jawa Timur"],
  "62": ["Jawa Timur"],
  "63": ["Jawa Timur"],
  "64": ["Jawa Timur"],
  "65": ["Jawa Timur"],
  "66": ["Jawa Timur"],
  "67": ["Jawa Timur"],
  "68": ["Jawa Timur"],
  "69": ["Jawa Timur"],
  "70": ["Kalimantan Selatan", "Kalimantan Barat"],
  "71": ["Kalimantan Tengah", "Kalimantan Selatan"],
  "72": ["Kalimantan Tengah"],
  "73": ["Kalimantan Selatan"],
  "74": ["Kalimantan Timur", "Kalimantan Utara"],
  "75": ["Kalimantan Timur", "Kalimantan Utara"],
  "76": ["Kalimantan Barat"],
  "77": ["Kalimantan Barat"],
  "78": ["Kalimantan Barat"],
  "79": ["Kalimantan Utara"],
  "80": ["Bali", "Nusa Tenggara Barat"],
  "81": ["Nusa Tenggara Barat"],
  "82": ["Nusa Tenggara Barat"],
  "83": ["Bali"],
  "84": ["Nusa Tenggara Timur"],
  "85": ["Nusa Tenggara Timur"],
  "86": ["Nusa Tenggara Timur"],
  "87": ["Maluku", "Maluku Utara"],
  "88": ["Papua", "Papua Barat"],
  "89": ["Papua"],
  "90": ["Sulawesi Selatan"],
  "91": ["Sulawesi Selatan", "Sulawesi Barat"],
  "92": ["Sulawesi Selatan"],
  "93": ["Sulawesi Selatan"],
  "94": ["Sulawesi Tenggara"],
  "95": ["Sulawesi Utara", "Gorontalo"],
  "96": ["Sulawesi Tengah"],
  "97": ["Papua", "Papua Pegunungan"],
  "98": ["Papua Barat", "Papua Barat Daya"],
  "99": ["Papua", "Papua Selatan"],
};

const PROVINCE_ALIASES: Record<string, string> = {
  "JAKARTA": "DKI Jakarta",
  "DKI JAKARTA": "DKI Jakarta",
  "DAERAH KHUSUS IBUKOTA JAKARTA": "DKI Jakarta",
  "YOGYAKARTA": "DI Yogyakarta",
  "JOGJA": "DI Yogyakarta",
  "DIY": "DI Yogyakarta",
  "KEP. RIAU": "Kepulauan Riau",
  "KEPULAUAN RIAU": "Kepulauan Riau",
  "KEP. BANGKA BELITUNG": "Kepulauan Bangka Belitung",
  "BANGKA BELITUNG": "Kepulauan Bangka Belitung",
  "PAPUA BARAT DAYA": "Papua Barat Daya",
  "NTB": "Nusa Tenggara Barat",
  "NTT": "Nusa Tenggara Timur",
};

export function normalizeProvinceName(raw: string): string {
  const upper = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (PROVINCE_ALIASES[upper]) return PROVINCE_ALIASES[upper];
  for (const p of INDONESIA_PROVINCES) {
    if (p.toUpperCase() === upper) return p;
    if (upper.includes(p.toUpperCase()) || p.toUpperCase().includes(upper)) return p;
  }
  return raw.trim();
}

export function isValidPostalCodeFormat(postalCode: string): boolean {
  return /^\d{5}$/.test(postalCode.trim());
}

export function isKnownProvince(province: string): boolean {
  const normalized = normalizeProvinceName(province);
  return INDONESIA_PROVINCES.some((p) => p === normalized);
}

export function postalCodeMatchesProvince(postalCode: string, province: string): boolean {
  const code = postalCode.trim();
  if (!isValidPostalCodeFormat(code)) return false;
  const prefix = code.slice(0, 2);
  const candidates = POSTAL_PREFIX_PROVINCES[prefix];
  if (!candidates?.length) return true;
  const normalized = normalizeProvinceName(province);
  return candidates.some((c) => c === normalized);
}

export function getPostalPrefixHint(postalCode: string): string[] {
  const prefix = postalCode.trim().slice(0, 2);
  return POSTAL_PREFIX_PROVINCES[prefix] ?? [];
}
