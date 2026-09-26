import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import {
  buildEligibleUtilityNftItems,
  buildUtilityNftTokenUri,
  isCategoryEligible,
  type UserNftEligibilityInput,
} from "../src/lib/nft/utilityNftPolicy.js";
import {
  type UtilityNftCategory,
  type UtilityNftItem,
  type UtilityNftPortfolio,
  UTILITY_NFT_CATEGORY_ID,
} from "../src/lib/nft/utilityNftTypes.js";
import {
  categoryFromOnChainId,
  isUtilityNftOnChainConfigured,
  mintUtilityNftOnChain,
  readOnChainUtilityTokens,
  utilityNftContractAddress,
} from "./utilityNftOnChain.js";
import { resolvePrimaryWalletForUid } from "./chainBalanceService.js";

const NFT_COL = "utility_nfts";

type StoredNft = {
  uid: string;
  category: UtilityNftCategory;
  tokenId: string | null;
  txHash: string | null;
  walletAddress: string;
  issuedAt: string;
  onChainVerified: boolean;
};

async function loadUserEligibility(uid: string): Promise<UserNftEligibilityInput & { uid: string }> {
  const db = adminDb();
  const userSnap = await db.collection("users").doc(uid).get();
  const user = userSnap.data() ?? {};

  const walletAddress = await resolvePrimaryWalletForUid(uid);

  let investCount = 0;
  let stakingCount = 0;
  try {
    const portfolioSnap = await db.collection("user_portfolios").doc(uid).get();
    const portfolio = portfolioSnap.data();
    const investments = portfolio?.investments ?? portfolio?.investPositions;
    const staking = portfolio?.staking ?? portfolio?.stakingPositions;
    investCount = Array.isArray(investments) ? investments.length : Number(portfolio?.investCount ?? 0);
    stakingCount = Array.isArray(staking) ? staking.length : Number(portfolio?.stakingCount ?? 0);
  } catch {
    /* optional */
  }

  let referralCompleted = 0;
  try {
    const refs = await db.collection("referrals").where("referrerUid", "==", uid).get();
    referralCompleted = refs.docs.filter((d) => d.data().status === "completed").length;
  } catch {
    /* optional */
  }

  let validatorActive = false;
  try {
    const apps = await db.collection("validator_applications")
      .where("uid", "==", uid)
      .where("status", "==", "active")
      .limit(1)
      .get();
    validatorActive = !apps.empty;
  } catch {
    /* optional */
  }

  return {
    uid,
    walletAddress,
    hasWallet: Boolean(walletAddress?.startsWith("0x")),
    kycTier: Number(user.kycTier ?? 0),
    kycStatus: String(user.kycStatus ?? ""),
    investCount,
    stakingCount,
    referralCompleted,
    validatorActive,
    zakatPaid: Boolean(user.zakatPaid ?? user.lastZakatAt),
  };
}

async function loadStoredNfts(uid: string): Promise<StoredNft[]> {
  const snap = await adminDb().collection(NFT_COL).where("uid", "==", uid).get();
  return snap.docs.map((doc) => doc.data() as StoredNft);
}

function mergePortfolioItems(
  eligible: UtilityNftItem[],
  stored: StoredNft[],
  onChain: { tokenId: string; categoryId: number; issuedAt: string | null }[],
  locale: "id" | "en",
): UtilityNftItem[] {
  const contract = utilityNftContractAddress();
  const onChainByCategory = new Map<UtilityNftCategory, typeof onChain[0]>();
  for (const row of onChain) {
    const cat = categoryFromOnChainId(row.categoryId);
    if (cat) onChainByCategory.set(cat, row);
  }

  const storedByCategory = new Map(stored.map((s) => [s.category, s]));

  return eligible.map((item) => {
    const saved = storedByCategory.get(item.category);
    const chainRow = onChainByCategory.get(item.category);
    const ownedOnChain = Boolean(chainRow);
    const ownedStored = Boolean(saved?.tokenId || saved?.onChainVerified);

    if (ownedOnChain || ownedStored) {
      return {
        ...item,
        status: "owned" as const,
        tokenId: chainRow?.tokenId ?? saved?.tokenId ?? null,
        txHash: saved?.txHash ?? null,
        issuedAt: chainRow?.issuedAt ?? saved?.issuedAt ?? null,
        contractAddress: contract,
        onChainVerified: ownedOnChain,
      };
    }

    if (item.status === "eligible" && isUtilityNftOnChainConfigured()) {
      return { ...item, status: "pending_mint" as const, contractAddress: contract };
    }

    return { ...item, contractAddress: contract };
  });
}

export async function getUserUtilityNftPortfolio(
  uid: string,
  locale: "id" | "en" = "id",
): Promise<UtilityNftPortfolio> {
  const eligibility = await loadUserEligibility(uid);
  eligibility.locale = locale;

  const eligible = buildEligibleUtilityNftItems(eligibility);
  const stored = await loadStoredNfts(uid);

  let onChain: Awaited<ReturnType<typeof readOnChainUtilityTokens>> = [];
  const wallet = eligibility.walletAddress?.trim();
  if (wallet?.startsWith("0x") && isUtilityNftOnChainConfigured()) {
    onChain = await readOnChainUtilityTokens(wallet as `0x${string}`);
  }

  const items = mergePortfolioItems(eligible, stored, onChain, locale);
  const owned = items.filter((i) => i.status === "owned").length;
  const eligibleCount = items.filter((i) => i.status === "eligible" || i.status === "pending_mint").length;
  const pendingMint = items.filter((i) => i.status === "pending_mint").length;

  return {
    total: items.length,
    owned,
    eligible: eligibleCount,
    pendingMint,
    onChainConfigured: isUtilityNftOnChainConfigured(),
    contractAddress: utilityNftContractAddress(),
    network: "Sidra Network",
    chainId: Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453,
    items,
  };
}

export async function syncUserUtilityNfts(
  uid: string,
  locale: "id" | "en" = "id",
): Promise<{ minted: number; skipped: number; portfolio: UtilityNftPortfolio }> {
  const eligibility = await loadUserEligibility(uid);
  eligibility.locale = locale;
  const wallet = eligibility.walletAddress?.trim();

  if (!wallet?.startsWith("0x")) {
    return {
      minted: 0,
      skipped: 0,
      portfolio: await getUserUtilityNftPortfolio(uid, locale),
    };
  }

  const stored = await loadStoredNfts(uid);
  const storedCategories = new Set(stored.filter((s) => s.tokenId).map((s) => s.category));
  const eligibleItems = buildEligibleUtilityNftItems(eligibility);

  let minted = 0;
  let skipped = 0;
  const db = adminDb();

  for (const item of eligibleItems) {
    if (item.status !== "eligible" && item.status !== "pending_mint") {
      skipped++;
      continue;
    }
    if (!isCategoryEligible(item.category, eligibility)) {
      skipped++;
      continue;
    }
    if (storedCategories.has(item.category)) {
      skipped++;
      continue;
    }

    const issuedAt = new Date().toISOString();
    let tokenId: string | null = null;
    let txHash: string | null = null;
    let onChainVerified = false;

    if (isUtilityNftOnChainConfigured()) {
      try {
        const uri = buildUtilityNftTokenUri({
          category: item.category,
          title: item.title,
          utility: item.utility,
          issuedAt,
          walletAddress: wallet,
          uid,
        });
        const result = await mintUtilityNftOnChain({
          to: wallet as `0x${string}`,
          category: item.category,
          tokenUri: uri,
          soulbound: item.soulbound,
        });
        tokenId = result.tokenId;
        txHash = result.txHash;
        onChainVerified = true;
        minted++;
      } catch {
        skipped++;
        continue;
      }
    } else {
      tokenId = `local-${UTILITY_NFT_CATEGORY_ID[item.category]}-${uid.slice(0, 8)}`;
      minted++;
    }

    await db.collection(NFT_COL).add({
      uid,
      category: item.category,
      tokenId,
      txHash,
      walletAddress: wallet,
      issuedAt,
      onChainVerified,
      createdAt: FieldValue.serverTimestamp(),
    });
    storedCategories.add(item.category);
  }

  return {
    minted,
    skipped,
    portfolio: await getUserUtilityNftPortfolio(uid, locale),
  };
}
