import { type GarudaAiUserContext } from "./aiChatContext.js";

export type AiChatMessage = {
  role: "user" | "ai";
  text: string;
};

export type AiChatContext = GarudaAiUserContext;

const formatUsd = (value: number, lang: "id" | "en") =>
  new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const formatGat = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 4 });

const lastMessage = (messages: AiChatMessage[], role: "user" | "ai"): string => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === role) return messages[i].text.trim();
  }
  return "";
};

const isAcknowledgment = (text: string): boolean =>
  /^(siap|ok(?:e)?|ya|yes|thanks|terima kasih|makasih|baik|noted|lanjut|continue|mantap|sip)\.?$/i.test(text.trim());

const isFollowUpQuestion = (text: string): boolean =>
  /bagaimana|gimana|caranya|how do|how to|maksudnya|jelaskan|explain|contoh|example|langkah|step|detail|lebih lanjut|more detail/i.test(text);

type ConversationTopic =
  | "zakat"
  | "invest"
  | "merchant"
  | "market"
  | "gat"
  | "wallet"
  | "kyc"
  | "qr"
  | "pay"
  | "send"
  | "swap"
  | "staking"
  | "referral"
  | "syariah"
  | "governance"
  | "security"
  | "tx"
  | "troubleshoot"
  | "balance"
  | "advantages"
  | "web3"
  | "banking"
  | "general";

const topicFromText = (text: string): ConversationTopic | null => {
  const lower = text.toLowerCase();
  if (lower.includes("zakat")) return "zakat";
  if (
    lower.includes("diversif")
    || lower.includes("mudharabah")
    || lower.includes("musyarakah")
    || lower.includes("invest")
    || lower.includes("portofolio")
    || lower.includes("portfolio")
  ) return "invest";
  if (lower.includes("staking") || lower.includes("stake")) return "staking";
  if (lower.includes("merchant") || lower.includes("toko") || lower.includes("jual") || lower.includes("penjual")) return "merchant";
  if (lower.includes("market") || lower.includes("checkout") || lower.includes("produk")) return "market";
  if (
    lower.includes("qr tidak")
    || lower.includes("qr kosong")
    || lower.includes("tidak dikenali")
    || lower.includes("not recognized")
    || lower.includes("blank qr")
    || lower.includes("gagal scan")
    || lower.includes("scan error")
  ) return "troubleshoot";
  if (lower.includes("qr") || lower.includes("scan") || lower.includes("barcode")) return "qr";
  if (lower.includes("bayar") || lower.includes("payment") || /\bpay\b/.test(lower)) return "pay";
  if (lower.includes("kirim") || lower.includes("send") || lower.includes("transfer")) return "send";
  if (lower.includes("swap") || lower.includes("tukar")) return "swap";
  if (lower.includes("dompet") || lower.includes("wallet") || lower.includes("sidra")) return "wallet";
  if (
    lower.includes("saldo")
    || lower.includes("balance")
    || lower.includes("cek gat")
    || lower.includes("check gat")
  ) return "balance";
  if (lower.includes("kyc") || lower.includes("verifikasi") || lower.includes("verification")) return "kyc";
  if (lower.includes("referral") || lower.includes("ajak") || lower.includes("invite")) return "referral";
  if (lower.includes("governance") || lower.includes("dao") || lower.includes("vote")) return "governance";
  if (
    lower.includes("keamanan")
    || lower.includes("security")
    || lower.includes("2fa")
    || lower.includes("password")
    || lower.includes("phishing")
  ) return "security";
  if (
    lower.includes("riwayat")
    || lower.includes("transaksi")
    || lower.includes("history")
    || lower.includes("transaction")
    || lower.includes("txhash")
    || lower.includes("tx hash")
  ) return "tx";
  if (
    lower.includes("kelebihan")
    || lower.includes("mengapa pilih")
    || lower.includes("why choose")
    || lower.includes("advantage")
    || lower.includes("fitur garuda")
    || lower.includes("garuda prime edge")
  ) return "advantages";
  if (
    lower.includes("web3")
    || lower.includes("on-chain")
    || lower.includes("onchain")
    || lower.includes("blockchain")
    || lower.includes("garuda chain")
    || lower.includes("sidra network")
    || lower.includes("transparan")
  ) return "web3";
  if (
    lower.includes("perbankan syariah")
    || lower.includes("bank syariah")
    || lower.includes("syariah banking")
    || lower.includes("prinsip perbankan")
  ) return "banking";
  if (lower.includes("syariah") || lower.includes("halal") || lower.includes("riba") || lower.includes("bunga")) return "syariah";
  if (lower.includes("gat")) return "gat";
  if (/^(halo|hai|hi|hello|help|bantuan|asalam|assalam)/i.test(lower.trim())) return "general";
  return null;
};

const topicFromAiReply = (text: string): ConversationTopic | null => topicFromText(text);

const replyMenu = (lang: "id" | "en"): string =>
  lang === "id"
    ? "Saya bisa bantu: keuangan Islam & perbankan Syariah, Web3 halal, fitur Garuda Prime, investasi & Zakat, dompet GAT on-chain, merchant/QR, dan troubleshooting. Topik mana yang ingin Anda dalami?"
    : "I can help with: Islamic finance & Syariah banking, halal Web3, Garuda Prime features, investing & Zakat, on-chain GAT wallet, merchant/QR, and troubleshooting. Which topic would you like?";

const balanceSnapshot = (ctx: AiChatContext, lang: "id" | "en"): string => {
  const gat = typeof ctx.gatBalance === "number" ? ctx.gatBalance : 0;
  const onChain = typeof ctx.onChainGat === "number" ? ctx.onChainGat : gat;
  const portfolio = typeof ctx.portfolioUsd === "number" ? ctx.portfolioUsd : 0;
  if (lang === "id") {
    const parts = [
      `Saldo GAT spendable: ${formatGat(gat)} GAT`,
      onChain !== gat ? `On-chain GAT: ${formatGat(onChain)} GAT` : null,
      portfolio > 0 ? `Estimasi portofolio: ${formatUsd(portfolio, "id")}` : null,
      ctx.kycVerified ? "KYC: terverifikasi ✓" : "KYC: belum terverifikasi, verifikasi di Profil",
    ].filter(Boolean);
    return parts.join("\n");
  }
  const parts = [
    `Spendable GAT: ${formatGat(gat)} GAT`,
    onChain !== gat ? `On-chain GAT: ${formatGat(onChain)} GAT` : null,
    portfolio > 0 ? `Portfolio estimate: ${formatUsd(portfolio, "en")}` : null,
    ctx.kycVerified ? "KYC: verified ✓" : "KYC: not verified, verify in Profile",
  ].filter(Boolean);
  return parts.join("\n");
};

const replyInvestHowTo = (lang: "id" | "en", portfolioLabel: string): string =>
  lang === "id"
    ? `Langkah diversifikasi halal di Garuda Prime:\n\n1. Tab Invest, telusuri dana Musyarakah/Mudharabah.\n2. Alokasi, mulai 10-20% portofolio (${portfolioLabel}) ke satu dana; hindari all-in.\n3. Likuiditas GAT, sisakan GAT di Dompet untuk bayar merchant, Market, dan Zakat.\n4. KYC Tier 3, wajib sebelum investasi penuh.\n5. Pantau, cek performa mingguan di Invest & Merchant Center.\n\nIngin detail tentang satu dana atau perhitungan Zakat?`
    : `Halal diversification on Garuda Prime:\n\n1. Invest tab, browse Musyarakah/Mudarabah funds.\n2. Allocation, start 10-20% of portfolio (${portfolioLabel}) in one fund; avoid all-in.\n3. GAT liquidity, keep GAT in Wallet for merchant pay, Market, and Zakat.\n4. KYC Tier 3, required before full investing.\n5. Monitor, review weekly in Invest & Merchant Center.\n\nWant fund details or Zakat calculation?`;

const replyZakatHowTo = (lang: "id" | "en", portfolioLabel: string, zakatLabel: string): string =>
  lang === "id"
    ? `Cara bayar Zakat via Garuda Prime:\n\n1. Pastikan aset memenuhi nisab selama satu tahun hijriah.\n2. Estimasi (${portfolioLabel}): ~${zakatLabel} (2,5%).\n3. Komunitas → Zakat.\n4. Pilih nominal GAT on-chain & konfirmasi.\n5. Simpan bukti transaksi.\n\nPerlu penjelasan nisab atau aset wajib zakat?`
    : `Pay Zakat via Garuda Prime:\n\n1. Ensure nisab for one lunar year.\n2. Estimate (${portfolioLabel}): ~${zakatLabel} (2.5%).\n3. Community → Zakat.\n4. Choose on-chain GAT & confirm.\n5. Keep the receipt.\n\nNeed nisab or zakatable asset details?`;

const replyPayHowTo = (lang: "id" | "en", kycOk: boolean): string =>
  lang === "id"
    ? `Cara bayar merchant via QR:\n\n1. ${kycOk ? "KYC sudah OK ✓" : "Selesaikan KYC Tier 3 di Profil terlebih dahulu."}\n2. Dompet → Bayar → Pindai QR merchant.\n3. Pastikan saldo GAT on-chain cukup.\n4. Konfirmasi nominal & biaya jaringan.\n5. Simpan tx hash di riwayat transaksi.\n\nQR harus dari Merchant Center penjual (format sidra:pay / garuda:pay).`
    : `Pay a merchant via QR:\n\n1. ${kycOk ? "KYC verified ✓" : "Complete KYC Tier 3 in Profile first."}\n2. Wallet → Pay → Scan merchant QR.\n3. Ensure enough on-chain GAT.\n4. Confirm amount & network fee.\n5. Save tx hash in transaction history.\n\nQR must be from seller's Merchant Center (sidra:pay / garuda:pay).`;

const replyByTopic = (
  topic: ConversationTopic,
  lang: "id" | "en",
  portfolioLabel: string,
  zakatLabel: string,
  portfolio: number,
  ctx: AiChatContext,
): string => {
  const kycOk = Boolean(ctx.kycVerified);
  const gat = typeof ctx.gatBalance === "number" ? ctx.gatBalance : 0;

  switch (topic) {
    case "balance":
      return lang === "id"
        ? `Ringkasan saldo Anda:\n\n${balanceSnapshot(ctx, "id")}\n\nSaldo spendable = GAT on-chain + ledger penjual (Merchant Center). Untuk refresh, buka Dompet → Muat ulang saldo.`
        : `Your balance summary:\n\n${balanceSnapshot(ctx, "en")}\n\nSpendable = on-chain GAT + seller ledger (Merchant Center). Refresh via Wallet → Reload balance.`;
    case "zakat":
      return lang === "id"
        ? `Zakat wajib 2,5% dari aset eligible nisab setelah satu tahun hijriah. Estimasi portofolio ${portfolioLabel}: ~${zakatLabel}. Bayar via Komunitas → Zakat dengan GAT on-chain.${gat > 0 ? ` Saldo GAT Anda ${formatGat(gat)}, pastikan cukup setelah zakat.` : ""} Ingin langkah detail?`
        : `Zakat is 2.5% of nisab-eligible assets after one lunar year. Portfolio ${portfolioLabel}: ~${zakatLabel}. Pay via Community → Zakat with on-chain GAT.${gat > 0 ? ` Your GAT balance is ${formatGat(gat)}.` : ""} Want step-by-step?`;
    case "invest":
      return lang === "id"
        ? `Investasi Syariah: Mudharabah/Musyarakah, bagi hasil tanpa bunga tetap. Tab Invest → dana halal, staking GAT.${portfolio > 0 ? ` Portofolio ${portfolioLabel}, alokasi bertahap 10-20%.` : " Hubungkan dompet untuk rekomendasi personal."} Ingin langkah diversifikasi?`
        : `Syariah investing: Mudarabah/Musharakah profit-sharing, no fixed interest. Invest tab → halal funds, GAT staking.${portfolio > 0 ? ` Portfolio ${portfolioLabel}, allocate 10-20% gradually.` : " Connect wallet for personalized tips."} Want diversification steps?`;
    case "merchant":
      return lang === "id"
        ? "Merchant Center (Tools): ID unik GP-USR-* per pemilik. QR on-chain untuk terima bayar; upload produk ke Market; Saldo Onchain = GAT on-chain + kredit penjualan. Perlu bantuan QR atau settlement?"
        : "Merchant Center (Tools): unique GP-USR-* ID per owner. On-chain QR to receive pay; upload products to Market; On-chain balance = GAT + sales credits. Need QR or settlement help?";
    case "market":
      return lang === "id"
        ? "Checkout Market memakai GAT on-chain Sidra Network. Pembayaran masuk ke ID merchant penjual. Pastikan dompet terhubung, KYC Tier 3, dan saldo GAT cukup."
        : "Market checkout uses on-chain GAT on Sidra Network. Payments credit each seller's merchant ID. Connect wallet, complete KYC Tier 3, and ensure enough GAT.";
    case "qr":
      return lang === "id"
        ? "Terima bayar: Merchant Center → QR on-chain (sidra:pay / garuda:pay). Bayar: Dompet → Bayar → scan QR. Gunakan QR terbaru; ID merchant harus cocok dengan payload QR."
        : "Receive: Merchant Center → on-chain QR (sidra:pay / garuda:pay). Pay: Wallet → Pay → scan QR. Use the latest QR; merchant ID must match the payload.";
    case "pay":
      return replyPayHowTo(lang, kycOk);
    case "send":
      return lang === "id"
        ? `Kirim GAT: Dompet → Kirim → alamat tujuan + nominal.${kycOk ? "" : " KYC Tier 3 wajib sebelum kirim."} Cek gas Sidra & saldo ${formatGat(gat)} GAT. Konfirmasi tx hash setelah broadcast.`
        : `Send GAT: Wallet → Send → destination + amount.${kycOk ? "" : " KYC Tier 3 required before send."} Check Sidra gas & balance ${formatGat(gat)} GAT. Confirm tx hash after broadcast.`;
    case "swap":
      return lang === "id"
        ? `Swap token: Dompet → Swap.${kycOk ? "" : " Verifikasi KYC dulu."} Tukar GAT/SDA/ETH sesuai likuiditas Sidra. Review slippage & fee sebelum konfirmasi.`
        : `Swap tokens: Wallet → Swap.${kycOk ? "" : " Verify KYC first."} Exchange GAT/SDA/ETH per Sidra liquidity. Review slippage & fees before confirming.`;
    case "wallet":
      return lang === "id"
        ? `Dompet Garuda di Sidra Network.${ctx.walletConnected ? " Dompet terhubung ✓" : " Hubungkan dompet di tab Dompet."} GAT on-chain untuk bayar, Market, kirim, swap, Zakat. ${gat > 0 ? `Saldo spendable: ${formatGat(gat)} GAT.` : ""}`
        : `Garuda Wallet on Sidra Network.${ctx.walletConnected ? " Wallet connected ✓" : " Connect wallet in Wallet tab."} On-chain GAT for pay, Market, send, swap, Zakat. ${gat > 0 ? `Spendable: ${formatGat(gat)} GAT.` : ""}`;
    case "kyc":
      return lang === "id"
        ? `Status KYC: ${kycOk ? "Terverifikasi Tier 3 ✓, kirim, bayar, swap, invest aktif." : (ctx.kycStatus ? `Status: ${ctx.kycStatus}.` : "Belum terverifikasi.")} Profil → Verifikasi KYC, unggah identitas & selfie liveness.`
        : `KYC status: ${kycOk ? "Tier 3 verified ✓, send, pay, swap, invest unlocked." : (ctx.kycStatus ? `Status: ${ctx.kycStatus}.` : "Not verified yet.")} Profile → KYC Verification, upload ID & liveness selfie.`;
    case "staking":
      return lang === "id"
        ? "Staking GAT & SDA di tab Invest. GAT staking pakai saldo on-chain; imbal hasil prinsip bagi hasil Syariah. Cek APR & lock period sebelum commit."
        : "GAT & SDA staking in Invest tab. GAT staking uses on-chain balance; Syariah profit-sharing returns. Review APR & lock period before committing.";
    case "referral":
      return lang === "id"
        ? `Program referral: 25 GAT per undangan sukses (KYC Tier 3). Bonus tier +50 @5 dan +150 @10 referral. Reward otomatis via Pay Hub; setelah launch token dapat dialirkan dari GATProtocolTreasury (Sidra) bila SC payout aktif.${ctx.referralCode ? ` Kode Anda: ${ctx.referralCode}.` : ""} Komunitas → Referral untuk link & statistik.`
        : `Referral program: 25 GAT per successful invite (KYC Tier 3). Tier bonuses +50 @5 and +150 @10 referrals. Auto payout via Pay Hub; after token launch can route from GATProtocolTreasury on Sidra when SC payout is enabled.${ctx.referralCode ? ` Your code: ${ctx.referralCode}.` : ""} Community → Referral for link & stats.`;
    case "governance":
      return lang === "id"
        ? "Governance DAO Garuda Prime: voting proposal ekosistem via tab Tools → Governance. Token GAT dapat dipakai untuk suara sesuai aturan proposal aktif."
        : "Garuda Prime Governance DAO: vote on ecosystem proposals via Tools → Governance. GAT may be used for voting per active proposal rules.";
    case "security":
      return lang === "id"
        ? "Keamanan: Profil → Pengaturan Keamanan, aktifkan 2FA, biometrik, kelola sesi. Jangan bagikan seed phrase. Verifikasi alamat dompet sebelum kirim GAT besar."
        : "Security: Profile → Security Settings, enable 2FA, biometrics, manage sessions. Never share seed phrase. Verify wallet addresses before large GAT sends.";
    case "tx":
      return lang === "id"
        ? "Riwayat transaksi: Tools → Riwayat Transaksi atau feed aktivitas di Dompet. Filter tipe (bayar/kirim/swap). Tx hash bisa disalin untuk cek di explorer Sidra."
        : "Transaction history: Tools → Transaction History or activity feed in Wallet. Filter by type (pay/send/swap). Copy tx hash to verify on Sidra explorer.";
    case "troubleshoot":
      return lang === "id"
        ? `Troubleshooting QR & transaksi:\n\n1. QR kosong, Merchant Center → Muat ulang QR merchant.\n2. "QR tidak dikenali", pastikan format sidra:pay/garuda:pay & scan ulang.\n3. Saldo tidak cocok, refresh Dompet; Merchant Center pakai Saldo Onchain (GAT + ledger).\n4. Bayar gagal, cek KYC, saldo GAT, & koneksi Sidra.\n5. Tx tanpa hash, tunggu konfirmasi jaringan lalu refresh riwayat.`
        : `QR & transaction troubleshooting:\n\n1. Blank QR, Merchant Center → Reload merchant QR.\n2. "QR not recognized", ensure sidra:pay/garuda:pay format & rescan.\n3. Balance mismatch, refresh Wallet; Merchant Center uses on-chain GAT + ledger.\n4. Pay failed, check KYC, GAT balance, & Sidra connection.\n5. Missing tx hash, wait for network confirmation then refresh history.`;
    case "syariah":
      return lang === "id"
        ? "Garuda Prime patuh Syariah: no riba, transaksi transparan on-chain, Mudharabah/Musyarakah, Zakat terintegrasi. Riba = bunga/imbalan tetap tanpa bagi hasil nyata, dihindari total."
        : "Garuda Prime is Syariah-compliant: no riba, transparent on-chain transactions, Mudarabah/Musharakah, integrated Zakat. Riba = fixed interest without real profit-sharing, fully avoided.";
    case "banking":
      return lang === "id"
        ? "Prinsip perbankan Syariah di Garuda Prime:\n\n1. Bagi hasil (Mudharabah/Musyarakah), bukan bunga tetap.\n2. Transaksi nyata & transparan on-chain Sidra.\n3. No gharar berlebihan, fee & kontrak jelas.\n4. Zakat & aset halal terintegrasi.\n5. KYC Tier 3 untuk perlindungan nasabah.\n\nIngin detail kontrak investasi atau perbedaan dengan bank konvensional?"
        : "Syariah banking principles on Garuda Prime:\n\n1. Profit-sharing (Mudarabah/Musharakah), not fixed interest.\n2. Real & transparent on-chain Sidra transactions.\n3. No excessive gharar, clear fees & contracts.\n4. Integrated Zakat & halal assets.\n5. KYC Tier 3 for customer protection.\n\nWant investment contract details or comparison with conventional banking?";
    case "web3":
      return lang === "id"
        ? "Web3 Syariah di Garuda Prime:\n\n• GAT, token utilitas di Sidra Network.\n• Dompet non-kustodial, saldo on-chain transparan.\n• Bayar merchant & Market via QR on-chain.\n• Garuda Chain, L2 Syariah untuk transaksi cepat & governance.\n• Tidak ada produk riba/bunga tetap.\n\nIngin penjelasan GAT, Sidra, atau Garuda Chain?"
        : "Syariah Web3 on Garuda Prime:\n\n• GAT, utility token on Sidra Network.\n• Non-custodial wallet, transparent on-chain balance.\n• Pay merchants & Market via on-chain QR.\n• Garuda Chain, Syariah L2 for fast transactions & governance.\n• No riba/fixed-interest products.\n\nWant details on GAT, Sidra, or Garuda Chain?";
    case "advantages":
      return lang === "id"
        ? "Kelebihan Garuda Prime:\n\n1. Fintech Islam end-to-end, dompet, invest halal, Zakat, Market & merchant.\n2. Settlement GAT on-chain Sidra, transparan & auditable.\n3. Merchant Center + QR bayar, UMKM halal digital.\n4. KYCPORT Syariah Tier 3, keamanan transaksi.\n5. Komunitas, referral, & Governance DAO.\n6. Dua bahasa (ID/EN) & Garuda AI assistant.\n\nFitur mana yang ingin Anda eksplorasi dulu?"
        : "Garuda Prime advantages:\n\n1. End-to-end Islamic fintech, wallet, halal invest, Zakat, Market & merchant.\n2. On-chain GAT settlement on Sidra, transparent & auditable.\n3. Merchant Center + pay QR, digital halal SMEs.\n4. Syariah KYCPORT Tier 3, transaction security.\n5. Community, referral, & Governance DAO.\n6. Bilingual (ID/EN) & Garuda AI assistant.\n\nWhich feature would you like to explore first?";
    case "gat":
      return lang === "id"
        ? `GAT = token utilitas Garuda Prime di Sidra Network. Dipakai bayar merchant, Market, Zakat, invest, staking.${gat > 0 ? ` Saldo Anda: ${formatGat(gat)} GAT spendable.` : " Hubungkan dompet untuk lihat saldo."}`
        : `GAT = Garuda Prime utility token on Sidra Network. Used for merchant pay, Market, Zakat, invest, staking.${gat > 0 ? ` Your balance: ${formatGat(gat)} GAT spendable.` : " Connect wallet to see balance."}`;
    case "general":
      return lang === "id"
        ? `Wa alaykumussalam! Saya Garuda AI, asisten keuangan Islam Garuda Prime.${ctx.displayName?.trim() ? ` Halo, ${ctx.displayName.trim()}!` : ""} ${replyMenu("id")}`
        : `Hello! I'm Garuda AI, your Islamic finance assistant on Garuda Prime.${ctx.displayName?.trim() ? ` Hi, ${ctx.displayName.trim()}!` : ""} ${replyMenu("en")}`;
    default:
      return replyMenu(lang);
  }
};

export const buildRuleBasedAiReply = (
  messages: AiChatMessage[],
  ctx: AiChatContext,
): string => {
  const lang = ctx.lang === "en" ? "en" : "id";
  const text = lastMessage(messages, "user");
  const prevAi = lastMessage(messages, "ai");
  const portfolio = typeof ctx.portfolioUsd === "number" ? ctx.portfolioUsd : 0;
  const portfolioLabel = formatUsd(portfolio, lang);
  const zakatLabel = formatUsd(portfolio * 0.025, lang);

  const topic = topicFromText(text);
  const prevTopic = topicFromAiReply(prevAi);

  if (isAcknowledgment(text)) {
    return lang === "id"
      ? "Baik! Pilih topik: saldo GAT, diversifikasi halal, Zakat, bayar QR, merchant, Market, KYC, atau troubleshooting. Ketik pertanyaan atau gunakan chip saran."
      : "Got it! Pick a topic: GAT balance, halal diversification, Zakat, QR pay, merchant, Market, KYC, or troubleshooting. Type a question or use a suggestion chip.";
  }

  if (isFollowUpQuestion(text) && prevTopic) {
    if (prevTopic === "invest" || prevAi.toLowerCase().includes("diversif")) {
      return replyInvestHowTo(lang, portfolioLabel);
    }
    if (prevTopic === "zakat" || prevAi.toLowerCase().includes("zakat")) {
      return replyZakatHowTo(lang, portfolioLabel, zakatLabel);
    }
    if (prevTopic === "merchant") {
      return lang === "id"
        ? "Langkah merchant:\n1. Tools → Merchant Center.\n2. Catat ID GP-USR-* & bagikan QR on-chain.\n3. Upload Produk → publikasikan ke Market.\n4. Pantau Saldo Onchain & penjualan.\n5. Pelanggan bayar via Dompet → Bayar → scan QR."
        : "Merchant steps:\n1. Tools → Merchant Center.\n2. Note GP-USR-* ID & share on-chain QR.\n3. Upload Product → publish to Market.\n4. Track on-chain balance & sales.\n5. Customers pay via Wallet → Pay → scan QR.";
    }
    if (prevTopic === "pay" || prevTopic === "qr") {
      return replyPayHowTo(lang, Boolean(ctx.kycVerified));
    }
    if (prevTopic === "troubleshoot") {
      return replyByTopic("troubleshoot", lang, portfolioLabel, zakatLabel, portfolio, ctx);
    }
    return replyByTopic(prevTopic, lang, portfolioLabel, zakatLabel, portfolio, ctx);
  }

  if (topic) {
    return replyByTopic(topic, lang, portfolioLabel, zakatLabel, portfolio, ctx);
  }

  if (!ctx.walletConnected) {
    return lang === "id"
      ? `Dompet belum terhubung. Buka tab Dompet → Hubungkan wallet Sidra agar saldo GAT on-chain terbaca. Setelah itu saya bisa bantu Zakat, diversifikasi, dan strategi merchant. ${replyMenu("id")}`
      : `Wallet not connected. Open Wallet tab → Connect Sidra wallet so on-chain GAT appears. Then I can help with Zakat, diversification, and merchant strategy. ${replyMenu("en")}`;
  }

  if (portfolio <= 0 && (typeof ctx.gatBalance !== "number" || ctx.gatBalance <= 0)) {
    return lang === "id"
      ? `Saldo belum terdeteksi. Pastikan dompet Sidra terhubung & muat ulang saldo di Dompet. ${replyMenu("id")}`
      : `Balance not detected. Ensure Sidra wallet is connected & reload balance in Wallet. ${replyMenu("en")}`;
  }

  return lang === "id"
    ? `Ringkasan:\n${balanceSnapshot(ctx, "id")}\n\nSaran: diversifikasi bertahap ke produk halal di Invest sambil jaga likuiditas GAT untuk bayar & Market. ${replyMenu("id")}`
    : `Summary:\n${balanceSnapshot(ctx, "en")}\n\nTip: gradual halal diversification in Invest while keeping GAT liquidity for pay & Market. ${replyMenu("en")}`;
};

/** @deprecated Use messages array overload */
export const buildRuleBasedAiReplyFromText = (
  text: string,
  ctx: AiChatContext,
): string => buildRuleBasedAiReply([{ role: "user", text }], ctx);

export const buildInitialAiGreeting = (
  ctx: AiChatContext,
  templates: { greeting: string; greetingNamed: string },
): string => {
  const lang = ctx.lang === "en" ? "en" : "id";
  const name = ctx.displayName?.trim();
  let base = name
    ? templates.greetingNamed.replace("{name}", name)
    : templates.greeting;

  const gat = typeof ctx.gatBalance === "number" ? ctx.gatBalance : 0;
  if (gat > 0) {
    const extra = lang === "id"
      ? `\n\nSaldo GAT spendable Anda saat ini: ${formatGat(gat)} GAT.`
      : `\n\nYour current spendable GAT balance: ${formatGat(gat)} GAT.`;
    base += extra;
  } else if (!ctx.walletConnected) {
    const extra = lang === "id"
      ? "\n\nHubungkan dompet Sidra di tab Dompet agar saya bisa memberi saran berdasarkan saldo Anda."
      : "\n\nConnect your Sidra wallet in the Wallet tab so I can personalize advice based on your balance.";
    base += extra;
  }
  return base;
};
