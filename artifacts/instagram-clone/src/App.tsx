import { useEffect, useMemo, useState } from "react";
import "./instagram.css";

type Post = {
  id: number;
  username: string;
  displayName: string;
  avatar: string;
  image: string;
  caption: string;
  likes: number;
  liked: boolean;
};

type Comment = {
  id: number;
  username: string;
  displayName: string;
  text: string;
};

type Account = {
  username: string;
  password: string;
  displayName: string;
  avatar: string;
  bio?: string;
};

type Tab = "home" | "search" | "profile";

type InstagramStatus = {
  connected: boolean;
  configured: boolean;
  igUsername?: string;
  igDisplayName?: string | null;
};

type InstagramMedia = {
  id: string;
  image: string;
  caption: string;
  permalink: string;
  timestamp: string;
  igUsername: string;
  igDisplayName: string;
};

const STORAGE_PREFIX = "desigram:v2:";
const POSTS_KEY = `${STORAGE_PREFIX}posts`;
const COMMENTS_KEY = `${STORAGE_PREFIX}comments`;
const ACCOUNTS_KEY = `${STORAGE_PREFIX}accounts`;
const SESSION_KEY = `${STORAGE_PREFIX}session`;

const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

const PALETTE = [
  "#f59e0b", "#ef4444", "#ec4899", "#a855f7",
  "#6366f1", "#0ea5e9", "#14b8a6", "#22c55e",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function placeholderAvatar(seed: string, name: string): string {
  const color = PALETTE[hashStr(seed) % PALETTE.length];
  const initials = initialsOf(name || seed);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="${color}"/><text x="50%" y="50%" dy=".1em" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" font-weight="600" font-size="34">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-ignore iOS Safari
    window.navigator.standalone === true
  );
}

function Avatar({
  src,
  name,
  username,
  size = 32,
  className = "",
}: {
  src?: string;
  name: string;
  username: string;
  size?: number;
  className?: string;
}) {
  const url = src && src.length > 0 ? src : placeholderAvatar(username, name);
  return (
    <img
      className={`avatar ${className}`}
      src={url}
      alt={name}
      style={{ width: size, height: size }}
    />
  );
}

function PostCard({
  post,
  comments,
  currentUsername,
  onToggleLike,
  onDelete,
  onAddComment,
  onDeleteComment,
}: {
  post: Post;
  comments: Comment[];
  currentUsername: string;
  onToggleLike: (id: number) => void;
  onDelete: (id: number) => void;
  onAddComment: (postId: number, text: string) => void;
  onDeleteComment: (postId: number, commentId: number) => void;
}) {
  const [bursting, setBursting] = useState(false);
  const [commentText, setCommentText] = useState("");
  const isMine = post.username === currentUsername;

  const submitComment = (e: React.FormEvent) => {
    e.preventDefault();
    const text = commentText.trim();
    if (!text) return;
    onAddComment(post.id, text);
    setCommentText("");
  };

  const toggleLike = () => {
    if (!post.liked) {
      setBursting(true);
      setTimeout(() => setBursting(false), 350);
    }
    onToggleLike(post.id);
  };

  return (
    <article className="post">
      <header className="post-header">
        <Avatar src={post.avatar} name={post.displayName} username={post.username} size={32} />
        <div className="post-author">
          <span className="username">{post.displayName}</span>
          <span className="handle">@{post.username}</span>
        </div>
        {isMine && (
          <button
            className="more-btn delete-btn"
            aria-label="Delete post"
            onClick={() => { if (confirm("Delete this post?")) onDelete(post.id); }}
          >
            ×
          </button>
        )}
      </header>

      <div className="post-image-wrap" onDoubleClick={toggleLike}>
        <img className="post-image" src={post.image} alt={post.caption} />
      </div>

      <div className="post-actions">
        <button
          className={`like-btn ${post.liked ? "liked" : ""} ${bursting ? "burst" : ""}`}
          onClick={toggleLike}
          aria-pressed={post.liked}
          aria-label={post.liked ? "Unlike" : "Like"}
        >
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path
              d="M12 21s-7.5-4.6-10-9.2C.4 8.4 2.3 4 6.2 4c2.2 0 3.7 1.2 4.6 2.6h2.4C14.1 5.2 15.6 4 17.8 4c3.9 0 5.8 4.4 4.2 7.8C19.5 16.4 12 21 12 21z"
              fill={post.liked ? "#ed4956" : "none"}
              stroke={post.liked ? "#ed4956" : "currentColor"}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <label htmlFor={`comment-input-${post.id}`} className="icon-btn" aria-label="Comment">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-3.5-7.1L21 4l-1 3.5A9 9 0 0 1 21 12z" strokeLinejoin="round" />
          </svg>
        </label>
      </div>

      <div className="post-meta">
        <div className="likes">{post.likes.toLocaleString()} likes</div>
        {post.caption && (
          <div className="caption">
            <span className="username">{post.displayName}</span> {post.caption}
          </div>
        )}

        {comments.length > 0 && (
          <ul className="comments">
            {comments.map((c) => (
              <li key={c.id} className="comment">
                <span className="username">{c.displayName}</span>
                <span className="comment-text">{c.text}</span>
                {c.username === currentUsername && (
                  <button
                    className="comment-delete"
                    aria-label="Delete comment"
                    onClick={() => onDeleteComment(post.id, c.id)}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <form className="comment-form" onSubmit={submitComment}>
          <input
            id={`comment-input-${post.id}`}
            type="text"
            className="comment-input"
            placeholder="Add a comment…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
          />
          <button type="submit" className="comment-post" disabled={!commentText.trim()}>
            Post
          </button>
        </form>
      </div>
    </article>
  );
}

function AuthScreen({ onAuth }: { onAuth: (account: Account) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const u = username.trim().toLowerCase();
    const p = password;
    const d = displayName.trim();

    if (!u || !p) { setError("Username and password are required."); return; }
    if (!/^[a-z0-9._]{2,20}$/.test(u)) {
      setError("Username: 2–20 chars, letters, numbers, dot or underscore.");
      return;
    }

    const accounts = storage.get<Account[]>(ACCOUNTS_KEY, []);

    if (mode === "signup") {
      if (!d) { setError("Please enter your display name."); return; }
      if (accounts.some((a) => a.username === u)) {
        setError("That username is already taken.");
        return;
      }
      const account: Account = { username: u, password: p, displayName: d, avatar: "", bio: "" };
      storage.set(ACCOUNTS_KEY, [...accounts, account]);
      onAuth(account);
    } else {
      const found = accounts.find((a) => a.username === u);
      if (!found || found.password !== p) {
        setError("Incorrect username or password.");
        return;
      }
      onAuth(found);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="logo auth-logo">DesiGram</h1>
        <p className="auth-sub">
          {mode === "signup" ? "Create your account" : "Sign in to your account"}
        </p>

        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" && (
            <label className="field">
              <span>Display name</span>
              <input
                type="text"
                placeholder="e.g. Gajendra Singh"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            </label>
          )}

          <label className="field">
            <span>Username</span>
            <input
              type="text"
              placeholder="your_handle"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn-primary auth-submit">
            {mode === "signup" ? "Sign up" : "Log in"}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <button type="button" onClick={() => { setMode("login"); setError(""); }}>
                Log in
              </button>
            </>
          ) : (
            <>
              New here?{" "}
              <button type="button" onClick={() => { setMode("signup"); setError(""); }}>
                Create an account
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EditProfileModal({
  session,
  onClose,
  onSave,
  igStatus,
  onDisconnectInstagram,
}: {
  session: Account;
  onClose: () => void;
  onSave: (next: Account) => string | null;
  igStatus: InstagramStatus | null;
  onDisconnectInstagram: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(session.displayName);
  const [username, setUsername] = useState(session.username);
  const [bio, setBio] = useState(session.bio ?? "");
  const [avatar, setAvatar] = useState(session.avatar);
  const [error, setError] = useState("");

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = await readFileAsDataURL(file);
    setAvatar(data);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const d = displayName.trim();
    const u = username.trim().toLowerCase();
    if (!d) { setError("Display name is required."); return; }
    if (!/^[a-z0-9._]{2,20}$/.test(u)) {
      setError("Username: 2–20 chars, letters, numbers, dot or underscore.");
      return;
    }
    if (bio.length > 150) { setError("Bio must be 150 characters or fewer."); return; }
    const err = onSave({
      ...session,
      displayName: d,
      username: u,
      bio: bio.trim(),
      avatar,
    });
    if (err) setError(err);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit profile</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <form className="composer" onSubmit={submit}>
          <div className="edit-photo-row">
            <Avatar
              src={avatar}
              name={displayName || session.displayName}
              username={username || session.username}
              size={72}
              className="profile-avatar"
            />
            <div className="edit-photo-actions">
              <label className="btn-secondary">
                Change photo
                <input type="file" accept="image/*" onChange={onPickPhoto} hidden />
              </label>
              {avatar && (
                <button type="button" className="btn-text" onClick={() => setAvatar("")}>
                  Remove
                </button>
              )}
            </div>
          </div>

          <label className="field">
            <span>Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
            />
          </label>

          <label className="field">
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="field">
            <span>Bio <span className="field-hint">{bio.length}/150</span></span>
            <textarea
              rows={3}
              placeholder="Tell people a little about yourself…"
              value={bio}
              maxLength={150}
              onChange={(e) => setBio(e.target.value)}
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <div className="ig-row">
            <div className="ig-row-info">
              <div className="ig-row-title">Instagram</div>
              <div className="ig-row-sub">
                {igStatus?.connected
                  ? `Connected as @${igStatus.igUsername}`
                  : igStatus?.configured === false
                  ? "Not configured by the app owner yet."
                  : "Pull your Instagram photos into your DesiGram feed."}
              </div>
            </div>
            {igStatus?.connected ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={onDisconnectInstagram}
              >
                Disconnect
              </button>
            ) : (
              <a
                className="btn-primary ig-connect"
                href={`/api/instagram/connect?user=${encodeURIComponent(session.username)}`}
              >
                Connect Instagram
              </a>
            )}
          </div>

          <div className="composer-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InstallModal({
  onClose,
  onInstall,
  canPrompt,
}: {
  onClose: () => void;
  onInstall: () => void;
  canPrompt: boolean;
}) {
  const ios = isIOS();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Install DesiGram</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="install-body">
          <p className="install-lead">
            Get the full-screen app experience — no browser bars, opens from your home screen.
          </p>

          {canPrompt && (
            <button className="btn-primary install-cta" onClick={onInstall}>
              Install app
            </button>
          )}

          {ios ? (
            <ol className="install-steps">
              <li>Tap the <strong>Share</strong> button in Safari.</li>
              <li>Scroll and choose <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong> in the top-right.</li>
            </ol>
          ) : !canPrompt ? (
            <ol className="install-steps">
              <li>Open this site in Chrome or Edge on your phone.</li>
              <li>Tap the menu (⋮) in the top-right.</li>
              <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
            </ol>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ShareProfileModal({
  username,
  onClose,
}: {
  username: string;
  onClose: () => void;
}) {
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}#u/${username}`
      : "";
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `@${username} on DesiGram`,
          text: `Check out @${username} on DesiGram`,
          url,
        });
      } catch {
        /* user cancelled */
      }
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Share profile</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="install-body">
          <p className="install-lead">Send your DesiGram link to friends.</p>
          <div className="share-link">
            <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn-primary" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button className="btn-secondary install-cta" onClick={nativeShare}>
              Share via…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Account | null>(() =>
    storage.get<Account | null>(SESSION_KEY, null)
  );
  const [posts, setPosts] = useState<Post[]>(() => storage.get<Post[]>(POSTS_KEY, []));
  const [commentsByPost, setCommentsByPost] = useState<Record<number, Comment[]>>(
    () => storage.get<Record<number, Comment[]>>(COMMENTS_KEY, {})
  );
  const [tab, setTab] = useState<Tab>("home");
  const [showComposer, setShowComposer] = useState(false);
  const [imageInput, setImageInput] = useState("");
  const [captionInput, setCaptionInput] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [igStatus, setIgStatus] = useState<InstagramStatus | null>(null);
  const [igMedia, setIgMedia] = useState<InstagramMedia[]>([]);
  const [igNotice, setIgNotice] = useState<string>("");

  useEffect(() => { storage.set(POSTS_KEY, posts); }, [posts]);
  useEffect(() => { storage.set(COMMENTS_KEY, commentsByPost); }, [commentsByPost]);
  useEffect(() => {
    if (session) storage.set(SESSION_KEY, session);
    else storage.remove(SESSION_KEY);
  }, [session]);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowInstall(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ig = params.get("ig");
    if (ig === "success") {
      setIgNotice("Instagram connected.");
      params.delete("ig");
      params.delete("ig_msg");
      const q = params.toString();
      const url = window.location.pathname + (q ? `?${q}` : "") + window.location.hash;
      window.history.replaceState({}, "", url);
      setTimeout(() => setIgNotice(""), 3000);
    } else if (ig === "error") {
      const msg = params.get("ig_msg") || "unknown_error";
      setIgNotice(`Instagram connect failed: ${msg}`);
      params.delete("ig");
      params.delete("ig_msg");
      const q = params.toString();
      const url = window.location.pathname + (q ? `?${q}` : "") + window.location.hash;
      window.history.replaceState({}, "", url);
      setTimeout(() => setIgNotice(""), 5000);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/instagram/status?user=${encodeURIComponent(session.username)}`,
        );
        if (!r.ok) return;
        const data = (await r.json()) as InstagramStatus;
        if (cancelled) return;
        setIgStatus(data);
        if (data.connected) {
          const m = await fetch(
            `/api/instagram/media?user=${encodeURIComponent(session.username)}`,
          );
          if (m.ok) {
            const md = (await m.json()) as { media: InstagramMedia[] };
            if (!cancelled) setIgMedia(md.media ?? []);
          }
        } else {
          setIgMedia([]);
        }
      } catch {
        /* network error / api server down */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.username, igNotice]);

  const refreshIgStatus = async () => {
    if (!session) return;
    try {
      const r = await fetch(
        `/api/instagram/status?user=${encodeURIComponent(session.username)}`,
      );
      if (!r.ok) return;
      setIgStatus((await r.json()) as InstagramStatus);
    } catch { /* ignore */ }
  };

  const disconnectInstagram = async () => {
    if (!session) return;
    try {
      await fetch(
        `/api/instagram/disconnect?user=${encodeURIComponent(session.username)}`,
        { method: "POST" },
      );
      setIgMedia([]);
      await refreshIgStatus();
    } catch { /* ignore */ }
  };

  const accounts = useMemo(
    () => storage.get<Account[]>(ACCOUNTS_KEY, []),
    [session, posts]
  );

  if (!session) {
    return <AuthScreen onAuth={(acc) => setSession(acc)} />;
  }

  const toggleLike = (id: number) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, liked: !p.liked, likes: p.liked ? p.likes - 1 : p.likes + 1 }
          : p
      )
    );
  };

  const deletePost = (id: number) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
    setCommentsByPost((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const addComment = (postId: number, text: string) => {
    setCommentsByPost((prev) => {
      const list = prev[postId] ?? [];
      const newComment: Comment = {
        id: Date.now(),
        username: session.username,
        displayName: session.displayName,
        text,
      };
      return { ...prev, [postId]: [...list, newComment] };
    });
  };

  const deleteComment = (postId: number, commentId: number) => {
    setCommentsByPost((prev) => {
      const list = prev[postId];
      if (!list) return prev;
      return { ...prev, [postId]: list.filter((c) => c.id !== commentId) };
    });
  };

  const resetComposer = () => {
    setImageInput("");
    setCaptionInput("");
    setImagePreview("");
    setError("");
    setShowComposer(false);
  };

  const onComposerFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = await readFileAsDataURL(file);
    setImagePreview(data);
    setImageInput("");
    setError("");
  };

  const onUrlChange = (v: string) => {
    setImageInput(v);
    setImagePreview(v);
    setError("");
  };

  const submitPost = (e: React.FormEvent) => {
    e.preventDefault();
    const image = imagePreview.trim();
    if (!image) { setError("Add an image URL or upload a file."); return; }
    const newPost: Post = {
      id: Date.now(),
      username: session.username,
      displayName: session.displayName,
      avatar: session.avatar,
      image,
      caption: captionInput.trim(),
      likes: 0,
      liked: false,
    };
    setPosts((prev) => [newPost, ...prev]);
    resetComposer();
  };

  const saveProfile = (next: Account): string | null => {
    const all = storage.get<Account[]>(ACCOUNTS_KEY, []);
    const usernameChanged = next.username !== session.username;
    if (usernameChanged && all.some((a) => a.username === next.username)) {
      return "That username is already taken.";
    }
    const updated: Account = { ...next };
    storage.set(
      ACCOUNTS_KEY,
      all.map((a) => (a.username === session.username ? updated : a))
    );
    setSession(updated);
    setPosts((prev) =>
      prev.map((p) =>
        p.username === session.username
          ? {
              ...p,
              username: updated.username,
              displayName: updated.displayName,
              avatar: updated.avatar,
            }
          : p
      )
    );
    setCommentsByPost((prev) => {
      const next: Record<number, Comment[]> = {};
      for (const [k, list] of Object.entries(prev)) {
        next[Number(k)] = list.map((c) =>
          c.username === session.username
            ? { ...c, username: updated.username, displayName: updated.displayName }
            : c
        );
      }
      return next;
    });
    setShowEdit(false);
    return null;
  };

  const triggerInstall = async () => {
    if (!installPrompt) return;
    try {
      installPrompt.prompt();
      await installPrompt.userChoice;
    } catch {
      /* ignore */
    }
    setInstallPrompt(null);
  };

  const logout = () => setSession(null);

  const myPosts = posts.filter((p) => p.username === session.username);
  const filteredAccounts = accounts.filter((a) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return a.username !== session.username;
    return a.username.includes(q) || a.displayName.toLowerCase().includes(q);
  });

  const showInstallButton = !installed && (installPrompt || isIOS());

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="logo">DesiGram</h1>
        <div className="topbar-actions">
          {showInstallButton && (
            <button
              className="install-pill"
              onClick={() => (installPrompt ? triggerInstall() : setShowInstall(true))}
              aria-label="Install app"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4v12" strokeLinecap="round" />
                <path d="m6 12 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 20h14" strokeLinecap="round" />
              </svg>
              Get app
            </button>
          )}
          <button
            className="icon-btn create-btn"
            aria-label="Create new post"
            onClick={() => setShowComposer(true)}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <path d="M12 8v8M8 12h8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <main className="feed-wrap">
        {tab === "home" && (
          <section className="feed">
            {igStatus && !igStatus.connected && igStatus.configured && (
              <div className="ig-connect-banner">
                <div className="ig-connect-banner-text">
                  <div className="ig-connect-banner-title">Connect your Instagram</div>
                  <div className="ig-connect-banner-sub">
                    Pull your real Instagram photos into your DesiGram feed.
                  </div>
                </div>
                <a
                  className="btn-primary ig-connect"
                  href={`/api/instagram/connect?user=${encodeURIComponent(session.username)}`}
                >
                  Connect Instagram
                </a>
              </div>
            )}
            {posts.length === 0 && igMedia.length === 0 ? (
              <div className="empty-feed">
                <div className="empty-title">Your feed is empty</div>
                <div className="empty-sub">Share your first photo to get started.</div>
                <button className="btn-primary" onClick={() => setShowComposer(true)}>
                  Create a post
                </button>
              </div>
            ) : (
              <>
                {posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    comments={commentsByPost[p.id] ?? []}
                    currentUsername={session.username}
                    onToggleLike={toggleLike}
                    onDelete={deletePost}
                    onAddComment={addComment}
                    onDeleteComment={deleteComment}
                  />
                ))}
                {igMedia.map((m) => (
                  <article key={m.id} className="post ig-post">
                    <header className="post-header">
                      <Avatar
                        src={session.avatar}
                        name={m.igDisplayName}
                        username={m.igUsername}
                        size={32}
                      />
                      <div className="post-author">
                        <span className="username">{m.igDisplayName}</span>
                        <span className="handle">
                          @{m.igUsername}
                          <span className="ig-badge" title="From Instagram">Instagram</span>
                        </span>
                      </div>
                      <a
                        className="more-btn"
                        href={m.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="View on Instagram"
                      >
                        ↗
                      </a>
                    </header>
                    <div className="post-image-wrap">
                      <img className="post-image" src={m.image} alt={m.caption} />
                    </div>
                    <div className="post-meta">
                      {m.caption && (
                        <div className="caption">
                          <span className="username">{m.igDisplayName}</span> {m.caption}
                        </div>
                      )}
                      <div className="ig-timestamp">
                        {new Date(m.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                  </article>
                ))}
              </>
            )}
          </section>
        )}

        {tab === "search" && (
          <section className="search">
            <input
              type="search"
              className="search-input"
              placeholder="Search people"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <ul className="user-list">
              {filteredAccounts.length === 0 ? (
                <li className="user-empty">No people found.</li>
              ) : (
                filteredAccounts.map((a) => (
                  <li key={a.username} className="user-row">
                    <Avatar src={a.avatar} name={a.displayName} username={a.username} size={44} />
                    <div className="user-info">
                      <span className="username">{a.displayName}</span>
                      <span className="handle">@{a.username}</span>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        )}

        {tab === "profile" && (
          <section className="profile">
            <div className="profile-head">
              <Avatar
                src={session.avatar}
                name={session.displayName}
                username={session.username}
                size={88}
                className="profile-avatar"
              />
              <div className="profile-meta">
                <div className="profile-name">{session.displayName}</div>
                <div className="profile-handle">@{session.username}</div>
                <div className="profile-stats">
                  <span><strong>{myPosts.length}</strong> posts</span>
                </div>
              </div>
            </div>

            {session.bio && <div className="profile-bio">{session.bio}</div>}

            <div className="profile-actions profile-actions-row">
              <button className="btn-secondary" onClick={() => setShowEdit(true)}>
                Edit profile
              </button>
              <button className="btn-secondary" onClick={() => setShowShare(true)}>
                Share profile
              </button>
              <button className="btn-text" onClick={logout}>Log out</button>
            </div>

            {myPosts.length === 0 ? (
              <div className="empty-feed empty-profile">
                <div className="empty-title">No posts yet</div>
                <div className="empty-sub">Your photos will show up here.</div>
                <button className="btn-primary" onClick={() => setShowComposer(true)}>
                  Share a photo
                </button>
              </div>
            ) : (
              <div className="grid">
                {myPosts.map((p) => (
                  <div key={p.id} className="grid-cell">
                    <img src={p.image} alt={p.caption} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Primary">
        <button
          className={`nav-btn ${tab === "home" ? "active" : ""}`}
          onClick={() => setTab("home")}
          aria-label="Home"
        >
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12 12 3l9 9" strokeLinejoin="round" />
            <path d="M5 10v10h14V10" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          className={`nav-btn ${tab === "search" ? "active" : ""}`}
          onClick={() => setTab("search")}
          aria-label="Search"
        >
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className={`nav-btn ${tab === "profile" ? "active" : ""}`}
          onClick={() => setTab("profile")}
          aria-label="Profile"
        >
          <Avatar
            src={session.avatar}
            name={session.displayName}
            username={session.username}
            size={26}
            className={tab === "profile" ? "nav-avatar active" : "nav-avatar"}
          />
        </button>
      </nav>

      {showComposer && (
        <div className="modal-backdrop" onClick={resetComposer}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New post</h2>
              <button className="icon-btn" aria-label="Close" onClick={resetComposer}>×</button>
            </div>
            <form className="composer" onSubmit={submitPost}>
              <div className="composer-author">
                <Avatar
                  src={session.avatar}
                  name={session.displayName}
                  username={session.username}
                  size={36}
                />
                <div>
                  <div className="username">{session.displayName}</div>
                  <div className="handle">@{session.username}</div>
                </div>
              </div>

              {imagePreview ? (
                <div className="composer-preview">
                  <img src={imagePreview} alt="preview" onError={() => setError("Could not load image.")} />
                </div>
              ) : (
                <div className="composer-placeholder">Add an image to preview</div>
              )}

              <label className="field">
                <span>Image URL</span>
                <input
                  type="url"
                  placeholder="https://…"
                  value={imageInput}
                  onChange={(e) => onUrlChange(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Or upload</span>
                <input type="file" accept="image/*" onChange={onComposerFile} />
              </label>

              <label className="field">
                <span>Caption</span>
                <textarea
                  rows={3}
                  placeholder="Write a caption…"
                  value={captionInput}
                  onChange={(e) => setCaptionInput(e.target.value)}
                />
              </label>

              {error && <div className="form-error">{error}</div>}

              <div className="composer-actions">
                <button type="button" className="btn-secondary" onClick={resetComposer}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">Share</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEdit && (
        <EditProfileModal
          session={session}
          onClose={() => setShowEdit(false)}
          onSave={saveProfile}
          igStatus={igStatus}
          onDisconnectInstagram={disconnectInstagram}
        />
      )}

      {igNotice && <div className="ig-toast">{igNotice}</div>}

      {showShare && (
        <ShareProfileModal
          username={session.username}
          onClose={() => setShowShare(false)}
        />
      )}

      {showInstall && (
        <InstallModal
          onClose={() => setShowInstall(false)}
          onInstall={triggerInstall}
          canPrompt={!!installPrompt}
        />
      )}
    </div>
  );
}
