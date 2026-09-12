import React, { Component, useEffect, useId, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, setCsrf, uploadFile } from "./api";
import Icon from "./icons";
import ContentViewer from "./viewers";
import "./styles.css";

const kinds = { video: "Video", pdf: "PDF document", html: "HTML page" };
const date = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const size = (bytes) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Icon name="book" size={23} />
      </span>
      <span>
        fieldnote<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.73-.06-1.42-.19-2.09H12v3.96h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.75 3.28-7.95z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.8l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.87 0-5.3-1.94-6.17-4.54H2.15v2.85A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.83 13.96A6.6 6.6 0 0 1 5.48 12c0-.68.12-1.34.35-1.96V7.19H2.15A11 11 0 0 0 1 12c0 1.78.43 3.47 1.15 4.81l3.68-2.85z"
      />
      <path
        fill="#EA4335"
        d="M12 5.5c1.62 0 3.07.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1a11 11 0 0 0-9.85 6.19l3.68 2.85C6.7 7.44 9.13 5.5 12 5.5z"
      />
    </svg>
  );
}
function Login({ config, expired }) {
  const code = new URLSearchParams(location.search).get("authError");
  const errors = {
    configuration:
      "Google sign-in is not configured yet. Add the OAuth credentials to .env and restart the server.",
    expired: "This sign-in attempt expired. Please try again.",
    cancelled: "Google sign-in was cancelled. You can try again below.",
    failed:
      "Sign-in could not be completed. Check the Google test-user list, redirect URI, and organization allow-list, then retry.",
  };
  return (
    <div className="login">
      <section className="login-story">
        <Brand />
        <div className="story-copy">
          <span className="eyebrow">
            A LITTLE KNOWLEDGE. A LOT OF POSSIBILITY.
          </span>
          <h1>
            Great work starts
            <br />
            with shared
            <br />
            <em>knowledge.</em>
          </h1>
          <p>
            A home for your team’s training, ideas, and everyday know-how. All
            together. Always within reach.
          </p>
        </div>
        <div className="story-stack" aria-hidden="true">
          <div className="floating-card back-card">
            <Icon name="html" size={28} />
            <span>Make the everyday easier</span>
          </div>
          <div className="floating-card front-card">
            <span className="stack-icon">
              <Icon name="video" size={28} />
            </span>
            <div>
              <small>YOUR TEAM’S NEXT CHAPTER</small>
              <strong>
                Learn something
                <br />
                worth sharing.
              </strong>
            </div>
            <span className="round-arrow">
              <Icon name="arrow" />
            </span>
          </div>
          <span className="orbit orbit-one" />
          <span className="orbit orbit-two" />
        </div>
        <p className="story-footer">
          Built for curious teams. Designed for better work.
        </p>
      </section>
      <section className="login-form">
        <div className="login-box">
          <span className="welcome-icon">
            <Icon name="book" size={30} />
          </span>
          <span className="eyebrow">YOUR TEAM’S KNOWLEDGE HUB</span>
          <h2>Welcome to Fieldnote</h2>
          <p>
            Sign in to explore your organization’s
            <br className="desktop-break" /> training and reference library.
          </p>
          {(errors[code] || expired) && (
            <div className="error" role="alert">
              {errors[code] || "Your session ended. Please sign in again."}
            </div>
          )}
          {config && !config.googleConfigured && (
            <div className="setup-note">
              <strong>One-time setup needed</strong>
              <p>
                Add your Google client ID and client secret to <code>.env</code>
                . Follow <code>START-HERE.md</code> in the project folder.
              </p>
            </div>
          )}
          <a className="google-button" href="/auth/google">
            <GoogleIcon />
            Continue with Google
            <Icon name="arrow" size={18} />
          </a>
          <p className="login-note">
            Use your approved organization Google account.
          </p>
          <div className="login-divider" />
          <div className="trust-line">
            <Icon name="shield" size={19} />
            <div>
              <strong>Your workspace, kept private.</strong>
              <span>Only approved members can access your team’s content.</span>
            </div>
          </div>
        </div>
        <span className="login-bottom">
          FIELDNOTE / A PLACE TO KEEP LEARNING
        </span>
      </section>
    </div>
  );
}
function Modal({ title, children, onClose, wide = false, busy = false }) {
  const titleId = useId();
  const ref = useRef(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prior = document.activeElement,
      dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
      prior?.focus?.();
    };
  }, []);
  return (
    <dialog
      aria-labelledby={titleId}
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close.current();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
          disabled={busy}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function ContentForm({ item, onClose, onSaved, limits }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [file, setFile] = useState(null);
  async function submit(event) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    if (!item) {
      if (!file) return setError("Please choose an MP4, PDF, or HTML file.");
      const ext = file.name.split(".").pop().toLowerCase(),
        kind = { mp4: "video", pdf: "pdf", html: "html", htm: "html" }[ext];
      if (!kind)
        return setError("Unsupported file type. Choose MP4, PDF, or HTML.");
      if (!file.size || file.size > limits[kind])
        return setError(
          `${kinds[kind]} must be nonempty and at most ${size(limits[kind])}.`,
        );
    }
    setBusy(true);
    try {
      if (item)
        await api(`/api/admin/content/${item.id}`, {
          method: "PATCH",
          body: Object.fromEntries(form),
        });
      else await uploadFile(form, setProgress);
      onSaved(
        item
          ? "Content details updated."
          : "Content uploaded. Your team can open it now.",
      );
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <Modal
      title={item ? "Edit content details" : "Share something useful"}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="content-form">
        <p className="muted">
          {item
            ? "Update how this item appears in the library."
            : "Add training or reference material to your team’s library."}
        </p>
        <fieldset disabled={busy}>
          {!item && (
            <label className="file-drop">
              <Icon name="upload" size={29} />
              <strong>{file ? file.name : "Choose a file to upload"}</strong>
              <span>MP4 up to 250 MB · PDF up to 25 MB · HTML up to 2 MB</span>
              <input
                type="file"
                name="file"
                accept=".mp4,.pdf,.html,.htm"
                onChange={(e) => setFile(e.target.files[0] || null)}
                required
              />
            </label>
          )}
          <label>
            Title <span>*</span>
            <input
              name="title"
              required
              maxLength={160}
              defaultValue={item?.title || ""}
              placeholder="e.g. Getting started with our team"
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              maxLength={3000}
              rows={3}
              defaultValue={item?.description || ""}
              placeholder="What will your team learn from this?"
            />
          </label>
          <div className="form-row">
            <label>
              Category <span>*</span>
              <input
                name="category"
                required
                maxLength={60}
                defaultValue={item?.category || ""}
                placeholder="e.g. Onboarding"
              />
            </label>
            <label>
              Tags
              <input
                name="tags"
                maxLength={250}
                defaultValue={item?.tags.join(", ") || ""}
                placeholder="e.g. essentials, new starters"
              />
            </label>
          </div>
          <small className="muted">
            Separate tags with commas. Up to 8 tags, 30 characters each.
          </small>
        </fieldset>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {busy && !item && (
          <div className="upload-progress" role="status">
            <progress max="100" value={progress} />
            <span>
              {progress === 100
                ? "Validating and saving…"
                : `Uploading ${progress}%`}
            </span>
          </div>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Saving…" : item ? "Save changes" : "Upload content"}
            <Icon name={item ? "check" : "upload"} size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function DeleteModal({ item, onClose, onSaved }) {
  const [confirmation, setConfirmation] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/api/admin/content/${item.id}`, {
        method: "DELETE",
        body: { confirmation },
      });
      onSaved("Content deleted.");
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <Modal title="Delete this content?" onClose={onClose} busy={busy}>
      <form className="content-form" onSubmit={submit}>
        <p>
          This removes <strong>{item.title}</strong> from the library and
          deletes its stored file. This cannot be undone.
        </p>
        <label>
          Type the exact title to confirm
          <input
            autoComplete="off"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={busy}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={onClose}
          >
            Keep content
          </button>
          <button
            className="btn danger"
            disabled={busy || confirmation !== item.title}
          >
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function App() {
  const [session, setSession] = useState(null),
    [config, setConfig] = useState(null),
    [booting, setBooting] = useState(true),
    [bootError, setBootError] = useState(""),
    [expired, setExpired] = useState(false);
  const [items, setItems] = useState([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [kind, setKind] = useState("all"),
    [category, setCategory] = useState("all"),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("newest"),
    [layout, setLayout] = useState("grid"),
    [modal, setModal] = useState(null);
  const refreshSession = async () => {
    const me = await api("/api/me");
    setCsrf(me.csrf);
    setSession(me);
  };
  useEffect(() => {
    const end = () => {
      setCsrf("");
      setSession(null);
      setItems([]);
      setModal(null);
      setExpired(true);
    };
    window.addEventListener("session-expired", end);
    (async () => {
      try {
        setConfig(await api("/api/config"));
        const response = await fetch("/api/me", { cache: "no-store" });
        if (response.ok) {
          const me = await response.json();
          setCsrf(me.csrf);
          setSession(me);
        } else if (response.status !== 401)
          throw new Error("Could not reach your workspace. Please retry.");
      } catch (e) {
        setBootError(e.message);
      } finally {
        setBooting(false);
      }
    })();
    return () => window.removeEventListener("session-expired", end);
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () => window.dispatchEvent(new Event("session-expired")),
      Math.max(0, session.expiresAt - Date.now()),
    );
    const poll = setInterval(() => refreshSession().catch(() => {}), 60000);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
    };
  }, [session?.expiresAt]);
  useEffect(() => {
    if (session?.user.role === "VIEWER" && modal?.type !== "view")
      setModal(null);
  }, [session?.user.role]);
  async function loadItems() {
    setLoading(true);
    setError("");
    try {
      const data = await api("/api/content");
      setItems(data.items);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (session?.user.id) loadItems();
  }, [session?.user.id, session?.user.role]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const categories = useMemo(
    () => [...new Set(items.map((x) => x.category))].sort(),
    [items],
  );
  const visible = useMemo(
    () =>
      items
        .filter(
          (x) =>
            (kind === "all" || x.kind === kind) &&
            (category === "all" || x.category === category) &&
            `${x.title} ${x.description} ${x.category} ${x.tags.join(" ")}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "title"
            ? a.title.localeCompare(b.title)
            : sort === "oldest"
              ? a.created_at - b.created_at
              : b.created_at - a.created_at,
        ),
    [items, kind, category, search, sort],
  );
  const saved = (message) => {
    setModal(null);
    setToast(message);
    loadItems();
  };
  if (booting)
    return (
      <div className="splash">
        <Brand />
        <span className="spinner" />
        <p>Opening your workspace…</p>
      </div>
    );
  if (bootError)
    return (
      <div className="splash">
        <Brand />
        <p className="error" role="alert">
          {bootError}
        </p>
        <button className="btn primary" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  if (!session) return <Login config={config} expired={expired} />;
  const user = session.user,
    admin = user.role === "ADMIN";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">
          <span className="workspace-avatar">T</span>
          <div>
            <strong>Team workspace</strong>
            <span>Internal knowledge hub</span>
          </div>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Content navigation">
          {[
            ["all", "grid", "All content"],
            ["video", "video", "Videos"],
            ["pdf", "pdf", "Documents"],
            ["html", "html", "HTML pages"],
          ].map(([value, icon, label]) => (
            <button
              key={value}
              className={`nav-item ${kind === value ? "active" : ""}`}
              onClick={() => {
                setKind(value);
                setCategory("all");
              }}
              aria-current={kind === value ? "page" : undefined}
            >
              <Icon name={icon} />
              <span>{label}</span>
              <small>
                {value === "all"
                  ? items.length
                  : items.filter((x) => x.kind === value).length}
              </small>
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-icon">
            <Icon name="book" size={24} />
          </span>
          <h3>
            Good things,
            <br />
            worth knowing.
          </h3>
          <p>Your team’s collective experience, one resource at a time.</p>
          <span className="little-line" />
        </div>
        <div className="sidebar-bottom">
          <Icon name="lock" size={15} />
          Private team workspace
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <Icon name="chevron" size={14} />
            <strong>Content library</strong>
          </span>
          <div className="profile">
            <span className={`role-badge ${admin ? "admin" : ""}`}>
              {admin ? "Admin" : "Viewer"}
            </span>
            <span className="user-avatar" title={user.email}>
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="profile-name">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
            <button
              className="icon-button"
              title="Sign out"
              aria-label="Sign out"
              onClick={async () => {
                try {
                  await api("/api/logout", { method: "POST" });
                  setCsrf("");
                  setSession(null);
                  setItems([]);
                  setModal(null);
                  setExpired(false);
                  history.replaceState({}, "", "/");
                } catch (e) {
                  setToast(e.message);
                }
              }}
            >
              <Icon name="logout" size={19} />
            </button>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <span className="eyebrow">LEARN. REFERENCE. GROW.</span>
              <h1>
                Your team’s knowledge,
                <br className="mobile-break" /> all in one place.
              </h1>
              <p>
                Find the guidance you need. Make your next step a little easier.
              </p>
            </div>
            {admin && (
              <button
                className="btn primary upload-button"
                onClick={() => setModal({ type: "create" })}
              >
                <Icon name="plus" size={19} />
                Upload content
              </button>
            )}
          </div>
          <section className="welcome-banner">
            <div>
              <span className="banner-label">
                <span />
                ROOM TO KEEP GROWING
              </span>
              <h2>
                A shared library.
                <br />A stronger team.
              </h2>
              <p>
                Explore training videos, practical guides,
                <br />
                and the answers you’ll come back to.
              </p>
            </div>
            <div className="banner-art" aria-hidden="true">
              <div className="art-ring" />
              <div className="art-book book-one">
                <Icon name="pdf" size={28} />
                <span>
                  THE
                  <br />
                  TEAM
                  <br />
                  GUIDE
                </span>
                <i />
              </div>
              <div className="art-book book-two">
                <Icon name="video" size={32} />
                <span>
                  Press play.
                  <br />
                  Move forward.
                </span>
              </div>
              <div className="art-label">
                <Icon name="check" size={15} />A little more know-how
              </div>
            </div>
            <div className="banner-count">
              <strong>{items.length.toString().padStart(2, "0")}</strong>
              <span>
                resources
                <br />
                to explore
              </span>
            </div>
          </section>
          <div className="library-heading">
            <div>
              <h2>
                {kind === "all"
                  ? "Explore the library"
                  : kind === "video"
                    ? "Training videos"
                    : kind === "pdf"
                      ? "Documents & guides"
                      : "HTML reference pages"}
              </h2>
              <span>
                {visible.length}{" "}
                {visible.length === 1 ? "resource" : "resources"}
                {search || category !== "all"
                  ? " found"
                  : " available for your team"}
              </span>
            </div>
            <div className="layout-toggle" aria-label="Display style">
              <button
                className={layout === "grid" ? "selected" : ""}
                onClick={() => setLayout("grid")}
                aria-label="Grid view"
                aria-pressed={layout === "grid"}
              >
                <Icon name="grid" size={18} />
              </button>
              <button
                className={layout === "list" ? "selected" : ""}
                onClick={() => setLayout("list")}
                aria-label="List view"
                aria-pressed={layout === "list"}
              >
                <Icon name="list" size={18} />
              </button>
            </div>
          </div>
          <div className="filter-bar">
            <label className="search-box">
              <Icon name="search" size={19} />
              <input
                type="search"
                placeholder="Search titles, topics, or tags…"
                aria-label="Search content"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              aria-label="Filter by category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              aria-label="Sort content"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="title">Title A–Z</option>
            </select>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button className="btn small" onClick={loadItems}>
                Retry
              </button>
            </div>
          )}
          {loading ? (
            <div
              className="card-grid"
              aria-label="Loading content"
              role="status"
            >
              {[1, 2, 3].map((n) => (
                <div className="skeleton-card" key={n}>
                  <div />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : visible.length ? (
            <div
              className={`card-grid ${layout === "list" ? "list-layout" : ""}`}
            >
              {visible.map((item, index) => (
                <article className="content-card" key={item.id}>
                  <button
                    className={`card-visual visual-${item.kind} variant-${index % 3}`}
                    aria-label={`Open ${item.title}`}
                    onClick={() => setModal({ type: "view", item })}
                  >
                    <span className="format-pill">
                      <Icon name={item.kind} size={13} />
                      {item.kind === "pdf" ? "PDF" : item.kind.toUpperCase()}
                    </span>
                    <span className="visual-symbol">
                      <Icon name={item.kind} size={38} />
                    </span>
                    <span className="visual-lines" />
                    <span className="visual-category">{item.category}</span>
                    <span className="visual-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </button>
                  <div className="card-body">
                    <div className="card-category">{item.category}</div>
                    <h3>
                      <button onClick={() => setModal({ type: "view", item })}>
                        {item.title}
                      </button>
                    </h3>
                    <p>
                      {item.description ||
                        "A resource from your team’s shared knowledge library."}
                    </p>
                    <div className="tags">
                      {item.tags.slice(0, 3).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                    <div className="card-footer">
                      <span>
                        {date(item.created_at)}
                        <i /> {size(item.size)}
                      </span>
                      <button
                        className="card-open"
                        aria-label={`View ${item.title}`}
                        onClick={() => setModal({ type: "view", item })}
                      >
                        <Icon name="arrow" size={18} />
                      </button>
                    </div>
                    {admin && (
                      <div className="card-admin">
                        <span>{item.opens || 0} opens</span>
                        <button
                          className="text-button"
                          onClick={() => setModal({ type: "edit", item })}
                        >
                          <Icon name="edit" size={14} />
                          Edit
                        </button>
                        <button
                          className="text-button delete-text"
                          onClick={() => setModal({ type: "delete", item })}
                        >
                          <Icon name="trash" size={14} />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <section className="empty-state">
              <span>
                <Icon
                  name={search || category !== "all" ? "search" : "book"}
                  size={34}
                />
              </span>
              <h3>
                {items.length
                  ? "No matching resources"
                  : "Your team’s next chapter starts here"}
              </h3>
              <p>
                {items.length
                  ? "Try a different search, category, or content type."
                  : admin
                    ? "Upload your first video, PDF, or HTML page to give your team something worth knowing."
                    : "Your administrators haven’t shared any content yet. Check back soon."}
              </p>
              {items.length ? (
                <button
                  className="btn"
                  onClick={() => {
                    setKind("all");
                    setSearch("");
                    setCategory("all");
                  }}
                >
                  Clear filters
                </button>
              ) : (
                admin && (
                  <button
                    className="btn primary"
                    onClick={() => setModal({ type: "create" })}
                  >
                    <Icon name="plus" size={17} />
                    Add your first resource
                  </button>
                )
              )}
            </section>
          )}
          <footer className="main-footer">
            <span>Knowledge is better when it’s shared.</span>
            <span>
              <Icon name="shield" size={14} />
              For your team, with care.
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={17} />
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {admin && ["create", "edit"].includes(modal?.type) && (
        <ContentForm
          item={modal.item}
          limits={config.limits}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}{" "}
      {admin && modal?.type === "delete" && (
        <DeleteModal
          item={modal.item}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}{" "}
      {modal?.type === "view" && (
        <Modal
          title={modal.item.title}
          wide
          onClose={() => {
            setModal(null);
            if (admin) loadItems();
          }}
        >
          <div className="item-meta">
            <span className="kind-tag">{kinds[modal.item.kind]}</span>
            <span>{modal.item.category}</span>
            <span>Updated {date(modal.item.updated_at)}</span>
          </div>
          {modal.item.description && (
            <p className="view-description">{modal.item.description}</p>
          )}
          <ContentViewer key={modal.item.id} item={modal.item} user={user} />
        </Modal>
      )}
    </div>
  );
}
class ErrorBoundary extends Component {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="splash">
        <Brand />
        <h1>Something didn’t load correctly.</h1>
        <p>Please reload the page to reopen your workspace.</p>
        <button className="btn primary" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
