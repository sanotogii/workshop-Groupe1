"use client";

import { useEffect, useRef, useState } from "react";
import "./welcome-notice.css";

// Change this key to show the pop-up again to everyone (e.g. "…fuzzy-v2")
const SEEN_KEY = "drivebot:notice:fuzzy-v1";

export default function WelcomeNotice() {
  const [open, setOpen] = useState(false);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  function close() {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
  }

  useEffect(() => {
    if (!open) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="wn-backdrop" onClick={close}>
      <div
        className="wn-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wn-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="wn-head">
          <span className="wn-eyebrow">What&apos;s new</span>
          <h2 id="wn-title">DCC Notes v2 is here</h2>
        </header>

        <div className="wn-body">
          <p id="wn-description">
            I stopped using AI to answer requests which takes more time and less available. The bot now finds files with
            fuzzy search, which is faster and doesn&apos;t depend on an AI
            service being up.
          </p>

          <p className="wn-sub">How to ask</p>
          <ul>
            <li>
              Say the course, then TP, chapitre or workshop, then the number:{" "}
              <code>tp 3 devops 2</code>
            </li>
            <li>
              Use words that appear in the file name. It matches spelling, not
              meaning, so describing the content won&apos;t work.
            </li>
            <li>
              Typos are fine. Add <code>pdf</code>, <code>powerpoint</code> or{" "}
              <code>image</code> if you want a specific format.
            </li>
            <li>If several files match, you&apos;ll get a list to pick from.</li>
          </ul>

          <div className="wn-actions">
            <button ref={okRef} className="wn-ok" onClick={close}>
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
