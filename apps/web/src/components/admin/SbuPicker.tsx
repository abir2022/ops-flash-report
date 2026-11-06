import { useMemo, useState } from "react";
import type { SbuDim } from "../../types";
import { XIcon } from "../Icons";

interface SbuPickerProps {
  sbus: SbuDim[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
}

export function SbuPicker({ sbus, selected, onToggle, onSelectAll, onClear }: SbuPickerProps) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = sbus.filter(
      (s) =>
        !q ||
        s.code.toLowerCase().includes(q) ||
        (s.name ?? "").toLowerCase().includes(q)
    );
    const map = new Map<string, SbuDim[]>();
    for (const s of filtered) {
      const key = s.section && s.section.trim() ? s.section.trim() : "Others";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    const entries = Array.from(map.entries()).map(([section, items]) => ({
      section,
      items: items.slice().sort((a, b) => a.code.localeCompare(b.code)),
    }));
    entries.sort((a, b) => {
      if (a.section === "Others") return 1;
      if (b.section === "Others") return -1;
      return a.section.localeCompare(b.section);
    });
    return entries;
  }, [sbus, query]);

  const selectedList = useMemo(() => sbus.filter((s) => selected.has(s.id)), [sbus, selected]);

  function toggleGroup(items: SbuDim[]) {
    const allSelected = items.every((s) => selected.has(s.id));
    items.forEach((s) => {
      if (allSelected ? selected.has(s.id) : !selected.has(s.id)) onToggle(s.id);
    });
  }

  return (
    <div className="sbu-picker">
      <div className="sbu-picker-bar">
        <input
          type="search"
          className="sbu-picker-search"
          placeholder="Search by short name or full name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="sbu-picker-actions">
          <button type="button" className="btn-ghost sm" onClick={onSelectAll}>
            All
          </button>
          <button type="button" className="btn-ghost sm" onClick={onClear}>
            None
          </button>
        </div>
      </div>

      {selectedList.length > 0 && (
        <div className="sbu-picker-selected">
          <span className="sbu-picker-count">
            {selectedList.length} of {sbus.length} selected
          </span>
          {selectedList.map((s) => (
            <button
              key={s.id}
              type="button"
              className="sbu-tag"
              title={s.name ?? s.code}
              onClick={() => onToggle(s.id)}
            >
              {s.code}
              <span className="sbu-tag-x"><XIcon size={14} /></span>
            </button>
          ))}
        </div>
      )}

      <div className="sbu-picker-list">
        {groups.length === 0 && <p className="no-data">No SBUs match your search.</p>}
        {groups.map(({ section, items }) => {
          const allSelected = items.every((s) => selected.has(s.id));
          return (
            <div key={section} className="sbu-group">
              <div className="sbu-group-head">
                <span className="sbu-group-title">{section}</span>
                <span className="sbu-group-count">{items.length}</span>
                <button
                  type="button"
                  className="btn-ghost sm"
                  onClick={() => toggleGroup(items)}
                >
                  {allSelected ? "Clear group" : "Select group"}
                </button>
              </div>
              {items.map((s) => (
                <label key={s.id} className="sbu-row">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => onToggle(s.id)}
                  />
                  <span className="sbu-row-code">{s.code}</span>
                  <span className="sbu-row-name">{s.name ?? ""}</span>
                </label>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
