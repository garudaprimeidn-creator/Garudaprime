import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Heart, MessageCircle, Send, ChevronDown, ChevronUp, MessagesSquare, Loader2, Cloud, Trash2,
} from "lucide-react";
import { GP_SEP_INLINE } from "./garudaUi";
import { useApp } from "./AppContext";
import { useLanguage } from "./LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { isDemoAuthAllowed } from "../lib/env/production";
import { useFirebaseAuthUid } from "../lib/firebase/useFirebaseAuthUid";
import {
  addCommunityComment,
  createCommunityPost,
  deleteCommunityComment,
  deleteCommunityPost,
  ensureCommunitySeed,
  fetchCommunityPosts,
  fetchUserLikes,
  formatFeedTime,
  subscribeCommunityPosts,
  subscribePostComments,
  toggleCommunityLike,
  type FeedCommentDoc,
  type FeedPostDoc,
} from "../lib/firebase/communityFeedService";

export type SocialComment = {
  id: string;
  author: string;
  avatar: string;
  text: string;
  time: string;
  ownerUid?: string;
  isOwnLocal?: boolean;
};

export type SocialPost = {
  id: string;
  author: string;
  avatar: string;
  avatarColor: string;
  time: string;
  content: string;
  tag?: string;
  likes: number;
  liked: boolean;
  comments: SocialComment[];
  commentCount: number;
  ownerUid?: string;
  isSeed?: boolean;
  isOwnLocal?: boolean;
};

const AVATAR_COLORS = [
  "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30",
];

const avatarColor = (name: string) => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

const Avatar = ({ name, colorClass }: { name: string; colorClass?: string }) => (
  <div className={`w-9 h-9 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${colorClass ?? avatarColor(name)}`}>
    {(name.length >= 2 ? name.slice(0, 2) : name).toUpperCase()}
  </div>
);

const DeleteIconBtn = ({
  onClick, pending, label,
}: {
  onClick: () => void;
  pending?: boolean;
  label: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={pending}
    title={label}
    aria-label={label}
    className="shrink-0 p-1.5 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
  >
    {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
  </button>
);

const PostComments = ({
  postId,
  timeLabels,
  noComments,
  commentPlaceholder,
  authorName,
  uid,
  onCommentCountChange,
}: {
  postId: string;
  timeLabels: Parameters<typeof formatFeedTime>[1];
  noComments: string;
  commentPlaceholder: string;
  authorName: string;
  uid: string | null;
  onCommentCountChange: (count: number) => void;
}) => {
  const { showToast } = useApp();
  const sf = useLanguage().t.community.socialFeed;
  const [comments, setComments] = useState<({ id: string } & FeedCommentDoc)[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deletePending, setDeletePending] = useState<Record<string, boolean>>({});
  const useRemote = isFirebaseConfigured && Boolean(uid);

  useEffect(() => {
    if (!useRemote) return;
    return subscribePostComments(postId, setComments);
  }, [postId, useRemote]);

  useEffect(() => {
    onCommentCountChange(comments.length);
  }, [comments.length, onCommentCountChange]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || !uid) return;
    const author = authorName.split(" ")[0] || authorName;
    const avatar = author.slice(0, 2).toUpperCase();
    const optimisticId = `pending-${Date.now()}`;
    const optimistic = {
      id: optimisticId,
      uid,
      authorName: author,
      authorAvatar: avatar,
      text,
    } satisfies { id: string } & FeedCommentDoc;

    setSending(true);
    setComments((prev) => [...prev, optimistic]);
    setDraft("");
    try {
      await addCommunityComment(postId, uid, author, avatar, text);
      showToast(sf.commentAdded, "success");
    } catch {
      setComments((prev) => prev.filter((c) => c.id !== optimisticId));
      showToast(sf.feedError, "error");
    } finally {
      setSending(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!uid || deletePending[commentId] || commentId.startsWith("pending-")) return;
    const removed = comments.find((c) => c.id === commentId);
    setDeletePending((p) => ({ ...p, [commentId]: true }));
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    try {
      await deleteCommunityComment(postId, commentId, uid);
      showToast(sf.commentDeleted, "success");
    } catch {
      if (removed) setComments((prev) => [...prev, removed]);
      showToast(sf.feedError, "error");
    } finally {
      setDeletePending((p) => ({ ...p, [commentId]: false }));
    }
  };

  if (!useRemote) return null;

  return (
    <div className="mt-3 pt-3 border-t gp-divider space-y-2.5">
      {comments.length === 0 && <p className="gp-muted text-[11px]">{noComments}</p>}
      {comments.map((c) => (
        <div key={c.id} className="flex gap-2">
          <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-[9px] font-bold shrink-0 ${avatarColor(c.authorName)}`}>
            {c.authorAvatar}
          </div>
          <div className="flex-1 min-w-0 rounded-xl gp-subtle px-2.5 py-2">
            <div className="flex items-start justify-between gap-1">
              <p className="gp-text text-[11px] font-semibold min-w-0">
                {c.authorName}{" "}
                <span className="gp-muted font-normal">{GP_SEP_INLINE}{formatFeedTime(c.createdAt, timeLabels)}</span>
              </p>
              {c.uid === uid && (
                <DeleteIconBtn
                  label={sf.deleteComment}
                  pending={deletePending[c.id]}
                  onClick={() => deleteComment(c.id)}
                />
              )}
            </div>
            <p className="gp-muted text-xs mt-0.5 leading-relaxed">{c.text}</p>
          </div>
        </div>
      ))}
      {uid && (
        <div className="flex gap-2 pt-1">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !sending && submit()}
            placeholder={commentPlaceholder}
            className="flex-1 px-3 py-2 rounded-xl gp-input border text-xs focus:outline-none focus:border-cyan-500/40"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || sending}
            className="px-3 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 disabled:opacity-40"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
};

export const CommunitySocialFeed = () => {
  const { showToast, profileName } = useApp();
  const { user } = useAuth();
  const { uid: firebaseUid, ready: authReady } = useFirebaseAuthUid();
  const { t } = useLanguage();
  const cm = t.community;
  const sf = cm.socialFeed;

  const timeLabels = useMemo(() => ({
    justNow: sf.justNow,
    minutesAgo: sf.minutesAgo,
    hoursAgo: sf.hoursAgo,
    daysAgo: sf.daysAgo,
  }), [sf]);

  const seedInput = useMemo(
    () => sf.seedPosts.map((p) => ({
      author: p.author,
      avatar: p.avatar,
      content: p.content,
      tag: p.tag,
      likes: p.likes,
      comments: p.comments.map((c) => ({ author: c.author, avatar: c.avatar, text: c.text })),
    })),
    [sf.seedPosts],
  );

  const localSeedPosts = useMemo<SocialPost[]>(() =>
    sf.seedPosts.map((p, i) => ({
      id: `seed-${i}`,
      author: p.author,
      avatar: p.avatar,
      avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
      time: p.time,
      content: p.content,
      tag: p.tag,
      likes: p.likes,
      liked: false,
      commentCount: p.comments.length,
      comments: p.comments.map((c, ci) => ({
        id: `seed-${i}-c${ci}`,
        author: c.author,
        avatar: c.avatar,
        text: c.text,
        time: c.time,
      })),
    })),
  [sf.seedPosts]);

  const useRemote = isFirebaseConfigured && authReady && Boolean(firebaseUid);
  const uid = firebaseUid;
  const needsFirebaseAuth = authReady && Boolean(user?.uid) && !firebaseUid;

  const [remotePosts, setRemotePosts] = useState<({ id: string } & FeedPostDoc)[]>([]);
  const [remoteFailed, setRemoteFailed] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [localPosts, setLocalPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(isFirebaseConfigured && !authReady);
  const [draft, setDraft] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [likePending, setLikePending] = useState<Record<string, boolean>>({});
  const [deletePending, setDeletePending] = useState<Record<string, boolean>>({});
  const [liveCommentCounts, setLiveCommentCounts] = useState<Record<string, number>>({});
  const [ownPostIds, setOwnPostIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!uid || !useRemote) return;
    const key = `gp_own_posts_${uid}`;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) setOwnPostIds(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, [uid, useRemote]);

  useEffect(() => {
    if (!uid || !useRemote || ownPostIds.size === 0) return;
    try {
      sessionStorage.setItem(`gp_own_posts_${uid}`, JSON.stringify([...ownPostIds]));
    } catch { /* ignore */ }
  }, [ownPostIds, uid, useRemote]);

  useEffect(() => {
    if (!useRemote || !uid || remotePosts.length === 0) return;
    setOwnPostIds((prev) => {
      const next = new Set(prev);
      remotePosts.forEach((p) => {
        if (p.uid === uid && p.isSeed !== true) next.add(p.id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [remotePosts, uid, useRemote]);

  useEffect(() => {
    if (isDemoAuthAllowed()) setLocalPosts(localSeedPosts);
  }, [localSeedPosts]);

  useEffect(() => {
    if (!authReady) return;
    if (!useRemote || !uid) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setRemoteFailed(false);
    setLoading(true);

    (async () => {
      if (isDemoAuthAllowed()) {
        try {
          await ensureCommunitySeed(uid, seedInput);
        } catch {
          /* seed optional in dev demo only */
        }
      }
    })();

    const applyRows = (rows: ({ id: string } & FeedPostDoc)[]) => {
      if (cancelled) return;
      setRemotePosts(rows);
      setLoading(false);
      setRemoteFailed(false);
      fetchUserLikes(rows.map((r) => r.id), uid).then((set) => {
        if (!cancelled) setLikedIds(set);
      }).catch(() => {});
    };

    const unsub = subscribeCommunityPosts(
      applyRows,
      async (err) => {
        if (cancelled) return;
        try {
          const rows = await fetchCommunityPosts();
          if (!cancelled && rows.length >= 0) {
            applyRows(rows);
            return;
          }
        } catch { /* fall through */ }
        if (!cancelled) {
          setRemoteFailed(true);
          setLoading(false);
          const msg = err.message.toLowerCase();
          const isPermission = msg.includes("permission") || msg.includes("insufficient");
          if (!isPermission) showToast(sf.feedError, "error");
        }
      },
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [authReady, useRemote, uid, seedInput, showToast, sf.feedError]);

  useEffect(() => {
    const onAppRefresh = () => {
      if (!useRemote || !uid) return;
      void fetchCommunityPosts()
        .then((rows) => {
          setRemotePosts(rows);
          return fetchUserLikes(rows.map((r) => r.id), uid);
        })
        .then((set) => setLikedIds(set))
        .catch(() => {});
    };
    window.addEventListener("gp-app-refresh", onAppRefresh);
    return () => window.removeEventListener("gp-app-refresh", onAppRefresh);
  }, [useRemote, uid]);

  const posts: SocialPost[] = useRemote && !remoteFailed
    ? remotePosts.map((p) => ({
        id: p.id,
        author: p.authorName,
        avatar: p.authorAvatar,
        avatarColor: avatarColor(p.authorName),
        time: formatFeedTime(p.createdAt, timeLabels),
        content: p.content,
        tag: p.tag ?? undefined,
        likes: p.likeCount ?? 0,
        liked: likedIds.has(p.id),
        commentCount: p.commentCount ?? 0,
        comments: [],
        ownerUid: p.uid,
        isSeed: p.isSeed,
      }))
    : localPosts;

  const toggleLike = async (postId: string) => {
    if (useRemote && uid) {
      if (likePending[postId]) return;
      const currentlyLiked = likedIds.has(postId);
      setLikePending((p) => ({ ...p, [postId]: true }));
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (currentlyLiked) next.delete(postId);
        else next.add(postId);
        return next;
      });
      setRemotePosts((prev) => prev.map((p) =>
        p.id === postId ? { ...p, likeCount: (p.likeCount ?? 0) + (currentlyLiked ? -1 : 1) } : p,
      ));
      try {
        const liked = await toggleCommunityLike(postId, uid, currentlyLiked);
        setLikedIds((prev) => {
          const next = new Set(prev);
          if (liked) next.add(postId);
          else next.delete(postId);
          return next;
        });
      } catch {
        setLikedIds((prev) => {
          const next = new Set(prev);
          if (currentlyLiked) next.add(postId);
          else next.delete(postId);
          return next;
        });
        setRemotePosts((prev) => prev.map((p) =>
          p.id === postId ? { ...p, likeCount: (p.likeCount ?? 0) + (currentlyLiked ? 1 : -1) } : p,
        ));
        showToast(sf.feedError, "error");
      } finally {
        setLikePending((p) => ({ ...p, [postId]: false }));
      }
      return;
    }

    setLocalPosts((prev) => prev.map((p) => {
      if (p.id !== postId) return p;
      const liked = !p.liked;
      return { ...p, liked, likes: p.likes + (liked ? 1 : -1) };
    }));
  };

  const toggleComments = (postId: string) => {
    setExpanded((prev) => ({ ...prev, [postId]: !prev[postId] }));
  };

  const publishPost = async () => {
    const text = draft.trim();
    if (!text) {
      showToast(sf.emptyPost, "error");
      return;
    }
    if (useRemote && !uid) {
      showToast(sf.signInRequired, "warning");
      return;
    }

    const author = profileName.split(" ")[0] || profileName;
    const avatar = author.slice(0, 2).toUpperCase();

    if (useRemote && uid) {
      setPublishing(true);
      try {
        const newId = await createCommunityPost(uid, author, avatar, text);
        setOwnPostIds((prev) => new Set(prev).add(newId));
        setDraft("");
        showToast(sf.postPublished, "success");
      } catch {
        showToast(sf.feedError, "error");
      } finally {
        setPublishing(false);
      }
      return;
    }

    const newPost: SocialPost = {
      id: `user-${Date.now()}`,
      author,
      avatar,
      avatarColor: avatarColor(author),
      time: sf.justNow,
      content: text,
      likes: 0,
      liked: false,
      commentCount: 0,
      comments: [],
      isOwnLocal: true,
    };
    setLocalPosts((prev) => [newPost, ...prev]);
    setDraft("");
    showToast(sf.postPublished, "success");
  };

  const addLocalComment = (postId: string) => {
    const text = (commentDrafts[postId] ?? "").trim();
    if (!text) return;
    const author = profileName.split(" ")[0] || profileName;
    const comment: SocialComment = {
      id: `c-${Date.now()}`,
      author,
      avatar: author.slice(0, 2).toUpperCase(),
      text,
      time: sf.justNow,
      isOwnLocal: true,
    };
    setLocalPosts((prev) => prev.map((p) =>
      p.id === postId
        ? { ...p, comments: [...p.comments, comment], commentCount: p.commentCount + 1 }
        : p,
    ));
    setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
    setExpanded((prev) => ({ ...prev, [postId]: true }));
    showToast(sf.commentAdded, "success");
  };

  const setCommentCount = useCallback((postId: string, count: number) => {
    setLiveCommentCounts((prev) => (prev[postId] === count ? prev : { ...prev, [postId]: count }));
  }, []);

  useEffect(() => {
    if (!useRemote) return;
    setLiveCommentCounts((prev) => {
      let changed = false;
      const next = { ...prev };
      remotePosts.forEach((p) => {
        const serverCount = p.commentCount ?? 0;
        if (expanded[p.id]) return;
        if (next[p.id] !== serverCount) {
          next[p.id] = serverCount;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [remotePosts, useRemote, expanded]);

  const profileFirstName = profileName.split(" ")[0] || profileName;

  const canDeleteComment = (comment: SocialComment) => {
    if (comment.id.startsWith("seed-")) return false;
    if (comment.isOwnLocal) return true;
    if (useRemote) return Boolean(uid && comment.ownerUid === uid);
    return comment.author === profileFirstName;
  };

  const deleteLocalComment = (postId: string, commentId: string) => {
    setLocalPosts((prev) => prev.map((p) =>
      p.id === postId
        ? {
            ...p,
            comments: p.comments.filter((c) => c.id !== commentId),
            commentCount: Math.max(0, p.commentCount - 1),
          }
        : p,
    ));
    showToast(sf.commentDeleted, "success");
  };

  const canDeletePost = (post: SocialPost) => {
    if (post.isSeed === true) return false;
    if (ownPostIds.has(post.id)) return true;
    if (useRemote) return Boolean(uid && post.ownerUid === uid);
    return post.isOwnLocal === true || post.id.startsWith("user-");
  };

  const deletePost = async (postId: string) => {
    if (useRemote && uid) {
      if (deletePending[postId]) return;
      setDeletePending((p) => ({ ...p, [postId]: true }));
      try {
        await deleteCommunityPost(postId, uid);
        setOwnPostIds((prev) => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
        setExpanded((prev) => {
          const next = { ...prev };
          delete next[postId];
          return next;
        });
        showToast(sf.postDeleted, "success");
      } catch {
        showToast(sf.feedError, "error");
      } finally {
        setDeletePending((p) => ({ ...p, [postId]: false }));
      }
      return;
    }
    setLocalPosts((prev) => prev.filter((p) => p.id !== postId));
    setOwnPostIds((prev) => {
      const next = new Set(prev);
      next.delete(postId);
      return next;
    });
    setExpanded((prev) => {
      const next = { ...prev };
      delete next[postId];
      return next;
    });
    showToast(sf.postDeleted, "success");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] p-3 flex gap-2">
        <MessagesSquare className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400" />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="gp-text text-xs font-semibold">{sf.title}</p>
            {useRemote && !remoteFailed && (
              <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold">
                <Cloud className="w-3 h-3" /> {sf.syncLive}
              </span>
            )}
            {remoteFailed && (
              <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-semibold">
                {sf.syncOffline}
              </span>
            )}
          </div>
          <p className="gp-muted text-[11px] mt-1 leading-relaxed">{sf.info}</p>
          {needsFirebaseAuth && (
            <p className="text-amber-400 text-[10px] mt-1.5">{sf.needsFirebaseSignIn}</p>
          )}
          {useRemote && !uid && !needsFirebaseAuth && (
            <p className="text-amber-400 text-[10px] mt-1.5">{sf.signInRequired}</p>
          )}
        </div>
      </div>

      <div className="gp-glass border rounded-2xl p-3 border-cyan-500/15">
        <div className="flex gap-2.5">
          <Avatar name={profileName} colorClass="bg-emerald-500/20 text-emerald-400 border-emerald-500/30" />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={sf.composePlaceholder}
            rows={3}
            disabled={useRemote && !uid}
            className="flex-1 px-3 py-2 rounded-xl gp-input border text-sm resize-none focus:outline-none focus:border-cyan-500/40 min-h-[72px] disabled:opacity-50"
          />
        </div>
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={publishPost}
            disabled={!draft.trim() || publishing || (useRemote && !uid)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-400 text-black text-xs font-bold disabled:opacity-40"
          >
            {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {sf.publish}
          </button>
        </div>
      </div>

      <p className="gp-muted text-[10px] uppercase tracking-widest px-1">
        {sf.feedLabel}{GP_SEP_INLINE}{loading ? "…" : posts.length}
      </p>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 gp-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
          {sf.loadingFeed}
        </div>
      )}

      {!loading && (
        <div className="space-y-3">
          {posts.map((post) => {
            const open = expanded[post.id] ?? false;
            const commentTotal = useRemote && !remoteFailed
              ? (liveCommentCounts[post.id] ?? post.commentCount ?? 0)
              : post.comments.length;
            return (
              <article key={post.id} className="gp-glass border rounded-2xl p-3.5 border-cyan-500/10">
                <div className="flex gap-2.5">
                  <Avatar name={post.author} colorClass={post.avatarColor} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <p className="gp-text text-sm font-semibold">{post.author}</p>
                        {post.tag && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 font-semibold">{post.tag}</span>
                        )}
                        <span className="gp-muted text-[10px]">{GP_SEP_INLINE}{post.time}</span>
                      </div>
                    </div>
                    <p className="gp-text text-sm mt-1.5 leading-relaxed whitespace-pre-wrap">{post.content}</p>

                    <div className="flex items-center gap-4 mt-3">
                      <button
                        type="button"
                        onClick={() => toggleLike(post.id)}
                        disabled={useRemote && !uid}
                        className={`flex items-center gap-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
                          post.liked ? "text-red-400" : "gp-muted hover:text-red-400"
                        }`}
                      >
                        <Heart className={`w-4 h-4 ${post.liked ? "fill-red-400" : ""}`} />
                        {post.likes}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleComments(post.id)}
                        className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                          open ? "text-cyan-400" : "gp-muted hover:text-cyan-400"
                        }`}
                      >
                        <MessageCircle className="w-4 h-4" />
                        {commentTotal}
                        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {canDeletePost(post) && (
                        <div className="ml-auto">
                          <DeleteIconBtn
                            label={sf.deletePost}
                            pending={deletePending[post.id]}
                            onClick={() => deletePost(post.id)}
                          />
                        </div>
                      )}
                    </div>

                    {open && useRemote && !remoteFailed && (
                      <PostComments
                        postId={post.id}
                        timeLabels={timeLabels}
                        noComments={sf.noComments}
                        commentPlaceholder={sf.commentPlaceholder}
                        authorName={profileName}
                        uid={uid}
                        onCommentCountChange={(count) => setCommentCount(post.id, count)}
                      />
                    )}

                    {open && (!useRemote || remoteFailed) && (
                      <div className="mt-3 pt-3 border-t gp-divider space-y-2.5">
                        {post.comments.length === 0 && (
                          <p className="gp-muted text-[11px]">{sf.noComments}</p>
                        )}
                        {post.comments.map((c) => (
                          <div key={c.id} className="flex gap-2">
                            <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-[9px] font-bold shrink-0 ${avatarColor(c.author)}`}>
                              {c.avatar}
                            </div>
                            <div className="flex-1 min-w-0 rounded-xl gp-subtle px-2.5 py-2">
                              <div className="flex items-start justify-between gap-1">
                                <p className="gp-text text-[11px] font-semibold min-w-0">
                                  {c.author} <span className="gp-muted font-normal">{GP_SEP_INLINE}{c.time}</span>
                                </p>
                                {canDeleteComment(c) && (
                                  <DeleteIconBtn
                                    label={sf.deleteComment}
                                    onClick={() => deleteLocalComment(post.id, c.id)}
                                  />
                                )}
                              </div>
                              <p className="gp-muted text-xs mt-0.5 leading-relaxed">{c.text}</p>
                            </div>
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <input
                            type="text"
                            value={commentDrafts[post.id] ?? ""}
                            onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === "Enter" && addLocalComment(post.id)}
                            placeholder={sf.commentPlaceholder}
                            className="flex-1 px-3 py-2 rounded-xl gp-input border text-xs focus:outline-none focus:border-cyan-500/40"
                          />
                          <button
                            type="button"
                            onClick={() => addLocalComment(post.id)}
                            disabled={!(commentDrafts[post.id] ?? "").trim()}
                            className="px-3 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 disabled:opacity-40"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
