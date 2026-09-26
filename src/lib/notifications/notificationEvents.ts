import type { NotifAction, NotifType } from "./notificationService";
import { isGenericInboundLabel } from "../user/inboundTransferResolver";

export type NotifLocale = "id" | "en";

export type NotificationInput = {
  type: NotifType;
  title: string;
  body: string;
  action?: NotifAction;
};

const L = (locale: NotifLocale, id: string, en: string) => (locale === "id" ? id : en);

export const notificationEvents = {
  walletDepositSuccess: (amountGat: number, locale: NotifLocale = "id"): NotificationInput => ({
    type: "wallet",
    title: L(locale, "Deposit Berhasil", "Deposit Successful"),
    body: L(locale, `${amountGat.toLocaleString()} GAT masuk Pay Hub.`, `${amountGat.toLocaleString()} GAT credited to Pay Hub.`),
    action: { type: "screen", screen: "wallet" },
  }),

  walletWithdrawSuccess: (amountGat: number, locale: NotifLocale = "id"): NotificationInput => ({
    type: "wallet",
    title: L(locale, "Withdraw Berhasil", "Withdraw Successful"),
    body: L(locale, `${amountGat.toLocaleString()} GAT dikirim ke dompet Anda.`, `${amountGat.toLocaleString()} GAT sent to your wallet.`),
    action: { type: "screen", screen: "wallet" },
  }),

  walletWithdrawPending: (amountGat: number, locale: NotifLocale = "id"): NotificationInput => ({
    type: "wallet",
    title: L(locale, "Withdraw Diproses", "Withdraw Pending"),
    body: L(locale, `Penarikan ${amountGat.toLocaleString()} GAT sedang diproses.`, `Withdrawal of ${amountGat.toLocaleString()} GAT is processing.`),
    action: { type: "screen", screen: "wallet" },
  }),

  walletWithdrawRejected: (locale: NotifLocale = "id"): NotificationInput => ({
    type: "wallet",
    title: L(locale, "Withdraw Ditolak", "Withdraw Rejected"),
    body: L(locale, "Penarikan GAT tidak dapat diproses. Hubungi support jika perlu.", "GAT withdrawal could not be processed. Contact support if needed."),
    action: { type: "screen", screen: "wallet" },
  }),

  walletConnected: (addr: string, locale: NotifLocale = "id"): NotificationInput => ({
    type: "wallet",
    title: L(locale, "Dompet Terhubung", "Wallet Connected"),
    body: L(locale, `Dompet ${addr.slice(0, 6)}…${addr.slice(-4)} aktif di Sidra Mainnet.`, `Wallet ${addr.slice(0, 6)}…${addr.slice(-4)} connected on Sidra Mainnet.`),
    action: { type: "screen", screen: "wallet" },
  }),

  walletDisconnected: (locale: NotifLocale = "id"): NotificationInput => ({
    type: "wallet",
    title: L(locale, "Dompet Terputus", "Wallet Disconnected"),
    body: L(locale, "Sesi dompet Web3 berakhir.", "Web3 wallet session ended."),
    action: { type: "screen", screen: "wallet" },
  }),

  walletBalanceUpdate: (symbol: string, locale: NotifLocale = "id"): NotificationInput => ({
    type: "wallet",
    title: L(locale, "Saldo Diperbarui", "Balance Updated"),
    body: L(locale, `Saldo ${symbol} di dompet telah diperbarui.`, `Your ${symbol} wallet balance has been updated.`),
    action: { type: "screen", screen: "wallet" },
  }),

  walletSendSuccess: (amount: string, locale: NotifLocale = "id"): NotificationInput => ({
    type: "wallet",
    title: L(locale, "Transfer Berhasil", "Transfer Successful"),
    body: L(locale, `Pengiriman ${amount} berhasil.`, `Sent ${amount} successfully.`),
    action: { type: "screen", screen: "wallet" },
  }),

  walletPaySuccess: (amount: string, locale: NotifLocale = "id"): NotificationInput => ({
    type: "wallet",
    title: L(locale, "Pembayaran Berhasil", "Payment Successful"),
    body: L(locale, `Pembayaran ${amount} dikonfirmasi.`, `Payment of ${amount} confirmed.`),
    action: { type: "screen", screen: "wallet" },
  }),

  walletTransactionPending: (
    txType: string,
    amount: string,
    txId: number,
    locale: NotifLocale = "id",
  ): NotificationInput => {
    const labels: Record<string, [string, string]> = {
      send: ["Pengiriman Diproses", "Send Pending"],
      swap: ["Swap Diproses", "Swap Pending"],
      deposit: ["Deposit Diproses", "Deposit Pending"],
      pay: ["Pembayaran Diproses", "Payment Pending"],
      receive: ["Penerimaan Diproses", "Receive Pending"],
    };
    const [idTitle, enTitle] = labels[txType.toLowerCase()] ?? ["Transaksi Diproses", "Transaction Pending"];
    return {
      type: "wallet",
      title: L(locale, idTitle, enTitle),
      body: L(
        locale,
        `${amount} menunggu konfirmasi dompet.`,
        `${amount} awaiting wallet confirmation.`,
      ),
      action: { type: "transaction", txId },
    };
  },

  walletReceiveInbound: (amount: string, locale: NotifLocale = "id"): NotificationInput => ({
    type: "receive",
    title: L(locale, "Dana Diterima", "Funds Received"),
    body: L(locale, `${amount} masuk ke dompet Anda.`, `${amount} received in your wallet.`),
    action: { type: "screen", screen: "wallet" },
  }),

  referralBonus: (amountGat: number, locale: NotifLocale = "id"): NotificationInput => ({
    type: "referral",
    title: L(locale, "Bonus Referral", "Referral Bonus"),
    body: L(locale, `+${amountGat.toLocaleString()} GAT masuk Pay Hub dari program referral.`, `+${amountGat.toLocaleString()} GAT referral reward credited to Pay Hub.`),
    action: { type: "screen", screen: "community" },
  }),

  referralJoined: (locale: NotifLocale = "id"): NotificationInput => ({
    type: "referral",
    title: L(locale, "Referral Baru", "New Referral"),
    body: L(locale, "Pengguna baru bergabung melalui kode referral Anda.", "A new user joined via your referral code."),
    action: { type: "screen", screen: "community" },
  }),

  referralVerified: (locale: NotifLocale = "id"): NotificationInput => ({
    type: "referral",
    title: L(locale, "Referral Terverifikasi", "Referral Verified"),
    body: L(locale, "Referral menyelesaikan KYC · bonus tier aktif.", "Referral completed KYC · tier bonus unlocked."),
    action: { type: "screen", screen: "community" },
  }),

  governanceProposal: (title: string, locale: NotifLocale = "id"): NotificationInput => ({
    type: "governance",
    title: L(locale, "Proposal Baru", "New Proposal"),
    body: title,
    action: { type: "overlay", overlay: "profile" },
  }),

  governanceVoteRecorded: (locale: NotifLocale = "id"): NotificationInput => ({
    type: "governance",
    title: L(locale, "Vote Tercatat", "Vote Recorded"),
    body: L(locale, "Suara Anda tercatat di governance Garuda Prime.", "Your vote has been recorded in Garuda Prime governance."),
    action: { type: "overlay", overlay: "profile" },
  }),

  systemBroadcast: (title: string, body: string): NotificationInput => ({
    type: "system",
    title,
    body,
  }),

  systemSecurity: (body: string, locale: NotifLocale = "id"): NotificationInput => ({
    type: "system",
    title: L(locale, "Peringatan Keamanan", "Security Alert"),
    body,
  }),

  kycSubmitted: (locale: NotifLocale = "id"): NotificationInput => ({
    type: "kyc",
    title: L(locale, "KYC Dikirim", "KYC Submitted"),
    body: L(
      locale,
      "Dokumen berhasil dikirim. Tim verifikasi akan meninjau dalam 1-2 hari kerja. Hasil akan muncul di notifikasi ini.",
      "Documents submitted. Our team will review within 1-2 business days. Results will appear here.",
    ),
    action: { type: "profileSection", section: "kyc" },
  }),

  kycPendingReview: (locale: NotifLocale = "id"): NotificationInput => ({
    type: "kyc",
    title: L(locale, "KYC Dalam Peninjauan", "KYC Under Review"),
    body: L(
      locale,
      "Dokumen identitas Anda sedang ditinjau tim verifikasi Garuda Prime. Estimasi 1-2 hari kerja. Kami akan memberitahu hasilnya melalui notifikasi.",
      "Your identity documents are being reviewed. Estimated 1-2 business days. We will notify you of the outcome here.",
    ),
    action: { type: "profileSection", section: "kyc" },
  }),

  kycApproved: (tier = 3, locale: NotifLocale = "id"): NotificationInput => ({
    type: "kyc",
    title: L(locale, "KYC Disetujui", "KYC Approved"),
    body: L(
      locale,
      `Verifikasi identitas disetujui. Tier ${tier} aktif · kirim, bayar, swap, Market, dan fitur premium tersedia.`,
      `Identity verification approved. Tier ${tier} active · send, pay, swap, Market, and premium features unlocked.`,
    ),
    action: { type: "profileSection", section: "kyc" },
  }),

  kycRejected: (reason?: string | null, locale: NotifLocale = "id"): NotificationInput => {
    const reasonText = reason?.trim();
    const defaultBody = L(
      locale,
      "Verifikasi ditolak. Perbarui dokumen sesuai petunjuk lalu kirim ulang dari Profil → Verifikasi KYC.",
      "Verification rejected. Update your documents and resubmit from Profile → KYC Verification.",
    );
    const body = reasonText
      ? L(
          locale,
          `Verifikasi ditolak. Alasan: ${reasonText}. Perbarui dokumen lalu kirim ulang dari Profil → Verifikasi KYC.`,
          `Verification rejected. Reason: ${reasonText}. Update documents and resubmit from Profile → KYC Verification.`,
        )
      : defaultBody;
    return {
      type: "kyc",
      title: L(locale, "KYC Ditolak", "KYC Rejected"),
      body,
      action: { type: "profileSection", section: "kyc" },
    };
  },

  fromTransaction: (tx: { type: string; amount: string; status: string; id: number; addr?: string }, locale: NotifLocale = "id"): NotificationInput | null => {
    const kind = tx.type.toLowerCase();
    const counterparty = tx.addr?.trim();
    if (kind === "send") {
      return {
        ...notificationEvents.walletSendSuccess(tx.amount, locale),
        body: counterparty
          ? L(locale, `Pengiriman ${tx.amount} ke ${counterparty}.`, `Sent ${tx.amount} to ${counterparty}.`)
          : L(locale, `Pengiriman ${tx.amount} berhasil.`, `Sent ${tx.amount} successfully.`),
        action: { type: "transaction", txId: tx.id },
      };
    }
    if (kind === "pay") return { ...notificationEvents.walletPaySuccess(tx.amount, locale), action: { type: "transaction", txId: tx.id } };
    if (kind === "receive") {
      return {
        type: "receive",
        title: L(locale, "Dana Diterima", "Funds Received"),
        body: counterparty && !isGenericInboundLabel(counterparty)
          ? L(locale, `${tx.amount} diterima dari ${counterparty}.`, `Received ${tx.amount} from ${counterparty}.`)
          : L(locale, `${tx.amount} masuk ke dompet Anda.`, `${tx.amount} received in your wallet.`),
        action: { type: "transaction", txId: tx.id },
      };
    }
    if (kind === "swap") return {
      type: "wallet",
      title: L(locale, "Swap Berhasil", "Swap Successful"),
      body: L(locale, `Pertukaran ${tx.amount} selesai.`, `Swapped ${tx.amount}.`),
      action: { type: "transaction", txId: tx.id },
    };
    if (kind === "deposit") return { ...notificationEvents.walletDepositSuccess(Math.abs(parseFloat(tx.amount) || 0), locale), action: { type: "transaction", txId: tx.id } };
    if (kind === "withdraw") {
      const amt = Math.abs(parseFloat(tx.amount) || 0);
      if (tx.status.toLowerCase().includes("pending")) return { ...notificationEvents.walletWithdrawPending(amt, locale), action: { type: "transaction", txId: tx.id } };
      return { ...notificationEvents.walletWithdrawSuccess(amt, locale), action: { type: "transaction", txId: tx.id } };
    }
    return null;
  },
};
