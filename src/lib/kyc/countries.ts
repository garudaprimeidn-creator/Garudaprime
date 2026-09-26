export type CountryEntry = {
  code: string;
  nameEn: string;
  nameId: string;
  dial: string;
};

/** Primary residence countries, global coverage with Indonesia supported natively. */
export const RESIDENCE_COUNTRIES: CountryEntry[] = [
  { code: "ID", nameEn: "Indonesia", nameId: "Indonesia", dial: "+62" },
  { code: "MY", nameEn: "Malaysia", nameId: "Malaysia", dial: "+60" },
  { code: "SG", nameEn: "Singapore", nameId: "Singapura", dial: "+65" },
  { code: "BN", nameEn: "Brunei", nameId: "Brunei", dial: "+673" },
  { code: "TH", nameEn: "Thailand", nameId: "Thailand", dial: "+66" },
  { code: "PH", nameEn: "Philippines", nameId: "Filipina", dial: "+63" },
  { code: "VN", nameEn: "Vietnam", nameId: "Vietnam", dial: "+84" },
  { code: "JP", nameEn: "Japan", nameId: "Jepang", dial: "+81" },
  { code: "KR", nameEn: "South Korea", nameId: "Korea Selatan", dial: "+82" },
  { code: "CN", nameEn: "China", nameId: "Tiongkok", dial: "+86" },
  { code: "IN", nameEn: "India", nameId: "India", dial: "+91" },
  { code: "PK", nameEn: "Pakistan", nameId: "Pakistan", dial: "+92" },
  { code: "BD", nameEn: "Bangladesh", nameId: "Bangladesh", dial: "+880" },
  { code: "SA", nameEn: "Saudi Arabia", nameId: "Arab Saudi", dial: "+966" },
  { code: "AE", nameEn: "United Arab Emirates", nameId: "Uni Emirat Arab", dial: "+971" },
  { code: "QA", nameEn: "Qatar", nameId: "Qatar", dial: "+974" },
  { code: "KW", nameEn: "Kuwait", nameId: "Kuwait", dial: "+965" },
  { code: "BH", nameEn: "Bahrain", nameId: "Bahrain", dial: "+973" },
  { code: "OM", nameEn: "Oman", nameId: "Oman", dial: "+968" },
  { code: "TR", nameEn: "Turkey", nameId: "Turki", dial: "+90" },
  { code: "EG", nameEn: "Egypt", nameId: "Mesir", dial: "+20" },
  { code: "NG", nameEn: "Nigeria", nameId: "Nigeria", dial: "+234" },
  { code: "ZA", nameEn: "South Africa", nameId: "Afrika Selatan", dial: "+27" },
  { code: "KE", nameEn: "Kenya", nameId: "Kenya", dial: "+254" },
  { code: "GB", nameEn: "United Kingdom", nameId: "Britania Raya", dial: "+44" },
  { code: "DE", nameEn: "Germany", nameId: "Jerman", dial: "+49" },
  { code: "FR", nameEn: "France", nameId: "Prancis", dial: "+33" },
  { code: "NL", nameEn: "Netherlands", nameId: "Belanda", dial: "+31" },
  { code: "BE", nameEn: "Belgium", nameId: "Belgia", dial: "+32" },
  { code: "CH", nameEn: "Switzerland", nameId: "Swiss", dial: "+41" },
  { code: "IT", nameEn: "Italy", nameId: "Italia", dial: "+39" },
  { code: "ES", nameEn: "Spain", nameId: "Spanyol", dial: "+34" },
  { code: "SE", nameEn: "Sweden", nameId: "Swedia", dial: "+46" },
  { code: "NO", nameEn: "Norway", nameId: "Norway", dial: "+47" },
  { code: "US", nameEn: "United States", nameId: "Amerika Serikat", dial: "+1" },
  { code: "CA", nameEn: "Canada", nameId: "Kanada", dial: "+1" },
  { code: "MX", nameEn: "Mexico", nameId: "Meksiko", dial: "+52" },
  { code: "BR", nameEn: "Brazil", nameId: "Brasil", dial: "+55" },
  { code: "AR", nameEn: "Argentina", nameId: "Argentina", dial: "+54" },
  { code: "AU", nameEn: "Australia", nameId: "Australia", dial: "+61" },
  { code: "NZ", nameEn: "New Zealand", nameId: "Selandia Baru", dial: "+64" },
];

export const DEFAULT_COUNTRY_CODE = "US";

export function findCountry(code: string): CountryEntry | undefined {
  return RESIDENCE_COUNTRIES.find((c) => c.code === code.toUpperCase());
}

export function countryLabel(code: string, lang: "en" | "id"): string {
  const entry = findCountry(code);
  if (!entry) return code.toUpperCase();
  return lang === "id" ? entry.nameId : entry.nameEn;
}

export function detectDefaultCountryCode(): string {
  if (typeof navigator === "undefined") return DEFAULT_COUNTRY_CODE;
  const locale = navigator.language?.toUpperCase() ?? "";
  if (locale.includes("ID")) return "ID";
  if (locale.includes("MY")) return "MY";
  if (locale.includes("SG")) return "SG";
  if (locale.includes("GB")) return "GB";
  if (locale.includes("AU")) return "AU";
  if (locale.includes("US") || locale.startsWith("EN")) return "US";
  const region = locale.split("-")[1];
  if (region && findCountry(region)) return region;
  return DEFAULT_COUNTRY_CODE;
}
