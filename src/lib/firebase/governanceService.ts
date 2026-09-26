import {
  addDoc, collection, doc, getDoc, getDocs, increment, limit, onSnapshot,
  orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch,
  type Timestamp, type Unsubscribe,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./config";

export type ProposalCategory = "treasury" | "protocol" | "partnership" | "community";
export type ProposalStatus = "active" | "passed" | "rejected" | "pending";
export type VoteChoice = "yes" | "no";

export type GovernanceProposalDoc = {
  title: string;
  description: string;
  category: ProposalCategory;
  status: ProposalStatus;
  createdBy: string;
  authorName: string;
  yesVotes: number;
  noVotes: number;
  quorum: number;
  endsAt?: Timestamp;
  createdAt?: Timestamp;
  isSeed?: boolean;
};

export type GovernanceVoteDoc = {
  uid: string;
  vote: VoteChoice;
  weight: number;
  createdAt?: Timestamp;
};

export type SeedProposalInput = {
  title: string;
  description: string;
  category: ProposalCategory;
  authorName: string;
  yesVotes: number;
  noVotes: number;
  quorum: number;
  status?: ProposalStatus;
};

const PROPOSALS = "governance_proposals";
const META = "governance_meta";

export const formatGovernanceTime = (
  ts: Timestamp | undefined,
  labels: {
    justNow: string;
    minutesAgo: (n: number) => string;
    hoursAgo: (n: number) => string;
    daysAgo: (n: number) => string;
  },
): string => {
  if (!ts?.toDate) return labels.justNow;
  const ms = Date.now() - ts.toDate().getTime();
  if (ms < 60_000) return labels.justNow;
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return labels.minutesAgo(mins);
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return labels.hoursAgo(hrs);
  return labels.daysAgo(Math.floor(hrs / 24));
};

export const ensureGovernanceSeed = async (
  seederUid: string,
  seeds: SeedProposalInput[],
): Promise<void> => {
  if (!isFirebaseConfigured || !db) return;
  const metaRef = doc(db, META, "proposals");
  const metaSnap = await getDoc(metaRef);
  if (metaSnap.exists() && metaSnap.data()?.seeded === true) return;

  const existing = await getDocs(query(collection(db, PROPOSALS), limit(1)));
  if (!existing.empty) {
    await setDoc(metaRef, { seeded: true, seededAt: serverTimestamp() }, { merge: true });
    return;
  }

  const batch = writeBatch(db);
  seeds.forEach((seed) => {
    const ref = doc(collection(db, PROPOSALS));
    batch.set(ref, {
      title: seed.title,
      description: seed.description,
      category: seed.category,
      status: seed.status ?? "active",
      createdBy: seederUid,
      authorName: seed.authorName,
      yesVotes: seed.yesVotes,
      noVotes: seed.noVotes,
      quorum: seed.quorum,
      isSeed: true,
      createdAt: serverTimestamp(),
    } satisfies GovernanceProposalDoc);
  });
  batch.set(metaRef, { seeded: true, seededAt: serverTimestamp(), seededBy: seederUid });
  await batch.commit();
};

export const subscribeGovernanceProposals = (
  onData: (proposals: ({ id: string } & GovernanceProposalDoc)[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe => {
  if (!isFirebaseConfigured || !db) {
    onData([]);
    return () => {};
  }
  const q = query(collection(db, PROPOSALS), orderBy("createdAt", "desc"), limit(30));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as GovernanceProposalDoc) }))),
    (err) => onError?.(err),
  );
};

export const fetchUserVotes = async (
  proposalIds: string[],
  uid: string,
): Promise<Record<string, VoteChoice>> => {
  if (!isFirebaseConfigured || !db || !uid || proposalIds.length === 0) return {};
  const out: Record<string, VoteChoice> = {};
  await Promise.all(
    proposalIds.map(async (pid) => {
      const snap = await getDoc(doc(db!, PROPOSALS, pid, "votes", uid));
      if (snap.exists()) out[pid] = (snap.data() as GovernanceVoteDoc).vote;
    }),
  );
  return out;
};

export const castGovernanceVote = async (
  proposalId: string,
  uid: string,
  vote: VoteChoice,
  weight = 100,
): Promise<void> => {
  if (!isFirebaseConfigured || !db) throw new Error("Firebase not configured");
  const voteRef = doc(db, PROPOSALS, proposalId, "votes", uid);
  const existing = await getDoc(voteRef);
  if (existing.exists()) throw new Error("Already voted");

  const proposalRef = doc(db, PROPOSALS, proposalId);
  await setDoc(voteRef, {
    uid,
    vote,
    weight,
    createdAt: serverTimestamp(),
  } satisfies GovernanceVoteDoc);
  await updateDoc(proposalRef, {
    [vote === "yes" ? "yesVotes" : "noVotes"]: increment(weight),
  });
};

export const createGovernanceProposal = async (
  uid: string,
  authorName: string,
  input: { title: string; description: string; category: ProposalCategory },
): Promise<string> => {
  if (!isFirebaseConfigured || !db) throw new Error("Firebase not configured");
  const ref = await addDoc(collection(db, PROPOSALS), {
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category,
    status: "active",
    createdBy: uid,
    authorName,
    yesVotes: 0,
    noVotes: 0,
    quorum: 1000,
    createdAt: serverTimestamp(),
  } satisfies GovernanceProposalDoc);
  return ref.id;
};
