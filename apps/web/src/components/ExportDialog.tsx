import { useEffect, useState } from "react";
import { EXPORT_SECTIONS, type ExportSection } from "./ExportView";

interface ExportDialogProps {
  open: boolean;
  onExport: (sections: ExportSection[]) => void;
  onClose: () => void;
}

export function ExportDialog({ open, onExport, onClose }: ExportDialogProps) {
  const [selected, setSelected] = useState<ExportSection[]>(() =>
    EXPORT_SECTIONS.map((s) => s.id)
  );

  useEffect(() => {
    if (open) setSelected(EXPORT_SECTIONS.map((s) => s.id));
  }, [open]);

  if (!open) return null;

  const toggle = (id: ExportSection) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="export-dialog-backdrop" onClick={onClose}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="export-dialog-head">
          <h2>Export report</h2>
          <span className="export-dialog-sub">Select the tabs to include in the PDF</span>
        </div>
        <div className="export-dialog-options">
          {EXPORT_SECTIONS.map((s) => (
            <label key={s.id} className="export-dialog-option">
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={() => toggle(s.id)}
              />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
        <div className="export-dialog-actions">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn"
            disabled={selected.length === 0}
            onClick={() => onExport(selected)}
          >
            Export ({selected.length})
          </button>
        </div>
      </div>
    </div>
  );
}
