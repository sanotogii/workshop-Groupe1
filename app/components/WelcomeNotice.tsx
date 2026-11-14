"use client";

import { useEffect, useRef, useState } from "react";
import "./welcome-notice.css";

// Bumped so everyone sees the new two-step notice again
const SEEN_KEY = "drivebot:notice:list-v1";
const TOTAL_STEPS = 2;

export default function WelcomeNotice() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const primaryRef = useRef<HTMLButtonElement>(null);

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

  const isLast = step === TOTAL_STEPS - 1;

  // focus the main button whenever the pop-up opens or the step changes
  useEffect(() => {
    if (open) primaryRef.current?.focus();
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
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
          <span className="wn-eyebrow">
            {step === 0 ? "What\u2019s new" : "New command"}
          </span>
          <h2 id="wn-title">
            {step === 0 ? "DCC Notes v2 is here" : "Meet the list command"}
          </h2>
        </header>

        <div className="wn-body">
          {step === 0 ? (
            <div className="wn-step" key="step-1">
              <p id="wn-description">
                I stopped using AI to answer requests because it was slower and
                less reliable. The bot now finds files with fuzzy search, which
                is faster and doesn&apos;t depend on an AI service being up.
              </p>

              <p className="wn-sub">How to ask</p>
              <ul>
                <li>
                  Say the course, then TP, chapitre or workshop, then the
                  number: tp 3 devops 2
                </li>
                <li>
                  Use words that appear in the file name. It matches spelling,
                  not meaning, so describing the content won&apos;t work.
                </li>
                <li>
                  Typos are fine. Add pdf, powerpoint
                  or image if you want a specific format.
                </li>
                <li>
                  If several files match, you&apos;ll get a list to pick from.
                </li>
              </ul>
            </div>
          ) : (
            <div className="wn-step" key="step-2">
              <p>
                Not sure what&apos;s in a course? Start your message with{" "}
                list and the bot shows every matching file instead
                of just one. Tap a file in the result to get its link.
              </p>

              <p className="wn-sub">Examples</p>
              <ul>
                <li>
                  <code>list devops 2</code> shows every file of the module:
                  chapters and TPs.
                </li>
                <li>
                  <code>list devops 2 tps</code> shows only its TPs. Same with{" "}
                  <code>td</code> for exercises.
                </li>
                <li>
                  <code>list devops 2 pdf</code> keeps only the PDFs. Works with{" "}
                  <code>image</code> and <code>word</code> too.
                </li>
                <li>
                  Nicknames and typos work: <code>list admin</code>,{" "}
                  <code>list ml</code>, <code>list dvops 2</code>.
                </li>
              </ul>
            </div>
          )}

          <div className="wn-actions">
            <div
              className="wn-dots"
              role="group"
              aria-label={`Step ${step + 1} of ${TOTAL_STEPS}`}
            >
              {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`wn-dot${i === step ? " is-active" : ""}`}
                  aria-label={`Go to step ${i + 1}`}
                  aria-current={i === step ? "step" : undefined}
                  onClick={() => setStep(i)}
                />
              ))}
            </div>

            <div className="wn-btns">
              {step > 0 && (
                <button
                  type="button"
                  className="wn-back"
                  onClick={() => setStep(step - 1)}
                >
                  Back
                </button>
              )}
              <button
                ref={primaryRef}
                type="button"
                className="wn-ok"
                onClick={isLast ? close : () => setStep(step + 1)}
              >
                {isLast ? "Got it" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
