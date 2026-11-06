import { useId, useState } from "react";
import { termMeaning } from "../lib/glossary";

// Inline glossary term: dotted-underline + accessible popover (hover, focus,
// and tap). Replaces the hover-only ::after tooltips for acronyms.
export function Term({ children }: { children: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const meaning = termMeaning(children);

  return (
    <span className="term">
      <button
        type="button"
        className="term-btn"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
      >
        {children}
      </button>
      {meaning && (
        <span id={id} role="tooltip" className="term-pop" data-open={open}>
          {meaning}
        </span>
      )}
    </span>
  );
}
