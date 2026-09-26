import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  tokenToUsd, usdToToken, EMPTY_HOLDINGS, buildTokenRows, mergeOnChainHoldings, setTokenPricesUsd,
  portfolioTotalUsd, getTokenPriceUsd, type TokenRow,
} from "./tokenEconomy";
import { fetchWalletBalances, hasLiveBalances } from "../lib/web3/tokenBalances";
import {
  loadCustomTokens,
  refreshCustomTokenBalances,
  saveCustomTokens,
  fetchCustomTokenMeta,
  fetchCustomTokenBalance,
  type CustomTokenRecord,
} from "../lib/web3/customTokenService";
import { isAddress } from "viem";
import { showAppToast, type ToastType } from "./appToast";
import {
  PROFILE_EMAIL, PROFILE_NAME, PROFILE_PHONE,
  loadKycProgress, saveKycProgress, loadProfilePhoto, saveProfilePhoto, removeProfilePhotoStorage,
  type KycProgress,
} from "./profileData";
import { updateUserProfile } from "../lib/firebase/firestoreService";
import { subscribeKycProfileSync } from "../lib/kyc/kycProfileSync";
import type { MarketProduct } from "./marketData";
import { coerceMarketCategory, marketCartTotalUsd } from "./marketData";
import {
  loadNotifications, saveNotifications, nextNotificationId, formatNotifTime,
  migrateLegacyNotifications, resolveNotifStorageScope, dedupeNotifications,
  shouldEmitWalletConnectedNotif, hasWalletConnectedNotification,
  hasRecentDuplicateNotification, filterNotificationsForCompletedTx,
  loadKycNotifSeen, saveKycNotifSeen, kycNotifFingerprint, hasKycNotification,
  type AppNotification, type NotifAction,
} from "../lib/notifications/notificationService";
import { mergeTxNotification, isTxConfirmedStatus } from "../lib/user/transactionNotifications";
import { shareWalletAddress as shareWalletAddressLib, shareText, type ShareResult } from "../lib/share/shareContent";
import {
  loadSecurityPrefs, setStrictDeviceLock as persistStrictDeviceLock,
  syncSecurityPrefsToFirestore, setTwoFactorEnabledLocal, setBiometricEnabledLocal,
  hasAppPin, hasActiveSecurityChallenge,
} from "../lib/security/securityStore";
import { isAppLocked, lockApp, unlockApp, waitForAppUnlock } from "../lib/security/appLock";
import { grantGarudaSignWindow } from "../lib/web3/garudaWalletSignGate";
import { isGarudaNativeWalletType, type WalletProvider } from "../lib/web3/walletService";
import type { ReceivePanelView } from "../lib/wallet/receivePanelView";
import { getSessionUidSync } from "../lib/security/sessionManager";
import {
  loadPortfolio, savePortfolio, newPortfolioId, investedFundsFromPositions,
  totalInvestProfit, totalStakingReward, totalStakingRewardByToken, redeemInvestTotals, unstakeTotals,
  unstakeSdaTotals, isStakingUnlocked, getStakedAmount, getMinStake, STAKING_PRODUCTS, type InvestPosition, type StakingPosition, type StakingProduct,
} from "../lib/invest/investPortfolio";
import {
  defaultPlatformPrograms,
  fetchPlatformPrograms,
  type CommunityProgramConfig,
  type ReferralProgramConfig,
} from "../lib/platform/platformProgramsService";
import {
  loadMerchantProducts, saveMerchantProducts, loadMerchantStats, saveMerchantStats,
  buildMerchantProduct, recordMerchantSale, ensureUserMerchant, reconcileMerchantProductIds,
  applyMerchantBrandingToProducts,
  personalMerchantIdFromUid, canonicalMerchantIdForOwner, type MerchantProduct, type MerchantStats,
  type NewMerchantProductInput, type MerchantProductUpdateInput, isMerchantProductId, MERCHANT_ID, MERCHANT_NAME,
} from "../lib/merchant/merchantService";
import {
  loadShippingAddress, saveShippingAddress, type ShippingAddress,
  isShippingAddressComplete, emptyShippingAddress, buildShippingFromSources,
} from "../lib/merchant/shippingAddress";
import {
  loadKycAddress, saveKycAddress, type KycAddress,
  isKycAddressComplete, emptyKycAddress,
} from "../lib/merchant/kycAddress";
import {
  loadMarketOrders, saveMarketOrders, createMarketOrder, updateMarketOrderStatus as persistOrderStatus,
  cancelMarketOrder, resolveCheckoutMerchantId, resolveSellerName, resolveSellerContact,
  type MarketOrder, type OrderStatus,
} from "../lib/merchant/orderService";
import { migrateToFreshUserData, buildReferralCode } from "../lib/user/userAppData";
import { persistAppVersion, shouldReloadForAppVersion } from "../lib/app/bootCleanup";
import {
  bindReferralCodeClient,
  fetchReferralStats,
  processReferralKycClient,
  type ReferralStats,
} from "../lib/referral/referralService";
import { captureReferralFromUrl } from "../lib/referral/referralRef";
import { isReferralUsageEnabled } from "../lib/referral/referralProgramGate";
import {
  isKycFullyVerified, isKycPendingReview, isKycRejected, resolveKycTierFromProfile,
} from "../lib/kyc/kycPolicy";
import { saveKycVerification, type KycStatus } from "../lib/firebase/firestoreService";
import { resolveAllKycUploads, scheduleKycPreupload, clearKycPreuploadCache, ensureKycPreuploads, kycFieldToKind, subscribeKycUploadStatus, getKycUploadStatus, getKycUploadError, retryKycPreupload, type KycDocUploadStatus } from "../lib/kyc/kycPreuploadCache";
import type { KycUploadKind } from "../lib/kyc/kycStorageService";
import { submitKycApplication, computeKycRiskScore } from "../lib/kyc/kycApplicationService";
import type { KtpOcrExtract } from "../lib/kyc/ktpAddressOcr";
import { buildAddressVerification, isDomicileAddressValid, type GeoCapture } from "../lib/kyc/addressVerification";
import {
  getCaptureRequirements,
  getDefaultDocType,
  getAvailableDocTypes,
  isFaceVerificationComplete,
  areIdDocumentsComplete,
  resolveSubmitDocumentType,
  isPersonalDataStepComplete,
  isSelfieStepComplete,
  KYC_FLOW_MAX_STEP,
  type KycDocType,
} from "../lib/kyc/kycWorkflow";
import { detectDefaultCountryCode } from "../lib/kyc/countries";
import { readResidenceCountry } from "../lib/auth/accountSetup";
import { logKycRiskAnalysis } from "../lib/ai/aiLogService";
import {
  subscribeMarketplaceProducts,
  fetchPublishedProducts,
  syncLocalProductsToFirestore,
  upsertMarketplaceProduct,
  marketplaceDocFromMerchant,
  type MarketplaceProductDoc,
} from "../lib/merchant/marketplaceFirestore";
import { loadFeeConfigFromApi } from "../lib/protocol/feeConfig";
import { loadTokenPricesFromApi } from "./tokenEconomy";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { waitForAuthUser } from "../lib/firebase/waitForAuthUser";
import {
  bootstrapUserAppData,
  fetchUserNotifications,
  fetchUserOrders,
  fetchUserPortfolio,
  fetchUserTransactions,
  resolveMerchantIdsForUser,
  saveMarketOrdersRemote,
  saveNotificationsRemote,
  savePortfolioRemote,
  subscribeUserNotifications,
  subscribeUserOrders,
  subscribeUserPortfolio,
  subscribeUserTransactions,
  subscribePlatformBroadcasts,
  upsertUserTransaction,
  cancelUserTransaction,
} from "../lib/firebase/userAppDataFirestore";
import { notificationEvents } from "../lib/notifications/notificationEvents";
import { loadTransactions, mergeTransactions, migrateLegacyTransactions, nextTransactionId, resolveTxStorageScope, saveTransactions } from "../lib/user/transactionStore";
import {
  clearMobilePending,
  isPendingTxStatus,
  loadMobilePending,
  patchMobilePending,
  saveMobilePending,
  takeMobileTxHash,
  type MobilePendingMeta,
} from "../lib/user/mobileWalletActivity";
import {
  commitWalletSnapshot,
  loadWalletSnapshot,
  markRecentOutbound,
  hadRecentOutbound,
} from "../lib/user/inboundTransferDetector";
import {
  enrichReceiveTransaction,
  receiveNeedsEnrichment,
} from "../lib/user/enrichReceiveTransaction";
import { discoverInboundReceiveDrafts } from "../lib/user/inboundWalletSync";
import { syncPendingPayReceiptHashes } from "../lib/payhub/payReceiptSync";
import { sanitizeTransactionHistory } from "../lib/user/transactionSanitizer";
import { WalletBalanceGateRegistry } from "../lib/web3/stableOnChainBalance";
import {
  balanceRefreshMinIntervalMs,
  walletActivityPollDelayMs,
  WALLET_ACTIVITY_BURST_DURATION_MS,
} from "../lib/wallet/walletActivitySync";
import { prefetchWalletDisplayNames } from "../lib/user/walletIdentityService";
import { INVESTMENT_FUNDS, type InvestmentFund } from "./investData";
import { fetchInvestmentFunds, recordFundDeposit } from "../lib/invest/investmentFundsService";
import { getPayHubAuthToken, isPayHubApiConfigured } from "../lib/payhub/payHubApi";
import { fetchPayLedger, resolvePayHubTreasuryAddress, type PayLedgerSnapshot } from "../lib/payhub/payLedgerService";
import {
  confirmOnChainSwap,
  isSwapPairSupported,
  type SwapSymbol,
} from "../lib/payhub/paySwapService";
import { transferWalletAsset, resolveWalletSendAsset, type TransferOptions } from "../lib/web3/walletTransfer";
import { getStoredWallet, resolveWalletSession } from "../lib/web3/walletService";
import { resolveTransactionWalletProvider } from "../lib/web3/connectedWalletUtils";
import { settleProtocolActionClient, isProtocolApiConfigured } from "../lib/protocol/protocolService";
import { verifyOnChainInvest, verifyOnChainStake } from "../lib/protocol/protocolVerifyService";
import { releaseLegacyInvest, releaseLegacyStake } from "../lib/protocol/protocolLegacyService";
import { normalizeProductImages } from "../lib/merchant/productImages";
import { usdToGatPayHub } from "../lib/payhub/payHubAmounts";
import {
  hasEnoughGarudaPrimeGat,
  mergeHoldingsForGarudaPrimeWallet,
  resolveActiveWalletOnChainGat,
  resolveGarudaPrimeSpendableGat,
} from "../lib/wallet/garudaPrimeWallet";
import { getFeeRate } from "../lib/protocol/feeConfig";
import {
  canUseOnChainProtocol,
  investGatOnChain,
  redeemInvestOnChain,
  stakeGatOnChain,
  unstakeGatOnChain,
} from "../lib/web3/protocolActions";
import { isOnChainInvestEnabled, isOnChainStakeEnabled } from "../lib/web3/protocolOnChainConfig";
import type { PayQrChannel, PayScanPrefill, ScanMode, SendTokenPrefill, Tx } from "./appTypes";
import { lockPayTarget } from "../lib/payhub/payTarget";

export type { Tx, PayQrChannel, ScanMode, PayScanPrefill, SendTokenPrefill } from "./appTypes";

export type Screen = "home" | "wallet" | "invest" | "market" | "community";

export type Overlay =
  | "none"
  | "sidebar"
  | "notifications"
  | "profile"
  | "ai"
  | "send"
  | "receive"
  | "swap"
  | "pay"
  | "scan"
  | "invest"
  | "token"
  | "fund"
  | "product"
  | "transaction"
  | "tool"
  | "importToken"
  | "nftIdentity";

export type ToolPanelId = "analytics" | "reports" | "devices" | "wallets" | "help" | "garuda-chain" | "governance" | "mainnet-migration" | "merchant" | "assets" | "transactions" | "referral-dashboard" | "my-orders";

export type CommunityTab = "overview" | "feed" | "zakat" | "referral" | "learn" | "charity";

export type WalletTab = "overview" | "assets" | "transactions";
export type ProfileSection = "main" | "account" | "security" | "subscription" | "kyc" | "kyc-flow" | "customTokens" | "shipping" | "walletBackup";

export type KycFlowData = {
  personalFullName: string;
  personalEmail: string;
  personalPhone: string;
  country: string;
  documentType: KycDocType;
  documentTypeOther: string;
  idDocumentFront: string | null;
  idDocumentBack: string | null;
  faceVerified: boolean;
  faceCapture: string | null;
  livenessStep1Capture: string | null;
  livenessStep2Capture: string | null;
  livenessStep3Capture: string | null;
  livenessPassed: boolean;
  livenessScore: number;
  faceMatchScore: number;
  faceMatchPassed: boolean;
  autoVerifyComplete: boolean;
  ocrMatchScore: number;
  ktpSelfieFront: string | null;
  ktpSelfieBack: string | null;
  addressProof: string | null;
  domicile: KycAddress;
  ktpExtracted: KtpOcrExtract | null;
  geo: GeoCapture | null;
};

export type DetailTarget =
  | { kind: "token"; symbol: string; contractAddress?: string }
  | { kind: "fund"; id: number }
  | { kind: "product"; id: number }
  | { kind: "transaction"; id: number }
  | null;

export type Notif = AppNotification;

export type CartItem = { productId: number; name: string; price: number; qty: number };

export type MerchantPanelTab = "dashboard" | "products" | "upload" | "orders";

export type CheckoutResult =
  | { ok: true; hasMerchantOrder: boolean; feeGat?: number; netGat?: number }
  | { ok: false };

const WALLET_ADDRESS = "";
const KYC_STORAGE = "garuda_prime_kyc_tier";
const KYC_STATUS_STORAGE = "garuda_prime_kyc_status";
const BIOMETRIC_STORAGE = "garuda_prime_biometric";

const GATED_OVERLAYS: Overlay[] = ["send", "swap", "pay", "invest", "importToken"];

type AppContextValue = {
  walletAddress: string;
  overlay: Overlay;
  setOverlay: (o: Overlay) => void;
  toggleOverlay: (o: Overlay) => void;
  requestOverlay: (o: Overlay) => boolean;
  requestSendOverlay: (prefill?: SendTokenPrefill) => boolean;
  sendPrefill: SendTokenPrefill | null;
  requestReceiveOverlay: (view?: ReceivePanelView) => boolean;
  receiveViewPrefill: ReceivePanelView | null;
  requestPayOverlay: (prefill?: PayScanPrefill) => boolean;
  payScanPrefill: PayScanPrefill | null;
  screen: Screen;
  setScreen: (s: Screen) => void;
  detail: DetailTarget;
  openDetail: (d: DetailTarget) => void;
  closeDetail: () => void;
  notifications: Notif[];
  markAllRead: () => void;
  markRead: (id: number) => void;
  deleteNotification: (id: number) => void;
  deleteAllNotifications: () => void;
  addNotification: (input: Omit<Notif, "id" | "read" | "time" | "createdAt"> & { time?: string; createdAt?: string }) => void;
  refreshNotifications: () => Promise<void>;
  openNotification: (id: number) => void;
  shareWalletAddress: (message: string, title?: string) => Promise<ShareResult>;
  shareContent: (text: string, title?: string) => Promise<ShareResult>;
  transactions: Tx[];
  addTransaction: (tx: Omit<Tx, "id">) => number;
  patchTransaction: (txId: number, patch: Partial<Tx>) => void;
  beginMobileTransaction: (draft: Omit<Tx, "id">, meta?: MobilePendingMeta) => number;
  completeMobileTransaction: (txId: number, patch: Partial<Tx>) => void;
  cancelMobileTransaction: (txId: number) => void;
  cart: CartItem[];
  addToCart: (productId: number, name: string, price: number) => boolean;
  removeFromCart: (productId: number) => void;
  updateCartQty: (productId: number, qty: number) => void;
  clearCart: () => void;
  checkoutCart: (shipping: ShippingAddress) => Promise<CheckoutResult>;
  shippingAddress: ShippingAddress;
  setShippingAddress: (addr: ShippingAddress) => void;
  saveShippingAddressProfile: (addr: ShippingAddress) => void;
  kycAddress: KycAddress;
  saveKycAddressProfile: (addr: KycAddress) => void;
  buildDefaultShipping: () => ShippingAddress;
  marketOrders: MarketOrder[];
  updateOrderStatus: (orderId: string, status: OrderStatus, trackingNumber?: string) => void;
  cancelOrder: (orderId: string) => boolean;
  profilePhone: string;
  referralCode: string;
  referralStats: ReferralStats | null;
  referralLoading: boolean;
  refreshReferralStats: () => Promise<void>;
  bindUserReferralCode: (code: string) => Promise<{ ok: boolean; error?: string }>;
  cartTotal: number;
  cartCount: number;
  investedFunds: Record<number, number>;
  investPositions: InvestPosition[];
  stakingPositions: StakingPosition[];
  portfolioProfit: number;
  portfolioStakingReward: number;
  portfolioStakingRewardsByToken: Partial<Record<"GAT" | "SDA", number>>;
  investmentFunds: InvestmentFund[];
  refreshInvestmentFunds: () => Promise<void>;
  stakingProducts: StakingProduct[];
  communityConfig: CommunityProgramConfig;
  referralConfig: ReferralProgramConfig;
  refreshPlatformPrograms: () => Promise<void>;
  payZakat: (eligibleAssetUsd: number) => Promise<boolean>;
  donateCharity: (amountGat: number) => Promise<boolean>;
  investInFund: (fundId: number, amount: number, fundName: string) => Promise<boolean>;
  redeemInvestPosition: (positionId: string) => Promise<boolean>;
  stakeGat: (productId: string, amountGat: number) => Promise<boolean>;
  unstakePosition: (positionId: string) => Promise<boolean>;
  copyText: (text: string, label?: string) => Promise<void>;
  showToast: (message: string, type?: ToastType) => void;
  signOut: () => void;
  kycTier: number;
  kycStatus: KycStatus;
  isKycVerified: boolean;
  isKycPending: boolean;
  isKycRejected: boolean;
  kycRejectionReason: string | null;
  kycResubmitMode: boolean;
  upgradingKyc: boolean;
  kycSubmitProgress: { step: number; total: number; label: string; phase: string } | null;
  kycDocUploadStatus: {
    idDocumentFront: KycDocUploadStatus;
    idDocumentBack: KycDocUploadStatus;
    ktpSelfieFront: KycDocUploadStatus;
    ktpSelfieBack: KycDocUploadStatus;
    livenessSelfie: KycDocUploadStatus;
  };
  kycDocUploadErrors: {
    idDocumentFront: string | null;
    idDocumentBack: string | null;
    ktpSelfieFront: string | null;
    ktpSelfieBack: string | null;
    livenessSelfie: string | null;
  };
  isDemoUser: boolean;
  upgradeKyc: () => void;
  biometricEnabled: boolean;
  setBiometricEnabled: (v: boolean) => void;
  twoFactorEnabled: boolean;
  setTwoFactorEnabled: (v: boolean) => void;
  strictDeviceLock: boolean;
  setStrictDeviceLock: (v: boolean) => void;
  refreshSecurityPrefs: () => void;
  requireSecurityStep: () => Promise<boolean>;
  /** Kirim/bayar, hanya app lock; tanpa challenge PIN ganda. */
  requireSpendSecurity: () => Promise<boolean>;
  cancelPendingSecurityChallenge: () => void;
  securityChallengeOpen: boolean;
  resolveSecurityChallenge: (ok: boolean) => void;
  requireKyc: (message: string) => boolean;
  kycBlockedMessage: string;
  setKycBlockedMessage: (msg: string) => void;
  payQrChannel: PayQrChannel;
  setPayQrChannel: (c: PayQrChannel) => void;
  scanMode: ScanMode;
  setScanMode: (m: ScanMode) => void;
  scanLockedMode: ScanMode | null;
  openScan: (mode?: ScanMode, lock?: boolean) => void;
  walletTab: WalletTab;
  openWallet: (tab?: WalletTab) => void;
  activeTool: ToolPanelId | null;
  openToolPanel: (tool: ToolPanelId) => void;
  communityTab: CommunityTab;
  setCommunityTab: (tab: CommunityTab) => void;
  openCommunity: (tab?: CommunityTab) => void;
  profileSection: ProfileSection;
  openProfile: (section?: ProfileSection) => void;
  closeProfile: () => void;
  openProfileShipping: () => void;
  isShippingComplete: boolean;
  requireShipping: (message?: string) => boolean;
  profileName: string;
  profileEmail: string;
  profilePhotoUrl: string | null;
  uploadProfilePhoto: (file: File) => Promise<boolean>;
  removeProfilePhoto: () => void;
  kycProgress: KycProgress;
  kycFlowStep: number;
  kycFlowData: KycFlowData;
  beginKycFlow: () => void;
  startKycUpgrade: () => void;
  submitKycStep: (action: "next" | "submit" | keyof KycFlowData, value?: string | boolean | number | KycAddress | KtpOcrExtract | GeoCapture | null) => void;
  tokens: TokenRow[];
  holdings: Record<string, number>;
  portfolioUsd: number;
  balanceSource: "demo" | "onchain";
  balancesLoading: boolean;
  refreshBalances: (options?: { force?: boolean }) => Promise<void>;
  refreshWalletActivity: (options?: { force?: boolean }) => Promise<void>;
  /** Immediately adjust displayed GAT after confirmed outbound tx (pay/send). */
  applyOptimisticGatDelta: (delta: number) => void;
  /** Set GAT balance from Pay Hub / server response after confirmed tx. */
  applyConfirmedGatBalance: (balance: number) => void;
  /** GAT on-chain siap pakai untuk merchant, marketplace, invest. */
  garudaPrimeSpendableGat: number;
  /** GAT balance on connected wallet (chain), matches Merchant Center Saldo Onchain. */
  onChainGat: number;
  activeOnChainGat: number;
  refreshAppData: () => Promise<void>;
  swapWalletTokens: (
    from: SwapSymbol,
    to: SwapSymbol,
    amount: number,
    options?: TransferOptions,
  ) => Promise<{
    netToAmount: number;
    feeAmount: number;
    source: "pay_hub" | "wallet";
    delivery?: "pay_hub" | "wallet";
    txHash?: string;
  }>;
  importCustomToken: (contractAddress: string) => Promise<void>;
  removeCustomToken: (contractAddress: string) => void;
  merchantProducts: MerchantProduct[];
  merchantStats: MerchantStats;
  marketProducts: MarketProduct[];
  marketplaceLoading: boolean;
  refreshMarketplace: () => Promise<void>;
  addMerchantProduct: (input: NewMerchantProductInput) => void;
  updateMerchantProduct: (id: number, input: MerchantProductUpdateInput) => void;
  toggleMerchantProductPublished: (id: number) => void;
  removeMerchantProduct: (id: number) => void;
  syncMerchantShopBranding: (branding: { sellerName: string; shopSymbol?: string; shopLocation?: string }) => void;
  openMarket: () => void;
  openMarketCart: () => void;
  marketCartOpen: boolean;
  closeMarketCart: () => void;
  pendingInvestTab: "overview" | "portfolio" | "opportunities" | null;
  openInvestTab: (tab: "overview" | "portfolio" | "opportunities") => void;
  clearInvestTab: () => void;
  openMerchantOrders: () => void;
  openBuyerOrders: () => void;
  merchantPanelTab: MerchantPanelTab;
};

const AppContext = createContext<AppContextValue | null>(null);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
};

const INITIAL_TXS: Tx[] = [];

export const AppProvider = ({
  children,
  onSignOut,
  kycBlockedMessage: defaultKycMsg,
  kycVerifiedMessage,
  kycPendingMessage,
  profileName: profileNameProp,
  profileEmail: profileEmailProp,
  profilePhone: profilePhoneProp,
  profileAvatar: profileAvatarProp,
  walletAddress: walletAddressProp,
  walletProvider: walletProviderProp,
  userId,
  isDemoUser = false,
  kycTierFromServer,
  kycStatusFromServer,
  kycRejectionReasonFromServer,
  onRefreshUserProfile,
}: {
  children: React.ReactNode;
  onSignOut: () => void;
  kycBlockedMessage: string;
  kycVerifiedMessage: string;
  kycPendingMessage: string;
  profileName?: string;
  profileEmail?: string;
  profilePhone?: string;
  profileAvatar?: string | null;
  walletAddress?: string | null;
  walletProvider?: string | null;
  userId?: string | null;
  isDemoUser?: boolean;
  kycTierFromServer?: number;
  kycStatusFromServer?: KycStatus;
  kycRejectionReasonFromServer?: string | null;
  onRefreshUserProfile?: () => Promise<void>;
}) => {
  if (typeof window !== "undefined") migrateToFreshUserData();

  const [screen, setScreen] = useState<Screen>("home");
  const walletAddress = walletAddressProp ?? WALLET_ADDRESS;
  const isLiveWallet = Boolean(walletAddressProp);
  const profileName = profileNameProp?.trim() || PROFILE_NAME || "Pengguna";
  const profileEmail = profileEmailProp?.trim() || PROFILE_EMAIL;
  const profilePhone = profilePhoneProp?.trim() || PROFILE_PHONE;
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const prevReferralEarnedRef = useRef<number | null>(null);
  const referralCode = referralStats?.referralCode ?? buildReferralCode(profileName, profileEmail, userId);
  const [overlay, setOverlayState] = useState<Overlay>("none");
  const [detail, setDetail] = useState<DetailTarget>(null);
  const [notifications, setNotifications] = useState<Notif[]>(() => loadNotifications());
  const [transactions, setTransactions] = useState<Tx[]>(() => loadTransactions());
  const [cart, setCart] = useState<CartItem[]>([]);
  const [investPositions, setInvestPositions] = useState<InvestPosition[]>(() => loadPortfolio().investments);
  const [stakingPositions, setStakingPositions] = useState<StakingPosition[]>(() => loadPortfolio().staking);
  const [investmentFunds, setInvestmentFunds] = useState<InvestmentFund[]>(INVESTMENT_FUNDS);
  const [platformDefaults] = useState(defaultPlatformPrograms);
  const [stakingProducts, setStakingProducts] = useState<StakingProduct[]>(platformDefaults.staking.products);
  const [communityConfig, setCommunityConfig] = useState<CommunityProgramConfig>(platformDefaults.community);
  const [referralConfig, setReferralConfig] = useState<ReferralProgramConfig>(platformDefaults.referral);
  const [txId, setTxId] = useState(() => nextTransactionId(loadTransactions()));
  const [kycTier, setKycTier] = useState<number>(() =>
    resolveKycTierFromProfile(kycTierFromServer, kycStatusFromServer ?? "none"),
  );
  const [kycStatus, setKycStatus] = useState<KycStatus>(() => kycStatusFromServer ?? "none");
  const [kycRejectionReason, setKycRejectionReason] = useState<string | null>(
    () => kycRejectionReasonFromServer ?? null,
  );
  const [kycResubmitMode, setKycResubmitMode] = useState(false);
  const [upgradingKyc, setUpgradingKyc] = useState(false);
  const [kycSubmitProgress, setKycSubmitProgress] = useState<{
    step: number; total: number; label: string; phase: string;
  } | null>(null);
  const [kycUploadStatusTick, setKycUploadStatusTick] = useState(0);
  const prevKycStatusRef = useRef<KycStatus | undefined>(undefined);

  useEffect(() => {
    if (!userId) return;
    return subscribeKycUploadStatus((uid) => {
      if (uid === userId) setKycUploadStatusTick((n) => n + 1);
    });
  }, [userId]);

  useEffect(() => {
    if (kycStatusFromServer === undefined && kycTierFromServer === undefined) return;
    const status = kycStatusFromServer ?? "none";
    const tier = resolveKycTierFromProfile(kycTierFromServer, status);
    setKycStatus(status);
    setKycTier(tier);
    if (status === "pending" || status === "verified" || status === "none") {
      setKycResubmitMode(false);
    }
    if (typeof window !== "undefined") {
      localStorage.setItem(KYC_STORAGE, String(tier));
      localStorage.setItem(KYC_STATUS_STORAGE, status);
    }
  }, [kycStatusFromServer, kycTierFromServer]);

  useEffect(() => {
    return subscribeKycProfileSync(() => {
      const status = kycStatusFromServer ?? "none";
      const tier = resolveKycTierFromProfile(kycTierFromServer, status);
      setKycStatus(status);
      setKycTier(tier);
      if (status === "verified" || status === "pending" || status === "none") {
        setKycResubmitMode(false);
      }
      if (status === "verified") setUpgradingKyc(false);
      if (typeof window !== "undefined") {
        localStorage.setItem(KYC_STORAGE, String(tier));
        localStorage.setItem(KYC_STATUS_STORAGE, status);
      }
    });
  }, [kycStatusFromServer, kycTierFromServer]);

  useEffect(() => {
    if (kycRejectionReasonFromServer === undefined) return;
    setKycRejectionReason(kycRejectionReasonFromServer ?? null);
  }, [kycRejectionReasonFromServer]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const cachedTier = localStorage.getItem(KYC_STORAGE);
    const cachedStatus = localStorage.getItem(KYC_STATUS_STORAGE) as KycStatus | null;
    if (cachedTier === "3" && cachedStatus !== "verified" && kycStatusFromServer === undefined) {
      localStorage.setItem(KYC_STORAGE, "0");
      localStorage.setItem(KYC_STATUS_STORAGE, "none");
      setKycTier(0);
      setKycStatus("none");
    }
  }, [kycStatusFromServer]);
  const [biometricEnabled, setBiometricEnabledState] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(BIOMETRIC_STORAGE) === "1";
  });
  const [twoFactorEnabled, setTwoFactorEnabledState] = useState(false);
  const [strictDeviceLock, setStrictDeviceLockState] = useState(true);
  const [securityChallengeOpen, setSecurityChallengeOpen] = useState(false);
  const securityResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const [kycBlockedMessage, setKycBlockedMessage] = useState(defaultKycMsg);

  useEffect(() => {
    if (!userId) return;
    const prefs = loadSecurityPrefs(userId);
    setTwoFactorEnabledState(prefs.twoFactorEnabled);
    setBiometricEnabledState(prefs.biometricEnabled);
    setStrictDeviceLockState(prefs.strictDeviceLock);
    localStorage.setItem(BIOMETRIC_STORAGE, prefs.biometricEnabled ? "1" : "0");
  }, [userId]);

  const refreshSecurityPrefs = useCallback(() => {
    if (!userId) return;
    const prefs = loadSecurityPrefs(userId);
    setTwoFactorEnabledState(prefs.twoFactorEnabled);
    setBiometricEnabledState(prefs.biometricEnabled);
    setStrictDeviceLockState(prefs.strictDeviceLock);
  }, [userId]);

  const setTwoFactorEnabled = useCallback((v: boolean) => {
    if (!userId) return;
    setTwoFactorEnabledLocal(userId, v);
    setTwoFactorEnabledState(v);
    void syncSecurityPrefsToFirestore(userId, { twoFactorEnabled: v });
  }, [userId]);

  const setStrictDeviceLock = useCallback((v: boolean) => {
    if (!userId) return;
    persistStrictDeviceLock(userId, v);
    setStrictDeviceLockState(v);
    void syncSecurityPrefsToFirestore(userId, { strictDeviceLock: v });
  }, [userId]);

  const cancelPendingSecurityChallenge = useCallback(() => {
    setSecurityChallengeOpen(false);
    const resolve = securityResolveRef.current;
    securityResolveRef.current = null;
    resolve?.(false);
  }, []);

  const resolveSecurityChallenge = useCallback((ok: boolean) => {
    setSecurityChallengeOpen(false);
    if (ok) {
      unlockApp();
      grantGarudaSignWindow();
    }
    const resolve = securityResolveRef.current;
    securityResolveRef.current = null;
    resolve?.(ok);
  }, []);

  const runSecurityChallenge = useCallback(async (uid: string): Promise<boolean> => {
    const ok = await new Promise<boolean>((resolve) => {
      securityResolveRef.current = resolve;
      setSecurityChallengeOpen(true);
    });
    if (ok) {
      unlockApp();
      grantGarudaSignWindow();
    }
    return ok;
  }, []);

  const requireSecurityStep = useCallback(async (): Promise<boolean> => {
    const uid = userId?.trim() || getSessionUidSync()?.trim() || null;
    if (isAppLocked()) {
      lockApp();
      const unlocked = await waitForAppUnlock(120_000);
      if (!unlocked) {
        cancelPendingSecurityChallenge();
        return false;
      }
    }
    if (!uid || !hasActiveSecurityChallenge(uid)) {
      grantGarudaSignWindow();
      return true;
    }
    return runSecurityChallenge(uid);
  }, [userId, cancelPendingSecurityChallenge, runSecurityChallenge]);

  const requireSpendSecurity = useCallback(async (): Promise<boolean> => {
    if (isAppLocked()) {
      lockApp();
      const unlocked = await waitForAppUnlock(90_000);
      if (!unlocked) return false;
    }
    grantGarudaSignWindow();
    return true;
  }, []);

  const [payQrChannel, setPayQrChannel] = useState<PayQrChannel>("onchain");
  const [scanMode, setScanMode] = useState<ScanMode>("pay");
  const [scanLockedMode, setScanLockedMode] = useState<ScanMode | null>(null);
  const [walletTab, setWalletTab] = useState<WalletTab>("overview");
  const [activeTool, setActiveTool] = useState<ToolPanelId | null>(null);
  const [communityTab, setCommunityTab] = useState<CommunityTab>("overview");
  const [profileSection, setProfileSection] = useState<ProfileSection>("main");
  const [sendPrefill, setSendPrefill] = useState<SendTokenPrefill | null>(null);
  const [receiveViewPrefill, setReceiveViewPrefill] = useState<ReceivePanelView | null>(null);
  const [payScanPrefill, setPayScanPrefill] = useState<PayScanPrefill | null>(null);
  const prevOverlayRef = useRef<Overlay>("none");

  useEffect(() => {
    if (prevOverlayRef.current === "pay" && overlay !== "pay") {
      setPayScanPrefill(null);
    }
    if (prevOverlayRef.current === "receive" && overlay !== "receive") {
      setReceiveViewPrefill(null);
    }
    prevOverlayRef.current = overlay;
  }, [overlay]);

  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setProfilePhotoUrl(null);
      return;
    }
    const local = loadProfilePhoto(userId);
    if (local) {
      setProfilePhotoUrl(local);
      return;
    }
    setProfilePhotoUrl(profileAvatarProp?.trim() || null);
  }, [userId, profileAvatarProp]);
  const [kycProgress, setKycProgress] = useState<KycProgress>(() => loadKycProgress());
  const [kycFlowStep, setKycFlowStep] = useState(0);
  const [kycFlowData, setKycFlowData] = useState<KycFlowData>(() => {
    const residence = readResidenceCountry() ?? detectDefaultCountryCode();
    const saved = loadKycAddress();
    return {
      personalFullName: profileNameProp?.trim() || "",
      personalEmail: profileEmailProp?.trim() || "",
      personalPhone: profilePhoneProp?.trim() || "",
      country: saved?.country || residence,
      documentType: getDefaultDocType(saved?.country || residence),
      documentTypeOther: "",
      idDocumentFront: null,
      idDocumentBack: null,
      faceVerified: false,
      faceCapture: null,
      livenessStep1Capture: null,
      livenessStep2Capture: null,
      livenessStep3Capture: null,
      livenessPassed: false,
      livenessScore: 0,
      faceMatchScore: 0,
      faceMatchPassed: false,
      autoVerifyComplete: false,
      ocrMatchScore: 0,
      ktpSelfieFront: null,
      ktpSelfieBack: null,
      addressProof: null,
      domicile: saved ?? emptyKycAddress(residence),
      ktpExtracted: null,
      geo: null,
    };
  });

  const kycDocUploadStatus = useMemo(() => ({
    idDocumentFront: userId && kycFlowData.idDocumentFront
      ? getKycUploadStatus(userId, "id-document-front", kycFlowData.idDocumentFront)
      : "idle" as KycDocUploadStatus,
    idDocumentBack: userId && kycFlowData.idDocumentBack
      ? getKycUploadStatus(userId, "id-document-back", kycFlowData.idDocumentBack)
      : "idle" as KycDocUploadStatus,
    ktpSelfieFront: userId && kycFlowData.ktpSelfieFront
      ? getKycUploadStatus(userId, "ktp-selfie-front", kycFlowData.ktpSelfieFront)
      : "idle" as KycDocUploadStatus,
    ktpSelfieBack: userId && kycFlowData.ktpSelfieBack
      ? getKycUploadStatus(userId, "ktp-selfie-back", kycFlowData.ktpSelfieBack)
      : "idle" as KycDocUploadStatus,
    livenessSelfie: userId && kycFlowData.faceCapture
      ? getKycUploadStatus(userId, "liveness-selfie", kycFlowData.faceCapture)
      : "idle" as KycDocUploadStatus,
  }), [
    userId,
    kycFlowData.idDocumentFront,
    kycFlowData.idDocumentBack,
    kycFlowData.ktpSelfieFront,
    kycFlowData.ktpSelfieBack,
    kycFlowData.faceCapture,
    kycUploadStatusTick,
  ]);

  const kycDocUploadErrors = useMemo(() => ({
    idDocumentFront: userId && kycFlowData.idDocumentFront
      ? getKycUploadError(userId, "id-document-front", kycFlowData.idDocumentFront)
      : null,
    idDocumentBack: userId && kycFlowData.idDocumentBack
      ? getKycUploadError(userId, "id-document-back", kycFlowData.idDocumentBack)
      : null,
    ktpSelfieFront: userId && kycFlowData.ktpSelfieFront
      ? getKycUploadError(userId, "ktp-selfie-front", kycFlowData.ktpSelfieFront)
      : null,
    ktpSelfieBack: userId && kycFlowData.ktpSelfieBack
      ? getKycUploadError(userId, "ktp-selfie-back", kycFlowData.ktpSelfieBack)
      : null,
    livenessSelfie: userId && kycFlowData.faceCapture
      ? getKycUploadError(userId, "liveness-selfie", kycFlowData.faceCapture)
      : null,
  }), [
    userId,
    kycFlowData.idDocumentFront,
    kycFlowData.idDocumentBack,
    kycFlowData.ktpSelfieFront,
    kycFlowData.ktpSelfieBack,
    kycFlowData.faceCapture,
    kycUploadStatusTick,
  ]);

  useEffect(() => {
    if (!userId || kycFlowStep !== 4 || isDemoUser) return;
    const req = getCaptureRequirements(kycFlowData.country, kycFlowData.documentType);
    ensureKycPreuploads(userId, {
      idDocumentFront: kycFlowData.idDocumentFront,
      idDocumentBack: kycFlowData.idDocumentBack,
      ktpSelfieFront: kycFlowData.ktpSelfieFront,
      ktpSelfieBack: kycFlowData.ktpSelfieBack,
      livenessSelfie: kycFlowData.faceCapture,
      livenessStep1: kycFlowData.livenessStep1Capture,
      livenessStep2: kycFlowData.livenessStep2Capture,
      livenessStep3: kycFlowData.livenessStep3Capture,
    }, { idBack: req.idBack, selfieBack: req.selfieBack });
    const retries: [KycUploadKind, string | null][] = [
      ["id-document-front", kycFlowData.idDocumentFront],
      ["id-document-back", req.idBack ? kycFlowData.idDocumentBack : null],
      ["ktp-selfie-front", kycFlowData.ktpSelfieFront],
      ["ktp-selfie-back", req.selfieBack ? kycFlowData.ktpSelfieBack : null],
      ["liveness-selfie", kycFlowData.faceCapture],
      ["liveness-step-1", kycFlowData.livenessStep1Capture],
      ["liveness-step-2", kycFlowData.livenessStep2Capture],
      ["liveness-step-3", kycFlowData.livenessStep3Capture],
    ];
    for (const [kind, data] of retries) {
      if (data && getKycUploadStatus(userId, kind, data) === "error") {
        retryKycPreupload(userId, kind, data);
      }
    }
  }, [
    userId,
    kycFlowStep,
    isDemoUser,
    kycFlowData.country,
    kycFlowData.documentType,
    kycFlowData.idDocumentFront,
    kycFlowData.idDocumentBack,
    kycFlowData.ktpSelfieFront,
    kycFlowData.ktpSelfieBack,
    kycFlowData.faceCapture,
    kycFlowData.livenessStep1Capture,
    kycFlowData.livenessStep2Capture,
    kycFlowData.livenessStep3Capture,
  ]);

  const [tokenPriceTick, setTokenPriceTick] = useState(0);
  const [holdings, setHoldings] = useState(EMPTY_HOLDINGS);
  const [customTokens, setCustomTokens] = useState<CustomTokenRecord[]>(() => loadCustomTokens());
  const [merchantProducts, setMerchantProducts] = useState<MerchantProduct[]>(() => loadMerchantProducts());
  const [catalogProducts, setCatalogProducts] = useState<MarketProduct[]>([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(true);
  const [merchantStats, setMerchantStats] = useState<MerchantStats>(() => loadMerchantStats());
  const [merchantPanelTab, setMerchantPanelTab] = useState<MerchantPanelTab>("dashboard");
  const [marketCartOpen, setMarketCartOpen] = useState(false);
  const [pendingInvestTab, setPendingInvestTab] = useState<"overview" | "portfolio" | "opportunities" | null>(null);
  const [marketOrders, setMarketOrders] = useState<MarketOrder[]>(() => loadMarketOrders());
  const [kycAddress, setKycAddressState] = useState<KycAddress>(() => loadKycAddress() ?? emptyKycAddress());
  const [shippingAddress, setShippingAddressState] = useState<ShippingAddress>(() => {
    const saved = loadShippingAddress();
    return buildShippingFromSources({
      profileName: profileNameProp?.trim() || PROFILE_NAME,
      profilePhone: profilePhoneProp?.trim() || PROFILE_PHONE,
      profileEmail: profileEmailProp?.trim() || PROFILE_EMAIL,
      savedShipping: saved,
    });
  });
  const [balanceSource, setBalanceSource] = useState<"demo" | "onchain">("demo");
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [payLedgerGat, setPayLedgerGat] = useState(0);
  const [payLedgerOnChainGat, setPayLedgerOnChainGat] = useState(0);
  const [payLedgerSnapshot, setPayLedgerSnapshot] = useState<PayLedgerSnapshot | null>(null);
  const balanceGatesRef = useRef(new WalletBalanceGateRegistry());
  const balanceWalletKeyRef = useRef<string | null>(null);
  const lastBalanceRefreshAtRef = useRef(0);
  const walletActivityBurstUntilRef = useRef(0);
  const walletActivitySyncInFlightRef = useRef(false);
  const knownReceiveTxHashesRef = useRef<Set<string>>(new Set());
  const knownReceiveIdsRef = useRef<Set<number>>(new Set());
  const refreshPayLedgerRef = useRef<() => Promise<void>>(async () => undefined);
  const applyInboundReceivesRef = useRef<
    (balances?: { gat: number; sda: number }) => Promise<void>
  >(async () => undefined);
  const refreshBalancesAfterTxRef = useRef<() => Promise<void>>(async () => undefined);
  const refreshTransactionHistoryRef = useRef<() => Promise<void>>(async () => undefined);
  const refreshWalletActivityRef = useRef<(options?: { force?: boolean }) => Promise<void>>(
    async () => undefined,
  );
  const patchTransactionRef = useRef<(txId: number, patch: Partial<Tx>) => void>(() => undefined);
  const txStorageScope = useMemo(
    () => resolveTxStorageScope(userId, isDemoUser),
    [userId, isDemoUser],
  );
  const notifStorageScope = useMemo(
    () => resolveNotifStorageScope(userId, isDemoUser),
    [userId, isDemoUser],
  );
  const shouldSyncRemote = Boolean(userId && !isDemoUser);

  const scheduleWalletActivityBurst = useCallback(() => {
    walletActivityBurstUntilRef.current = Date.now() + WALLET_ACTIVITY_BURST_DURATION_MS;
  }, []);

  const refreshBalances = useCallback(async (options?: { force?: boolean }) => {
    if (!walletAddress || !isAddress(walletAddress)) return;

    const now = Date.now();
    const minInterval = balanceRefreshMinIntervalMs(walletActivityBurstUntilRef.current, now);
    if (!options?.force && now - lastBalanceRefreshAtRef.current < minInterval) {
      return;
    }
    lastBalanceRefreshAtRef.current = now;

    const snap = isLiveWallet ? loadWalletSnapshot(walletAddress) : null;
    const showSpinner = Boolean(options?.force && !snap);
    if (showSpinner) setBalancesLoading(true);
    try {
      if (isLiveWallet) {
        const onChain = await fetchWalletBalances(walletAddress);
        const gat = onChain.gat ?? snap?.GAT ?? null;
        const sda = onChain.sda ?? snap?.SDA ?? null;

        if (!hasLiveBalances(onChain) && !snap) return;

        const resolvedGat = gat ?? 0;
        const resolvedSda = sda ?? 0;
        void applyInboundReceivesRef.current({ gat: resolvedGat, sda: resolvedSda });

        setHoldings((prev) => mergeOnChainHoldings(prev, {
          gat,
          sda,
          usdx: onChain.usdx,
        }, {
          clampGatIncrease: hadRecentOutbound("GAT"),
          clampSdaIncrease: hadRecentOutbound("SDA"),
        }));
        setBalanceSource("onchain");
        commitWalletSnapshot(walletAddress, resolvedGat, resolvedSda);
        balanceGatesRef.current.forAddress(walletAddress, { gat: resolvedGat, sda: resolvedSda }).seed({
          gat: resolvedGat,
          sda: resolvedSda,
        });
      }
      const stored = loadCustomTokens();
      if (stored.length) {
        const updated = await refreshCustomTokenBalances(stored, walletAddress);
        setCustomTokens(updated);
        saveCustomTokens(updated);
      }
      if (userId && !isDemoUser && isPayHubApiConfigured()) {
        const ledger = await fetchPayLedger();
        if (ledger != null) {
          setPayLedgerSnapshot(ledger);
          setPayLedgerGat(ledger.gatBalance);
          setPayLedgerOnChainGat(ledger.onChainGat ?? 0);
        }
      }
    } catch {
      /* keep demo holdings */
    } finally {
      if (showSpinner) setBalancesLoading(false);
    }
  }, [isLiveWallet, walletAddress, userId, isDemoUser]);

  const refreshBalancesAfterTx = useCallback(async () => {
    if (walletAddress) balanceGatesRef.current.reset(walletAddress);
    await refreshBalances({ force: true });
  }, [refreshBalances, walletAddress]);

  const applyOptimisticGatDelta = useCallback((delta: number) => {
    if (!walletAddress || !isLiveWallet || !Number.isFinite(delta) || delta === 0) return;
    balanceGatesRef.current.reset(walletAddress);
    scheduleWalletActivityBurst();
    setHoldings((prev) => {
      const nextGat = Math.max(0, (prev.GAT ?? 0) + delta);
      commitWalletSnapshot(walletAddress, nextGat, prev.SDA ?? 0);
      return { ...prev, GAT: nextGat };
    });
    setPayLedgerSnapshot((prev) => {
      if (!prev) return prev;
      const nextGat = Math.max(0, (prev.gatBalance ?? 0) + delta);
      const nextOnChain = Math.max(0, (prev.onChainGat ?? prev.gatBalance ?? 0) + delta);
      setPayLedgerGat(nextGat);
      setPayLedgerOnChainGat(nextOnChain);
      return { ...prev, gatBalance: nextGat, onChainGat: nextOnChain };
    });
  }, [walletAddress, isLiveWallet, scheduleWalletActivityBurst]);

  const applyConfirmedGatBalance = useCallback((balance: number) => {
    if (!walletAddress || !isLiveWallet || !Number.isFinite(balance) || balance < 0) return;
    balanceGatesRef.current.reset(walletAddress);
    scheduleWalletActivityBurst();
    const nextGat = Math.round(Math.max(0, balance) * 1_000_000) / 1_000_000;
    setHoldings((prev) => {
      commitWalletSnapshot(walletAddress, nextGat, prev.SDA ?? 0);
      return { ...prev, GAT: nextGat };
    });
    setPayLedgerSnapshot((prev) => {
      if (!prev) return prev;
      setPayLedgerGat(nextGat);
      setPayLedgerOnChainGat(nextGat);
      return { ...prev, gatBalance: nextGat, onChainGat: nextGat };
    });
  }, [walletAddress, isLiveWallet, scheduleWalletActivityBurst]);

  refreshBalancesAfterTxRef.current = refreshBalancesAfterTx;

  const refreshPayLedger = useCallback(async () => {
    if (!userId || isDemoUser || !isPayHubApiConfigured()) return;
    const ledger = await fetchPayLedger();
    if (ledger != null) {
      setPayLedgerSnapshot(ledger);
      setPayLedgerGat(ledger.gatBalance);
      setPayLedgerOnChainGat(ledger.onChainGat ?? 0);
    }
  }, [userId, isDemoUser]);

  refreshPayLedgerRef.current = refreshPayLedger;

  const swapWalletTokens = useCallback(async (
    from: SwapSymbol,
    to: SwapSymbol,
    amount: number,
    options?: TransferOptions,
  ) => {
    if (!isSwapPairSupported(from, to)) {
      throw new Error("Unsupported swap pair");
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Invalid amount");
    }

    const walletBal = from === "GAT"
      ? (holdings.GAT ?? 0)
      : (holdings.SDA ?? 0);
    if (walletBal < amount) {
      throw new Error("Insufficient wallet balance");
    }

    const wallet = resolveWalletSession(walletAddress) ?? getStoredWallet();
    if (!wallet?.address) throw new Error("Connect wallet first");
    const provider = resolveTransactionWalletProvider(wallet.address, wallet);
    const treasury = resolvePayHubTreasuryAddress(null);
    if (!treasury) throw new Error("Treasury not configured");

    const asset = resolveWalletSendAsset(from);
    if (!asset) throw new Error("Token not supported for on-chain swap");

    const { txHash, simulated } = await transferWalletAsset(
      wallet.address,
      treasury,
      String(amount),
      asset,
      provider,
      options,
    );
    if (simulated || !txHash) throw new Error("On-chain transfer failed");

    const result = await confirmOnChainSwap(from, to, txHash, wallet.address);
    void refreshBalancesAfterTx();
    return {
      netToAmount: result.netToAmount,
      feeAmount: result.feeAmount,
      source: result.source,
      delivery: result.delivery,
      txHash: result.txHash,
    };
  }, [holdings, refreshBalancesAfterTx, walletAddress]);

  const importCustomToken = useCallback(async (contractAddress: string) => {
    const addr = contractAddress.trim();
    if (!isAddress(addr)) throw new Error("Invalid address");

    const exists = customTokens.some((t) => t.address.toLowerCase() === addr.toLowerCase());

    const meta = await fetchCustomTokenMeta(addr);
    let balance = 0;
    if (walletAddress && isAddress(walletAddress)) {
      balance = await fetchCustomTokenBalance(meta.address, walletAddress, meta.decimals);
    }

    if (exists) {
      const next = customTokens.map((t) =>
        t.address.toLowerCase() === addr.toLowerCase()
          ? { ...meta, balance }
          : t,
      );
      setCustomTokens(next);
      saveCustomTokens(next);
      return;
    }

    const entry: CustomTokenRecord = { ...meta, balance };
    const next = [...customTokens, entry];
    setCustomTokens(next);
    saveCustomTokens(next);
  }, [customTokens, walletAddress]);

  const removeCustomToken = useCallback((contractAddress: string) => {
    const lower = contractAddress.toLowerCase();
    setCustomTokens((prev) => {
      const next = prev.filter((t) => t.address.toLowerCase() !== lower);
      saveCustomTokens(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const stored = loadCustomTokens();
    if (stored.length) setCustomTokens(stored);
  }, []);

  useEffect(() => {
    if (!walletAddress || !isAddress(walletAddress)) return;
    const walletKey = walletAddress.trim().toLowerCase();
    if (balanceWalletKeyRef.current === walletKey) return;

    const prevKey = balanceWalletKeyRef.current;
    if (prevKey && prevKey !== walletKey) {
      setPayLedgerSnapshot(null);
      setPayLedgerGat(0);
      setPayLedgerOnChainGat(0);
      balanceGatesRef.current.reset(prevKey);
    }
    balanceWalletKeyRef.current = walletKey;
    lastBalanceRefreshAtRef.current = 0;

    const snap = loadWalletSnapshot(walletAddress);
    if (snap) {
      balanceGatesRef.current.forAddress(walletAddress, { gat: snap.GAT, sda: snap.SDA });
      setHoldings((prev) => ({
        ...prev,
        GAT: snap.GAT,
        SDA: snap.SDA,
      }));
      setBalanceSource("onchain");
    }
  }, [walletAddress]);

  const walletDisplayHoldings = useMemo(
    () => mergeHoldingsForGarudaPrimeWallet(holdings, walletProviderProp),
    [holdings, walletProviderProp],
  );

  const onChainGat = walletDisplayHoldings.GAT ?? 0;

  const activeOnChainGat = useMemo(
    () => resolveActiveWalletOnChainGat(holdings, payLedgerSnapshot, walletAddress),
    [holdings, payLedgerSnapshot, walletAddress],
  );

  const garudaPrimeSpendableGat = useMemo(
    () => resolveGarudaPrimeSpendableGat(holdings, payLedgerSnapshot, walletAddress),
    [holdings, payLedgerSnapshot, walletAddress],
  );

  const tokens = useMemo(
    () => buildTokenRows(walletDisplayHoldings, customTokens),
    [walletDisplayHoldings, customTokens, tokenPriceTick],
  );
  const portfolioUsd = useMemo(
    () => portfolioTotalUsd(walletDisplayHoldings),
    [walletDisplayHoldings],
  );

  const ownerMerchantId = useMemo(
    () => (userId && !isDemoUser ? canonicalMerchantIdForOwner(userId) : null),
    [userId, isDemoUser],
  );

  const refreshMarketCatalog = useCallback(async () => {
    const products = await fetchPublishedProducts(ownerMerchantId);
    setCatalogProducts(products);
    return products;
  }, [ownerMerchantId]);

  const refreshMarketplace = useCallback(async () => {
    setMarketplaceLoading(true);
    try {
      if (ownerMerchantId && merchantProducts.length > 0) {
        const pendingUpload = merchantProducts.filter((p) => {
          const imgs = normalizeProductImages(p.imageUrl, p.imageUrls);
          return imgs.some((u) => u.startsWith("data:image/"));
        }) as MarketplaceProductDoc[];
        if (pendingUpload.length > 0) {
          await syncLocalProductsToFirestore(ownerMerchantId, pendingUpload);
        }
      }
      await refreshMarketCatalog();
    } catch (err) {
      console.warn("[marketplace] refresh failed", err);
      await refreshMarketCatalog().catch(() => undefined);
    } finally {
      setMarketplaceLoading(false);
    }
  }, [ownerMerchantId, merchantProducts, refreshMarketCatalog]);

  useEffect(() => {
    void refreshMarketCatalog().finally(() => setMarketplaceLoading(false));
    const unsub = subscribeMarketplaceProducts((products) => {
      setCatalogProducts(products);
      setMarketplaceLoading(false);
    }, ownerMerchantId);
    return () => { unsub?.(); };
  }, [ownerMerchantId, refreshMarketCatalog]);

  useEffect(() => {
    if (screen !== "market") return;
    void refreshMarketplace();
  }, [screen, refreshMarketplace]);

  useEffect(() => {
    if (isDemoUser) {
      const demoTx = loadTransactions(txStorageScope);
      setTransactions(demoTx);
      setTxId(nextTransactionId(demoTx));
      setNotifications(loadNotifications(notifStorageScope));
      return;
    }
    if (!userId) {
      const guest = loadTransactions();
      setTransactions(guest);
      setTxId(nextTransactionId(guest));
      setNotifications(loadNotifications());
      return;
    }
    const local = sanitizeTransactionHistory(migrateLegacyTransactions(userId));
    saveTransactions(userId, local);
    setTransactions(local);
    setTxId(nextTransactionId(local));
    setNotifications(migrateLegacyNotifications(userId));
  }, [userId, isDemoUser, txStorageScope, notifStorageScope]);

  const marketProducts = useMemo(() => catalogProducts, [catalogProducts]);

  const investedFunds = useMemo(() => investedFundsFromPositions(investPositions), [investPositions]);
  const portfolioProfit = useMemo(() => totalInvestProfit(investPositions), [investPositions]);
  const portfolioStakingReward = useMemo(
    () => totalStakingReward(stakingPositions, stakingProducts),
    [stakingPositions, stakingProducts],
  );
  const portfolioStakingRewardsByToken = useMemo(
    () =>
      totalStakingRewardByToken(stakingPositions, stakingProducts, {
        SDA: getTokenPriceUsd("SDA"),
        GAT: getTokenPriceUsd("GAT"),
      }),
    [stakingPositions, stakingProducts, tokenPriceTick],
  );

  const persistPortfolio = useCallback((inv: InvestPosition[], stk: StakingPosition[]) => {
    savePortfolio({ investments: inv, staking: stk });
    if (userId && !isDemoUser) void savePortfolioRemote(userId, { investments: inv, staking: stk });
  }, [userId, isDemoUser]);

  const openMarket = useCallback(() => {
    setActiveTool(null);
    setOverlayState("none");
    setScreen("market");
    void refreshMarketplace();
  }, [refreshMarketplace]);

  const openMarketCart = useCallback(() => {
    setActiveTool(null);
    setOverlayState("none");
    setDetail(null);
    setScreen("market");
    setMarketCartOpen(true);
  }, []);

  const closeMarketCart = useCallback(() => {
    setMarketCartOpen(false);
  }, []);

  const openInvestTab = useCallback((tab: "overview" | "portfolio" | "opportunities") => {
    setActiveTool(null);
    setOverlayState("none");
    setDetail(null);
    setScreen("invest");
    setPendingInvestTab(tab);
  }, []);

  const clearInvestTab = useCallback(() => {
    setPendingInvestTab(null);
  }, []);

  const openMerchantOrders = useCallback(() => {
    setMerchantPanelTab("orders");
    setActiveTool("merchant");
    setOverlayState("tool");
  }, []);

  const openBuyerOrders = useCallback(() => {
    setActiveTool("my-orders");
    setOverlayState("tool");
  }, []);

  const cancelOrder = useCallback((orderId: string) => {
    const target = marketOrders.find((o) => o.id === orderId);
    if (!target || target.status !== "pending") return false;
    const next = cancelMarketOrder(marketOrders, orderId);
    setMarketOrders(next);
    if (userId && !isDemoUser) void saveMarketOrdersRemote(userId, next);
    return true;
  }, [marketOrders, userId, isDemoUser]);

  const syncProductToMarketplace = useCallback(async (product: MerchantProduct) => {
    try {
      const synced = await upsertMarketplaceProduct(
        marketplaceDocFromMerchant(product),
        ownerMerchantId,
      );
      const remoteImages = synced.imageUrls?.filter((u) => u.startsWith("http")) ?? [];
      if (remoteImages.length > 0) {
        setMerchantProducts((prev) => {
          const next = prev.map((p) => (p.id === product.id ? {
            ...p,
            merchantId: synced.merchantId ?? p.merchantId,
            imageUrl: synced.imageUrl ?? remoteImages[0],
            imageUrls: remoteImages,
          } : p));
          saveMerchantProducts(next);
          return next;
        });
      }
      await refreshMarketCatalog();
    } catch (err) {
      console.warn("[marketplace] product sync failed", product.id, err);
    }
  }, [ownerMerchantId, refreshMarketCatalog]);

  const addMerchantProduct = useCallback((input: NewMerchantProductInput) => {
    const merchantId = userId
      ? canonicalMerchantIdForOwner(userId)
      : MERCHANT_ID;
    const sellerName = profileName?.trim() || MERCHANT_NAME;
    const product = buildMerchantProduct(input, merchantId, sellerName);
    setMerchantProducts((prev) => {
      const next = [product, ...prev];
      saveMerchantProducts(next);
      return next;
    });
    void syncProductToMarketplace(product);
    if (input.publish) {
      setMerchantStats((prev) => {
        const next = { ...prev, marketLinked: true };
        saveMerchantStats(next);
        return next;
      });
    }
  }, [syncProductToMarketplace, userId, profileName]);

  useEffect(() => {
    if (!userId) return;
    setMerchantProducts((prev) => {
      const next = reconcileMerchantProductIds(prev, userId, profileName);
      if (next === prev) return prev;
      saveMerchantProducts(next);
      next.filter((p) => p.published).forEach((p) => {
        void syncProductToMarketplace(p);
      });
      return next;
    });
  }, [userId, profileName, syncProductToMarketplace]);

  const updateMerchantProduct = useCallback((id: number, input: MerchantProductUpdateInput) => {
    const images = normalizeProductImages(input.imageUrls[0], input.imageUrls);
    setMerchantProducts((prev) => {
      const next = prev.map((p) => (p.id === id ? {
        ...p,
        name: input.name.trim(),
        price: input.price,
        cat: coerceMarketCategory(input.cat),
        imageUrl: images[0],
        imageUrls: images,
        description: input.description.trim(),
        published: input.publish,
      } : p));
      saveMerchantProducts(next);
      const updated = next.find((p) => p.id === id);
      if (updated) void syncProductToMarketplace(updated);
      const anyPublished = next.some((p) => p.published);
      setMerchantStats((s) => {
        const stats = { ...s, marketLinked: anyPublished };
        saveMerchantStats(stats);
        return stats;
      });
      return next;
    });
  }, [syncProductToMarketplace]);

  const toggleMerchantProductPublished = useCallback((id: number) => {
    setMerchantProducts((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, published: !p.published } : p));
      saveMerchantProducts(next);
      const updated = next.find((p) => p.id === id);
      if (updated) void syncProductToMarketplace(updated);
      const anyPublished = next.some((p) => p.published);
      setMerchantStats((s) => {
        const stats = { ...s, marketLinked: anyPublished };
        saveMerchantStats(stats);
        return stats;
      });
      return next;
    });
  }, [syncProductToMarketplace]);

  const removeMerchantProduct = useCallback((id: number) => {
    setMerchantProducts((prev) => {
      const removed = prev.find((p) => p.id === id);
      const next = prev.filter((p) => p.id !== id);
      saveMerchantProducts(next);
      if (removed) void syncProductToMarketplace({ ...removed, published: false });
      const anyPublished = next.some((p) => p.published);
      setMerchantStats((s) => {
        const stats = { ...s, marketLinked: anyPublished };
        saveMerchantStats(stats);
        return stats;
      });
      return next;
    });
  }, [syncProductToMarketplace]);

  const syncMerchantShopBranding = useCallback((branding: {
    sellerName: string;
    shopSymbol?: string;
    shopLocation?: string;
  }) => {
    const merchantId = userId
      ? canonicalMerchantIdForOwner(userId)
      : MERCHANT_ID;
    setMerchantProducts((prev) => {
      const next = applyMerchantBrandingToProducts(prev, merchantId, branding);
      if (next === prev) return prev;
      saveMerchantProducts(next);
      next.filter((p) => p.published).forEach((p) => {
        void syncProductToMarketplace(p);
      });
      return next;
    });
  }, [userId, syncProductToMarketplace]);

  const openWallet = useCallback((tab: WalletTab = "overview") => {
    setWalletTab(tab);
    setScreen("wallet");
    if (tab === "transactions") void refreshWalletActivityRef.current({ force: true });
  }, []);

  const openCommunity = useCallback((tab: CommunityTab = "overview") => {
    setCommunityTab(tab);
    setScreen("community");
  }, []);

  const openProfile = useCallback((section: ProfileSection = "main") => {
    setProfileSection(section);
    setOverlayState("profile");
  }, []);

  const closeProfile = useCallback(() => {
    setProfileSection("main");
    setOverlayState("none");
  }, []);

  const openProfileShipping = useCallback(() => {
    setProfileSection("shipping");
    setOverlayState("profile");
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    showAppToast(message, type);
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      saveNotifications(next, notifStorageScope);
      if (shouldSyncRemote && userId) void saveNotificationsRemote(userId, next);
      return next;
    });
  }, [userId, isDemoUser, notifStorageScope, shouldSyncRemote]);

  const markRead = useCallback((id: number) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      saveNotifications(next, notifStorageScope);
      if (shouldSyncRemote && userId) void saveNotificationsRemote(userId, next);
      return next;
    });
  }, [userId, isDemoUser, notifStorageScope, shouldSyncRemote]);

  const deleteNotification = useCallback((id: number) => {
    setNotifications((prev) => {
      const next = prev.filter((n) => n.id !== id);
      saveNotifications(next, notifStorageScope);
      if (shouldSyncRemote && userId) void saveNotificationsRemote(userId, next);
      return next;
    });
  }, [userId, isDemoUser, notifStorageScope, shouldSyncRemote]);

  const deleteAllNotifications = useCallback(() => {
    setNotifications(() => {
      const next: Notif[] = [];
      saveNotifications(next, notifStorageScope);
      if (shouldSyncRemote && userId) void saveNotificationsRemote(userId, next);
      return next;
    });
  }, [userId, isDemoUser, notifStorageScope, shouldSyncRemote]);

  const addNotification = useCallback((
    input: Omit<Notif, "id" | "read" | "time" | "createdAt"> & { time?: string; createdAt?: string },
  ) => {
    const createdAt = input.createdAt ?? new Date().toISOString();
    setNotifications((prev) => {
      if (input.type === "wallet" && hasWalletConnectedNotification(prev, input.body)) {
        return prev;
      }
      if (input.type === "kyc" && hasKycNotification(prev, input.title, input.body)) {
        return prev;
      }
      if (hasRecentDuplicateNotification(prev, input)) {
        return prev;
      }
      const entry: Notif = {
        id: nextNotificationId(prev),
        type: input.type,
        title: input.title,
        body: input.body,
        action: input.action,
        createdAt,
        time: input.time ?? formatNotifTime(createdAt, "id"),
        read: false,
      };
      const next = dedupeNotifications([entry, ...prev]).slice(0, 50);
      saveNotifications(next, notifStorageScope);
      if (shouldSyncRemote && userId) void saveNotificationsRemote(userId, next);
      return next;
    });
  }, [userId, isDemoUser, notifStorageScope, shouldSyncRemote]);

  const prevWalletRef = useRef<string | null>(null);

  const applyTransactionHistory = useCallback((items: Tx[]) => {
    const cleaned = sanitizeTransactionHistory(items);
    const freshReceives = cleaned.filter((tx) => {
      if ((tx.type ?? "send").toLowerCase() !== "receive") return false;
      if (tx.txHash?.trim()) {
        return !knownReceiveTxHashesRef.current.has(tx.txHash.trim().toLowerCase());
      }
      return !knownReceiveIdsRef.current.has(tx.id);
    });
    for (const tx of cleaned) {
      if ((tx.type ?? "send").toLowerCase() === "receive") {
        knownReceiveIdsRef.current.add(tx.id);
        if (tx.txHash?.trim()) {
          knownReceiveTxHashesRef.current.add(tx.txHash.trim().toLowerCase());
        }
      }
    }
    saveTransactions(txStorageScope, cleaned);
    setTransactions(cleaned);
    setTxId(nextTransactionId(cleaned));
    if (freshReceives.length) {
      scheduleWalletActivityBurst();
      if (walletAddress) {
        balanceGatesRef.current.reset(walletAddress);
        void refreshBalancesAfterTxRef.current();
      }
      void refreshPayLedgerRef.current();
    }
  }, [txStorageScope, walletAddress, scheduleWalletActivityBurst]);

  const refreshTransactionHistory = useCallback(async (options?: { skipBalanceRefresh?: boolean }) => {
    if (isDemoUser) {
      applyTransactionHistory(loadTransactions(txStorageScope));
      return;
    }
    if (!userId) {
      applyTransactionHistory(loadTransactions());
      return;
    }
    const local = loadTransactions(txStorageScope);
    if (shouldSyncRemote && isFirebaseConfigured) {
      const remote = await fetchUserTransactions(userId).catch(() => null);
      if (remote) {
        applyTransactionHistory(mergeTransactions(local, remote));
      } else {
        applyTransactionHistory(local);
      }
    } else {
      applyTransactionHistory(local);
    }
    if (!options?.skipBalanceRefresh && walletAddress && isLiveWallet) {
      await refreshBalances({ force: true });
    }
    const scope = isDemoUser ? txStorageScope : (userId ? txStorageScope : undefined);
    const latest = loadTransactions(scope);
    void syncPendingPayReceiptHashes(latest, (id, data) => patchTransactionRef.current(id, data));
  }, [
    userId,
    isDemoUser,
    txStorageScope,
    shouldSyncRemote,
    walletAddress,
    isLiveWallet,
    applyTransactionHistory,
    refreshBalances,
  ]);

  const refreshWalletActivity = useCallback(async (options?: { force?: boolean }) => {
    if (walletActivitySyncInFlightRef.current && !options?.force) return;
    walletActivitySyncInFlightRef.current = true;
    try {
      await Promise.all([
        refreshBalances({ force: options?.force }),
        refreshTransactionHistory({ skipBalanceRefresh: true }),
        refreshPayLedger(),
      ]);
    } finally {
      walletActivitySyncInFlightRef.current = false;
    }
  }, [refreshBalances, refreshTransactionHistory, refreshPayLedger]);

  refreshTransactionHistoryRef.current = () => refreshTransactionHistory();
  refreshWalletActivityRef.current = refreshWalletActivity;

  useEffect(() => {
    void refreshWalletActivity({ force: true });
  }, [walletAddress, isLiveWallet, userId, isDemoUser, refreshWalletActivity]);

  useEffect(() => {
    if (isDemoUser) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      if (cancelled) return;
      const delay = walletActivityPollDelayMs(walletActivityBurstUntilRef.current);
      timer = window.setTimeout(() => {
        void refreshWalletActivityRef.current().finally(scheduleNext);
      }, delay);
    };

    scheduleNext();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refreshWalletActivityRef.current({ force: true });
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isDemoUser, userId, walletAddress]);

  useEffect(() => {
    const seed = loadTransactions(txStorageScope);
    knownReceiveTxHashesRef.current = new Set(
      seed
        .filter((tx) => (tx.type ?? "send").toLowerCase() === "receive" && tx.txHash?.trim())
        .map((tx) => tx.txHash!.trim().toLowerCase()),
    );
    knownReceiveIdsRef.current = new Set(
      seed
        .filter((tx) => (tx.type ?? "send").toLowerCase() === "receive")
        .map((tx) => tx.id),
    );
  }, [userId, txStorageScope]);

  useEffect(() => {
    if (!userId || isDemoUser || !isFirebaseConfigured) return;
    let cancelled = false;
    void refreshTransactionHistoryRef.current();

    const txUnsub = subscribeUserTransactions(
      userId,
      (items) => {
        if (!cancelled) applyTransactionHistory(items);
      },
      () => {
        if (!cancelled) void refreshTransactionHistoryRef.current();
      },
    );

    return () => {
      cancelled = true;
      txUnsub?.();
    };
  }, [userId, isDemoUser, applyTransactionHistory]);

  useEffect(() => {
    if (!userId || isDemoUser) return;
    void ensureUserMerchant().catch(() => null);
  }, [userId, isDemoUser]);

  useEffect(() => {
    if (!userId || isDemoUser) return;
    setNotifications((prev) => {
      const deduped = dedupeNotifications(prev);
      if (deduped.length === prev.length) return prev;
      saveNotifications(deduped, notifStorageScope);
      if (shouldSyncRemote) void saveNotificationsRemote(userId, deduped);
      return deduped;
    });
  }, [userId, isDemoUser, notifStorageScope, shouldSyncRemote]);

  useEffect(() => {
    if (!userId || isDemoUser || !isFirebaseConfigured) return;
    let cancelled = false;
    const unsubs: Array<() => void> = [];

    const runBootstrap = () => {
    void bootstrapUserAppData(userId).then(async () => {
      if (cancelled) return;
      const merchantIds = await resolveMerchantIdsForUser(userId);
      if (cancelled) return;
      const orderUnsub = subscribeUserOrders(userId, (orders) => {
        if (!cancelled) setMarketOrders(orders);
      }, undefined, merchantIds);
      const portfolioUnsub = subscribeUserPortfolio(userId, (state) => {
        if (!cancelled) {
          setInvestPositions(state.investments);
          setStakingPositions(state.staking);
        }
      });
      const notifUnsub = subscribeUserNotifications(userId, (items) => {
        if (!cancelled) {
          setNotifications(items);
          if (items.some((n) => n.type === "receive")) {
            void refreshWalletActivityRef.current({ force: true });
          }
        }
      });
      if (orderUnsub) unsubs.push(orderUnsub);
      if (portfolioUnsub) unsubs.push(portfolioUnsub);
      if (notifUnsub) unsubs.push(notifUnsub);
      const broadcastUnsub = subscribePlatformBroadcasts(userId, (b) => {
        if (cancelled) return;
        addNotification(
          b.channel === "security"
            ? notificationEvents.systemSecurity(b.message)
            : notificationEvents.systemBroadcast(b.title, b.message),
        );
      });
      if (broadcastUnsub) unsubs.push(broadcastUnsub);
    });
    };

    if (typeof requestIdleCallback !== "undefined") {
      const idleId = requestIdleCallback(runBootstrap, { timeout: 2_000 });
      return () => {
        cancelled = true;
        cancelIdleCallback(idleId);
        unsubs.forEach((fn) => fn());
      };
    }

    const deferId = window.setTimeout(runBootstrap, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(deferId);
      unsubs.forEach((fn) => fn());
    };
  }, [userId, isDemoUser, addNotification]);

  useEffect(() => {
    if (!isLiveWallet) {
      prevWalletRef.current = null;
      return;
    }
    const next = walletAddress?.trim() || null;
    if (!next) {
      if (prevWalletRef.current) {
        addNotification(notificationEvents.walletDisconnected());
      }
      prevWalletRef.current = null;
      return;
    }

    const normalized = next.toLowerCase();
    const timer = window.setTimeout(() => {
      const stable = walletAddress?.trim();
      if (!stable || stable.toLowerCase() !== normalized) return;

      const prev = prevWalletRef.current;
      if (prev === normalized) return;

      if (!prev || prev !== normalized) {
        setNotifications((current) => {
          const payload = notificationEvents.walletConnected(stable);
          if (!shouldEmitWalletConnectedNotif(userId, stable, current)) {
            return current;
          }
          const createdAt = new Date().toISOString();
          const entry: Notif = {
            id: nextNotificationId(current),
            type: payload.type,
            title: payload.title,
            body: payload.body,
            action: payload.action,
            createdAt,
            time: formatNotifTime(createdAt, "id"),
            read: false,
          };
          const merged = dedupeNotifications([entry, ...current]).slice(0, 50);
          saveNotifications(merged, notifStorageScope);
          if (shouldSyncRemote && userId) void saveNotificationsRemote(userId, merged);
          return merged;
        });
      }
      prevWalletRef.current = normalized;
    }, 600);

    return () => window.clearTimeout(timer);
  }, [isLiveWallet, walletAddress, addNotification, userId, notifStorageScope, shouldSyncRemote]);

  useEffect(() => {
    if (!userId || isDemoUser || kycStatusFromServer === undefined) return;

    const status = kycStatusFromServer;
    if (status !== "pending" && status !== "verified" && status !== "rejected") return;

    const reasonNorm = (kycRejectionReasonFromServer ?? "").trim();
    const tier = resolveKycTierFromProfile(kycTierFromServer, status);
    const fingerprint = kycNotifFingerprint(status, reasonNorm, tier);
    const seen = loadKycNotifSeen(userId);
    if (seen && kycNotifFingerprint(seen.status, seen.reason, seen.tier) === fingerprint) {
      prevKycStatusRef.current = status;
      return;
    }

    if (status === "pending") {
      addNotification(notificationEvents.kycPendingReview());
    } else if (status === "verified") {
      showToast("KYC Anda telah disetujui! Tier 3 aktif.", "success");
      addNotification(notificationEvents.kycApproved(tier));
    } else if (status === "rejected") {
      setKycResubmitMode(false);
      showToast("KYC ditolak, lihat alasan di notifikasi.", "error");
      addNotification(notificationEvents.kycRejected(reasonNorm || null));
    }

    saveKycNotifSeen(userId, { status, reason: reasonNorm, tier });
    prevKycStatusRef.current = status;
  }, [
    userId,
    isDemoUser,
    kycStatusFromServer,
    kycRejectionReasonFromServer,
    kycTierFromServer,
    addNotification,
    showToast,
  ]);

  const refreshInvestmentFunds = useCallback(async () => {
    const funds = await fetchInvestmentFunds();
    setInvestmentFunds(funds);
  }, []);

  const refreshPlatformPrograms = useCallback(async () => {
    const bundle = await fetchPlatformPrograms();
    const products = Array.isArray(bundle.staking?.products) && bundle.staking.products.length
      ? bundle.staking.products
      : STAKING_PRODUCTS;
    setStakingProducts(products);
    setCommunityConfig(bundle.community);
    setReferralConfig(bundle.referral);
    if (bundle.tokenPrices?.prices) {
      setTokenPricesUsd(bundle.tokenPrices.prices);
      setTokenPriceTick((n) => n + 1);
    }
  }, []);

  const checkAppVersion = useCallback(async () => {
    try {
      const res = await fetch(`/app-version.json?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json() as { version?: string };
      if (!data?.version) return;
      const key = "gp-app-version";
      const prev = localStorage.getItem(key);
      if (shouldReloadForAppVersion(prev, data.version)) {
        persistAppVersion(data.version);
        try {
          if (sessionStorage.getItem("gp_oauth_pending") === "1") return;
        } catch { /* ignore */ }
        location.reload();
        return;
      }
      persistAppVersion(data.version);
    } catch {
      /* ignore version check errors */
    }
  }, []);

  useEffect(() => {
    void refreshPlatformPrograms();
    captureReferralFromUrl();
  }, [refreshPlatformPrograms]);

  const refreshReferralStats = useCallback(async () => {
    if (!userId || isDemoUser) {
      setReferralStats(null);
      prevReferralEarnedRef.current = null;
      return;
    }
    setReferralLoading(true);
    try {
      const stats = await fetchReferralStats();
      if (stats) {
        const prev = prevReferralEarnedRef.current;
        if (prev !== null && stats.totalEarnedGat > prev) {
          const delta = stats.totalEarnedGat - prev;
          showToast(`+${delta} GAT referral reward`, "success");
          addNotification(notificationEvents.referralBonus(delta));
          void refreshBalances({ force: true });
        }
        prevReferralEarnedRef.current = stats.totalEarnedGat;
        setReferralStats(stats);
      }
    } catch {
      /* keep previous */
    } finally {
      setReferralLoading(false);
    }
  }, [userId, isDemoUser, showToast, refreshBalances, addNotification]);

  const refreshUserRemoteData = useCallback(async () => {
    if (!userId || isDemoUser) return;
    const merchantIds = await resolveMerchantIdsForUser(userId);
    const [orders, portfolio, notifs, txs] = await Promise.all([
      fetchUserOrders(userId, merchantIds).catch(() => null),
      fetchUserPortfolio(userId).catch(() => null),
      fetchUserNotifications(userId).catch(() => null),
      fetchUserTransactions(userId).catch(() => null),
    ]);
    if (orders) setMarketOrders(orders);
    if (portfolio) {
      setInvestPositions(portfolio.investments);
      setStakingPositions(portfolio.staking);
    }
    if (notifs) {
      const merged = dedupeNotifications(notifs).slice(0, 50);
      saveNotifications(merged, notifStorageScope);
      setNotifications(merged);
    }
    if (txs) {
      const local = loadTransactions(txStorageScope);
      applyTransactionHistory(mergeTransactions(local, txs));
    }
  }, [userId, isDemoUser, txStorageScope, applyTransactionHistory]);

  const refreshAppData = useCallback(async () => {
    const capped = <T,>(promise: Promise<T>, ms: number) =>
      Promise.race([
        promise.catch(() => undefined),
        new Promise<undefined>((resolve) => window.setTimeout(resolve, ms)),
      ]);

    refreshSecurityPrefs();
    if (userId) {
      const local = loadProfilePhoto(userId);
      setProfilePhotoUrl(local ?? (profileAvatarProp?.trim() || null));
    }

    await Promise.all([
      capped(refreshBalances({ force: true }), 3500),
      capped(loadTokenPricesFromApi(), 2500),
      capped(refreshPlatformPrograms(), 3000),
      capped(refreshInvestmentFunds(), 3000),
      capped(refreshReferralStats(), 3000),
      capped(refreshMarketplace(), 3000),
      capped(refreshUserRemoteData(), 3500),
      capped(loadFeeConfigFromApi(), 2000),
      capped(onRefreshUserProfile?.() ?? Promise.resolve(), 3500),
    ]);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("gp-app-refresh"));
    }
    void checkAppVersion();
  }, [
    refreshBalances,
    refreshWalletActivity,
    refreshPlatformPrograms,
    refreshInvestmentFunds,
    refreshReferralStats,
    refreshMarketplace,
    refreshUserRemoteData,
    refreshSecurityPrefs,
    checkAppVersion,
    onRefreshUserProfile,
    userId,
    profileAvatarProp,
  ]);

  const bindUserReferralCode = useCallback(async (code: string) => {
    const result = await bindReferralCodeClient(code);
    if (result.ok) {
      addNotification(notificationEvents.referralJoined());
      await refreshReferralStats();
    }
    return result;
  }, [refreshReferralStats, addNotification]);

  const isShippingComplete = isShippingAddressComplete(shippingAddress);

  const requireShipping = useCallback((message?: string) => {
    if (isShippingAddressComplete(shippingAddress)) return true;
    showToast(message ?? "Lengkapi pengiriman digital di Pengaturan", "error");
    setProfileSection("shipping");
    setOverlayState("profile");
    return false;
  }, [shippingAddress, showToast]);

  const isKycVerified = isKycFullyVerified(kycTier, kycStatus);

  useEffect(() => {
    void refreshReferralStats();
  }, [refreshReferralStats]);

  useEffect(() => {
    if (!userId || isDemoUser) return;
    const id = window.setInterval(() => void refreshReferralStats(), 60_000);
    return () => window.clearInterval(id);
  }, [userId, isDemoUser, refreshReferralStats]);

  useEffect(() => {
    if (!userId || isDemoUser || !isKycVerified) return;
    if (!isReferralUsageEnabled(referralConfig)) return;
    if (kycTier < referralConfig.requireKycTier) return;
    void processReferralKycClient().then((result) => {
      if (result?.processed || result?.baseProcessed || (result?.tierBonus ?? 0) > 0) {
        void refreshReferralStats();
      }
    });
  }, [userId, isDemoUser, isKycVerified, kycTier, referralConfig, refreshReferralStats]);
  const isKycPending = isKycPendingReview(kycStatus);
  const isKycRejectedFlag = isKycRejected(kycStatus);

  const kycAddressRef = useRef(kycAddress);
  kycAddressRef.current = kycAddress;

  const beginKycFlow = useCallback(() => {
    const residence = readResidenceCountry() ?? detectDefaultCountryCode();
    if (userId) clearKycPreuploadCache(userId);
    setKycFlowStep(0);
    const saved = kycAddressRef.current;
    const domicile = saved.addressLine1 ? saved : emptyKycAddress(residence);
    setKycFlowData({
      personalFullName: profileName?.trim() || "",
      personalEmail: profileEmail?.trim() || "",
      personalPhone: profilePhone?.trim() || "",
      country: domicile.country || residence,
      documentType: getDefaultDocType(domicile.country || residence),
      documentTypeOther: "",
      idDocumentFront: null,
      idDocumentBack: null,
      faceVerified: false,
      faceCapture: null,
      livenessStep1Capture: null,
      livenessStep2Capture: null,
      livenessStep3Capture: null,
      livenessPassed: false,
      livenessScore: 0,
      faceMatchScore: 0,
      faceMatchPassed: false,
      autoVerifyComplete: false,
      ocrMatchScore: 0,
      ktpSelfieFront: null,
      ktpSelfieBack: null,
      addressProof: null,
      domicile: { ...domicile, country: domicile.country || residence },
      ktpExtracted: null,
      geo: null,
    });
  }, [userId, profileName, profileEmail, profilePhone]);

  const openKycGate = useCallback(() => {
    beginKycFlow();
    setProfileSection("kyc-flow");
    setOverlayState("profile");
  }, [beginKycFlow]);

  const openToolPanel = useCallback((tool: ToolPanelId) => {
    if (tool === "merchant" && !isKycVerified) {
      showToast(kycBlockedMessage, "warning");
      openKycGate();
      return;
    }
    if (tool !== "merchant") setMerchantPanelTab("dashboard");
    setActiveTool(tool);
    setOverlayState("tool");
    if (tool === "transactions") void refreshWalletActivityRef.current({ force: true });
  }, [isKycVerified, kycBlockedMessage, showToast, openKycGate]);

  const requireKyc = useCallback((message: string) => {
    if (isKycVerified) return true;
    showToast(message, "warning");
    openKycGate();
    return false;
  }, [isKycVerified, showToast, openKycGate]);

  const setOverlay = useCallback((o: Overlay) => {
    setOverlayState((prev) => {
      if (prev === "profile" && o !== "profile") setProfileSection("main");
      return o;
    });
    if (o !== "scan") setScanLockedMode(null);
  }, []);

  const requestOverlay = useCallback((o: Overlay) => {
    if (GATED_OVERLAYS.includes(o) && !isKycVerified) {
      showToast(kycBlockedMessage, "warning");
      openKycGate();
      return false;
    }
    if (o !== "send") setSendPrefill(null);
    if (o !== "pay") setPayScanPrefill(null);
    if (o !== "receive") setReceiveViewPrefill(null);
    setOverlayState(o);
    return true;
  }, [isKycVerified, kycBlockedMessage, showToast, openKycGate]);

  const requestSendOverlay = useCallback((prefill?: SendTokenPrefill) => {
    if (!isKycVerified) {
      showToast(kycBlockedMessage, "warning");
      openKycGate();
      return false;
    }
    setDetail(null);
    setPayScanPrefill(null);
    setReceiveViewPrefill(null);
    setSendPrefill(prefill ?? null);
    setOverlayState("send");
    return true;
  }, [isKycVerified, kycBlockedMessage, showToast, openKycGate]);

  const requestReceiveOverlay = useCallback((view: ReceivePanelView = "assets") => {
    setDetail(null);
    setSendPrefill(null);
    setPayScanPrefill(null);
    setReceiveViewPrefill(view);
    setOverlayState("receive");
    return true;
  }, []);

  const requestPayOverlay = useCallback((prefill?: PayScanPrefill) => {
    if (!isKycVerified) {
      showToast(kycBlockedMessage, "warning");
      openKycGate();
      return false;
    }
    const locked = lockPayTarget(prefill);
    if (!locked) {
      return false;
    }
    setDetail(null);
    setSendPrefill(null);
    setPayScanPrefill(locked);
    setPayQrChannel("onchain");
    setOverlayState("pay");
    return true;
  }, [isKycVerified, kycBlockedMessage, showToast, openKycGate]);

  const toggleOverlay = useCallback((o: Overlay) => {
    if (GATED_OVERLAYS.includes(o) && !isKycVerified) {
      showToast(kycBlockedMessage, "warning");
      openKycGate();
      return;
    }
    let openingReceive = false;
    setOverlayState((prev) => {
      if (prev === o) {
        if (o === "profile") setProfileSection("main");
        return "none";
      }
      if (prev === "profile" && o !== "profile") setProfileSection("main");
      if (o === "receive") openingReceive = true;
      return o;
    });
    if (openingReceive) setReceiveViewPrefill("assets");
    if (o !== "scan") setScanLockedMode(null);
  }, [isKycVerified, kycBlockedMessage, showToast, openKycGate]);

  const openScan = useCallback((mode: ScanMode = "pay", lock = false) => {
    if ((mode === "pay" || mode === "send") && !isKycVerified) {
      showToast(kycBlockedMessage, "warning");
      openKycGate();
      return;
    }
    setScanMode(mode);
    setScanLockedMode(lock ? mode : null);
    setOverlayState("scan");
  }, [isKycVerified, kycBlockedMessage, showToast, openKycGate]);

  const openDetail = useCallback((d: DetailTarget) => {
    if (!d) {
      setDetail(null);
      setOverlayState("none");
      return;
    }
    setDetail(d);
    if (d.kind === "token") setOverlayState("token");
    else if (d.kind === "fund") setOverlayState("fund");
    else if (d.kind === "product") setOverlayState("product");
    else if (d.kind === "transaction") setOverlayState("transaction");
  }, []);

  const closeDetail = useCallback(() => {
    setDetail(null);
    setOverlayState("none");
  }, []);

  const copyText = useCallback(async (text: string, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copied to clipboard`);
    } catch {
      showToast("Failed to copy", "error");
    }
  }, [showToast]);

  const openNotification = useCallback((id: number) => {
    const target = notifications.find((n) => n.id === id);
    if (!target) return;
    markRead(id);
    const action = target.action;
    if (!action) return;

    setOverlayState("none");
    setDetail(null);

    const run = (a: NotifAction) => {
      switch (a.type) {
        case "screen":
          setScreen(a.screen);
          break;
        case "overlay":
          if (a.overlay === "wallet") {
            setScreen("wallet");
          } else {
            setOverlayState(a.overlay);
          }
          break;
        case "profileSection":
          openProfile(a.section);
          break;
        case "buyerOrders":
          openBuyerOrders();
          break;
        case "investTab":
          openInvestTab(a.tab);
          break;
        case "transaction":
          setDetail({ kind: "transaction", id: a.txId });
          setOverlayState("transaction");
          break;
        default:
          break;
      }
    };
    run(action);
  }, [notifications, markRead, openBuyerOrders, openInvestTab, openProfile]);

  const shareWalletAddressFn = useCallback(async (message: string, title?: string) => {
    return shareWalletAddressLib(walletAddress, message, title);
  }, [walletAddress]);

  const shareContentFn = useCallback(async (text: string, title?: string) => {
    return shareText(text, { title });
  }, []);

  const cancelOrderWithNotif = useCallback((orderId: string) => {
    const ok = cancelOrder(orderId);
    if (ok) {
      addNotification({
        type: "order",
        title: "Pesanan Dibatalkan",
        body: `${orderId} telah dibatalkan`,
        action: { type: "buyerOrders" },
      });
    }
    return ok;
  }, [cancelOrder, addNotification]);

  const refreshNotifications = useCallback(async () => {
    if (isDemoUser) {
      setNotifications(dedupeNotifications(loadNotifications(notifStorageScope)));
      return;
    }
    if (!userId) {
      setNotifications(dedupeNotifications(loadNotifications()));
      return;
    }
    const remote = await fetchUserNotifications(userId).catch(() => null);
    if (remote) {
      const merged = dedupeNotifications(remote).slice(0, 50);
      saveNotifications(merged, notifStorageScope);
      setNotifications(merged);
    } else {
      setNotifications(dedupeNotifications(loadNotifications(notifStorageScope)));
    }
  }, [userId, isDemoUser, notifStorageScope]);

  const addTransaction = useCallback((tx: Omit<Tx, "id">): number => {
    let assignedId = 0;
    const kind = tx.type.toLowerCase();
    if (kind === "send" || kind === "swap" || kind === "deposit" || kind === "pay") {
      const symbol = tx.amount.match(/([A-Z]{2,5})\s*$/i)?.[1] ?? "GAT";
      markRecentOutbound(symbol);
    }
    setTransactions((prev) => {
      const row: Tx = { ...tx, id: nextTransactionId(prev) };
      assignedId = row.id;
      const next = sanitizeTransactionHistory([row, ...prev.filter((item) => item.id !== row.id)]);
      saveTransactions(txStorageScope, next);
      if (shouldSyncRemote && userId) void upsertUserTransaction(userId, row);
      queueMicrotask(() => {
        setTxId(nextTransactionId(next));
        setNotifications((prevNotifs) => {
          const merged = mergeTxNotification(prevNotifs, row);
          saveNotifications(merged, notifStorageScope);
          if (shouldSyncRemote && userId) void saveNotificationsRemote(userId, merged);
          return merged;
        });
        scheduleWalletActivityBurst();
        void refreshWalletActivityRef.current({ force: true });
      });
      return next;
    });
    return assignedId;
  }, [txStorageScope, shouldSyncRemote, userId, notifStorageScope, scheduleWalletActivityBurst]);

  const patchTransaction = useCallback((txId: number, patch: Partial<Tx>) => {
    if (txId <= 0) return;
    setTransactions((prev) => {
      const existing = prev.find((item) => item.id === txId);
      if (!existing) return prev;
      const row: Tx = { ...existing, ...patch };
      const next = sanitizeTransactionHistory([row, ...prev.filter((item) => item.id !== txId)]);
      saveTransactions(txStorageScope, next);
      if (shouldSyncRemote && userId) void upsertUserTransaction(userId, row);
      if (patch.txHash?.trim() || patch.status) {
        scheduleWalletActivityBurst();
        queueMicrotask(() => {
          if (isTxConfirmedStatus(row.status) || patch.txHash?.trim()) {
            setNotifications((prevNotifs) => {
              const merged = mergeTxNotification(prevNotifs, row);
              saveNotifications(merged, notifStorageScope);
              if (shouldSyncRemote && userId) void saveNotificationsRemote(userId, merged);
              return merged;
            });
          }
          void refreshWalletActivityRef.current({ force: true });
        });
      }
      return next;
    });
  }, [txStorageScope, shouldSyncRemote, userId, notifStorageScope, scheduleWalletActivityBurst]);

  patchTransactionRef.current = patchTransaction;

  applyInboundReceivesRef.current = async (balances) => {
    if (!walletAddress || !isLiveWallet || isDemoUser) return;
    const existing = loadTransactions(txStorageScope);
    const drafts = await discoverInboundReceiveDrafts(walletAddress, existing, balances);
    if (!drafts.length) return;
    balanceGatesRef.current.reset(walletAddress);
    scheduleWalletActivityBurst();
    for (const draft of drafts) {
      addTransaction(draft);
      if (draft.txHash) {
        knownReceiveTxHashesRef.current.add(draft.txHash.trim().toLowerCase());
      }
    }
    if (balances) commitWalletSnapshot(walletAddress, balances.gat, balances.sda);
    await refreshBalancesAfterTxRef.current();
  };

  const beginMobileTransaction = useCallback((
    draft: Omit<Tx, "id">,
    meta?: MobilePendingMeta,
  ): number => {
    const prev = loadTransactions(txStorageScope);
    const row: Tx = { ...draft, id: nextTransactionId(prev) };
    const next = sanitizeTransactionHistory([row, ...prev.filter((item) => item.id !== row.id)]);
    setTransactions(next);
    setTxId(nextTransactionId(next));
    saveTransactions(txStorageScope, next);
    if (shouldSyncRemote && userId) void upsertUserTransaction(userId, row);
    saveMobilePending({
      txId: row.id,
      uid: userId ?? undefined,
      startedAt: new Date().toISOString(),
      kind: meta?.kind ?? "wallet",
      walletAddress: meta?.walletAddress,
      amountGat: meta?.amountGat,
    });
    const pendingNotif = notificationEvents.walletTransactionPending(
      draft.type,
      draft.amount,
      row.id,
    );
    addNotification(pendingNotif);
    return row.id;
  }, [txStorageScope, shouldSyncRemote, userId, addNotification]);

  const completeMobileTransaction = useCallback((txId: number, patch: Partial<Tx>) => {
    if (txId < 0) return;
    clearMobilePending();
    const prev = loadTransactions(txStorageScope);
    const existing = prev.find((item) => item.id === txId);
    if (!existing) return;
    const row: Tx = { ...existing, ...patch };
    const next = sanitizeTransactionHistory([row, ...prev.filter((item) => item.id !== txId)]);
    setTransactions(next);
    setTxId(nextTransactionId(next));
    saveTransactions(txStorageScope, next);
    if (shouldSyncRemote && userId) void upsertUserTransaction(userId, row);
    const confirmed = isTxConfirmedStatus(row.status);
    setNotifications((prevNotifs) => {
      const merged = confirmed
        ? mergeTxNotification(prevNotifs, row)
        : filterNotificationsForCompletedTx(prevNotifs, txId);
      saveNotifications(merged, notifStorageScope);
      if (shouldSyncRemote && userId) void saveNotificationsRemote(userId, merged);
      return merged;
    });
    scheduleWalletActivityBurst();
    void refreshWalletActivityRef.current({ force: true });
  }, [txStorageScope, shouldSyncRemote, userId, notifStorageScope, scheduleWalletActivityBurst]);

  const cancelMobileTransaction = useCallback((txId: number) => {
    if (txId < 0) return;
    clearMobilePending();
    const prev = loadTransactions(txStorageScope);
    const existing = prev.find((item) => item.id === txId);
    if (!existing) return;
    const row: Tx = { ...existing, status: "Dibatalkan" };
    const next = [row, ...prev.filter((item) => item.id !== txId)].slice(0, 100);
    setTransactions(next);
    setTxId(nextTransactionId(next));
    saveTransactions(txStorageScope, next);
    if (shouldSyncRemote && userId) void cancelUserTransaction(userId, row);
  }, [txStorageScope, shouldSyncRemote, userId]);

  const reconcileMobileTransactions = useCallback(() => {
    const pending = loadMobilePending();
    if (!pending) return;
    if (pending.uid && userId && pending.uid !== userId) return;
    if (pending.kind === "deposit") return;

    const txHash = takeMobileTxHash();
    const prev = loadTransactions(txStorageScope);
    const existing = prev.find((item) => item.id === pending.txId);

    if (txHash && existing) {
      completeMobileTransaction(pending.txId, {
        txHash,
        status: isPendingTxStatus(existing.status) ? "Terkonfirmasi" : existing.status,
      });
      return;
    }

    if (existing && !txHash) {
      setTransactions(prev);
      setTxId(nextTransactionId(prev));
    }
  }, [userId, txStorageScope, completeMobileTransaction]);

  useEffect(() => {
    reconcileMobileTransactions();
  }, [reconcileMobileTransactions]);

  useEffect(() => {
    const wallets = transactions
      .map((tx) => tx.counterpartyWallet)
      .filter((addr): addr is string => Boolean(addr));
    if (!wallets.length || isDemoUser) return;
    void prefetchWalletDisplayNames(wallets);
  }, [transactions, isDemoUser]);

  useEffect(() => {
    if (!walletAddress || !isLiveWallet || isDemoUser) return;

    const pending = loadTransactions(txStorageScope).filter(receiveNeedsEnrichment);
    if (!pending.length) return;

    let cancelled = false;
    void (async () => {
      for (const tx of pending.slice(0, 8)) {
        if (cancelled) return;
        const patch = await enrichReceiveTransaction(walletAddress, tx);
        if (!patch) continue;

        setTransactions((current) => {
          const existing = current.find((row) => row.id === tx.id);
          if (!existing) return current;
          const updated: Tx = { ...existing, ...patch };
          const next = [updated, ...current.filter((row) => row.id !== tx.id)].slice(0, 100);
          saveTransactions(txStorageScope, next);
          if (shouldSyncRemote && userId) void upsertUserTransaction(userId, updated);
          return next;
        });
      }
    })();

    return () => { cancelled = true; };
  }, [transactions, walletAddress, isLiveWallet, isDemoUser, txStorageScope, shouldSyncRemote, userId]);

  useEffect(() => {
    void checkAppVersion();
  }, [checkAppVersion]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onMobileResume = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void checkAppVersion();
        reconcileMobileTransactions();
        void refreshWalletActivityRef.current({ force: true });
      }, 500);
    };
    document.addEventListener("visibilitychange", onMobileResume);
    window.addEventListener("pageshow", onMobileResume);
    window.addEventListener("focus", onMobileResume);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onMobileResume);
      window.removeEventListener("pageshow", onMobileResume);
      window.removeEventListener("focus", onMobileResume);
    };
  }, [checkAppVersion, reconcileMobileTransactions]);

  useEffect(() => {
    if (screen !== "home" && screen !== "wallet") return;
    void refreshWalletActivityRef.current({ force: true });
  }, [walletTab, activeTool, screen]);

  const addToCart = useCallback((productId: number, name: string, price: number) => {
    if (!isKycVerified) {
      showToast(kycBlockedMessage, "warning");
      openKycGate();
      return false;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === productId);
      if (existing) {
        return prev.map((i) => (i.productId === productId ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { productId, name, price, qty: 1 }];
    });
    return true;
  }, [isKycVerified, kycBlockedMessage, showToast, openKycGate]);

  const removeFromCart = useCallback((productId: number) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const updateCartQty = useCallback((productId: number, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    setCart((prev) => prev.map((i) => (i.productId === productId ? { ...i, qty } : i)));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const buildDefaultShipping = useCallback((): ShippingAddress => {
    return buildShippingFromSources({
      profileName,
      profilePhone,
      profileEmail,
      savedShipping: loadShippingAddress(),
    });
  }, [profileName, profilePhone, profileEmail]);

  const saveKycAddressProfile = useCallback((addr: KycAddress) => {
    setKycAddressState(addr);
    saveKycAddress(addr);
  }, []);

  const setShippingAddress = useCallback((addr: ShippingAddress) => {
    setShippingAddressState(addr);
  }, []);

  const saveShippingAddressProfile = useCallback((addr: ShippingAddress) => {
    setShippingAddressState(addr);
    saveShippingAddress(addr);
  }, []);

  const updateOrderStatus = useCallback((orderId: string, status: OrderStatus, trackingNumber?: string) => {
    setMarketOrders((prev) => {
      const next = persistOrderStatus(prev, orderId, status, trackingNumber);
      if (userId && !isDemoUser) void saveMarketOrdersRemote(userId, next);
      const order = next.find((o) => o.id === orderId);
      if (order && order.buyer.email === profileEmail && (status === "shipped" || status === "delivered")) {
        addNotification({
          type: "order",
          title: status === "shipped" ? "Produk Digital Dikirim" : "Pesanan Selesai",
          body: status === "shipped"
            ? `${order.id} dikirim ke email Anda${trackingNumber ? ` · kode ${trackingNumber}` : ""}`
            : `${order.id} telah selesai`,
          action: { type: "buyerOrders" },
        });
      }
      return next;
    });
  }, [profileEmail, addNotification, userId, isDemoUser]);

  const checkoutCart = useCallback(async (shipping: ShippingAddress): Promise<CheckoutResult> => {
    if (cart.length === 0) return { ok: false };
    if (!isKycVerified) {
      showToast(kycBlockedMessage, "warning");
      setOverlayState("profile");
      return { ok: false };
    }
    if (!isShippingAddressComplete(shipping)) return { ok: false };

    const hadMerchantItems = cart.some((item) => isMerchantProductId(item.productId));

    saveShippingAddress(shipping);
    setShippingAddressState(shipping);

    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const total = marketCartTotalUsd(subtotal);
    const lineUsdFactor = subtotal > 0 ? total / subtotal : 1;
    const grossGat = usdToGatPayHub(total);
    const checkoutRef = newPortfolioId("mkt");

    const buyer = {
      fullName: profileName,
      email: profileEmail,
      phone: shipping.phone,
      kycTier,
    };

    const sellerGroups = new Map<string, {
      merchantId: string;
      sellerName: string;
      items: { productId: number; name: string; qty: number; priceUsd: number }[];
    }>();

    cart.forEach((item) => {
      const product = marketProducts.find((p) => p.id === item.productId);
      const merchantId = product
        ? resolveCheckoutMerchantId(product, merchantProducts)
        : MERCHANT_ID;
      const sellerName = product ? resolveSellerName(product) : MERCHANT_NAME;
      const key = merchantId;
      const group = sellerGroups.get(key) ?? { merchantId, sellerName, items: [] };
      group.items.push({
        productId: item.productId,
        name: item.name,
        qty: item.qty,
        priceUsd: item.price * item.qty * lineUsdFactor,
      });
      sellerGroups.set(key, group);
    });

    const pendingOrders: MarketOrder[] = [];
    const merchantSplits: { merchantId: string; grossGat: number; orderId: string }[] = [];

    sellerGroups.forEach((group) => {
      const groupTotalUsd = group.items.reduce((s, i) => s + i.priceUsd, 0);
      const groupGrossGat = usdToGatPayHub(groupTotalUsd);
      const order = createMarketOrder({
        merchantId: group.merchantId,
        sellerName: group.sellerName,
        sellerContact: resolveSellerContact(group.merchantId),
        items: group.items,
        buyer,
        shipping,
        totalUsd: groupTotalUsd,
        totalGat: groupGrossGat,
        checkoutRef,
      });
      pendingOrders.push(order);
      merchantSplits.push({
        merchantId: group.merchantId,
        grossGat: groupGrossGat,
        orderId: order.id,
      });
    });

    let feeGat = grossGat * getFeeRate("market");
    let netGat = grossGat - feeGat;
    let checkoutTxHash: string | undefined;

    if (userId && !isDemoUser) {
      if (!isProtocolApiConfigured()) {
        showToast("Layanan pembayaran tidak tersedia", "error");
        return { ok: false };
      }
      const spendable = garudaPrimeSpendableGat;
      if (!hasEnoughGarudaPrimeGat(holdings, grossGat, payLedgerSnapshot, walletAddress)) {
        showToast(
          `Saldo Garuda Prime tidak cukup, butuh ${grossGat.toFixed(2)} GAT, tersedia ${spendable.toFixed(2)} GAT`,
          "error",
        );
        return { ok: false };
      }
      const wallet = resolveWalletSession(walletAddress) ?? getStoredWallet();
      if (!wallet?.address) {
        showToast("Hubungkan dompet untuk checkout", "error");
        return { ok: false };
      }
      const checkoutProvider = resolveTransactionWalletProvider(wallet.address, wallet);
      const treasury = resolvePayHubTreasuryAddress(null);
      const gatAsset = resolveWalletSendAsset("GAT");
      if (!treasury || !gatAsset) {
        showToast("Konfigurasi treasury belum siap", "error");
        return { ok: false };
      }
      try {
        const { txHash, simulated } = await transferWalletAsset(
          wallet.address,
          treasury,
          String(grossGat),
          gatAsset,
          checkoutProvider,
        );
        if (simulated || !txHash) {
          showToast("Transfer GAT on-chain gagal", "error");
          return { ok: false };
        }
        checkoutTxHash = txHash;
        const settled = await settleProtocolActionClient("market_checkout", grossGat, checkoutRef, {
          merchantSplits,
          txHash,
          walletAddress: wallet.address,
        });
        if (!settled) {
          showToast("Pembayaran gagal", "error");
          return { ok: false };
        }
        feeGat = settled.feeAmount ?? feeGat;
        netGat = settled.netAmount ?? netGat;
        void refreshBalancesAfterTx();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Checkout fee failed";
        showToast(msg, "error");
        return { ok: false };
      }
    }

    const gatAmount = grossGat.toFixed(2);

    let nextOrders = marketOrders;
    pendingOrders.forEach((order) => {
      const groupGross = order.totalGat;
      const orderFee = grossGat > 0 ? feeGat * (groupGross / grossGat) : 0;
      const orderNet = grossGat > 0 ? netGat * (groupGross / grossGat) : groupGross;
      nextOrders = [{
        ...order,
        feeGat: orderFee,
        netGat: orderNet,
      }, ...nextOrders];
    });
    saveMarketOrders(nextOrders);
    setMarketOrders(nextOrders);
    if (userId && !isDemoUser) void saveMarketOrdersRemote(userId, nextOrders);

    let nextStats = merchantStats;
    let statsDirty = false;
    let nextMerchantProducts = merchantProducts;
    let productsDirty = false;

    cart.forEach((item) => {
      if (!isMerchantProductId(item.productId)) return;
      const lineUsd = item.price * item.qty * lineUsdFactor;
      const lineGat = usdToGatPayHub(lineUsd);
      nextStats = recordMerchantSale(nextStats, lineUsd, item.qty, lineGat);
      statsDirty = true;
      nextMerchantProducts = nextMerchantProducts.map((p) =>
        p.id === item.productId ? { ...p, orders: p.orders + item.qty } : p,
      );
      productsDirty = true;
    });

    if (statsDirty) {
      setMerchantStats(nextStats);
      saveMerchantStats(nextStats);
    }
    if (productsDirty) {
      setMerchantProducts(nextMerchantProducts);
      saveMerchantProducts(nextMerchantProducts);
    }

    const sellerNames = [...sellerGroups.values()].map((g) => g.sellerName).join(" · ");
    addTransaction({
      type: "pay",
      amount: `-${gatAmount} GAT`,
      addr: sellerNames || MERCHANT_NAME,
      time: "Just now",
      usd: `-$${total.toFixed(2)}`,
      status: "Confirmed",
      txHash: checkoutTxHash,
      networkFee: feeGat > 0 ? `${feeGat.toFixed(4)} GAT` : undefined,
    });
    const orderCount = sellerGroups.size;
    addNotification({
      type: "market",
      title: orderCount > 1 ? "Pesanan Market Dibuat" : "Pesanan Market Dibuat",
      body: orderCount > 1
        ? `${orderCount} pesanan checkout · $${total.toFixed(2)}`
        : `Checkout $${total.toFixed(2)} · ${gatAmount} GAT`,
      action: { type: "buyerOrders" },
    });
    setCart([]);
    setOverlayState("none");
    setDetail(null);
    return { ok: true, hasMerchantOrder: hadMerchantItems, feeGat, netGat };
  }, [
    cart, isKycVerified, kycBlockedMessage, addTransaction, addNotification, merchantStats, merchantProducts,
    marketProducts, marketOrders, profileName, profileEmail, kycTier, userId, isDemoUser,
    holdings, garudaPrimeSpendableGat, refreshBalancesAfterTx,
  ]);

  const investInFund = useCallback(async (fundId: number, amount: number, fundName: string) => {
    if (!isKycVerified) {
      showToast(kycBlockedMessage, "warning");
      setOverlayState("profile");
      return false;
    }

    const positionId = newPortfolioId("inv");
    const grossGat = usdToGatPayHub(amount);
    let onChainPositionId: number | undefined;
    let investTxHash: string | undefined;

    if (userId && !isDemoUser) {
      const spendable = resolveGarudaPrimeSpendableGat(holdings, payLedgerSnapshot, walletAddress);
      if (!hasEnoughGarudaPrimeGat(holdings, grossGat, payLedgerSnapshot, walletAddress)) {
        showToast(`Saldo GAT tidak cukup (${spendable.toFixed(2)} GAT)`, "error");
        return false;
      }

      if (!isOnChainInvestEnabled()) {
        showToast("Investasi on-chain belum dikonfigurasi", "error");
        return false;
      }
      const wallet = resolveWalletSession(walletAddress) ?? getStoredWallet();
      if (!wallet?.address || !canUseOnChainProtocol(wallet.address)) {
        showToast("Hubungkan dompet Sidra untuk investasi on-chain", "error");
        return false;
      }
      const provider = resolveTransactionWalletProvider(wallet.address, wallet);
      try {
        const result = await investGatOnChain(wallet.address, fundId, grossGat, provider);
        if (result.simulated || result.positionId === null) {
          throw new Error("Investasi on-chain tidak tersedia");
        }
        onChainPositionId = result.positionId;
        investTxHash = result.txHash ?? undefined;
        if (investTxHash) {
          try {
            await verifyOnChainInvest({
              refId: positionId,
              txHash: investTxHash,
              walletAddress: wallet.address,
              fundId,
              positionId: onChainPositionId,
            });
          } catch (verifyErr) {
            const verifyMsg =
              verifyErr instanceof Error ? verifyErr.message : "Verifikasi investasi gagal";
            showToast(`${verifyMsg}, posisi on-chain tetap aktif`, "warning");
          }
        }
        void refreshBalancesAfterTx();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Investasi on-chain gagal";
        showToast(msg, "error");
        return false;
      }
    }

    const position: InvestPosition = {
      id: positionId,
      fundId,
      principalUsd: amount,
      startedAt: new Date().toISOString(),
      onChainPositionId,
      investTxHash,
    };
    setInvestPositions((prev) => {
      const next = [...prev, position];
      persistPortfolio(next, stakingPositions);
      return next;
    });
    addTransaction({
      type: "invest",
      amount: `-${grossGat.toLocaleString(undefined, { maximumFractionDigits: 2 })} GAT`,
      addr: fundName,
      time: "Just now",
      usd: `-$${amount.toFixed(2)}`,
      status: "Confirmed",
    });
    addNotification({
      type: "invest",
      title: "Investasi Dikonfirmasi",
      body: `Investasi $${amount.toLocaleString()} di ${fundName}`,
      action: { type: "investTab", tab: "portfolio" },
    });
    showToast(`Invested $${amount.toLocaleString()} in ${fundName}`);
    setOverlayState("none");
    setDetail(null);
    void (async () => {
      const token = await getPayHubAuthToken();
      await recordFundDeposit(fundId, amount, token, positionId, investTxHash, grossGat);
      await refreshInvestmentFunds();
    })();
    return true;
  }, [isKycVerified, kycBlockedMessage, addTransaction, addNotification, showToast, stakingPositions, persistPortfolio, userId, isDemoUser, refreshInvestmentFunds, holdings, refreshBalancesAfterTx, walletAddress]);

  const redeemInvestPosition = useCallback(async (positionId: string) => {
    const position = investPositions.find((p) => p.id === positionId);
    if (!position) return false;
    const fund = investmentFunds.find((f) => f.id === position.fundId);
    const { netUsd, profit, fee, grossUsd } = redeemInvestTotals(position);
    const grossGat = usdToGatPayHub(grossUsd);

    if (userId && !isDemoUser) {
      if (position.onChainPositionId) {
        const wallet = resolveWalletSession(walletAddress) ?? getStoredWallet();
        if (!wallet?.address || !canUseOnChainProtocol(wallet.address)) {
          showToast("Hubungkan dompet untuk pencairan on-chain", "error");
          return false;
        }
        const provider = resolveTransactionWalletProvider(wallet.address, wallet);
        try {
          await redeemInvestOnChain(wallet.address, position.onChainPositionId, provider);
          void refreshBalancesAfterTx();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Pencairan on-chain gagal";
          showToast(msg, "error");
          return false;
        }
      } else {
        const wallet = resolveWalletSession(walletAddress) ?? getStoredWallet();
        if (!wallet?.address) {
          showToast("Hubungkan dompet untuk pencairan posisi legacy", "error");
          return false;
        }
        if (!isProtocolApiConfigured()) {
          showToast("Login dan hubungkan dompet untuk pencairan investasi", "error");
          return false;
        }
        try {
          await releaseLegacyInvest(positionId, grossGat, wallet.address);
          void refreshBalancesAfterTx();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Redeem legacy gagal";
          showToast(msg, "error");
          return false;
        }
      }
    }

    setInvestPositions((prev) => {
      const next = prev.filter((p) => p.id !== positionId);
      persistPortfolio(next, stakingPositions);
      return next;
    });
    addTransaction({
      type: "receive",
      amount: `+${usdToGatPayHub(netUsd).toFixed(2)} GAT`,
      addr: fund?.name ?? "Investment Redeem",
      time: "Just now",
      usd: `+$${netUsd.toFixed(2)}`,
      status: "Confirmed",
    });
    showToast(`Redeemed $${netUsd.toFixed(2)} (profit +$${profit.toFixed(2)}, fee $${fee.toFixed(2)})`);
    addNotification({
      type: "invest",
      title: "Investasi Dicairkan",
      body: `$${netUsd.toFixed(2)} dari ${fund?.name ?? "portofolio"}`,
      action: { type: "investTab", tab: "portfolio" },
    });
    return true;
  }, [investPositions, stakingPositions, investmentFunds, addTransaction, addNotification, showToast, persistPortfolio, userId, isDemoUser, refreshBalances, walletAddress]);

  const stakeGat = useCallback(async (productId: string, amount: number) => {
    if (!isKycVerified) {
      showToast(kycBlockedMessage, "warning");
      setOverlayState("profile");
      return false;
    }
    const product = stakingProducts.find((p) => p.id === productId);
    const minStake = product ? getMinStake(product) : 0;
    if (!product || amount < minStake) return false;

    const stakeRef = newPortfolioId("stk");
    let onChainStakeId: number | undefined;
    let stakeTxHash: string | undefined;
    let sdaLockTxHash: string | undefined;
    const usePayHub = Boolean(userId && !isDemoUser && isProtocolApiConfigured());

    if (product.token === "GAT") {
      if (userId && !isDemoUser) {
        const spendable = resolveGarudaPrimeSpendableGat(holdings, payLedgerSnapshot, walletAddress);
        if (!hasEnoughGarudaPrimeGat(holdings, amount, payLedgerSnapshot, walletAddress)) {
          showToast(`Saldo GAT tidak cukup (${spendable.toFixed(2)} GAT)`, "error");
          return false;
        }

        if (!isOnChainStakeEnabled()) {
          showToast("Staking on-chain belum dikonfigurasi", "error");
          return false;
        }
        const wallet = resolveWalletSession(walletAddress) ?? getStoredWallet();
        if (!wallet?.address || !canUseOnChainProtocol(wallet.address)) {
          showToast("Hubungkan dompet Sidra untuk staking on-chain", "error");
          return false;
        }
        const provider = resolveTransactionWalletProvider(wallet.address, wallet);
        try {
          const result = await stakeGatOnChain(
            wallet.address,
            amount,
            product.lockDays,
            provider,
          );
          if (result.simulated || result.stakeId === null) {
            throw new Error("Staking on-chain tidak tersedia");
          }
          onChainStakeId = result.stakeId;
          stakeTxHash = result.txHash ?? undefined;
          if (stakeTxHash) {
            try {
              await verifyOnChainStake({
                refId: stakeRef,
                txHash: stakeTxHash,
                walletAddress: wallet.address,
                stakeId: onChainStakeId,
              });
            } catch (verifyErr) {
              const verifyMsg =
                verifyErr instanceof Error ? verifyErr.message : "Verifikasi staking gagal";
              showToast(`${verifyMsg}, stake on-chain tetap aktif`, "warning");
            }
          }
          void refreshBalances();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Staking on-chain gagal";
          showToast(msg, "error");
          return false;
        }
      }
    } else if (product.token === "SDA") {
      if (isDemoUser) {
        setHoldings((prev) => ({
          ...prev,
          SDA: Math.max(0, (prev.SDA ?? 0) - amount),
        }));
      } else {
        const wallet = resolveWalletSession(walletAddress) ?? getStoredWallet();
        if (!wallet?.address) {
          showToast("Hubungkan dompet untuk lock SDA on-chain", "error");
          return false;
        }
        const walletSda = holdings.SDA ?? 0;
        if (walletSda < amount) {
          showToast(`Saldo SDA dompet tidak cukup (${walletSda.toFixed(2)} SDA)`, "error");
          return false;
        }
        const treasury = resolvePayHubTreasuryAddress(null);
        if (!treasury) {
          showToast("Treasury tidak dikonfigurasi", "error");
          return false;
        }
        const sdaAsset = resolveWalletSendAsset("SDA");
        if (!sdaAsset) {
          showToast("SDA tidak didukung untuk transfer on-chain", "error");
          return false;
        }
        try {
          const provider = resolveTransactionWalletProvider(wallet.address, wallet);
          const { txHash, simulated } = await transferWalletAsset(
            wallet.address,
            treasury,
            String(amount),
            sdaAsset,
            provider,
          );
          if (simulated || !txHash) throw new Error("On-chain transfer failed");
          sdaLockTxHash = txHash;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Transfer SDA on-chain gagal";
          showToast(msg, "error");
          return false;
        }
        if (usePayHub) {
          try {
            await settleProtocolActionClient("sda_lock", 0, stakeRef, {
              productId: product.id,
              txHash: sdaLockTxHash,
              walletAddress: wallet.address,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Lock SDA settlement failed";
            showToast(msg, "error");
            return false;
          }
        } else {
          showToast("Login diperlukan untuk mencatat lock SDA", "error");
          return false;
        }
        void refreshBalances();
      }
    } else {
      return false;
    }

    const position: StakingPosition = {
      id: stakeRef,
      productId,
      stakedAmount: amount,
      startedAt: new Date().toISOString(),
      onChainStakeId: product.token === "GAT" ? onChainStakeId : undefined,
      stakeTxHash: product.token === "GAT" ? stakeTxHash : undefined,
      sdaLockTxHash: product.token === "SDA" ? sdaLockTxHash : undefined,
    };
    setStakingPositions((prev) => {
      const next = [...prev, position];
      persistPortfolio(investPositions, next);
      return next;
    });
    addTransaction({
      type: "invest",
      amount: `-${amount.toLocaleString()} ${product.token}`,
      addr: `Stake ${product.token}`,
      time: "Just now",
      usd: `-$${tokenToUsd(amount, product.token).toFixed(2)}`,
      status: "Confirmed",
    });
    showToast(`Staked ${amount.toLocaleString()} ${product.token}`);
    addNotification({
      type: "staking",
      title: "Staking Berhasil",
      body: `${amount.toLocaleString()} ${product.token} · ${product.nameKey}`,
      action: { type: "investTab", tab: "portfolio" },
    });
    return true;
  }, [isKycVerified, kycBlockedMessage, investPositions, stakingProducts, addTransaction, addNotification, showToast, persistPortfolio, userId, isDemoUser, holdings, walletAddress, refreshBalances]);

  const unstakePosition = useCallback(async (positionId: string) => {
    const position = stakingPositions.find((p) => p.id === positionId);
    if (!position) return false;
    const product = stakingProducts.find((p) => p.id === position.productId);
    if (!product || !isStakingUnlocked(position.startedAt, product.lockDays)) return false;

    const prices = { SDA: getTokenPriceUsd("SDA"), GAT: getTokenPriceUsd("GAT") };

    if (product.token === "SDA") {
      const usePayHub = Boolean(userId && !isDemoUser && isProtocolApiConfigured());
      if (usePayHub) {
        const wallet = resolveWalletSession(walletAddress) ?? getStoredWallet();
        if (!wallet?.address) {
          showToast("Hubungkan dompet untuk menerima SDA unlock", "error");
          return false;
        }
        try {
          await settleProtocolActionClient("sda_unlock", 0, positionId, {
            walletAddress: wallet.address,
          });
          void refreshBalancesAfterTx();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unstake settlement failed";
          showToast(msg, "error");
          return false;
        }
      } else if (!isDemoUser) {
        showToast("Login diperlukan untuk unlock SDA", "error");
        return false;
      }
      const totals = unstakeSdaTotals(position, stakingProducts, prices);
      if (!usePayHub) {
        setHoldings((prev) => ({
          ...prev,
          SDA: (prev.SDA ?? 0) + totals.stakedSda,
          GAT: (prev.GAT ?? 0) + totals.netRewardGat,
        }));
      }
      setStakingPositions((prev) => {
        const next = prev.filter((p) => p.id !== positionId);
        persistPortfolio(investPositions, next);
        return next;
      });
      addTransaction({
        type: "receive",
        amount: `+${totals.stakedSda.toFixed(2)} SDA · +${totals.netRewardGat.toFixed(2)} GAT`,
        addr: "Unlock SDA + Reward GAT",
        time: "Just now",
        usd: `+$${tokenToUsd(totals.netRewardGat, "GAT").toFixed(2)}`,
        status: "Confirmed",
      });
      showToast(
        `Unlocked ${totals.stakedSda.toFixed(2)} SDA + ${totals.netRewardGat.toFixed(2)} GAT reward (fee ${totals.feeGat.toFixed(2)} GAT)`,
      );
      addNotification({
        type: "staking",
        title: "SDA Lock Selesai",
        body: `${totals.stakedSda.toFixed(2)} SDA dikembalikan · +${totals.netRewardGat.toFixed(2)} GAT imbal hasil`,
        action: { type: "investTab", tab: "portfolio" },
      });
      return true;
    }

    const { totalGat, reward, fee, netGat, token } = unstakeTotals(position, stakingProducts);

    if (userId && !isDemoUser && product.token === "GAT") {
      if (position.onChainStakeId) {
        const wallet = resolveWalletSession(walletAddress) ?? getStoredWallet();
        if (!wallet?.address || !canUseOnChainProtocol(wallet.address)) {
          showToast("Hubungkan dompet untuk unstake on-chain", "error");
          return false;
        }
        const provider = resolveTransactionWalletProvider(wallet.address, wallet);
        try {
          await unstakeGatOnChain(wallet.address, position.onChainStakeId, provider);
          void refreshBalances();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unstake on-chain gagal";
          showToast(msg, "error");
          return false;
        }
      } else {
        const wallet = resolveWalletSession(walletAddress) ?? getStoredWallet();
        if (!wallet?.address) {
          showToast("Hubungkan dompet untuk unstake posisi legacy", "error");
          return false;
        }
        if (!isProtocolApiConfigured()) {
          showToast("Login dan hubungkan dompet untuk unstake", "error");
          return false;
        }
        try {
          await releaseLegacyStake(positionId, totalGat, wallet.address);
          void refreshBalances();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unstake legacy gagal";
          showToast(msg, "error");
          return false;
        }
      }
    }

    setStakingPositions((prev) => {
      const next = prev.filter((p) => p.id !== positionId);
      persistPortfolio(investPositions, next);
      return next;
    });
    addTransaction({
      type: "receive",
      amount: `+${netGat.toFixed(2)} ${token}`,
      addr: `Unstake ${token}`,
      time: "Just now",
      usd: `+$${tokenToUsd(netGat, product.token).toFixed(2)}`,
      status: "Confirmed",
    });
    showToast(`Unstaked ${netGat.toFixed(2)} ${product.token} (+${reward.toFixed(2)} reward, fee ${fee.toFixed(2)})`);
    addNotification({
      type: "staking",
      title: "Unstake Selesai",
      body: `${netGat.toFixed(2)} ${product.token} (+${reward.toFixed(2)} reward)`,
      action: { type: "investTab", tab: "portfolio" },
    });
    return true;
  }, [stakingPositions, investPositions, stakingProducts, addTransaction, addNotification, showToast, persistPortfolio, userId, isDemoUser, walletAddress, refreshBalances]);

  const payZakat = useCallback(async (eligibleAssetUsd: number) => {
    if (!communityConfig.zakat.enabled) {
      showToast("Zakat payments are currently disabled", "warning");
      return false;
    }
    if (!isKycVerified) {
      showToast(kycBlockedMessage, "warning");
      setOverlayState("profile");
      return false;
    }
    if (!eligibleAssetUsd || eligibleAssetUsd <= 0) return false;

    const zakatUsd = (eligibleAssetUsd * communityConfig.zakat.nisabRateBps) / 10_000;
    const zakatGat = usdToGatPayHub(zakatUsd);
    const refId = newPortfolioId("zkt");

    if (userId && !isDemoUser) {
      if (!isProtocolApiConfigured()) {
        showToast("Login dan hubungkan dompet untuk zakat", "error");
        return false;
      }
      const spendable = resolveGarudaPrimeSpendableGat(holdings, payLedgerSnapshot, walletAddress);
      if (!hasEnoughGarudaPrimeGat(holdings, zakatGat, payLedgerSnapshot, walletAddress)) {
        showToast(`Saldo Garuda Prime tidak cukup (${spendable.toFixed(2)} GAT)`, "error");
        return false;
      }
      try {
        await settleProtocolActionClient("zakat_pay", zakatGat, refId);
        void refreshBalances();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Zakat settlement failed";
        showToast(msg, "error");
        return false;
      }
    }

    addTransaction({
      type: "send",
      amount: `-${zakatGat.toLocaleString(undefined, { maximumFractionDigits: 2 })} GAT`,
      addr: "Zakat Distribution",
      time: "Just now",
      usd: `-$${zakatUsd.toFixed(2)}`,
      status: "Confirmed",
    });
    addNotification({
      type: "community",
      title: "Zakat Dibayar",
      body: `$${zakatUsd.toFixed(2)} via GAT`,
      action: { type: "screen", screen: "community" },
    });
    showToast(`Zakat $${zakatUsd.toFixed(2)} paid via GAT`);
    return true;
  }, [communityConfig, isKycVerified, kycBlockedMessage, addTransaction, addNotification, showToast, userId, isDemoUser, holdings, refreshBalances]);

  const donateCharity = useCallback(async (amountGat: number) => {
    if (!communityConfig.charity.enabled) {
      showToast("Charity donations are currently disabled", "warning");
      return false;
    }
    if (!isKycVerified) {
      showToast(kycBlockedMessage, "warning");
      setOverlayState("profile");
      return false;
    }
    if (!amountGat || amountGat <= 0) return false;

    const usd = tokenToUsd(amountGat, "GAT");
    const refId = newPortfolioId("sdq");

    if (userId && !isDemoUser) {
      if (!isProtocolApiConfigured()) {
        showToast("Login dan hubungkan dompet untuk donasi", "error");
        return false;
      }
      const spendable = resolveGarudaPrimeSpendableGat(holdings, payLedgerSnapshot, walletAddress);
      if (!hasEnoughGarudaPrimeGat(holdings, amountGat, payLedgerSnapshot, walletAddress)) {
        showToast(`Saldo Garuda Prime tidak cukup (${spendable.toFixed(2)} GAT)`, "error");
        return false;
      }
      try {
        await settleProtocolActionClient("charity_donate", amountGat, refId);
        void refreshBalances();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Donation settlement failed";
        showToast(msg, "error");
        return false;
      }
    }

    addTransaction({
      type: "send",
      amount: `-${amountGat} GAT`,
      addr: "Sadaqah Fund",
      time: "Just now",
      usd: `-$${usd.toFixed(2)}`,
      status: "Confirmed",
    });
    addNotification({
      type: "community",
      title: "Sadaqah Diterima",
      body: `${amountGat} GAT · $${usd.toFixed(2)}`,
      action: { type: "screen", screen: "community" },
    });
    showToast(`Thank you, ${amountGat} GAT donated`);
    return true;
  }, [communityConfig, isKycVerified, kycBlockedMessage, addTransaction, addNotification, showToast, userId, isDemoUser, holdings, refreshBalances]);

  const uploadProfilePhoto = useCallback(async (file: File) => {
    if (!userId) return false;
    const maxBytes = 2 * 1024 * 1024;
    if (!file.type.startsWith("image/")) return false;
    if (file.size > maxBytes) return false;
    return new Promise<boolean>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result as string;
        saveProfilePhoto(userId, data);
        setProfilePhotoUrl(data);
        if (!isDemoUser && data.length < 900_000) {
          void updateUserProfile(userId, { avatar: data }).catch(() => {});
        }
        resolve(true);
      };
      reader.onerror = () => resolve(false);
      reader.readAsDataURL(file);
    });
  }, [userId, isDemoUser]);

  const removeProfilePhoto = useCallback(() => {
    if (userId) {
      removeProfilePhotoStorage(userId);
      if (!isDemoUser) {
        void updateUserProfile(userId, { avatar: null }).catch(() => {});
      }
    }
    setProfilePhotoUrl(profileAvatarProp?.trim() || null);
  }, [userId, isDemoUser, profileAvatarProp]);

  const startKycUpgrade = useCallback(() => {
    if (isKycVerified) return;
    if (isKycPending) {
      showToast(kycPendingMessage, "info");
      setProfileSection("kyc");
      setOverlayState("profile");
      return;
    }
    if (isKycRejectedFlag) {
      setKycResubmitMode(true);
    }
    openKycGate();
  }, [isKycVerified, isKycPending, isKycRejectedFlag, kycPendingMessage, showToast, openKycGate]);

  const submitKycStep = useCallback((action: "next" | "submit" | keyof KycFlowData, value?: string | boolean | number | KycAddress | KtpOcrExtract | GeoCapture | null) => {
    const queuePreupload = (field: string, dataUrl: unknown) => {
      if (isDemoUser) return;
      if (!userId || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return;
      const kind = kycFieldToKind(field);
      if (kind) scheduleKycPreupload(userId, kind, dataUrl);
    };

    if (action === "next") {
      const req = getCaptureRequirements(kycFlowData.country, kycFlowData.documentType);
      if (kycFlowStep === 0 && !isPersonalDataStepComplete(
        { fullName: kycFlowData.personalFullName, email: kycFlowData.personalEmail, phone: kycFlowData.personalPhone },
        kycFlowData.domicile,
        kycFlowData.documentType,
        kycFlowData.documentTypeOther,
        req.gpsRequired,
        kycFlowData.geo,
      )) return;
      if (kycFlowStep === 1 && !areIdDocumentsComplete(kycFlowData.idDocumentFront, kycFlowData.idDocumentBack, req)) return;
      if (kycFlowStep === 2 && !isSelfieStepComplete(
        {
          ktpSelfieFront: kycFlowData.ktpSelfieFront,
          ktpSelfieBack: kycFlowData.ktpSelfieBack,
          faceCapture: kycFlowData.faceCapture,
          livenessPassed: kycFlowData.livenessPassed,
        },
        req,
      )) return;
      if (kycFlowStep === 3 && !kycFlowData.autoVerifyComplete) return;
      setKycFlowStep((s) => Math.min(s + 1, KYC_FLOW_MAX_STEP));
      return;
    }
    if (action === "personalFullName" || action === "personalEmail" || action === "personalPhone") {
      setKycFlowData((d) => ({ ...d, [action]: String(value ?? "").slice(0, action === "personalEmail" ? 120 : 80) }));
      return;
    }
    if (action === "livenessPassed") {
      setKycFlowData((d) => ({
        ...d,
        livenessPassed: Boolean(value),
        livenessScore: typeof value === "number" ? value : d.livenessScore,
      }));
      return;
    }
    if (action === "livenessScore" || action === "faceMatchScore" || action === "ocrMatchScore") {
      setKycFlowData((d) => ({ ...d, [action]: typeof value === "number" ? value : Number(value) || 0 }));
      return;
    }
    if (action === "faceMatchPassed" || action === "autoVerifyComplete") {
      setKycFlowData((d) => ({ ...d, [action]: Boolean(value) }));
      return;
    }
    if (action === "country") {
      const code = String(value ?? "").toUpperCase();
      const nextDoc = getDefaultDocType(code);
      setKycFlowData((d) => ({
        ...d,
        country: code,
        documentType: nextDoc,
        documentTypeOther: "",
        domicile: { ...d.domicile, country: code, province: "", postalCode: "" },
        ktpExtracted: null,
        idDocumentFront: null,
        idDocumentBack: null,
        ktpSelfieFront: null,
        ktpSelfieBack: null,
        faceVerified: false,
        faceCapture: null,
        livenessStep1Capture: null,
        livenessStep2Capture: null,
        livenessStep3Capture: null,
        livenessPassed: false,
        livenessScore: 0,
        faceMatchScore: 0,
        faceMatchPassed: false,
        autoVerifyComplete: false,
        ocrMatchScore: 0,
        geo: null,
      }));
      return;
    }
    if (action === "documentType") {
      const docType = value as KycDocType;
      setKycFlowData((d) => ({
        ...d,
        documentType: docType,
        documentTypeOther: docType === "other" ? d.documentTypeOther : "",
        idDocumentBack: docType === "passport" ? null : d.idDocumentBack,
        ktpSelfieBack: getCaptureRequirements(d.country, docType).selfieBack ? d.ktpSelfieBack : null,
        faceVerified: false,
        ktpExtracted: null,
      }));
      return;
    }
    if (action === "documentTypeOther") {
      setKycFlowData((d) => ({ ...d, documentTypeOther: String(value ?? "").slice(0, 80) }));
      return;
    }
    if (action === "idDocumentFront" || action === "idDocumentBack" || action === "addressProof") {
      setKycFlowData((d) => ({ ...d, [action]: value as string }));
      queuePreupload(action, value);
      return;
    }
    if (action === "domicile") {
      setKycFlowData((d) => ({ ...d, domicile: value as KycAddress }));
      return;
    }
    if (action === "ktpExtracted") {
      setKycFlowData((d) => ({ ...d, ktpExtracted: value as KtpOcrExtract | null }));
      return;
    }
    if (action === "geo") {
      setKycFlowData((d) => ({ ...d, geo: value as GeoCapture | null }));
      return;
    }
    if (action === "ktpSelfieFront" || action === "ktpSelfieBack") {
      setKycFlowData((d) => {
        const next = { ...d, [action]: value as string | null };
        const req = getCaptureRequirements(d.country, d.documentType);
        return {
          ...next,
          faceVerified: isFaceVerificationComplete(next, req),
        };
      });
      queuePreupload(action, value);
      return;
    }
    if (action === "faceVerified") {
      setKycFlowData((d) => ({
        ...d,
        faceVerified: true,
      }));
      return;
    }
    if (action === "faceCapture") {
      setKycFlowData((d) => ({
        ...d,
        faceCapture: value as string | null,
        livenessPassed: value ? d.livenessPassed : false,
        livenessStep1Capture: value ? d.livenessStep1Capture : null,
        livenessStep2Capture: value ? d.livenessStep2Capture : null,
        livenessStep3Capture: value ? d.livenessStep3Capture : null,
      }));
      queuePreupload("faceCapture", value);
      return;
    }
    if (
      action === "livenessStep1Capture"
      || action === "livenessStep2Capture"
      || action === "livenessStep3Capture"
    ) {
      setKycFlowData((d) => ({ ...d, [action]: value as string | null }));
      queuePreupload(action, value);
      return;
    }
    if (action === "submit") {
      const {
        country, documentType, documentTypeOther,
        idDocumentFront, idDocumentBack, faceCapture, livenessPassed,
        livenessStep1Capture, livenessStep2Capture, livenessStep3Capture,
        ktpSelfieFront, ktpSelfieBack,
        personalFullName, personalEmail, personalPhone,
        domicile, ktpExtracted, geo, faceMatchScore, ocrMatchScore,
      } = kycFlowData;
      const req = getCaptureRequirements(country, documentType);
      const hasIdDocuments = areIdDocumentsComplete(idDocumentFront, idDocumentBack, req);
      const selfieOk = isSelfieStepComplete(
        { ktpSelfieFront, ktpSelfieBack, faceCapture, livenessPassed },
        req,
      );
      const otherNameOk = documentType !== "other" || documentTypeOther.trim().length >= 2;
      if (!hasIdDocuments || !selfieOk || !kycFlowData.autoVerifyComplete
        || !isPersonalDataStepComplete(
          { fullName: personalFullName, email: personalEmail, phone: personalPhone },
          domicile, documentType, documentTypeOther, req.gpsRequired, geo,
        ) || !otherNameOk || upgradingKyc) return;
      if (isDemoUser) {
        showToast("KYC memerlukan login Firebase (email/Google). Mode demo tidak bisa upload dokumen.", "error");
        return;
      }
      if (isKycPending) {
        showToast(kycPendingMessage, "info");
        return;
      }
      setUpgradingKyc(true);
      setKycSubmitProgress({ step: 1, total: 4, label: "Identitas depan", phase: "compress" });
      void (async () => {
        const submitWork = async () => {
          const progress = { identity: true, face: true, address: true };
          setKycProgress(progress);
          saveKycProgress(progress);
          saveKycAddress(domicile);
          setKycAddressState(domicile);
          setShippingAddressState((prev) => buildShippingFromSources({
            profileName,
            profilePhone,
            profileEmail,
            savedShipping: prev,
          }));

          if (userId) {
            await waitForAuthUser().then((u) => u.getIdToken(true));

            const domicileComplete = isDomicileAddressValid(domicile);
            const addressVerification = buildAddressVerification(domicile, ktpExtracted, geo);

            const uploaded = await resolveAllKycUploads(userId, {
              idDocumentFront: idDocumentFront!,
              idDocumentBack: req.idBack ? idDocumentBack : null,
              ktpSelfieFront: ktpSelfieFront!,
              ktpSelfieBack: req.selfieBack ? ktpSelfieBack : null,
              livenessSelfie: faceCapture!,
              livenessStep1: livenessStep1Capture,
              livenessStep2: livenessStep2Capture,
              livenessStep3: livenessStep3Capture,
            }, (info) => {
              setKycSubmitProgress({
                step: info.step,
                total: info.total,
                label: info.label,
                phase: info.phase === "compress" ? "compress" : "upload",
              });
            });

            setKycSubmitProgress({ step: 4, total: 4, label: "Data KYC", phase: "save" });

            const hasIdDocuments = true;
            const hasKtpSelfie = true;
            const riskScore = computeKycRiskScore({
              faceVerified: hasKtpSelfie,
              hasIdDocument: hasIdDocuments,
              hasGeoLocation: !!geo,
              domicileComplete,
              addressStrengthScore: addressVerification.strengthScore,
            });

            await submitKycApplication(userId, {
              fullName: personalFullName.trim() || profileName,
              email: personalEmail.trim() || profileEmail,
              phone: personalPhone.trim() || profilePhone,
              status: "pending",
              tier: 1,
              provider: "GARUDA",
              faceVerified: hasKtpSelfie,
              livenessPassed,
              livenessScore: kycFlowData.livenessScore,
              faceMatchScore,
              ocrMatchScore,
              domicile,
              documentType: resolveSubmitDocumentType(country, documentType, documentTypeOther),
              hasIdDocument: hasIdDocuments,
              hasAddressProof: false,
              hasKtpSelfie,
              idDocumentUrl: uploaded.idDocumentUrl,
              idDocumentFrontUrl: uploaded.idDocumentFrontUrl,
              idDocumentBackUrl: uploaded.idDocumentBackUrl,
              ktpSelfieFrontUrl: uploaded.ktpSelfieFrontUrl,
              ktpSelfieBackUrl: uploaded.ktpSelfieBackUrl,
              livenessSelfieUrl: uploaded.livenessSelfieUrl,
              livenessStep1Url: uploaded.livenessStep1Url,
              livenessStep2Url: uploaded.livenessStep2Url,
              livenessStep3Url: uploaded.livenessStep3Url,
              addressProofUrl: null,
              riskScore,
              addressVerification,
            });

            const factors: string[] = [];
            if (!hasKtpSelfie) factors.push("selfie + ID incomplete");
            if (!hasIdDocuments) factors.push("missing ID");
            if (!geo) factors.push("missing GPS location");
            if (!domicileComplete) factors.push("incomplete domicile");
            if (factors.length === 0) factors.push("all checks passed");
            void logKycRiskAnalysis(userId, riskScore, factors);
          } else {
            await saveKycVerification("local", {
              status: "pending",
              tier: 1,
              provider: "GARUDA",
            });
          }

          setKycStatus("pending");
          setKycTier(1);
          setKycResubmitMode(false);
          setKycRejectionReason(null);
          localStorage.setItem(KYC_STORAGE, "1");
          localStorage.setItem(KYC_STATUS_STORAGE, "pending");

          addNotification(notificationEvents.kycSubmitted());
          if (userId) {
            saveKycNotifSeen(userId, { status: "pending", reason: "", tier: 1 });
          }
          showToast(kycPendingMessage, "info");
        };

        try {
          await submitWork();
        } catch (err) {
          console.error("[KYC submit]", err);
          const raw = err instanceof Error ? err.message : "Gagal mengirim KYC. Coba lagi.";
          const msg = raw.includes("insufficient permissions") || raw.includes("permission-denied")
            ? "Gagal menyimpan KYC, pastikan Anda sudah login, lalu coba kirim lagi."
            : raw.includes("Sesi Firebase") || raw.includes("Sesi tidak cocok")
              ? "Sesi habis, logout, login ulang, lalu coba kirim lagi."
              : raw;
          showToast(msg, "error");
        } finally {
          setUpgradingKyc(false);
          setKycSubmitProgress(null);
        }
      })();
    }
  }, [
    kycFlowData, kycFlowStep, upgradingKyc, isKycPending, kycPendingMessage, isDemoUser,
    showToast, addNotification, profileName, profilePhone, profileEmail, userId,
  ]);

  const upgradeKyc = useCallback(() => {
    startKycUpgrade();
  }, [startKycUpgrade]);

  const setBiometricEnabled = useCallback((v: boolean) => {
    setBiometricEnabledState(v);
    localStorage.setItem(BIOMETRIC_STORAGE, v ? "1" : "0");
    if (userId) {
      setBiometricEnabledLocal(userId, v);
      void syncSecurityPrefsToFirestore(userId, { biometricEnabled: v });
    }
  }, [userId]);

  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.qty, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart]);

  const value = useMemo<AppContextValue>(() => ({
    walletAddress,
    overlay,
    setOverlay,
    toggleOverlay,
    requestOverlay,
    requestSendOverlay,
    sendPrefill,
    requestReceiveOverlay,
    receiveViewPrefill,
    requestPayOverlay,
    payScanPrefill,
    screen,
    setScreen,
    detail,
    openDetail,
    closeDetail,
    notifications,
    markAllRead,
    markRead,
    deleteNotification,
    deleteAllNotifications,
    addNotification,
    refreshNotifications,
    openNotification,
    shareWalletAddress: shareWalletAddressFn,
    shareContent: shareContentFn,
    transactions,
    addTransaction,
    patchTransaction,
    beginMobileTransaction,
    completeMobileTransaction,
    cancelMobileTransaction,
    cart,
    addToCart,
    removeFromCart,
    updateCartQty,
    clearCart,
    checkoutCart,
    shippingAddress,
    setShippingAddress,
    saveShippingAddressProfile,
    kycAddress,
    saveKycAddressProfile,
    buildDefaultShipping,
    marketOrders,
    updateOrderStatus,
    cartTotal,
    cartCount,
    investedFunds,
    investPositions,
    stakingPositions,
    portfolioProfit,
    portfolioStakingReward,
    portfolioStakingRewardsByToken,
    investmentFunds,
    refreshInvestmentFunds,
    stakingProducts,
    communityConfig,
    referralConfig,
    refreshPlatformPrograms,
    payZakat,
    donateCharity,
    investInFund,
    redeemInvestPosition,
    stakeGat,
    unstakePosition,
    copyText,
    showToast,
    signOut: onSignOut,
    kycTier,
    kycStatus,
    isKycVerified,
    isKycPending,
    isKycRejected: isKycRejectedFlag,
    kycRejectionReason,
    kycResubmitMode,
    upgradingKyc,
    kycSubmitProgress,
    kycDocUploadStatus,
    kycDocUploadErrors,
    isDemoUser,
    upgradeKyc,
    biometricEnabled,
    setBiometricEnabled,
    twoFactorEnabled,
    setTwoFactorEnabled,
    strictDeviceLock,
    setStrictDeviceLock,
    refreshSecurityPrefs,
    requireSecurityStep,
    requireSpendSecurity,
    cancelPendingSecurityChallenge,
    securityChallengeOpen,
    resolveSecurityChallenge,
    requireKyc,
    kycBlockedMessage,
    setKycBlockedMessage,
    payQrChannel,
    setPayQrChannel,
    scanMode,
    setScanMode,
    scanLockedMode,
    openScan,
    walletTab,
    openWallet,
    activeTool,
    openToolPanel,
    communityTab,
    setCommunityTab,
    openCommunity,
    profileSection,
    openProfile,
    closeProfile,
    openProfileShipping,
    isShippingComplete,
    requireShipping,
    profileName,
    profileEmail,
    profilePhone,
    referralCode,
    referralStats,
    referralLoading,
    refreshReferralStats,
    bindUserReferralCode,
    profilePhotoUrl,
    uploadProfilePhoto,
    removeProfilePhoto,
    kycProgress,
    kycFlowStep,
    kycFlowData,
    beginKycFlow,
    startKycUpgrade,
    submitKycStep,
    tokens,
    holdings,
    portfolioUsd,
    balanceSource,
    balancesLoading,
    refreshBalances,
    refreshWalletActivity,
    applyOptimisticGatDelta,
    applyConfirmedGatBalance,
    garudaPrimeSpendableGat,
    onChainGat,
    activeOnChainGat,
    refreshAppData,
    swapWalletTokens,
    importCustomToken,
    removeCustomToken,
    merchantProducts,
    merchantStats,
    marketProducts,
    marketplaceLoading,
    refreshMarketplace,
    addMerchantProduct,
    updateMerchantProduct,
    toggleMerchantProductPublished,
    removeMerchantProduct,
    syncMerchantShopBranding,
    openMarket,
    openMarketCart,
    marketCartOpen,
    closeMarketCart,
    pendingInvestTab,
    openInvestTab,
    clearInvestTab,
    openMerchantOrders,
    openBuyerOrders,
    cancelOrder: cancelOrderWithNotif,
    merchantPanelTab,
  }), [
    overlay, setOverlay, toggleOverlay, requestOverlay, requestSendOverlay, sendPrefill, requestReceiveOverlay, receiveViewPrefill, requestPayOverlay, payScanPrefill, screen, detail, openDetail, closeDetail,
    notifications, markAllRead, markRead, deleteNotification, deleteAllNotifications, addNotification, refreshNotifications, openNotification, shareWalletAddressFn, shareContentFn, transactions, addTransaction, patchTransaction,
    cart, addToCart, removeFromCart, updateCartQty, clearCart, checkoutCart,
    shippingAddress, setShippingAddress, saveShippingAddressProfile,
    kycAddress, saveKycAddressProfile, buildDefaultShipping,
    marketOrders, updateOrderStatus,
    cartTotal, cartCount, investedFunds, investPositions, stakingPositions,
    portfolioProfit, portfolioStakingReward, portfolioStakingRewardsByToken, investmentFunds, refreshInvestmentFunds,
    stakingProducts, communityConfig, referralConfig, refreshPlatformPrograms, payZakat, donateCharity,
    investInFund, redeemInvestPosition, stakeGat, unstakePosition,
    copyText, showToast, onSignOut,
    kycTier, kycStatus, isKycVerified, isKycPending, isKycRejectedFlag, kycRejectionReason, kycResubmitMode, upgradingKyc, kycSubmitProgress, kycDocUploadStatus, kycDocUploadErrors, isDemoUser, upgradeKyc, biometricEnabled, setBiometricEnabled,
    twoFactorEnabled, setTwoFactorEnabled, strictDeviceLock, setStrictDeviceLock, refreshSecurityPrefs, requireSecurityStep, requireSpendSecurity, cancelPendingSecurityChallenge, securityChallengeOpen, resolveSecurityChallenge, requireKyc, kycBlockedMessage, payQrChannel, scanMode, scanLockedMode, openScan, walletTab, openWallet,
    activeTool, openToolPanel, communityTab, setCommunityTab, openCommunity, profileSection, openProfile,
    closeProfile, openProfileShipping, requireShipping, isShippingComplete,
    profilePhotoUrl, uploadProfilePhoto, removeProfilePhoto,
    profileNameProp, profileEmailProp, profilePhoneProp, walletAddressProp, profilePhone, referralCode, referralStats, referralLoading, refreshReferralStats, bindUserReferralCode, userId,
    kycProgress, kycFlowStep, kycFlowData, beginKycFlow, startKycUpgrade, submitKycStep,
    tokens, holdings, portfolioUsd, balanceSource, balancesLoading, refreshBalances,
    refreshWalletActivity, applyOptimisticGatDelta, applyConfirmedGatBalance,
    garudaPrimeSpendableGat,
    onChainGat,
    activeOnChainGat,
    refreshAppData, swapWalletTokens,
    importCustomToken, removeCustomToken,
    merchantProducts, merchantStats, marketProducts, marketplaceLoading, refreshMarketplace, addMerchantProduct, updateMerchantProduct,
    toggleMerchantProductPublished, removeMerchantProduct, syncMerchantShopBranding, openMarket, openMarketCart, marketCartOpen, closeMarketCart,
    pendingInvestTab, openInvestTab, clearInvestTab, openMerchantOrders, openBuyerOrders, cancelOrderWithNotif, merchantPanelTab,
    shippingAddress, marketOrders, updateOrderStatus, saveShippingAddressProfile, setShippingAddress,
    kycAddress, saveKycAddressProfile, buildDefaultShipping, isShippingComplete,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export { WALLET_ADDRESS };
