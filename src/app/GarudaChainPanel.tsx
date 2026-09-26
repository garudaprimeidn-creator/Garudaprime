import React, { useEffect, useState } from "react";
import {
  X, Layers, Shield, Server, ArrowRight,
  ExternalLink, Loader2, Activity,
} from "lucide-react";
import { useLanguage } from "./LanguageContext";
import { useApp } from "./AppContext";
import { useAuth } from "../contexts/AuthContext";
import { isPhase2Active } from "../lib/ecosystem/garudaEcosystem";
import {
  GARUDA_CHAIN, activeGarudaBridgeVault, activeGarudaGatAddress, isGarudaChainLive, isGarudaMainnet,
} from "../lib/web3/garudaChain";
import { SIDRA_CHAIN } from "../lib/web3/sidraNetwork";
import { GAT_TOKEN } from "../lib/web3/gatToken";
import {
  fetchSidraStats, fetchSidraToken, sidraExplorerUrl, type SidraChainStats, type SidraTokenInfo,
} from "../lib/web3/sidraExplorer";
import { fetchGarudaChainStats, type GarudaChainStats } from "../lib/web3/garudaChainRpc";
import { addGarudaChainToWallet } from "../lib/web3/addGarudaChain";
import { applyValidatorWaitlist } from "../lib/firebase/validatorApi";
import { fetchValidatorStats, type ValidatorStats } from "../lib/validator/validatorService";
import { parseStakeSda } from "../lib/validator/parseStakeSda";
import { displayTokenSymbol } from "./tokenEconomy";

type Props = { onClose: () => void };

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ", ";
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return ", ";
  }
}

function statusLabel(status: string, gc: Record<string, string>): string {
  switch (status) {
    case "active": return gc.validatorStatusActive;
    case "pending": return gc.validatorStatusPending;
    case "rejected": return gc.validatorStatusRejected;
    case "revoked": return gc.validatorStatusRevoked;
    default: return status;
  }
}

function statusTone(status: string): string {
  switch (status) {
    case "active": return "text-emerald-400 bg-emerald-500/15 border-emerald-500/30";
    case "pending": return "text-amber-400 bg-amber-500/15 border-amber-500/30";
    case "rejected": return "text-red-400 bg-red-500/15 border-red-500/30";
    case "revoked": return "text-orange-400 bg-orange-500/15 border-orange-500/30";
    default: return "gp-text gp-subtle border-indigo-500/20";
  }
}

function fmtTpl(template: string, amount: number): string {
  return template.replace("{amount}", amount.toLocaleString());
}

export const GarudaChainPanel = ({ onClose }: Props) => {
  const { t } = useLanguage();
  const { showToast, copyText, walletAddress } = useApp();
  const { connectedWallet } = useAuth();
  const { user } = useAuth();
  const gc = t.garudaChain;
  const bridgeVault = import.meta.env.VITE_GAT_BRIDGE_VAULT_ADDRESS?.trim();

  const [stats, setStats] = useState<SidraChainStats | null>(null);
  const [gatInfo, setGatInfo] = useState<SidraTokenInfo | null>(null);
  const [chainStats, setChainStats] = useState<GarudaChainStats | null>(null);
  const [showValidator, setShowValidator] = useState(false);
  const [busy, setBusy] = useState(false);

  const [vEmail, setVEmail] = useState(user?.email ?? "");
  const [vOrg, setVOrg] = useState("");
  const [vStake, setVStake] = useState("");
  const [vMsg, setVMsg] = useState("");
  const [validatorStats, setValidatorStats] = useState<ValidatorStats | null>(null);

  useEffect(() => {
    fetchSidraStats().then(setStats);
    if (GAT_TOKEN.address) fetchSidraToken(GAT_TOKEN.address).then(setGatInfo);
    if (isGarudaChainLive()) fetchGarudaChainStats().then(setChainStats);
    fetchValidatorStats().then(setValidatorStats);
  }, []);

  const copy = (label: string, value: string) => {
    copyText(value);
    showToast(`${label} ${gc.copied}`, "success");
  };

  const submitValidator = async () => {
    const addr = connectedWallet?.address ?? walletAddress;
    if (!addr) { showToast(gc.connectWalletFirst, "error"); return; }
    if (!vEmail.includes("@")) { showToast(gc.invalidEmail, "error"); return; }
    const minStake = validatorStats?.minStakeSda ?? 0;
    const stake = parseStakeSda(vStake);
    if (!vStake.trim()) { showToast(gc.validatorStakeRequired, "error"); return; }
    if (minStake > 0 && stake < minStake) {
      showToast(fmtTpl(gc.validatorStakeTooLow, minStake), "error");
      return;
    }
    setBusy(true);
    try {
      await applyValidatorWaitlist({
        walletAddress: addr,
        email: vEmail,
        orgName: vOrg || undefined,
        stakeSda: vStake.trim(),
        message: vMsg || undefined,
      });
      showToast(gc.validatorSubmitted, "success");
      setShowValidator(false);
      setVStake("");
      setVMsg("");
      fetchValidatorStats().then(setValidatorStats);
    } catch (e) {
      showToast(e instanceof Error ? e.message : gc.validatorFailed, "error");
    } finally {
      setBusy(false);
    }
  };

  const handleAddNetwork = async () => {
    try {
      const result = await addGarudaChainToWallet(window.ethereum);
      if (result.symbolStaleHint) {
        showToast(gc.networkSymbolRefresh, "info");
      } else {
        showToast(gc.networkAdded, "success");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : gc.networkAddFailed, "error");
    }
  };

  const minStake = validatorStats?.minStakeSda ?? 0;
  const canApply = validatorStats?.canApply ?? !validatorStats?.application;
  const app = validatorStats?.application;
  const appStatus = app?.status ?? "";

  return (
    <div className="flex flex-col h-full">
      <div className="gp-panel-header flex items-start gap-3 p-4 pt-6 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center gp-read-indigo shrink-0">
          <Layers className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="gp-text font-bold text-base leading-tight">{gc.title}</h3>
          <p className="gp-muted text-xs mt-0.5">{gc.subtitle}</p>
        </div>
        <button type="button" onClick={onClose} className="gp-muted gp-icon-btn p-1 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="gp-panel-body p-4 space-y-4" style={{ scrollbarWidth: "none" }}>
        {isGarudaChainLive() && (
          <div className={`rounded-2xl border p-4 ${chainStats?.online ? "border-indigo-500/25 bg-indigo-500/[0.06]" : "border-zinc-500/25 bg-zinc-500/[0.04]"}`}>
            <div className="flex items-center justify-between mb-3">
              <p className="gp-text text-sm font-semibold flex items-center gap-1.5">
                <Server className="w-4 h-4 gp-read-indigo" /> {isGarudaMainnet() ? gc.mainnetTitle : gc.testnetTitle}
              </p>
              <span className={`gp-badge-read ${chainStats?.online ? "gp-badge-read--emerald" : "bg-zinc-500/15 text-zinc-500 border border-zinc-500/25"}`}>
                {chainStats?.online ? gc.testnetOnline : gc.testnetOffline}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div className="rounded-xl gp-subtle p-2.5">
                <p className="gp-muted text-[10px]">{gc.testnetBlock}</p>
                <p className="gp-num gp-text font-bold text-sm mt-0.5">
                  {chainStats?.online ? chainStats.blockNumber.toLocaleString() : ", "}
                </p>
              </div>
              <div className="rounded-xl gp-subtle p-2.5">
                <p className="gp-muted text-[10px]">{gc.chainId}</p>
                <p className="gp-num gp-text font-bold text-sm mt-0.5">{GARUDA_CHAIN.chainId}</p>
              </div>
              <div className="rounded-xl gp-subtle p-2.5">
                <p className="gp-muted text-[10px]">{gc.consensus}</p>
                <p className="gp-text font-semibold text-sm mt-0.5">{GARUDA_CHAIN.consensus}</p>
              </div>
              <div className="rounded-xl gp-subtle p-2.5">
                <p className="gp-muted text-[10px]">{gc.blockTime}</p>
                <p className="gp-text font-semibold text-sm mt-0.5">{GARUDA_CHAIN.blockTime}</p>
              </div>
            </div>
            <div className="flex gap-2 mb-3">
              {GARUDA_CHAIN.blockExplorer && (
                <a
                  href={GARUDA_CHAIN.blockExplorer}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-2 rounded-xl gp-subtle text-center text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center justify-center gap-1"
                >
                  Explorer <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <a
                href={GARUDA_CHAIN.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2 rounded-xl gp-subtle text-center text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center justify-center gap-1"
              >
                {gc.docsLink} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <button type="button" onClick={handleAddNetwork}
              className="gp-btn-accent gp-btn-accent--indigo w-full py-2 text-xs">
              {gc.addNetwork}
            </button>
          </div>
        )}

        {stats && (
          <div className="rounded-2xl border gp-glass p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="gp-text text-sm font-semibold flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-400" /> {gc.liveStatsTitle}
              </p>
              <a
                href={sidraExplorerUrl("/stats")}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-emerald-400 flex items-center gap-0.5 hover:underline"
              >
                Blockscout <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: gc.statBlocks, value: Number(stats.totalBlocks).toLocaleString() },
                { label: gc.statTxs, value: Number(stats.totalTransactions).toLocaleString() },
                { label: gc.statGas, value: `${stats.gasPriceGwei} Gwei` },
                { label: gc.statTxToday, value: Number(stats.transactionsToday).toLocaleString() },
              ].map((s) => (
                <div key={s.label} className="rounded-xl gp-subtle p-2.5">
                  <p className="gp-muted text-[10px]">{s.label}</p>
                  <p className="gp-num gp-text font-bold text-sm mt-0.5">{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {gatInfo && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 text-xs">
            <p className="gp-text font-semibold mb-2">{gatInfo.name} ({gatInfo.symbol})</p>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="gp-muted">{gc.gatSupply}</span><p className="gp-text font-semibold">{gatInfo.totalSupply}</p></div>
              <div><span className="gp-muted">{gc.gatHolders}</span><p className="gp-text font-semibold">{gatInfo.holders}</p></div>
            </div>
            <a href={sidraExplorerUrl(`/token/${gatInfo.address}`)} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-emerald-400 mt-2 hover:underline text-[10px]">
              {gc.viewExplorer} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.06] p-4">
          <p className="gp-text text-sm font-semibold mb-2">{gc.architectureTitle}</p>
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="gp-chip gp-chip--emerald">{SIDRA_CHAIN.name}</span>
            <ArrowRight className="w-3.5 h-3.5 gp-muted" />
            <span className="gp-chip gp-chip--indigo">{GARUDA_CHAIN.name}</span>
          </div>
          <p className="gp-muted text-[11px] mt-3 leading-relaxed">{gc.architectureDesc}</p>
        </div>

        <div className="rounded-2xl border gp-glass p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="gp-text text-sm font-semibold">{gc.networkTitle}</p>
            <a
              href={GARUDA_CHAIN.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-indigo-400 hover:underline shrink-0"
            >
              docs.garudachain.id
            </a>
          </div>
          {[
            { label: gc.chainId, value: String(GARUDA_CHAIN.chainId), copyable: false },
            { label: "RPC", value: GARUDA_CHAIN.rpcUrl, copyable: true },
            ...(GARUDA_CHAIN.blockExplorer
              ? [{ label: gc.explorer, value: GARUDA_CHAIN.blockExplorer, copyable: false }]
              : []),
            { label: gc.nativeSymbol, value: `${GARUDA_CHAIN.symbol} · ${GARUDA_CHAIN.nativeName}`, copyable: false },
            { label: gc.consensus, value: GARUDA_CHAIN.consensus, copyable: false },
            { label: gc.blockTime, value: GARUDA_CHAIN.blockTime, copyable: false },
            { label: gc.finality, value: GARUDA_CHAIN.finality, copyable: false },
            { label: gc.validators, value: `${GARUDA_CHAIN.validatorGenesis} → ${GARUDA_CHAIN.validatorTarget}`, copyable: false },
            { label: gc.maxSupply, value: GARUDA_CHAIN.maxSupply, copyable: false },
            { label: gc.gatSidra, value: GAT_TOKEN.address ?? gc.notDeployed, copyable: true },
            ...(activeGarudaGatAddress()
              ? [{
                  label: isGarudaMainnet() ? gc.mainnetGat : gc.testnetGat,
                  value: activeGarudaGatAddress()!,
                  copyable: true,
                }]
              : []),
            { label: gc.bridgeVault, value: bridgeVault || activeGarudaBridgeVault() || gc.pendingDeploy, copyable: true },
          ].map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-2 text-xs">
              <span className="gp-muted shrink-0">{row.label}</span>
              {row.copyable && row.value.startsWith("0x") ? (
                <button type="button" onClick={() => copy(row.label, row.value)}
                  className="gp-text font-mono text-[10px] text-right break-all hover:text-emerald-400">
                  {row.value.length > 22 ? `${row.value.slice(0, 10)}…${row.value.slice(-8)}` : row.value}
                </button>
              ) : row.value.startsWith("http") ? (
                <a href={row.value} target="_blank" rel="noreferrer"
                  className="gp-text font-mono text-[10px] text-right break-all text-indigo-400 hover:underline">
                  {row.value.replace(/^https?:\/\//, "")}
                </a>
              ) : (
                <span className="gp-text font-mono text-[10px] text-right break-all">
                  {row.value.length > 22 && row.value.startsWith("0x")
                    ? `${row.value.slice(0, 10)}…${row.value.slice(-8)}`
                    : row.value}
                </span>
              )}
            </div>
          ))}
        </div>

        {isPhase2Active() && validatorStats?.programEnabled && (
          <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/[0.06] p-4 space-y-3">
            <div>
              <p className="gp-text text-sm font-semibold">{gc.validatorRewardsTitle}</p>
              <p className="gp-muted text-[10px] mt-1 leading-relaxed">{gc.validatorProgramDesc}</p>
            </div>

            <div className="rounded-xl border border-indigo-500/15 bg-indigo-500/[0.04] p-3 space-y-1.5 text-[10px]">
              <p className="gp-muted font-semibold uppercase tracking-wide">{gc.validatorHowItWorksTitle}</p>
              {[gc.validatorStep1, gc.validatorStep2, gc.validatorStep3, gc.validatorStep4].map((step) => (
                <p key={step} className="gp-muted leading-relaxed">{step}</p>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl gp-subtle p-2.5">
                <p className="gp-muted text-[10px]">{gc.validatorJoinReward}</p>
                <p className="gp-num gp-text font-bold text-sm mt-0.5">{validatorStats.joinRewardGat} GAT</p>
              </div>
              <div className="rounded-xl gp-subtle p-2.5">
                <p className="gp-muted text-[10px]">{gc.validatorMonthlyReward}</p>
                <p className="gp-num gp-text font-bold text-sm mt-0.5">{validatorStats.monthlyRewardGat} GAT</p>
              </div>
              <div className="rounded-xl gp-subtle p-2.5">
                <p className="gp-muted text-[10px]">{gc.validatorMinStake}</p>
                <p className="gp-num gp-text font-bold text-sm mt-0.5">{minStake.toLocaleString()} {displayTokenSymbol("SDA")}</p>
              </div>
            </div>

            {app ? (
              <div className="rounded-xl border border-indigo-500/20 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="gp-muted">{gc.validatorStatus}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${statusTone(appStatus)}`}>
                    {statusLabel(appStatus, gc as unknown as Record<string, string>)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className="gp-muted">{gc.validatorStake}</span>
                    <p className="gp-text font-semibold mt-0.5">
                      {(app.stakeAmount ?? parseStakeSda(app.stakeSda)).toLocaleString()} {displayTokenSymbol("SDA")}
                    </p>
                  </div>
                  <div>
                    <span className="gp-muted">{gc.validatorAppliedAt}</span>
                    <p className="gp-text font-semibold mt-0.5">{fmtDate(app.appliedAt)}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="gp-muted">{gc.validatorWallet}</span>
                    <p className="gp-text font-mono text-[10px] mt-0.5 break-all">{app.walletAddress || ", "}</p>
                  </div>
                </div>

                {validatorStats.totalEarnedGat > 0 && (
                  <div className="rounded-lg bg-emerald-500/[0.08] border border-emerald-500/20 p-2.5 space-y-1">
                    <div className="flex justify-between">
                      <span className="gp-muted">{gc.validatorTotalEarned}</span>
                      <span className="text-emerald-400 font-semibold">{validatorStats.totalEarnedGat.toLocaleString()} GAT</span>
                    </div>
                    <p className="gp-muted text-[10px] leading-relaxed">{gc.validatorEarnedNote}</p>
                  </div>
                )}

                {appStatus === "pending" && (
                  <p className="gp-muted text-[10px] leading-relaxed">
                    {fmtTpl(gc.validatorPendingNote, validatorStats.joinRewardGat)}
                  </p>
                )}
                {appStatus === "active" && (
                  <>
                    <p className="text-emerald-400/90 text-[10px] leading-relaxed">
                      {fmtTpl(gc.validatorActiveNote, validatorStats.monthlyRewardGat)}
                    </p>
                    <p className="gp-muted text-[10px]">
                      {validatorStats.joinRewardPaid
                        ? gc.validatorJoinRewardPaid
                        : gc.validatorJoinRewardPending}
                    </p>
                    {validatorStats.lastMonthlyPeriod && (
                      <p className="gp-muted text-[10px]">
                        {gc.validatorLastMonthly}: {validatorStats.lastMonthlyPeriod}
                      </p>
                    )}
                  </>
                )}
                {appStatus === "rejected" && (
                  <p className="text-red-400/90 text-[10px] leading-relaxed">{gc.validatorRejectedNote}</p>
                )}
                {appStatus === "revoked" && (
                  <p className="text-orange-400/90 text-[10px] leading-relaxed">{gc.validatorRevokedNote}</p>
                )}
              </div>
            ) : (
              <p className="gp-muted text-[10px] leading-relaxed">{gc.validatorRewardHint}</p>
            )}
          </div>
        )}

        {isPhase2Active() && !showValidator && canApply && (
          <button
            type="button"
            onClick={() => setShowValidator(true)}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.06] hover:bg-indigo-500/10 transition-colors"
          >
            <Server className="w-4 h-4 text-indigo-400" />
            <span className="gp-text text-[11px] font-semibold">
              {app ? gc.validatorReapplyCta : gc.validatorCta}
            </span>
          </button>
        )}

        {showValidator && canApply && (
          <div className="rounded-2xl border border-indigo-500/25 p-4 space-y-3">
            <p className="gp-text text-sm font-semibold">{gc.validatorFormTitle}</p>
            <p className="gp-muted text-[10px] leading-relaxed">
              {fmtTpl(gc.validatorMinStakeHint, minStake)}
            </p>
            <input value={vEmail} onChange={(e) => setVEmail(e.target.value)} placeholder={gc.email} className="w-full gp-input rounded-xl px-3 py-2 text-xs" />
            <input value={vOrg} onChange={(e) => setVOrg(e.target.value)} placeholder={gc.orgName} className="w-full gp-input rounded-xl px-3 py-2 text-xs" />
            <input
              value={vStake}
              onChange={(e) => setVStake(e.target.value)}
              placeholder={fmtTpl(gc.stakeSda, minStake)}
              className="w-full gp-input rounded-xl px-3 py-2 text-xs"
            />
            <textarea value={vMsg} onChange={(e) => setVMsg(e.target.value)} placeholder={gc.message} rows={2} className="w-full gp-input rounded-xl px-3 py-2 text-xs resize-none" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowValidator(false)} className="flex-1 py-2 rounded-xl gp-subtle text-xs">{gc.cancel}</button>
              <button type="button" disabled={busy} onClick={submitValidator} className="flex-1 py-2 rounded-xl bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1">
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}{gc.submit}
              </button>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 flex gap-2">
          <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="gp-muted text-[11px] leading-relaxed">{gc.syariahNote}</p>
        </div>
      </div>
    </div>
  );
};
