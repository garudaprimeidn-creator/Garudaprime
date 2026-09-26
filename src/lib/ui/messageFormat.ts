/** Separator for informational copy (toast, notification, hint), not em dash. */
export const INFO_SEP = " · ";

export function infoJoin(...parts: string[]): string {
  return parts.filter(Boolean).join(INFO_SEP);
}
