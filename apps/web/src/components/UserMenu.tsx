import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "./Icons";

export interface UserMenuItem {
  id: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export type UserRoleTone = "admin" | "view" | "romi" | "both";

interface UserMenuProps {
  email: string;
  name?: string | null;
  roleLabel: string;
  roleTone: UserRoleTone;
  sbuCodes: string[];
  items: UserMenuItem[];
}

export function UserMenu({
  email,
  name,
  roleLabel,
  roleTone,
  sbuCodes,
  items,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = (name ?? email ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        className="user-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="user-avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="user-menu-email">{email}</span>
        <span className="user-chevron" aria-hidden="true">
          <ChevronDownIcon size={14} />
        </span>
      </button>

      {open && (
        <div className="user-menu-panel" role="menu">
          <div className="user-menu-head">
            <div className="user-menu-email user-menu-email-full">{email}</div>
            <span className={`user-role-badge role-${roleTone}`}>{roleLabel}</span>
            {sbuCodes.length > 0 && (
              <div className="user-menu-sbus">
                <span className="user-menu-sbus-label">Responsible SBUs</span>
                <span className="user-menu-sbus-codes">{sbuCodes.join(", ")}</span>
              </div>
            )}
          </div>

          <div className="user-menu-divider" />

          <div className="user-menu-items">
            {items.map((item) => (
              <button
                key={item.id}
                className={`user-menu-item${item.danger ? " danger" : ""}`}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
