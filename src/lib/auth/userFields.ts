export const pickText = (...values: (string | null | undefined)[]) => {
  for (const value of values) {
    if (value?.trim()) return value.trim();
  }
  return null;
};
