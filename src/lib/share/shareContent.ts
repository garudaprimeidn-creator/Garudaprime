export type ShareResult = "shared" | "copied" | "failed";

export async function shareText(
  text: string,
  options?: { title?: string; url?: string },
): Promise<ShareResult> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: options?.title,
        text,
        url: options?.url,
      });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "failed";
      }
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

export async function shareWalletAddress(
  address: string,
  message: string,
  title?: string,
): Promise<ShareResult> {
  return shareText(message, { title: title ?? "Garuda Prime Wallet" });
}
