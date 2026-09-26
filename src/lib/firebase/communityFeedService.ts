import {
  addDoc, collection, doc, getDoc, getDocs, increment, limit, onSnapshot,
  query, serverTimestamp, setDoc, deleteDoc, updateDoc, where, writeBatch,
  type Timestamp, type Unsubscribe,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./config";

export type FeedCommentDoc = {
  uid: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  createdAt?: Timestamp;
};

export type FeedPostDoc = {
  uid: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  tag?: string | null;
  likeCount: number;
  commentCount: number;
  createdAt?: Timestamp;
  isSeed?: boolean;
};

export type SeedPostInput = {
  author: string;
  avatar: string;
  content: string;
  tag?: string;
  likes: number;
  comments: { author: string; avatar: string; text: string }[];
};

const POSTS = "community_posts";
const META = "community_meta";
const COMMUNITY_ACTIVE_KEY = "garuda_prime_community_active";

export const markCommunityActive = () => {
  try {
    localStorage.setItem(COMMUNITY_ACTIVE_KEY, "1");
  } catch {
    /* private mode */
  }
};

const readLocalCommunityActive = () => {
  try {
    return localStorage.getItem(COMMUNITY_ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
};

/** User posted, commented, or liked in Social Chat */
export const userHasCommunityActivity = async (uid: string): Promise<boolean> => {
  if (readLocalCommunityActive()) return true;
  if (!isFirebaseConfigured || !db || !uid) return false;
  const snap = await getDocs(query(collection(db, POSTS), where("uid", "==", uid), limit(1)));
  return !snap.empty;
};

export const formatFeedTime = (
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

export const ensureCommunitySeed = async (
  seederUid: string,
  seeds: SeedPostInput[],
): Promise<void> => {
  if (!isFirebaseConfigured || !db) return;
  const metaRef = doc(db, META, "feed");
  const metaSnap = await getDoc(metaRef);
  if (metaSnap.exists() && metaSnap.data()?.seeded === true) return;

  const existing = await getDocs(query(collection(db, POSTS), limit(1)));
  if (!existing.empty) {
    await setDoc(metaRef, { seeded: true, seededAt: serverTimestamp() }, { merge: true });
    return;
  }

  const batch = writeBatch(db);
  seeds.forEach((seed) => {
    const postRef = doc(collection(db, POSTS));
    batch.set(postRef, {
      uid: seederUid,
      authorName: seed.author,
      authorAvatar: seed.avatar,
      content: seed.content,
      tag: seed.tag ?? null,
      likeCount: seed.likes,
      commentCount: seed.comments.length,
      isSeed: true,
      createdAt: serverTimestamp(),
    } satisfies FeedPostDoc);
    seed.comments.forEach((c) => {
      const commentRef = doc(collection(db, POSTS, postRef.id, "comments"));
      batch.set(commentRef, {
        uid: seederUid,
        authorName: c.author,
        authorAvatar: c.avatar,
        text: c.text,
        createdAt: serverTimestamp(),
      } satisfies FeedCommentDoc);
    });
  });
  batch.set(metaRef, { seeded: true, seededAt: serverTimestamp(), seededBy: seederUid });
  await batch.commit();
};

const sortPostsByCreatedAt = (
  rows: ({ id: string } & FeedPostDoc)[],
): ({ id: string } & FeedPostDoc)[] =>
  [...rows].sort(
    (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
  );

export const subscribeCommunityPosts = (
  onData: (posts: ({ id: string } & FeedPostDoc)[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe => {
  if (!isFirebaseConfigured || !db) {
    onData([]);
    return () => {};
  }

  const deliver = (snap: { docs: { id: string; data: () => FeedPostDoc }[] }) => {
    onData(sortPostsByCreatedAt(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as FeedPostDoc) })),
    ));
  };

  const q = query(collection(db, POSTS), limit(50));
  return onSnapshot(
    q,
    deliver,
    (err) => {
      const normalized = err instanceof Error ? err : new Error(String(err));
      const msg = normalized.message.toLowerCase();
      const isIndex = msg.includes("index") || msg.includes("failed-precondition");
      if (isIndex) {
        void fetchCommunityPosts()
          .then(onData)
          .catch(() => onError?.(normalized));
        return;
      }
      onError?.(normalized);
    },
  );
};

/** Fallback query without orderBy (no composite index needed). */
export const fetchCommunityPosts = async (): Promise<({ id: string } & FeedPostDoc)[]> => {
  if (!isFirebaseConfigured || !db) return [];
  const snap = await getDocs(query(collection(db, POSTS), limit(50)));
  return sortPostsByCreatedAt(
    snap.docs.map((d) => ({ id: d.id, ...(d.data() as FeedPostDoc) })),
  );
};

export const fetchUserLikes = async (
  postIds: string[],
  uid: string,
): Promise<Set<string>> => {
  if (!isFirebaseConfigured || !db || !uid || postIds.length === 0) return new Set();
  const liked = new Set<string>();
  await Promise.all(
    postIds.map(async (postId) => {
      const snap = await getDoc(doc(db, POSTS, postId, "likes", uid));
      if (snap.exists()) liked.add(postId);
    }),
  );
  return liked;
};

export const createCommunityPost = async (
  uid: string,
  authorName: string,
  authorAvatar: string,
  content: string,
): Promise<string> => {
  if (!isFirebaseConfigured || !db) throw new Error("Firebase not configured");
  const ref = await addDoc(collection(db, POSTS), {
    uid,
    authorName,
    authorAvatar,
    content,
    tag: null,
    likeCount: 0,
    commentCount: 0,
    isSeed: false,
    createdAt: serverTimestamp(),
  } satisfies FeedPostDoc);
  markCommunityActive();
  return ref.id;
};

export const toggleCommunityLike = async (
  postId: string,
  uid: string,
  currentlyLiked: boolean,
): Promise<boolean> => {
  if (!isFirebaseConfigured || !db) throw new Error("Firebase not configured");
  const likeRef = doc(db, POSTS, postId, "likes", uid);
  const postRef = doc(db, POSTS, postId);
  if (currentlyLiked) {
    await deleteDoc(likeRef);
    await updateDoc(postRef, { likeCount: increment(-1) });
    return false;
  }
  await setDoc(likeRef, { uid, createdAt: serverTimestamp() });
  await updateDoc(postRef, { likeCount: increment(1) });
  markCommunityActive();
  return true;
};

export const addCommunityComment = async (
  postId: string,
  uid: string,
  authorName: string,
  authorAvatar: string,
  text: string,
): Promise<void> => {
  if (!isFirebaseConfigured || !db) throw new Error("Firebase not configured");
  const batch = writeBatch(db);
  const commentRef = doc(collection(db, POSTS, postId, "comments"));
  batch.set(commentRef, {
    uid,
    authorName,
    authorAvatar,
    text,
    createdAt: serverTimestamp(),
  } satisfies FeedCommentDoc);
  batch.update(doc(db, POSTS, postId), { commentCount: increment(1) });
  await batch.commit();
  markCommunityActive();
};

export const subscribePostComments = (
  postId: string,
  onData: (comments: ({ id: string } & FeedCommentDoc)[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe => {
  if (!isFirebaseConfigured || !db) {
    onData([]);
    return () => {};
  }
  const q = query(collection(db, POSTS, postId, "comments"), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as FeedCommentDoc) }));
      rows.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
      onData(rows);
    },
    (err) => onError?.(err instanceof Error ? err : new Error(String(err))),
  );
};

export const deleteCommunityPost = async (postId: string, uid: string): Promise<void> => {
  if (!isFirebaseConfigured || !db) throw new Error("Firebase not configured");
  const postRef = doc(db, POSTS, postId);
  const postSnap = await getDoc(postRef);
  if (!postSnap.exists()) throw new Error("Post not found");
  const data = postSnap.data() as FeedPostDoc;
  if (data.uid !== uid) throw new Error("Not authorized");
  if (data.isSeed === true) throw new Error("Cannot delete seed post");

  const batch = writeBatch(db);
  const [likesSnap, commentsSnap] = await Promise.all([
    getDocs(collection(db, POSTS, postId, "likes")),
    getDocs(collection(db, POSTS, postId, "comments")),
  ]);
  likesSnap.docs.forEach((d) => batch.delete(d.ref));
  commentsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(postRef);
  await batch.commit();
};

export const deleteCommunityComment = async (
  postId: string,
  commentId: string,
  uid: string,
): Promise<void> => {
  if (!isFirebaseConfigured || !db) throw new Error("Firebase not configured");
  const commentRef = doc(db, POSTS, postId, "comments", commentId);
  const snap = await getDoc(commentRef);
  if (!snap.exists()) throw new Error("Comment not found");
  if ((snap.data() as FeedCommentDoc).uid !== uid) throw new Error("Not authorized");
  const batch = writeBatch(db);
  batch.delete(commentRef);
  batch.update(doc(db, POSTS, postId), { commentCount: increment(-1) });
  await batch.commit();
};
