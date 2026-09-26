import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  X, Vote, ThumbsUp, ThumbsDown, Plus, Loader2, ScrollText,
  Users, BarChart3, Clock,
} from "lucide-react";
import { GP_SEP_INLINE } from "./garudaUi";
import { useLanguage } from "./LanguageContext";
import { useApp } from "./AppContext";
import { useAuth } from "../contexts/AuthContext";
import { isFirebaseConfigured } from "../lib/firebase/config";
import {
  castGovernanceVote,
  createGovernanceProposal,
  ensureGovernanceSeed,
  fetchUserVotes,
  formatGovernanceTime,
  subscribeGovernanceProposals,
  type GovernanceProposalDoc,
  type ProposalCategory,
  type VoteChoice,
} from "../lib/firebase/governanceService";
import { isGovernanceEnabled } from "../lib/ecosystem/garudaEcosystem";
import { fetchPayLedger } from "../lib/payhub/payLedgerService";
import {
  relayGovernanceProposalOnChain,
  relayGovernanceVoteOnChain,
} from "../lib/governance/governanceOnChainApi";
import { isDemoAuthAllowed } from "../lib/env/production";
import { notificationEvents } from "../lib/notifications/notificationEvents";

type Props = { onClose: () => void };

const CATEGORY_STYLE: Record<ProposalCategory, string> = {
  treasury: "gp-badge-read gp-badge-read--amber",
  protocol: "gp-badge-read gp-badge-read--indigo",
  partnership: "gp-badge-read gp-badge-read--cyan",
  community: "gp-badge-read gp-badge-read--emerald",
};

export function GovernancePanel({ onClose }: Props) {
  const { t } = useLanguage();
  const gv = t.governance;
  const { showToast, profileName, addNotification } = useApp();
  const { user } = useAuth();

  const [proposals, setProposals] = useState<({ id: string } & GovernanceProposalDoc)[]>([]);
  const [userVotes, setUserVotes] = useState<Record<string, VoteChoice>>({});
  const [loading, setLoading] = useState(true);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCategory, setFormCategory] = useState<ProposalCategory>("community");
  const [submitting, setSubmitting] = useState(false);
  const [votePower, setVotePower] = useState(100);

  const useRemote = isFirebaseConfigured && Boolean(user?.uid);
  const enabled = isGovernanceEnabled();

  const timeLabels = useMemo(
    () => ({
      justNow: gv.timeJustNow,
      minutesAgo: gv.timeMinutesAgo,
      hoursAgo: gv.timeHoursAgo,
      daysAgo: gv.timeDaysAgo,
    }),
    [gv],
  );

  const seedRemote = useCallback(async () => {
    if (!user?.uid || !isDemoAuthAllowed()) return;
    await ensureGovernanceSeed(user.uid, [
      {
        title: gv.seed1Title,
        description: gv.seed1Desc,
        category: "treasury",
        authorName: "Garuda DAO",
        yesVotes: 4200,
        noVotes: 890,
        quorum: 5000,
      },
      {
        title: gv.seed2Title,
        description: gv.seed2Desc,
        category: "protocol",
        authorName: "Core Team",
        yesVotes: 3100,
        noVotes: 1200,
        quorum: 5000,
      },
      {
        title: gv.seed3Title,
        description: gv.seed3Desc,
        category: "partnership",
        authorName: gv.communityLead,
        yesVotes: 2800,
        noVotes: 450,
        quorum: 4000,
      },
    ]);
  }, [user?.uid, gv]);

  useEffect(() => {
    if (!enabled) {
      setProposals([]);
      setLoading(false);
      return;
    }
    if (!useRemote) {
      setProposals([]);
      setLoading(false);
      return;
    }

    seedRemote().catch(() => {});
    const unsub = subscribeGovernanceProposals(
      (data) => {
        setProposals(data);
        setLoading(false);
      },
      () => {
        setProposals([]);
        setLoading(false);
      },
    );
    return unsub;
  }, [enabled, useRemote, seedRemote]);

  useEffect(() => {
    if (!useRemote || !user?.uid || proposals.length === 0) return;
    fetchUserVotes(
      proposals.filter((p) => !p.id.startsWith("local-")).map((p) => p.id),
      user.uid,
    ).then(setUserVotes);
  }, [proposals, useRemote, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    void fetchPayLedger().then((ledger) => {
      const gat = Math.floor(ledger?.gatBalance ?? 0);
      setVotePower(gat > 0 ? gat : 100);
    });
  }, [user?.uid]);

  const stats = useMemo(() => {
    const active = proposals.filter((p) => p.status === "active").length;
    const totalVotes = proposals.reduce((s, p) => s + p.yesVotes + p.noVotes, 0);
    return { active, totalVotes, power: votePower };
  }, [proposals, votePower]);

  const vote = async (proposalId: string, choice: VoteChoice) => {
    if (!user?.uid) {
      showToast(gv.loginRequired, "error");
      return;
    }
    if (userVotes[proposalId]) {
      showToast(gv.alreadyVoted, "info");
      return;
    }
    if (proposalId.startsWith("local-")) {
      setUserVotes((v) => ({ ...v, [proposalId]: choice }));
      setProposals((prev) =>
        prev.map((p) =>
          p.id === proposalId
            ? { ...p, [choice === "yes" ? "yesVotes" : "noVotes"]: p[choice === "yes" ? "yesVotes" : "noVotes"] + 100 }
            : p,
        ),
      );
      showToast(gv.voteRecorded, "success");
      addNotification(notificationEvents.governanceVoteRecorded());
      return;
    }
    setVotingId(proposalId);
    try {
      const weight = Math.max(1, votePower);
      await castGovernanceVote(proposalId, user.uid, choice, weight);
      await relayGovernanceVoteOnChain({
        proposalId,
        support: choice === "yes",
      });
      setUserVotes((v) => ({ ...v, [proposalId]: choice }));
      showToast(gv.voteRecorded, "success");
      addNotification(notificationEvents.governanceVoteRecorded());
    } catch (e) {
      showToast(e instanceof Error ? e.message : gv.voteFailed, "error");
    } finally {
      setVotingId(null);
    }
  };

  const submitProposal = async () => {
    const title = formTitle.trim();
    const description = formDesc.trim();
    if (!title || !description) {
      showToast(gv.formIncomplete, "error");
      return;
    }
    if (!user?.uid) {
      showToast(gv.loginRequired, "error");
      return;
    }
    setSubmitting(true);
    try {
      if (useRemote) {
        const proposalId = await createGovernanceProposal(user.uid, profileName, {
          title,
          description,
          category: formCategory,
        });
        await relayGovernanceProposalOnChain({ proposalId, title });
      } else {
        setProposals((prev) => [
          {
            id: `local-${Date.now()}`,
            title,
            description,
            category: formCategory,
            status: "active",
            createdBy: user.uid,
            authorName: profileName,
            yesVotes: 0,
            noVotes: 0,
            quorum: 1000,
          },
          ...prev,
        ]);
      }
      setFormTitle("");
      setFormDesc("");
      setShowForm(false);
      showToast(gv.proposalCreated, "success");
      addNotification(notificationEvents.governanceProposal(title));
    } catch (e) {
      showToast(e instanceof Error ? e.message : gv.proposalFailed, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!enabled) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-center">
        <Vote className="w-10 h-10 text-zinc-500 mb-3" />
        <p className="gp-text font-semibold">{gv.disabledTitle}</p>
        <p className="gp-muted text-xs mt-1">{gv.disabledDesc}</p>
        <button type="button" onClick={onClose} className="mt-4 px-4 py-2 rounded-xl gp-subtle text-xs">{gv.close}</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="gp-panel-header flex items-start gap-3 p-4 pt-6 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center gp-read-violet shrink-0">
          <Vote className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="gp-text font-bold text-base leading-tight">{gv.title}</h3>
          <p className="gp-muted text-xs mt-0.5">{gv.subtitle}</p>
        </div>
        <button type="button" onClick={onClose} className="gp-muted gp-icon-btn p-1 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="gp-panel-body p-4 space-y-4" style={{ scrollbarWidth: "none" }}>
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: <ScrollText className="w-3.5 h-3.5" />, label: gv.statActive, value: stats.active },
            { icon: <Users className="w-3.5 h-3.5" />, label: gv.statVotes, value: stats.totalVotes.toLocaleString() },
            { icon: <BarChart3 className="w-3.5 h-3.5" />, label: gv.statPower, value: `${stats.power} GAT` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl gp-subtle border p-2.5 text-center">
              <div className="flex justify-center gp-read-violet mb-1">{s.icon}</div>
              <p className="gp-text text-sm font-bold gp-num">{s.value}</p>
              <p className="gp-muted text-[9px] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="gp-text text-sm font-semibold">{gv.proposalsTitle}</p>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="gp-btn-accent gp-btn-accent--violet inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px]"
          >
            <Plus className="w-3 h-3" /> {gv.newProposal}
          </button>
        </div>

        {showForm && (
          <div className="rounded-2xl border border-violet-500/25 p-4 space-y-3">
            <input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder={gv.formTitle}
              className="w-full gp-input rounded-xl px-3 py-2 text-xs"
            />
            <textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder={gv.formDesc}
              rows={3}
              className="w-full gp-input rounded-xl px-3 py-2 text-xs resize-none"
            />
            <select
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value as ProposalCategory)}
              className="w-full gp-input rounded-xl px-3 py-2 text-xs"
            >
              {(Object.keys(gv.categories) as ProposalCategory[]).map((c) => (
                <option key={c} value={c}>{gv.categories[c]}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-xl gp-subtle text-xs">{gv.cancel}</button>
              <button type="button" disabled={submitting} onClick={submitProposal} className="flex-1 py-2 rounded-xl bg-violet-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1">
                {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}{gv.submit}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
          </div>
        ) : (
          <div className="space-y-3">
            {proposals.map((p) => {
              const total = p.yesVotes + p.noVotes;
              const yesPct = total > 0 ? Math.round((p.yesVotes / total) * 100) : 0;
              const quorumPct = Math.min(100, Math.round((total / p.quorum) * 100));
              const myVote = userVotes[p.id];
              const isVoting = votingId === p.id;

              return (
                <div key={p.id} className="rounded-2xl border border-violet-500/20 gp-glass p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className={`${CATEGORY_STYLE[p.category]} mb-1.5`}>
                        {gv.categories[p.category]}
                      </span>
                      <p className="gp-text text-sm font-semibold leading-snug">{p.title}</p>
                      <p className="gp-muted text-[11px] mt-1 leading-relaxed">{p.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] gp-muted">
                    <span>{p.authorName}</span>
                    {p.createdAt && (
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {formatGovernanceTime(p.createdAt, timeLabels)}
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-emerald-400">{gv.yes} {yesPct}%</span>
                      <span className="gp-muted">{gv.quorum} {quorumPct}%</span>
                      <span className="text-red-400">{gv.no} {100 - yesPct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden flex">
                      <div className="bg-emerald-500 h-full" style={{ width: `${yesPct}%` }} />
                      <div className="bg-red-500/70 h-full flex-1" />
                    </div>
                    <p className="gp-muted text-[9px] mt-1 gp-num">
                      {p.yesVotes.toLocaleString()} / {p.noVotes.toLocaleString()}{GP_SEP_INLINE}{gv.target} {p.quorum.toLocaleString()} GAT
                    </p>
                  </div>

                  {p.status === "active" && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={Boolean(myVote) || isVoting}
                        onClick={() => vote(p.id, "yes")}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                          myVote === "yes"
                            ? "bg-emerald-500/25 border border-emerald-500/40 text-emerald-400"
                            : "bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-50"
                        }`}
                      >
                        {isVoting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                        {gv.voteYes}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(myVote) || isVoting}
                        onClick={() => vote(p.id, "no")}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                          myVote === "no"
                            ? "bg-red-500/25 border border-red-500/40 text-red-400"
                            : "bg-red-500/10 border border-red-500/25 text-red-400 hover:bg-red-500/15 disabled:opacity-50"
                        }`}
                      >
                        {isVoting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsDown className="w-3 h-3" />}
                        {gv.voteNo}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.05] p-3">
          <p className="gp-muted text-[11px] leading-relaxed">{gv.syariahNote}</p>
        </div>
      </div>
    </div>
  );
};
