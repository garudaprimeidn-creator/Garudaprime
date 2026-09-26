import { useState } from "react";
import {
  TrendingUp, Lock, Plus, Ban, ChevronRight, Sprout, Zap, Store, Building2,
} from "lucide-react";
import { useApp } from "./AppContext";
import { useLanguage } from "./LanguageContext";
import { type FundIcon, type InvestmentFund, INVESTMENT_FUNDS } from "./investData";
import {
  calcInvestProfit,
  calcStakingReward,
  calcStakingRewardGatFromSda,
  countLegacyGatPositions,
  daysUntilUnlock,
  isLegacyLedgerGatStake,
  isLegacyLedgerInvestPosition,
  isStakingUnlocked,
  parseApr,
  getStakedAmount,
  getMinStake,
  type InvestPosition,
} from "../lib/invest/investPortfolio";
import { formatGatFromUsd, formatUsd } from "./PriceWithGat";
import { usdToToken, getTokenPriceUsd } from "./tokenEconomy";

const FUND_ICON: Record<FundIcon, React.ReactNode> = {
  zap: <Zap className="w-4 h-4" />,
  sprout: <Sprout className="w-4 h-4" />,
  store: <Store className="w-4 h-4" />,
  building: <Building2 className="w-4 h-4" />,
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

const TokenBadge = ({ token }: { token: "GAT" | "SDA" }) => (
  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
    token === "GAT" ? "bg-amber-500/15 text-amber-400" : "bg-indigo-500/15 text-indigo-300"
  }`}>
    {token}
  </span>
);

const formatRewardsByToken = (rewards: Partial<Record<"GAT" | "SDA", number>> | null | undefined) => {
  const parts: string[] = [];
  const gat = rewards?.GAT;
  const sda = rewards?.SDA;
  if (typeof gat === "number" && gat > 0) parts.push(`+${gat.toFixed(2)} GAT`);
  if (typeof sda === "number" && sda > 0) parts.push(`+${sda.toFixed(2)} SDA`);
  return parts.length ? parts.join(" · ") : "+0 GAT";
};

function resolveFund(funds: InvestmentFund[], fundId: number): InvestmentFund | undefined {
  return funds.find((f) => f.id === fundId) ?? INVESTMENT_FUNDS.find((f) => f.id === fundId);
}

function stakingProductName(
  names: Record<string, string> | undefined,
  nameKey: string,
): string {
  return names?.[nameKey] ?? nameKey;
}

export const InvestPortfolioPanel = ({
  onInvestFund,
  onViewFund,
}: {
  onInvestFund: (fundId: number) => void;
  onViewFund: (fundId: number) => void;
}) => {
  const {
    investPositions, stakingPositions, portfolioProfit, portfolioStakingRewardsByToken,
    redeemInvestPosition, stakeGat, unstakePosition, showToast, investmentFunds, stakingProducts,
    garudaPrimeSpendableGat, holdings,
  } = useApp();
  const { t } = useLanguage();
  const il = t.invest;
  const [stakeProductId, setStakeProductId] = useState<string | null>(null);
  const [stakeAmount, setStakeAmount] = useState("");
  const [confirmRedeem, setConfirmRedeem] = useState<string | null>(null);
  const [confirmUnstake, setConfirmUnstake] = useState<string | null>(null);

  const stakingNames = il.stakingProducts ?? {};
  const products = Array.isArray(stakingProducts) ? stakingProducts : [];
  const gatProducts = products.filter((p) => p.token === "GAT");
  const sdaProducts = products.filter((p) => p.token === "SDA");

  const activeInvestCount = investPositions.length;
  const activeStakeCount = stakingPositions.length;
  const legacyCounts = countLegacyGatPositions(investPositions, stakingPositions, products);

  const handleStake = async (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const minStake = getMinStake(product);
    const amt = parseFloat(stakeAmount);
    if (!amt || amt < minStake) {
      showToast(
        typeof il.stakeMinError === "function"
          ? il.stakeMinError(minStake, product.token)
          : `Minimum stake ${minStake} ${product.token}`,
        "error",
      );
      return;
    }
    const ok = await stakeGat(productId, amt);
    if (ok) {
      showToast(il.stakeSuccess(amt.toFixed(2), product.token), "success");
      setStakeProductId(null);
      setStakeAmount("");
    }
  };

  return (
    <div className="gp-invest-section">
      {legacyCounts.total > 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-[10px] leading-relaxed text-amber-200/90">
          <p className="font-semibold text-amber-300">
            {il.legacyMigrationTitle ?? "Posisi legacy (ledger lama)"}
          </p>
          <p className="mt-1 gp-muted">
            {typeof il.legacyMigrationBody === "function"
              ? il.legacyMigrationBody(legacyCounts.total)
              : `${legacyCounts.total} posisi dicatat sebelum migrasi on-chain. Cairkan/unstake seperti biasa, GAT dikirim ke dompet terhubung. Investasi & stake baru selalu on-chain.`}
          </p>
        </div>
      )}

      <div className="gp-invest-kpi-row">
        <div className="gp-invest-kpi">
          <p className="gp-invest-kpi__label">{il.portfolioProfit}</p>
          <p className="gp-invest-kpi__value text-emerald-400">+{formatUsd(portfolioProfit)}</p>
          <p className="gp-invest-kpi__sub gp-num">{formatGatFromUsd(portfolioProfit)}</p>
        </div>
        <div className="gp-invest-kpi">
          <p className="gp-invest-kpi__label">{il.stakingRewards}</p>
          <p className="gp-invest-kpi__value text-amber-400 text-sm leading-snug">
            {formatRewardsByToken(portfolioStakingRewardsByToken)}
          </p>
          <p className="gp-invest-kpi__sub">{activeStakeCount} {il.stakingActive}</p>
        </div>
      </div>

      <section className="gp-invest-section">
        <div className="gp-invest-section__head">
          <h3 className="gp-invest-section__title">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> {il.myInvestments}
          </h3>
          <span className="gp-invest-section__meta">{activeInvestCount} {il.activePositions}</span>
        </div>

        {investPositions.length === 0 ? (
          <p className="gp-invest-empty">{il.noInvestments}</p>
        ) : (
          investPositions.map((pos) => (
            <InvestPositionCard
              key={pos.id}
              position={pos}
              fund={resolveFund(investmentFunds, pos.fundId)}
              il={il}
              t={t}
              confirmRedeem={confirmRedeem}
              onConfirmRedeem={setConfirmRedeem}
              onRedeem={async () => {
                if (await redeemInvestPosition(pos.id)) {
                  showToast(il.redeemSuccess, "success");
                  setConfirmRedeem(null);
                }
              }}
              onAdd={() => onInvestFund(pos.fundId)}
              onView={() => onViewFund(pos.fundId)}
            />
          ))
        )}
      </section>

      <section className="gp-invest-section">
        <div className="gp-invest-section__head">
          <h3 className="gp-invest-section__title">
            <Lock className="w-4 h-4 text-amber-400" /> {il.myStaking}
          </h3>
        </div>

        {stakingPositions.length === 0 ? (
          <p className="gp-invest-empty">{il.noStaking}</p>
        ) : (
          stakingPositions.map((pos) => {
            const product = products.find((p) => p.id === pos.productId);
            if (!product) return null;
            const staked = getStakedAmount(pos);
            const isSda = product.token === "SDA";
            const prices = { SDA: getTokenPriceUsd("SDA"), GAT: getTokenPriceUsd("GAT") };
            const rewardGat = isSda
              ? calcStakingRewardGatFromSda(staked, product.apr ?? 0, pos.startedAt, prices.SDA, prices.GAT)
              : calcStakingReward(staked, product.apr ?? 0, pos.startedAt);
            const lockDays = product.lockDays ?? 0;
            const unlocked = isStakingUnlocked(pos.startedAt, lockDays);
            const daysLeft = daysUntilUnlock(pos.startedAt, lockDays);
            const stakeLockedLabel = typeof il.stakeLocked === "function"
              ? il.stakeLocked(daysLeft)
              : `${daysLeft} hari lagi`;
            const lockLabel = lockDays === 0
              ? il.flexibleLock
              : (typeof il.lockDays === "function" ? il.lockDays(lockDays) : `Lock ${lockDays} hari`);
            return (
              <div key={pos.id} className="gp-invest-card space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="gp-text text-sm font-semibold">{stakingProductName(stakingNames, product.nameKey)}</p>
                      <TokenBadge token={product.token} />
                      {pos.onChainStakeId != null ? (
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">
                          On-chain #{pos.onChainStakeId}
                        </span>
                      ) : isLegacyLedgerGatStake(pos, products) ? (
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                          {il.legacyBadge ?? "Legacy"}
                        </span>
                      ) : null}
                    </div>
                    <p className="gp-muted text-[10px] mt-0.5">{il.since} {formatDate(pos.startedAt)}</p>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                    unlocked ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                  }`}>
                    {unlocked ? il.stakeUnlocked : stakeLockedLabel}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <p className="gp-muted">{il.stakedAmount}</p>
                    <p className="gp-num gp-text font-bold">{staked.toLocaleString()} {product.token}</p>
                  </div>
                  <div className="text-right">
                    <p className="gp-muted">{isSda ? il.stakedSdaRewardLabel : il.stakingRewards}</p>
                    <p className="gp-num text-emerald-400 font-bold">
                      +{rewardGat.toFixed(2)} {isSda ? "GAT" : product.token}
                    </p>
                  </div>
                </div>
                <p className="gp-muted text-[10px]">
                  {product.apr ?? 0}% {isSda ? "est. bagi hasil" : t.apr} · {lockLabel}
                </p>
                {confirmUnstake === pos.id ? (
                  <div className="space-y-2 pt-1">
                    <p className="gp-muted text-[10px] text-center">
                      {unlocked
                        ? (isSda ? il.unstakeSdaConfirm : il.unstakeConfirm)
                        : (typeof il.unstakeLockedHint === "function"
                          ? il.unstakeLockedHint(daysLeft)
                          : `Masih terkunci, ${daysLeft} hari lagi`)}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setConfirmUnstake(null)} className="py-2 rounded-xl gp-pill text-xs font-semibold">{il.cancel}</button>
                      <button
                        type="button"
                        disabled={!unlocked}
                        onClick={async () => {
                          if (await unstakePosition(pos.id)) {
                            showToast(isSda ? il.unstakeSdaSuccess : il.unstakeSuccess, "success");
                            setConfirmUnstake(null);
                          } else showToast(
                            typeof il.unstakeLockedHint === "function"
                              ? il.unstakeLockedHint(daysLeft)
                              : `Masih terkunci, ${daysLeft} hari lagi`,
                            "warning",
                          );
                        }}
                        className="py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold disabled:opacity-40"
                      >
                        {il.unstake}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setStakeProductId(product.id); setStakeAmount(String(getMinStake(product))); }}
                      className="flex-1 py-2 rounded-xl border border-emerald-500/30 text-emerald-400 text-[10px] font-bold flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> {il.addStake}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmUnstake(pos.id)}
                      className="flex-1 py-2 rounded-xl border border-red-500/25 text-red-400 text-[10px] font-semibold flex items-center justify-center gap-1"
                    >
                      <Ban className="w-3 h-3" /> {il.unstake}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      <section className="gp-invest-section">
        <h3 className="gp-invest-section__title">{il.newStaking}</h3>

        {gatProducts.length > 0 && (
          <div className="gp-invest-section">
            <p className="gp-invest-section__label">{il.stakingGatSection}</p>
            {gatProducts.map((product) => (
              <StakingProductCard
                key={product.id}
                product={product}
                name={stakingProductName(stakingNames, product.nameKey)}
                stakeProductId={stakeProductId}
                stakeAmount={stakeAmount}
                walletBalance={garudaPrimeSpendableGat}
                il={il}
                t={t}
                onOpen={(id, min) => { setStakeProductId(id); setStakeAmount(String(min)); }}
                onClose={() => setStakeProductId(null)}
                onAmountChange={setStakeAmount}
                onConfirm={() => handleStake(product.id)}
              />
            ))}
          </div>
        )}

        {sdaProducts.length > 0 && (
          <div className="gp-invest-section">
            <p className="gp-invest-section__label">{il.stakingSdaSection}</p>
            {sdaProducts.map((product) => (
              <StakingProductCard
                key={product.id}
                product={product}
                name={stakingProductName(stakingNames, product.nameKey)}
                stakeProductId={stakeProductId}
                stakeAmount={stakeAmount}
                walletBalance={holdings?.SDA ?? 0}
                il={il}
                t={t}
                onOpen={(id, min) => { setStakeProductId(id); setStakeAmount(String(min)); }}
                onClose={() => setStakeProductId(null)}
                onAmountChange={setStakeAmount}
                onConfirm={() => handleStake(product.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const StakingProductCard = ({
  product, name, stakeProductId, stakeAmount, walletBalance, il, t, onOpen, onClose, onAmountChange, onConfirm,
}: {
  product: { id: string; token: "GAT" | "SDA"; apr: number; lockDays: number; minAmount?: number; minGat?: number };
  name: string;
  stakeProductId: string | null;
  stakeAmount: string;
  walletBalance: number;
  il: ReturnType<typeof useLanguage>["t"]["invest"];
  t: ReturnType<typeof useLanguage>["t"];
  onOpen: (id: string, min: number) => void;
  onClose: () => void;
  onAmountChange: (v: string) => void;
  onConfirm: () => void;
}) => {
  const minStake = getMinStake(product as import("../lib/invest/investPortfolio").StakingProduct);
  const isSda = product.token === "SDA";
  const prices = { SDA: getTokenPriceUsd("SDA"), GAT: getTokenPriceUsd("GAT") };
  const estRewardGat = isSda && stakeAmount
    ? calcStakingRewardGatFromSda(parseFloat(stakeAmount) || 0, product.apr, new Date().toISOString(), prices.SDA, prices.GAT)
    : 0;
  return (
    <div className="gp-invest-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="gp-text text-sm font-semibold">{name}</p>
            <TokenBadge token={product.token} />
          </div>
          <p className="gp-muted text-[10px] mt-0.5">
            {product.apr ?? 0}% {isSda ? "est. bagi hasil" : t.apr} ·{" "}
            {(product.lockDays ?? 0) === 0
              ? il.flexibleLock
              : (typeof il.lockDays === "function" ? il.lockDays(product.lockDays ?? 0) : `Lock ${product.lockDays ?? 0} hari`)}
          </p>
          <p className="gp-muted text-[9px] mt-0.5">
            {typeof il.stakeWithToken === "function" ? il.stakeWithToken(product.token) : product.token}
          </p>
        </div>
        <p className="gp-num text-emerald-400 font-bold text-sm">{minStake} {product.token}</p>
      </div>
      {stakeProductId === product.id ? (
        <div className="mt-3 space-y-2">
          <p className="gp-muted text-[9px]">
            Dompet: {walletBalance.toLocaleString()} {product.token}
          </p>
          <input
            type="number"
            value={stakeAmount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder={`Min ${minStake} ${product.token}`}
            className="w-full px-3 py-2.5 rounded-xl gp-input border gp-num text-sm"
          />
          {isSda && parseFloat(stakeAmount) >= minStake && typeof il.rewardPaidInGat === "function" && (
            <p className="gp-muted text-[9px]">{il.rewardPaidInGat(estRewardGat.toFixed(2))} (setelah lock penuh, proporsional waktu)</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} className="py-2 rounded-xl gp-pill text-xs font-semibold">{il.cancel}</button>
            <button
              type="button"
              onClick={onConfirm}
              className="py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black text-xs font-bold"
            >
              {il.confirmStake}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onOpen(product.id, minStake)}
          className="w-full mt-2 py-2 rounded-xl border border-amber-500/30 text-amber-400 text-xs font-semibold flex items-center justify-center gap-1"
        >
          <Lock className="w-3 h-3" /> {il.startStake} <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

const InvestPositionCard = ({
  position, fund, il, t, confirmRedeem, onConfirmRedeem, onRedeem, onAdd, onView,
}: {
  position: InvestPosition;
  fund: InvestmentFund | undefined;
  il: ReturnType<typeof useLanguage>["t"]["invest"];
  t: ReturnType<typeof useLanguage>["t"];
  confirmRedeem: string | null;
  onConfirmRedeem: (id: string | null) => void;
  onRedeem: () => void;
  onAdd: () => void;
  onView: () => void;
}) => {
  if (!fund) return null;
  const profit = calcInvestProfit(position.principalUsd, parseApr(fund.apr), position.startedAt);
  const gatPrincipal = usdToToken(position.principalUsd, "GAT");
  const fundIcon = FUND_ICON[fund.icon] ?? FUND_ICON.zap;

  return (
    <div className="gp-invest-card space-y-2.5">
      <button type="button" onClick={onView} className="w-full text-left">
        <div className="flex items-start gap-2">
          <div className="p-2 rounded-lg gp-subtle border text-emerald-400 shrink-0">{fundIcon}</div>
          <div className="flex-1 min-w-0">
            <p className="gp-text text-sm font-semibold truncate">{fund.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <p className={`text-[10px] font-medium ${fund.typeColor}`}>{fund.type}</p>
              {position.onChainPositionId != null ? (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">
                  On-chain #{position.onChainPositionId}
                </span>
              ) : isLegacyLedgerInvestPosition(position) ? (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                  {il.legacyBadge ?? "Legacy"}
                </span>
              ) : null}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="gp-num text-emerald-400 font-bold">{fund.apr}</p>
            <p className="gp-muted text-[9px]">{t.apr}</p>
          </div>
        </div>
      </button>

      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <p className="gp-muted">{il.investedLabel}</p>
          <p className="gp-num gp-text font-bold">{formatUsd(position.principalUsd)}</p>
          <p className="gp-num text-teal-500/90 font-semibold">{gatPrincipal.toFixed(2)} GAT</p>
        </div>
        <div className="text-right">
          <p className="gp-muted">{il.profitLabel}</p>
          <p className="gp-num text-emerald-400 font-bold">+{formatUsd(profit)}</p>
          <p className="gp-num text-teal-500/90 font-semibold">+{usdToToken(profit, "GAT").toFixed(2)} GAT</p>
        </div>
      </div>

      <p className="gp-muted text-[10px]">{il.since} {formatDate(position.startedAt)} · {fund.term}</p>

      {confirmRedeem === position.id ? (
        <div className="space-y-2">
          <p className="gp-muted text-[10px] text-center leading-relaxed">{il.redeemConfirm}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onConfirmRedeem(null)} className="py-2 rounded-xl gp-pill text-xs font-semibold">{il.cancel}</button>
            <button type="button" onClick={onRedeem} className="py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold">{il.redeemYes}</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAdd}
            className="flex-1 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black text-[10px] font-bold flex items-center justify-center gap-1"
          >
            <Plus className="w-3 h-3" /> {il.addMore}
          </button>
          <button
            type="button"
            onClick={() => onConfirmRedeem(position.id)}
            className="flex-1 py-2 rounded-xl border border-red-500/25 text-red-400 text-[10px] font-semibold flex items-center justify-center gap-1"
          >
            <Ban className="w-3 h-3" /> {il.redeem}
          </button>
        </div>
      )}
    </div>
  );
};
