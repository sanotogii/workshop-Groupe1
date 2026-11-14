"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import "./chat.css";
import LoadingSteps from "./components/LoadingSteps";
import WelcomeNotice from "./components/WelcomeNotice";

type Kind = "pdf" | "image" | "html" | "other";
type Theme = "light" | "dark";
type Option = { fileId?: string; fileName: string };
type FileInfo = {
  key: string;
  fileName: string;
  url: string; // blob: URL for stored files, or the Drive link for remote ones
  kind: Kind;
  label: string;
  size: number;
  remote?: boolean; // true = Google Drive link (nothing stored in the browser)
  previewUrl?: string; // Drive embed URL (…/preview), only if the type can be previewed
};
type Msg = {
  id: string;
  role: "user" | "bot";
  text: string;
  options?: Option[];
  file?: FileInfo;
};
type Chat = { id: string; title: string; updatedAt: number; messages: Msg[] };

const KEY = "drivebot:chats";
const ACTIVE = "drivebot:active";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const makeChat = (): Chat => ({
  id: uid(),
  title: "New chat",
  updatedAt: Date.now(),
  messages: [],
});
const titleFrom = (t: string) =>
  t.length > 42 ? t.slice(0, 42).trim() + "…" : t;

const SUGGESTIONS = [
  "Send me TP 3 of Devops 2",
  "chapitre 1 devsecops",
  "slides big data",
  "TP api et architecture microservice",
];

const LABELS: Record<string, string> = {
  pdf: "PDF",
  pptx: "PowerPoint",
  ppt: "PowerPoint",
  xlsx: "Excel",
  xls: "Excel",
  docx: "Word",
  doc: "Word",
  csv: "CSV",
  zip: "ZIP",
  html: "HTML",
};

// Extensions Google Drive can render in its embedded /preview viewer
const DRIVE_PREVIEWABLE = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "txt",
  "csv",
]);

/* ---------- IndexedDB (files are stored here, chat text in localStorage) ---------- */
let dbPromise: Promise<IDBDatabase> | null = null;
const getDB = () => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open("drivebot", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("files");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
};
async function putBlob(key: string, blob: Blob) {
  const db = await getDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(blob, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function getBlob(key: string): Promise<Blob | undefined> {
  const db = await getDB();
  return new Promise((res, rej) => {
    const r = db.transaction("files").objectStore("files").get(key);
    r.onsuccess = () => res(r.result as Blob | undefined);
    r.onerror = () => rej(r.error);
  });
}
async function delBlobs(keys: string[]) {
  if (!keys.length) return;
  const db = await getDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction("files", "readwrite");
    keys.forEach((k) => tx.objectStore("files").delete(k));
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/* ---------- file helpers ---------- */
const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

function kindOf(ext: string, mime: string): Kind {
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (
    mime.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)
  )
    return "image";
  if (mime === "text/html" || ext === "html") return "html";
  return "other";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const fileMeta = (f: FileInfo) =>
  f.remote ? `${f.label} · Google Drive` : `${f.label} · ${formatSize(f.size)}`;

function buildFile(
  b64: string,
  mimeIn: string,
  fileName: string,
): { file: FileInfo; blob: Blob } {
  const ext = extOf(fileName);
  const kind = kindOf(ext, mimeIn);
  const mime =
    kind === "pdf"
      ? "application/pdf"
      : kind === "html"
        ? "text/html"
        : mimeIn || "application/octet-stream";
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes as BlobPart], { type: mime });
  return {
    blob,
    file: {
      key: uid(),
      fileName,
      url: URL.createObjectURL(blob),
      kind,
      label: LABELS[ext] ?? (ext ? ext.toUpperCase() : "File"),
      size: bytes.length,
    },
  };
}

/* Google Drive link -> FileInfo with an embeddable preview URL */
function buildLink(url: string, fileName: string): FileInfo {
  const ext = extOf(fileName);
  const id =
    url.match(/\/d\/([\w-]+)/)?.[1] ?? url.match(/[?&]id=([\w-]+)/)?.[1];
  return {
    key: uid(),
    fileName,
    url,
    kind: kindOf(ext, ""),
    label: LABELS[ext] ?? (ext ? ext.toUpperCase() : "File"),
    size: 0,
    remote: true,
    previewUrl:
      id && DRIVE_PREVIEWABLE.has(ext)
        ? `https://drive.google.com/file/d/${id}/preview`
        : undefined,
  };
}

/* ---------- icons ---------- */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const DocIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h6" />
  </svg>
);
const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
const MenuIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </svg>
);
const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </svg>
);
const ExternalIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
    <path d="M14 4h6v6" />
    <path d="M20 4l-9 9" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
    <path d="M12 4v11" />
    <path d="M7 11l5 5 5-5" />
    <path d="M5 20h14" />
  </svg>
);

/* ---------- file card ---------- */
function FileCard({
  file,
  active,
  onOpen,
}: {
  file: FileInfo;
  active: boolean;
  onOpen: () => void;
}) {
  const gone = !file.url;
  return (
    <button
      className={`file ${active ? "active" : ""}`}
      onClick={onOpen}
      disabled={gone}
    >
      <span className={`file-thumb ${file.kind}`}>
        {file.kind === "image" && !gone && !file.remote ? (
          <img src={file.url} alt="" />
        ) : (
          <DocIcon />
        )}
      </span>
      <span className="file-info">
        <span className="file-name">{file.fileName}</span>
        <span className="file-meta">
          {gone ? "No longer stored in this browser" : fileMeta(file)}
        </span>
      </span>
    </button>
  );
}

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [theme, setTheme] = useState<Theme>("light");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [preview, setPreview] = useState<FileInfo | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeRef = useRef("");
  activeRef.current = activeId;

  const active = chats.find((c) => c.id === activeId);
  const messages = active?.messages ?? [];
  const busy = loadingId !== null;
  const loading = busy && loadingId === activeId;
  const history = chats
    .filter((c) => c.messages.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  /* load saved chats + rebuild file URLs from IndexedDB (Drive links are kept as-is) */
  useEffect(() => {
    (async () => {
      let saved: Chat[] = [];
      try {
        saved = JSON.parse(localStorage.getItem(KEY) || "[]") as Chat[];
      } catch {}
      for (const c of saved) {
        for (const m of c.messages) {
          if (!m.file || m.file.remote) continue;
          try {
            const blob = await getBlob(m.file.key);
            m.file.url = blob ? URL.createObjectURL(blob) : "";
          } catch {
            m.file.url = "";
          }
        }
      }
      let last: string | null = null;
      try {
        last = localStorage.getItem(ACTIVE);
      } catch {}
      if (last && saved.some((c) => c.id === last)) {
        setChats(saved);
        setActiveId(last);
      } else {
        const fresh = makeChat();
        setChats([fresh, ...saved]);
        setActiveId(fresh.id);
      }
      setSidebarOpen(window.innerWidth > 900);
      setLoaded(true);
    })();
  }, []);

  /* save chats (blob URLs are dropped; Drive links are real URLs so they are kept) */
  useEffect(() => {
    if (!loaded) return;
    const toSave = chats
      .filter((c) => c.messages.length > 0)
      .map((c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.file && !m.file.remote ? { ...m, file: { ...m.file, url: "" } } : m,
        ),
      }));
    try {
      localStorage.setItem(KEY, JSON.stringify(toSave));
      localStorage.setItem(ACTIVE, activeId);
    } catch {}
  }, [chats, activeId, loaded]);

  /* theme set by the script in layout.tsx */
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    if (t === "dark" || t === "light") setTheme(t);
  }, []);

  useEffect(() => {
    const onKey = (e: { key: string }) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading, activeId]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  function openPreview(file: FileInfo) {
    if (!file.url) return;
    setZoomed(false);
    setPreview(file);
    if (window.innerWidth < 1400) setSidebarOpen(false); // make room for the panel
  }

  function closeSidebarOnMobile() {
    if (window.innerWidth <= 900) setSidebarOpen(false);
  }

  function startNewChat() {
    setPreview(null);
    setInput("");
    const empty = chats.find((c) => c.messages.length === 0);
    if (empty) {
      setActiveId(empty.id);
    } else {
      const c = makeChat();
      setChats((p) => [c, ...p]);
      setActiveId(c.id);
    }
    closeSidebarOnMobile();
  }

  function selectChat(id: string) {
    setPreview(null);
    setInput("");
    setActiveId(id);
    closeSidebarOnMobile();
  }

  function deleteChat(id: string) {
    const c = chats.find((x) => x.id === id);
    if (!c) return;
    const keys: string[] = [];
    c.messages.forEach((m) => {
      if (m.file && !m.file.remote) {
        keys.push(m.file.key);
        if (m.file.url) URL.revokeObjectURL(m.file.url);
      }
    });
    delBlobs(keys).catch(() => {});

    const rest = chats.filter((x) => x.id !== id);
    if (id === activeId) {
      setPreview(null);
      const empty = rest.find((x) => x.messages.length === 0);
      if (empty) {
        setChats(rest);
        setActiveId(empty.id);
      } else {
        const n = makeChat();
        setChats([n, ...rest]);
        setActiveId(n.id);
      }
    } else {
      setChats(rest);
    }
  }

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || busy || !activeId) return;

    const chatId = activeId;
    const append = (msg: Msg) =>
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: [...c.messages, msg],
                updatedAt: Date.now(),
                title:
                  c.messages.length === 0 && msg.role === "user"
                    ? titleFrom(msg.text)
                    : c.title,
              }
            : c,
        ),
      );

    append({ id: uid(), role: "user", text: prompt });
    setInput("");
    setLoadingId(chatId);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, channel_id: chatId }),
      });
      const raw = await res.json();
      const data = Array.isArray(raw) ? raw[0] : raw;

      if (data?.type === "link" && data.url) {
        // New: workflow returns a Google Drive link
        const file = buildLink(data.url, data.fileName || "file");
        append({
          id: uid(),
          role: "bot",
          text: data.message || "Here is your file.",
          file,
        });
        if (activeRef.current === chatId) openPreview(file);
      } else if (data?.type === "file" && data.base64) {
        // Old behaviour: workflow returns the file itself as base64
        const { file, blob } = buildFile(
          data.base64,
          data.mimeType || "",
          data.fileName || "file",
        );
        try {
          await putBlob(file.key, blob);
        } catch {}
        append({
          id: uid(),
          role: "bot",
          text: data.message || "Here is your file.",
          file,
        });
        if (file.kind !== "other" && activeRef.current === chatId)
          openPreview(file);
      } else if (data?.type === "clarify") {
        append({
          id: uid(),
          role: "bot",
          text: data.message || "Which one do you mean?",
          options: data.options ?? [],
        });
      } else {
        append({
          id: uid(),
          role: "bot",
          text: data?.message || "Something went wrong, try again.",
        });
      }
    } catch {
      append({
        id: uid(),
        role: "bot",
        text: "Connection error. Please try again.",
      });
    } finally {
      setLoadingId(null);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  if (!loaded) return <div className="shell" />;

  return (
    <div className="shell">
    <WelcomeNotice />

      {/* ---------- sidebar ---------- */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="side-head">
          <span>Chats</span>
          <button
            className="icon-btn"
            onClick={() => setSidebarOpen(false)}
            title="Close sidebar"
          >
            <CloseIcon />
          </button>
        </div>
        <button className="new-chat" onClick={startNewChat}>
          + New chat
        </button>
        <div className="side-label">Recents</div>
        {history.length === 0 ? (
          <div className="side-empty">No chats yet</div>
        ) : (
          <ul className="chat-list">
            {history.map((c) => (
              <li key={c.id} className={c.id === activeId ? "active" : ""}>
                <button className="chat-item" onClick={() => selectChat(c.id)}>
                  {c.title}
                </button>
                <button
                  className="chat-del"
                  onClick={() => deleteChat(c.id)}
                  title="Delete chat"
                  aria-label="Delete chat"
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <div
        className={`backdrop ${sidebarOpen ? "show" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* ---------- main ---------- */}
      <div className="app">
        <header className="topbar">
          <div className="top-left">
            <button
              className="icon-btn"
              onClick={() => setSidebarOpen((o) => !o)}
              title="Toggle sidebar"
              aria-label="Toggle sidebar"
            >
              <MenuIcon />
            </button>
            <div className="brand">
              <span className="spark">✻</span> DCC Notes
            </div>
          </div>
          <div className="top-actions">
            <button
              className="icon-btn"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <button className="ghost" onClick={startNewChat}>
              + New chat
            </button>
          </div>
        </header>

        <main className={`thread ${messages.length === 0 ? "is-empty" : ""}`}>
          {messages.length === 0 ? (
            <div className="empty">
              <div className="spark big">✻</div>
              <h1>What file do you need?</h1>
              <p>
                Tell me the course, TP or chapter and I&apos;ll fetch it for you.
              </p>
              <div className="chips">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages">
              {messages.map((m, i) => {
                const isLast = i === messages.length - 1;
                const f = m.file;
                return m.role === "user" ? (
                  <div key={m.id} className="row user">
                    <div className="bubble">{m.text}</div>
                  </div>
                ) : (
                  <div key={m.id} className="row bot">
                    <span className="spark small">✻</span>
                    <div className="content">
                      <p className="text">{m.text}</p>

                      {m.options && m.options.length > 0 && (
                        <div className="options">
                          {m.options.map((o, idx) => (
                            <button
                              key={idx}
                              className="option"
                              disabled={!isLast || busy}
                              onClick={() =>
                                send(`I want this one: ${o.fileName}`)
                              }
                            >
                              <span className="num">{idx + 1}</span>
                              {o.fileName}
                            </button>
                          ))}
                        </div>
                      )}

                      {f && (
                        <>
                          {f.kind === "image" && f.url && !f.remote && (
                            <button
                              className="inline-img"
                              onClick={() => openPreview(f)}
                            >
                              <img src={f.url} alt={f.fileName} />
                            </button>
                          )}
                          <FileCard
                            file={f}
                            active={preview?.key === f.key}
                            onOpen={() => openPreview(f)}
                          />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="row bot">
                  <span className="spark small">✻</span>
                  <LoadingSteps />
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </main>

        <footer className="composer-wrap">
          <div className="composer">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              placeholder="Ask for a file…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button
              className="send"
              onClick={() => send(input)}
              disabled={!input.trim() || busy}
              aria-label="Send"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                {...stroke}
                strokeWidth={2.4}
              >
                <path d="M12 19V5" />
                <path d="M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
          <p className="hint">
            Enter to send · Shift+Enter for a new line ·{" "}
            <a href="/privacy">Privacy</a>
          </p>
        </footer>
      </div>

      {/* ---------- preview panel ---------- */}
      {preview && (
        <aside className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <span className="panel-name">{preview.fileName}</span>
              <span className="panel-meta">{fileMeta(preview)}</span>
            </div>
            <div className="panel-actions">
              <a
                className="icon-btn"
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                title={preview.remote ? "Open in Google Drive" : "Open in new tab"}
              >
                <ExternalIcon />
              </a>
              {preview.remote ? (
                <a
                  className="btn-primary"
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalIcon /> Open in Drive
                </a>
              ) : (
                <a
                  className="btn-primary"
                  href={preview.url}
                  download={preview.fileName}
                >
                  <DownloadIcon /> Download
                </a>
              )}
              <button
                className="icon-btn"
                onClick={() => setPreview(null)}
                title="Close (Esc)"
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          <div className="panel-body">
            {/* Google Drive link: embedded Drive viewer */}
            {preview.remote && preview.previewUrl && (
              <iframe
                key={preview.previewUrl}
                src={preview.previewUrl}
                title={preview.fileName}
                allow="autoplay"
              />
            )}
            {preview.remote && !preview.previewUrl && (
              <div className="no-preview">
                <span className="file-thumb other big-thumb">
                  <DocIcon />
                </span>
                <h3>No preview available</h3>
                <p>
                  {preview.label} files can&apos;t be previewed here. Open it in
                  Google Drive to view or download it.
                </p>
                <a
                  className="btn-primary"
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalIcon /> Open in Drive
                </a>
              </div>
            )}

            {/* Stored file (base64 from the old workflow) */}
            {!preview.remote && preview.kind === "pdf" && (
              <iframe
                key={preview.url}
                src={`${preview.url}#view=FitH`}
                title={preview.fileName}
              />
            )}
            {!preview.remote && preview.kind === "html" && (
              <iframe
                key={preview.url}
                sandbox=""
                src={preview.url}
                title={preview.fileName}
              />
            )}
            {!preview.remote && preview.kind === "image" && (
              <div className={`img-stage ${zoomed ? "zoomed" : ""}`}>
                <img
                  src={preview.url}
                  alt={preview.fileName}
                  onClick={() => setZoomed((z) => !z)}
                />
              </div>
            )}
            {!preview.remote && preview.kind === "other" && (
              <div className="no-preview">
                <span className="file-thumb other big-thumb">
                  <DocIcon />
                </span>
                <h3>No preview available</h3>
                <p>
                  {preview.label} files can&apos;t be previewed in the browser.
                  Download it to open it on your device.
                </p>
                <a
                  className="btn-primary"
                  href={preview.url}
                  download={preview.fileName}
                >
                  <DownloadIcon /> Download
                </a>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
