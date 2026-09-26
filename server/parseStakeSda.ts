/** Parse stake amount, supports plain, US (10,000), and ID (10.000) formats. */
export function parseStakeSda(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw ?? "").trim().replace(/\s/g, "");
  if (!s) return 0;

  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    return Number(s.replace(/\./g, "")) || 0;
  }
  if (/^\d{1,3}(,\d{3})+$/.test(s)) {
    return Number(s.replace(/,/g, "")) || 0;
  }
  if (s.includes(",") && s.includes(".")) {
    return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (s.includes(",")) {
    return Number(s.replace(",", ".")) || 0;
  }
  return Number(s) || 0;
}
