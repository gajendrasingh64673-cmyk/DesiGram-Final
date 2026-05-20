import { useEffect, useMemo, useRef, useState } from "react";
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
  saved?: boolean;
  ts?: number;
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

type Tab = "home" | "reels" | "search" | "notifications" | "profile";

type Notification = {
  id: number;
  recipient: string;
  kind: "like" | "comment";
  actorUsername: string;
  actorDisplayName: string;
  actorAvatar: string;
  postId: number;
  postImage: string;
  text?: string;
  ts: number;
  read: boolean;
};

type Reel = {
  id: number;
  username: string;
  displayName: string;
  avatar: string;
  video: string;
  poster?: string;
  caption: string;
  likes: number;
  liked: boolean;
};

type ProfileTab = "posts" | "reels";

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
const REELS_KEY = `${STORAGE_PREFIX}reels`;
const NOTIFS_KEY = `${STORAGE_PREFIX}notifications`;

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

function formatTimeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
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
  onToggleSave,
  onDelete,
  onAddComment,
  onDeleteComment,
}: {
  post: Post;
  comments: Comment[];
  currentUsername: string;
  onToggleLike: (id: number) => void;
  onToggleSave?: (id: number) => void;
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

  const likeOnly = () => {
    if (post.liked) return;
    setBursting(true);
    setTimeout(() => setBursting(false), 350);
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

      <div className="post-image-wrap" onDoubleClick={likeOnly}>
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
        <label htmlFor={`comment-input-${post.id}`} className="action-btn" aria-label="Comment">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" strokeLinejoin="round" />
          </svg>
        </label>
        <button
          className="action-btn"
          aria-label="Share"
          onClick={() => {
            const url = `${window.location.origin}/?post=${post.id}`;
            if (navigator.share) {
              navigator.share({ title: `${post.displayName} on DesiGram`, text: post.caption, url }).catch(() => {});
            } else if (navigator.clipboard) {
              navigator.clipboard.writeText(url).catch(() => {});
            }
          }}
        >
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2 11 13" strokeLinecap="round" />
            <path d="M22 2 15 22l-4-9-9-4 20-7z" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="spacer" />
        <button
          className={`action-btn ${post.saved ? "saved" : ""}`}
          aria-label={post.saved ? "Unsave" : "Save"}
          onClick={() => onToggleSave?.(post.id)}
        >
          <svg viewBox="0 0 24 24" width="26" height="26" fill={post.saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" strokeLinejoin="round" />
          </svg>
        </button>
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
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("signup");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const switchTo = (m: "login" | "signup" | "forgot") => {
    setMode(m);
    setError("");
    setInfo("");
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    const u = username.trim().toLowerCase();
    const d = displayName.trim();

    if (!u) { setError("Please enter your username."); return; }
    if (!/^[a-z0-9._]{2,20}$/.test(u)) {
      setError("Username: 2–20 chars, letters, numbers, dot or underscore.");
      return;
    }

    const accounts = storage.get<Account[]>(ACCOUNTS_KEY, []);

    if (mode === "signup") {
      if (!password) { setError("Please enter a password."); return; }
      if (password.length < 4) { setError("Password should be at least 4 characters."); return; }
      if (!d) { setError("Please enter your display name."); return; }
      if (accounts.some((a) => a.username === u)) {
        setError("That username is already taken on this device.");
        return;
      }
      const account: Account = { username: u, password: password, displayName: d, avatar: "", bio: "" };
      storage.set(ACCOUNTS_KEY, [...accounts, account]);
      onAuth(account);
      return;
    }

    if (mode === "login") {
      if (!password) { setError("Please enter your password."); return; }
      const found = accounts.find((a) => a.username === u);
      if (!found) {
        setError("No account with that username on this device. New here? Tap “Create an account”.");
        return;
      }
      if (found.password !== password) {
        setError("Wrong password. Tap “Forgot password?” below to reset it.");
        return;
      }
      onAuth(found);
      return;
    }

    // forgot
    if (!newPassword || !confirmPassword) { setError("Please enter and confirm a new password."); return; }
    if (newPassword.length < 4) { setError("Password should be at least 4 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    const idx = accounts.findIndex((a) => a.username === u);
    if (idx === -1) {
      setError("No account with that username on this device.");
      return;
    }
    const updated: Account[] = [...accounts];
    updated[idx] = { ...updated[idx], password: newPassword };
    storage.set(ACCOUNTS_KEY, updated);
    setInfo("Password updated. You can now log in with your new password.");
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => { switchTo("login"); setUsername(u); }, 1200);
  };

  const title =
    mode === "signup" ? "Create your account"
    : mode === "login" ? "Sign in to your account"
    : "Reset your password";

  const submitLabel =
    mode === "signup" ? "Sign up"
    : mode === "login" ? "Log in"
    : "Reset password";

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="logo auth-logo">DesiGram</h1>
        <p className="auth-sub">{title}</p>

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

          {mode !== "forgot" && (
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
          )}

          {mode === "forgot" && (
            <>
              <label className="field">
                <span>New password</span>
                <input
                  type="password"
                  placeholder="At least 4 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <label className="field">
                <span>Confirm new password</span>
                <input
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
            </>
          )}

          {mode === "login" && (
            <div className="auth-forgot-row">
              <button
                type="button"
                className="btn-text auth-forgot-link"
                onClick={() => switchTo("forgot")}
              >
                Forgot password?
              </button>
            </div>
          )}

          {error && <div className="form-error">{error}</div>}
          {info && <div className="form-info">{info}</div>}

          <button type="submit" className="btn-primary auth-submit">{submitLabel}</button>
        </form>

        <div className="auth-switch">
          {mode === "signup" && (
            <>
              Already have an account?{" "}
              <button type="button" onClick={() => switchTo("login")}>Log in</button>
            </>
          )}
          {mode === "login" && (
            <>
              New here?{" "}
              <button type="button" onClick={() => switchTo("signup")}>Create an account</button>
            </>
          )}
          {mode === "forgot" && (
            <>
              Remembered it?{" "}
              <button type="button" onClick={() => switchTo("login")}>Back to log in</button>
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
  const [reels, setReels] = useState<Reel[]>(() => storage.get<Reel[]>(REELS_KEY, []));
  const [showReelComposer, setShowReelComposer] = useState(false);
  const [reelVideoData, setReelVideoData] = useState("");
  const [reelCaption, setReelCaption] = useState("");
  const [reelError, setReelError] = useState("");
  const [profileTab, setProfileTab] = useState<ProfileTab>("posts");
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const reelFileInputRef = useRef<HTMLInputElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>(
    () => storage.get<Notification[]>(NOTIFS_KEY, [])
  );

  useEffect(() => { storage.set(POSTS_KEY, posts); }, [posts]);
  useEffect(() => { storage.set(COMMENTS_KEY, commentsByPost); }, [commentsByPost]);
  useEffect(() => { storage.set(NOTIFS_KEY, notifications); }, [notifications]);
  useEffect(() => {
    try { storage.set(REELS_KEY, reels); }
    catch { /* quota — ignore */ }
  }, [reels]);
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
    let shouldNotify: Post | null = null;
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const nextLiked = !p.liked;
        if (nextLiked && p.username !== session.username) shouldNotify = p;
        return { ...p, liked: nextLiked, likes: nextLiked ? p.likes + 1 : p.likes - 1 };
      })
    );
    if (shouldNotify) {
      const target = shouldNotify as Post;
      const notif: Notification = {
        id: Date.now(),
        recipient: target.username,
        kind: "like",
        actorUsername: session.username,
        actorDisplayName: session.displayName,
        actorAvatar: session.avatar,
        postId: target.id,
        postImage: target.image,
        ts: Date.now(),
        read: false,
      };
      setNotifications((prev) => [notif, ...prev]);
    }
  };

  const toggleSave = (id: number) => {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, saved: !p.saved } : p)));
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
    const post = posts.find((p) => p.id === postId);
    if (post && post.username !== session.username) {
      const notif: Notification = {
        id: Date.now(),
        recipient: post.username,
        kind: "comment",
        actorUsername: session.username,
        actorDisplayName: session.displayName,
        actorAvatar: session.avatar,
        postId: post.id,
        postImage: post.image,
        text,
        ts: Date.now(),
        read: false,
      };
      setNotifications((prev) => [notif, ...prev]);
    }
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
    if (usernameChanged) {
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          recipient: n.recipient === session.username ? updated.username : n.recipient,
          actorUsername: n.actorUsername === session.username ? updated.username : n.actorUsername,
          actorDisplayName:
            n.actorUsername === session.username ? updated.displayName : n.actorDisplayName,
          actorAvatar: n.actorUsername === session.username ? updated.avatar : n.actorAvatar,
        }))
      );
    }
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

  const toggleReelLike = (id: number) => {
    setReels((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, liked: !r.liked, likes: r.likes + (r.liked ? -1 : 1) }
          : r
      )
    );
  };

  const deleteReel = (id: number) => {
    setReels((prev) => prev.filter((r) => r.id !== id));
  };

  const resetReelComposer = () => {
    setShowReelComposer(false);
    setReelVideoData("");
    setReelCaption("");
    setReelError("");
  };

  const onReelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setReelError("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setReelError("Please select a video file.");
      return;
    }
    const MAX = 6 * 1024 * 1024;
    if (file.size > MAX) {
      setReelError("Video too large. Please pick a clip under 6 MB.");
      return;
    }
    try {
      const data = await readFileAsDataURL(file);
      setReelVideoData(data);
    } catch {
      setReelError("Could not read that video.");
    }
  };

  const submitReel = (e: React.FormEvent) => {
    e.preventDefault();
    setReelError("");
    if (!reelVideoData) { setReelError("Please add a video."); return; }
    const newReel: Reel = {
      id: Date.now(),
      username: session.username,
      displayName: session.displayName,
      avatar: session.avatar,
      video: reelVideoData,
      caption: reelCaption.trim(),
      likes: 0,
      liked: false,
    };
    try {
      setReels((prev) => [newReel, ...prev]);
      resetReelComposer();
      setTab("reels");
    } catch {
      setReelError("Could not save reel. Try a smaller video.");
    }
  };

  const myPosts = posts.filter((p) => p.username === session.username);
  const myReels = reels.filter((r) => r.username === session.username);
  const otherPosts = posts.filter((p) => p.username !== session.username);
  const myNotifs = notifications.filter((n) => n.recipient === session.username);
  const unreadCount = myNotifs.filter((n) => !n.read).length;
  const storyAccounts = accounts.filter((a) => a.username !== session.username).slice(0, 12);

  useEffect(() => {
    if (tab !== "notifications") return;
    const me = session.username;
    setNotifications((prev) => {
      if (!prev.some((n) => n.recipient === me && !n.read)) return prev;
      return prev.map((n) =>
        n.recipient === me && !n.read ? { ...n, read: true } : n
      );
    });
  }, [tab, session.username]);
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
              Get app
            </button>
          )}
          <button
            className="icon-btn topbar-btn"
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
            onClick={() => setTab("notifications")}
          >
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z" strokeLinejoin="round" />
            </svg>
            {unreadCount > 0 && (
              <span className="topbar-badge" aria-hidden>
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          <button
            className="icon-btn"
            aria-label="Create"
            onClick={() => setShowCreateSheet(true)}
            title="Create"
          >
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6.5 6.5h-1A2.5 2.5 0 0 0 3 9v9.5A2.5 2.5 0 0 0 5.5 21H15a2.5 2.5 0 0 0 2.5-2.5v-1" strokeLinecap="round" />
              <path d="m15 5 4 4M14 6l4 4-7.5 7.5H6.5V13.5L14 6z" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>

      <main className="feed-wrap">
        {tab === "home" && (
          <section className="feed">
            <div className="stories-row" aria-label="Stories">
              <div className="story">
                <button
                  type="button"
                  className="story-ring story-ring-add"
                  onClick={() => setShowComposer(true)}
                  aria-label="Add to your story"
                >
                  <Avatar
                    src={session.avatar}
                    name={session.displayName}
                    username={session.username}
                    size={60}
                  />
                  <span className="story-plus" aria-hidden>+</span>
                </button>
                <span className="story-name">Your story</span>
              </div>
              {storyAccounts.map((a) => (
                <div key={a.username} className="story">
                  <button
                    type="button"
                    className="story-ring"
                    onClick={() => { setSearchQuery(a.username); setTab("search"); }}
                    aria-label={`View ${a.displayName}'s profile`}
                  >
                    <Avatar src={a.avatar} name={a.displayName} username={a.username} size={60} />
                  </button>
                  <span className="story-name">{a.username}</span>
                </div>
              ))}
            </div>
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
                    onToggleSave={toggleSave}
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

        {tab === "reels" && (
          <section className="reels-feed">
            {reels.length === 0 ? (
              <div className="empty-feed">
                <div className="empty-title">No reels yet</div>
                <div className="empty-sub">Upload your first short video.</div>
                <button className="btn-primary" onClick={() => setShowReelComposer(true)}>
                  Upload a reel
                </button>
              </div>
            ) : (
              reels.map((r) => (
                <article key={r.id} className="reel-card">
                  <video
                    className="reel-video"
                    src={r.video}
                    poster={r.poster}
                    controls
                    playsInline
                    loop
                    preload="metadata"
                  />
                  <div className="reel-overlay">
                    <div className="reel-author">
                      <Avatar
                        src={r.avatar}
                        name={r.displayName}
                        username={r.username}
                        size={36}
                      />
                      <div className="reel-author-text">
                        <span className="username">{r.displayName}</span>
                        <span className="handle">@{r.username}</span>
                      </div>
                    </div>
                    {r.caption && <div className="reel-caption">{r.caption}</div>}
                    <div className="reel-actions">
                      <button
                        className={`reel-like ${r.liked ? "liked" : ""}`}
                        onClick={() => toggleReelLike(r.id)}
                        aria-label={r.liked ? "Unlike" : "Like"}
                      >
                        {r.liked ? "♥" : "♡"} {r.likes}
                      </button>
                      {r.username === session.username && (
                        <button
                          className="btn-text reel-delete"
                          onClick={() => deleteReel(r.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))
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
            {searchQuery.trim() !== "" && (
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
            )}
            {searchQuery.trim() === "" && (
              <div className="explore">
                <h3 className="section-title">Explore</h3>
                {otherPosts.length === 0 ? (
                  <div className="explore-empty">Nothing to explore yet. Be the first to post!</div>
                ) : (
                  <div className="grid explore-grid">
                    {otherPosts.map((p) => (
                      <div key={p.id} className="grid-cell">
                        <img src={p.image} alt={p.caption} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {tab === "notifications" && (
          <section className="notifications">
            <h2 className="section-title">Notifications</h2>
            {myNotifs.length === 0 ? (
              <div className="empty-feed">
                <div className="empty-title">No notifications yet</div>
                <div className="empty-sub">
                  When people like or comment on your posts, you'll see it here.
                </div>
              </div>
            ) : (
              <ul className="notif-list">
                {myNotifs.map((n) => (
                  <li key={n.id} className={`notif-row ${!n.read ? "unread" : ""}`}>
                    <Avatar
                      src={n.actorAvatar}
                      name={n.actorDisplayName}
                      username={n.actorUsername}
                      size={44}
                    />
                    <div className="notif-text">
                      <div>
                        <span className="username">{n.actorDisplayName}</span>{" "}
                        {n.kind === "like" ? (
                          <>liked your post.</>
                        ) : (
                          <>commented: <span className="notif-comment">{n.text}</span></>
                        )}
                      </div>
                      <div className="notif-time">{formatTimeAgo(n.ts)}</div>
                    </div>
                    <img className="notif-thumb" src={n.postImage} alt="" />
                  </li>
                ))}
              </ul>
            )}
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
                <button
                  type="button"
                  className="profile-username-btn"
                  onClick={() => setShowAccountSwitcher(true)}
                  aria-label="Switch account"
                >
                  <span className="profile-name">{session.displayName}</span>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden className="dropdown-caret">
                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="profile-handle">@{session.username}</div>
                <div className="profile-stats">
                  <span><strong>{myPosts.length}</strong> posts</span>
                  <span><strong>{myReels.length}</strong> reels</span>
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

            <div className="profile-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={profileTab === "posts"}
                className={`profile-tab ${profileTab === "posts" ? "active" : ""}`}
                onClick={() => setProfileTab("posts")}
              >
                Posts
              </button>
              <button
                role="tab"
                aria-selected={profileTab === "reels"}
                className={`profile-tab ${profileTab === "reels" ? "active" : ""}`}
                onClick={() => setProfileTab("reels")}
              >
                Reels
              </button>
            </div>

            {profileTab === "posts" && (
              myPosts.length === 0 ? (
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
              )
            )}

            {profileTab === "reels" && (
              myReels.length === 0 ? (
                <div className="empty-feed empty-profile">
                  <div className="empty-title">No reels yet</div>
                  <div className="empty-sub">Upload your first short video.</div>
                  <button className="btn-primary" onClick={() => setShowReelComposer(true)}>
                    Upload a reel
                  </button>
                </div>
              ) : (
                <div className="grid">
                  {myReels.map((r) => (
                    <div
                      key={r.id}
                      className="grid-cell reel-cell"
                      onClick={() => setTab("reels")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setTab("reels");
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <video src={r.video} muted playsInline preload="metadata" />
                      <span className="reel-cell-badge" aria-hidden>▶</span>
                    </div>
                  ))}
                </div>
              )
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
          {tab === "home" ? (
            <svg viewBox="0 0 24 24" width="26" height="26">
              <path d="M3 11 12 3l9 8v10h-6v-6h-6v6H3V11z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" className="outline-active">
              <path d="M3 11 12 3l9 8v10h-6v-6h-6v6H3V11z" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <button
          className={`nav-btn ${tab === "search" ? "active" : ""}`}
          onClick={() => setTab("search")}
          aria-label="Search"
        >
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth={tab === "search" ? 2.6 : 1.8} className="outline-active">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className="nav-btn"
          onClick={() => setShowCreateSheet(true)}
          aria-label="Create"
        >
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" className="outline-active">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <path d="M12 8v8M8 12h8" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className={`nav-btn ${tab === "reels" ? "active" : ""}`}
          onClick={() => setTab("reels")}
          aria-label="Reels"
        >
          {tab === "reels" ? (
            <svg viewBox="0 0 24 24" width="26" height="26">
              <path d="M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6z" fill="currentColor"/>
              <path d="M10 8.5v7l6-3.5-6-3.5z" fill="#fff" stroke="none" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" className="outline-active">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <path d="M10 8.5v7l6-3.5-6-3.5z" fill="currentColor" stroke="none" />
            </svg>
          )}
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

      {showReelComposer && (
        <div className="reel-picker" role="dialog" aria-label="New reel">
          <header className="reel-picker-top">
            <button className="reel-icon-btn" aria-label="Close" onClick={resetReelComposer}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round"/></svg>
            </button>
            <h2 className="reel-picker-title">New reel</h2>
            <button className="reel-icon-btn" aria-label="Settings" onClick={() => { setIgNotice("Reel settings — coming soon"); setTimeout(()=>setIgNotice(""), 1800); }}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" strokeLinejoin="round"/></svg>
            </button>
          </header>

          <div className="reel-picker-pills">
            <button type="button" className="reel-pill" onClick={() => { setIgNotice("Drafts — coming soon"); setTimeout(()=>setIgNotice(""), 1800); }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8" strokeDasharray="0" strokeLinecap="round"/></svg>
              <span>Drafts</span>
            </button>
            <button type="button" className="reel-pill" onClick={() => { setIgNotice("Templates — coming soon"); setTimeout(()=>setIgNotice(""), 1800); }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="6" width="14" height="14" rx="2"/><rect x="7" y="3" width="14" height="14" rx="2"/></svg>
              <span>Templates</span>
            </button>
          </div>

          <div className="reel-picker-sub">
            <button type="button" className="reel-sub-btn">
              <span>Recents</span>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button type="button" className="reel-select-pill" onClick={() => reelFileInputRef.current?.click()}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="4" width="14" height="14" rx="2"/><rect x="8" y="8" width="12" height="12" rx="2"/></svg>
              <span>Select</span>
            </button>
          </div>

          <div className="reel-picker-grid">
            <button type="button" className="reel-grid-cell reel-camera-cell" onClick={() => reelFileInputRef.current?.click()} aria-label="Pick a video">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            </button>
            {reelVideoData && (
              <div className="reel-grid-cell reel-pick-preview">
                <video src={reelVideoData} muted playsInline preload="metadata" />
                <span className="reel-pick-check" aria-hidden>
                  <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#1877f2"/><path d="M7 12.5l3.5 3.5L17 9.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
              </div>
            )}
            {myReels.slice(0, 8).map((r) => (
              <div key={r.id} className="reel-grid-cell reel-existing">
                <video src={r.video} muted playsInline preload="metadata" />
              </div>
            ))}
            {Array.from({ length: Math.max(0, 11 - myReels.length - (reelVideoData ? 1 : 0)) }).map((_, i) => (
              <div key={`ph-${i}`} className="reel-grid-cell reel-grid-placeholder" />
            ))}
          </div>

          <input
            ref={reelFileInputRef}
            type="file"
            accept="video/*"
            style={{ display: "none" }}
            onChange={onReelFile}
          />

          {reelVideoData && (
            <form className="reel-bottom-bar" onSubmit={submitReel}>
              <input
                type="text"
                className="reel-caption-input"
                placeholder="Say something about your reel…"
                value={reelCaption}
                onChange={(e) => setReelCaption(e.target.value)}
              />
              <button type="submit" className="reel-share-btn">Share</button>
            </form>
          )}

          {reelError && <div className="reel-error">{reelError}</div>}

          <nav className="reel-picker-tabs" aria-label="Composer tabs">
            <button type="button" className="reel-tab active">REEL</button>
            <button type="button" className="reel-tab" onClick={() => { setIgNotice("Templates — coming soon"); setTimeout(()=>setIgNotice(""), 1800); }}>TEMPLATES</button>
          </nav>
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

      {showCreateSheet && (
        <CreateSheet
          onClose={() => setShowCreateSheet(false)}
          onPick={(kind) => {
            setShowCreateSheet(false);
            if (kind === "post") setShowComposer(true);
            else if (kind === "reel") setShowReelComposer(true);
            else {
              setIgNotice(`${kind[0].toUpperCase()}${kind.slice(1)} — coming soon`);
              setTimeout(() => setIgNotice(""), 2200);
            }
          }}
        />
      )}

      {showAccountSwitcher && (
        <AccountSwitcherSheet
          accounts={accounts}
          currentUsername={session.username}
          onClose={() => setShowAccountSwitcher(false)}
          onSwitch={(acc) => {
            setShowAccountSwitcher(false);
            if (acc.username !== session.username) setSession(acc);
          }}
          onAddAccount={() => {
            setShowAccountSwitcher(false);
            logout();
          }}
        />
      )}
    </div>
  );
}

type CreateKind = "reel" | "post" | "story" | "highlights" | "live" | "ai" | "ad" | "channel";

function CreateSheet({ onClose, onPick }: { onClose: () => void; onPick: (kind: CreateKind) => void }) {
  const items: { kind: CreateKind; label: string; icon: React.ReactNode }[] = [
    { kind: "reel", label: "Reel", icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M10 8.5v7l6-3.5-6-3.5z" fill="currentColor" stroke="none"/></svg>
    )},
    { kind: "post", label: "Post", icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
    )},
    { kind: "story", label: "Story", icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 2"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8" strokeDasharray="0" strokeLinecap="round"/></svg>
    )},
    { kind: "highlights", label: "Highlights", icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 2"><circle cx="12" cy="12" r="9"/><path strokeDasharray="0" d="M12 17s-5-3.2-5-7a3 3 0 0 1 5-2 3 3 0 0 1 5 2c0 3.8-5 7-5 7z" strokeLinejoin="round"/></svg>
    )},
    { kind: "live", label: "Live", icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M7 8a6 6 0 0 0 0 8M17 8a6 6 0 0 1 0 8M4 5a10 10 0 0 0 0 14M20 5a10 10 0 0 1 0 14" strokeLinecap="round"/></svg>
    )},
    { kind: "ai", label: "AI", icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/><path d="M16 6l1.5 1.5M16 6l-1.5 1.5M16 6v2" strokeLinecap="round"/></svg>
    )},
    { kind: "ad", label: "Ad", icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 17l6-6 4 4 8-8" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 7h7v7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    )},
    { kind: "channel", label: "Channel", icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12a9 9 0 1 1-3.5-7.1L21 3v6h-6"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/></svg>
    )},
  ];
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Create">
        <div className="sheet-handle" aria-hidden />
        <h2 className="sheet-title">Create</h2>
        <ul className="sheet-list" role="menu">
          {items.map((it) => (
            <li key={it.kind} role="none">
              <button type="button" role="menuitem" className="sheet-item" onClick={() => onPick(it.kind)}>
                <span className="sheet-item-icon">{it.icon}</span>
                <span className="sheet-item-label">{it.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AccountSwitcherSheet({
  accounts,
  currentUsername,
  onClose,
  onSwitch,
  onAddAccount,
}: {
  accounts: Account[];
  currentUsername: string;
  onClose: () => void;
  onSwitch: (acc: Account) => void;
  onAddAccount: () => void;
}) {
  const ordered = [...accounts].sort((a, b) =>
    a.username === currentUsername ? -1 : b.username === currentUsername ? 1 : 0
  );
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Switch account">
        <div className="sheet-handle" aria-hidden />
        <ul className="sheet-list account-list" role="menu">
          {ordered.map((a) => {
            const isCurrent = a.username === currentUsername;
            return (
              <li key={a.username} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="sheet-item account-row"
                  onClick={() => onSwitch(a)}
                >
                  <Avatar src={a.avatar} name={a.displayName} username={a.username} size={44} />
                  <span className="account-name">{a.username}</span>
                  {isCurrent && (
                    <svg className="account-check" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                      <circle cx="12" cy="12" r="10" fill="#1877f2" />
                      <path d="M7 12.5l3.5 3.5L17 9.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
          <li role="none">
            <button type="button" role="menuitem" className="sheet-item account-row add-row" onClick={onAddAccount}>
              <span className="add-icon" aria-hidden>+</span>
              <span className="account-name">Add account</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
