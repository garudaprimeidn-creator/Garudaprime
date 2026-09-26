/** Deep-merge translation objects, later keys override earlier. */
export function deepMerge<T extends Record<string, unknown>>(base: T, overlay: Partial<T>): T {
  const out = { ...base } as T;
  for (const key of Object.keys(overlay) as (keyof T)[]) {
    const baseVal = base[key];
    const overVal = overlay[key];
    if (
      overVal
      && typeof overVal === "object"
      && !Array.isArray(overVal)
      && baseVal
      && typeof baseVal === "object"
      && !Array.isArray(baseVal)
    ) {
      out[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      ) as T[keyof T];
    } else if (overVal !== undefined) {
      out[key] = overVal as T[keyof T];
    }
  }
  return out;
}
