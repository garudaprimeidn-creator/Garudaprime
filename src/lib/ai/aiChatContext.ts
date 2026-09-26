/** Shared Garuda AI user snapshot, client + server. */
export type GarudaAiUserContext = {
  lang?: "id" | "en";
  displayName?: string;
  portfolioUsd?: number;
  gatBalance?: number;
  onChainGat?: number;
  walletConnected?: boolean;
  kycVerified?: boolean;
  kycStatus?: string;
  referralCode?: string;
  walletAddress?: string;
};

export const buildAiUserSnapshot = (ctx: GarudaAiUserContext, lang: "id" | "en"): string => {
  const lines: string[] = [];
  if (ctx.displayName?.trim()) lines.push(`Name: ${ctx.displayName.trim()}`);
  if (typeof ctx.portfolioUsd === "number" && ctx.portfolioUsd > 0) {
    lines.push(`Portfolio USD: ${ctx.portfolioUsd.toFixed(2)}`);
  }
  if (typeof ctx.gatBalance === "number") {
    lines.push(`Spendable GAT: ${ctx.gatBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}`);
  }
  if (typeof ctx.onChainGat === "number") {
    lines.push(`On-chain GAT: ${ctx.onChainGat.toLocaleString(undefined, { maximumFractionDigits: 4 })}`);
  }
  lines.push(`Wallet connected: ${ctx.walletConnected ? "yes" : "no"}`);
  lines.push(`KYC verified: ${ctx.kycVerified ? "yes" : "no"}`);
  if (ctx.kycStatus?.trim()) lines.push(`KYC status: ${ctx.kycStatus.trim()}`);
  if (ctx.referralCode?.trim()) lines.push(`Referral code: ${ctx.referralCode.trim()}`);
  if (ctx.walletAddress?.trim()) {
    const addr = ctx.walletAddress.trim();
    lines.push(`Wallet: ${addr.slice(0, 6)}…${addr.slice(-4)}`);
  }
  if (!lines.length) {
    return lang === "id"
      ? "Pengguna belum menghubungkan dompet, arahkan ke tab Dompet."
      : "User has not connected a wallet yet, guide to Wallet tab.";
  }
  return lines.join("\n");
};
