import { useCallback, useEffect, useState } from "react";
import {
  adminSaveSurveyForm,
  fetchRomiSurveyForm,
} from "../../api/client";
import type { RomiSurveyField } from "../../types";
import { ArrowLeftIcon, XIcon } from "../Icons";

const FIELD_TYPES: { value: RomiSurveyField["type"]; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select (options)" },
];

function blankField(): RomiSurveyField {
  return { key: "", label: "", type: "text", required: false };
}

export function SurveyFormEditor({ onDone }: { onDone?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<RomiSurveyField[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const form = await fetchRomiSurveyForm();
      setTitle(form?.title ?? "");
      setDescription(form?.description ?? "");
      setFields(form?.fields ?? []);
      setIsActive(form?.is_active ?? true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load survey form");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateField(index: number, patch: Partial<RomiSurveyField>) {
    setFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );
  }

  function moveField(index: number, dir: -1 | 1) {
    setFields((prev) => {
      const next = [...prev];
      const to = index + dir;
      if (to < 0 || to >= next.length) return prev;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  async function save() {
    setError("");
    setOk(false);
    setBusy(true);
    try {
      const clean: RomiSurveyField[] = fields
        .filter((f) => f.key.trim() !== "" && f.label.trim() !== "")
        .map((f) => {
          const out: RomiSurveyField = {
            key: f.key.trim(),
            label: f.label.trim(),
            type: f.type,
            required: f.required,
          };
          if (f.type === "select") {
            out.options = (f.options ?? [])
              .map((o) => o.trim())
              .filter((o) => o !== "");
          }
          return out;
        });
      await adminSaveSurveyForm({
        title: title.trim(),
        description: description.trim(),
        fields: clean,
        is_active: isActive,
      });
      setOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save survey form");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="loading-screen">Loading survey form…</div>;

  return (
    <div className="survey-editor">
      <div className="biir-hero">
        <div>
          <h2>ROMI Survey Form</h2>
          <p className="biir-hero-sub">
            Define the optional questions ROMI users fill in when submitting a campaign.
          </p>
        </div>
        <div className="biir-hero-meta">
          <span className={`badge ${isActive ? "badge-ok" : "badge-stall"}`}>
            {isActive ? "Active" : "Inactive"}
          </span>
          {onDone && (
            <button className="btn-ghost" onClick={onDone}>
              <span className="btn-label">
                <ArrowLeftIcon size={16} />
                Back to report
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="admin-card">
        <h3>Form details</h3>
        <div className="admin-form">
          <label>
            <span>Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Campaign details"
            />
          </label>
          <label>
            <span>Description</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional instructions shown above the questions"
            />
          </label>
          <label className="survey-toggle">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Active — shown to ROMI users</span>
          </label>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-sbu-head">
          <h3>Questions ({fields.length})</h3>
          <button className="btn" onClick={() => setFields((p) => [...p, blankField()])}>
            + Add question
          </button>
        </div>

        {fields.length === 0 ? (
          <p className="no-data">No questions yet. Add one to collect extra campaign data.</p>
        ) : (
          <div className="field-list">
            {fields.map((f, i) => (
              <div className="field-row" key={i}>
                <div className="field-move">
                  <button
                    className="close-btn"
                    onClick={() => moveField(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    className="close-btn"
                    onClick={() => moveField(i, 1)}
                    disabled={i === fields.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                </div>
                <label>
                  <span>Key</span>
                  <input
                    type="text"
                    value={f.key}
                    onChange={(e) => updateField(i, { key: e.target.value })}
                    placeholder="engineer_count"
                  />
                </label>
                <label>
                  <span>Label</span>
                  <input
                    type="text"
                    value={f.label}
                    onChange={(e) => updateField(i, { label: e.target.value })}
                    placeholder="Number of engineers met"
                  />
                </label>
                <label>
                  <span>Type</span>
                  <select
                    value={f.type}
                    onChange={(e) =>
                      updateField(i, {
                        type: e.target.value as RomiSurveyField["type"],
                        options: e.target.value === "select" ? f.options ?? [] : undefined,
                      })
                    }
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                {f.type === "select" && (
                  <label>
                    <span>Options (comma-separated)</span>
                    <input
                      type="text"
                      value={(f.options ?? []).join(", ")}
                      onChange={(e) =>
                        updateField(i, {
                          options: e.target.value.split(","),
                        })
                      }
                      placeholder="Option A, Option B"
                    />
                  </label>
                )}
                <label className="survey-toggle">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) => updateField(i, { required: e.target.checked })}
                  />
                  <span>Required</span>
                </label>
                <button
                  className="close-btn field-remove"
                  onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label="Remove question"
                >
                  <XIcon size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="survey-actions">
        <button className="btn" onClick={save} disabled={busy || title.trim() === ""}>
          {busy ? "Saving…" : "Save survey form"}
        </button>
        {ok && <span className="ok-note">Saved.</span>}
        {error && <span className="login-error">{error}</span>}
      </div>
    </div>
  );
}
