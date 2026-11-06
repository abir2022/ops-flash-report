import { useState } from "react";
import { TERMS } from "../lib/glossary";
import { HelpIcon, XIcon } from "./Icons";

export function Glossary() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="glossary-btn"
        aria-label="What do these terms mean?"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <HelpIcon size={18} />
      </button>

      {open && (
        <div className="glossary-backdrop" onClick={() => setOpen(false)}>
          <div
            className="glossary-modal"
            role="dialog"
            aria-label="Glossary"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="glossary-head">
              <h2>What do these terms mean?</h2>
              <button className="close-btn" aria-label="Close glossary" onClick={() => setOpen(false)}>
                <XIcon size={14} />
              </button>
            </div>
            <dl className="glossary-list">
              {TERMS.map((t) => (
                <div className="glossary-item" key={t.term}>
                  <dt>{t.term}</dt>
                  <dd>{t.meaning}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </>
  );
}
