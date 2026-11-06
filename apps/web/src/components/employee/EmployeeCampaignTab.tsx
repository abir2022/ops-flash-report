import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  employeeListCampaigns,
  employeeSubmitCampaign,
  fetchEmployeeProfile,
  fetchRomiSurveyForm,
} from "../../api/client";
import type { EmployeeProfile, RomiSurveyForm } from "../../types";

// Field keys that map to fixed romi_campaign columns (mirrors the Input
// Campaign survey). Any other field is stored in extra_fields.
const RESERVED_KEYS = ["campaign_name", "category", "start_date", "end_date", "expense"];

export function EmployeeCampaignTab() {
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [survey, setSurvey] = useState<RomiSurveyForm | null>(null);
  const [campaigns, setCampaigns] = useState<Awaited<ReturnType<typeof employeeListCampaigns>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [sbuId, setSbuId] = useState<number | "">("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [p, f, c] = await Promise.all([
        fetchEmployeeProfile(),
        fetchRomiSurveyForm(),
        employeeListCampaigns(),
      ]);
      setProfile(p);
      setSurvey(f);
      setCampaigns(c);
      if (p && p.allowed_sbus.length === 1) setSbuId(p.allowed_sbus[0]);
      if (f?.fields) {
        setValues((prev) => {
          const next = { ...prev };
          for (const field of f.fields) {
            if (field.type === "select" && field.options?.length && next[field.key] === undefined) {
              next[field.key] = field.options[0];
            }
          }
          return next;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employee data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const fields = useMemo(() => survey?.fields ?? [], [survey]);

  function setValue(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOk(false);
    setBusy(true);
    try {
      if (sbuId === "") throw new Error("Select the SBU for this campaign.");
      const campaignName = (values["campaign_name"] ?? "").trim();
      if (!campaignName) throw new Error("Campaign name is required.");
      const category = values["category"] ?? "Other";
      const startDate = values["start_date"] ?? "";
      const endDate = values["end_date"] ?? "";
      if (!startDate || !endDate) throw new Error("Start and end dates are required.");
      if (endDate < startDate) throw new Error("End date is before start date.");
      const expenseNum = Number(values["expense"] ?? "");
      if (!Number.isFinite(expenseNum) || expenseNum <= 0) {
        throw new Error("Enter a valid campaign expense greater than zero.");
      }

      const extraObj: Record<string, unknown> = {};
      for (const f of fields) {
        if (RESERVED_KEYS.includes(f.key)) continue;
        const v = values[f.key];
        if (v === undefined || v === "") continue;
        extraObj[f.key] = f.type === "number" ? Number(v) : v;
      }

      await employeeSubmitCampaign({
        sbu_id: Number(sbuId),
        campaign_name: campaignName,
        category,
        start_date: startDate,
        end_date: endDate,
        marketing_expense_total: expenseNum,
        extra_fields: Object.keys(extraObj).length ? extraObj : undefined,
      });
      setOk(true);
      setValues((prev) => {
        const next: Record<string, string> = {};
        for (const key of Object.keys(prev)) {
          const f = fields.find((x) => x.key === key);
          if (f?.type === "select" && f.options?.length) next[key] = f.options[0];
        }
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit campaign");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="loading-screen">Loading your SBUs…</div>;

  const sbuLabel = (id: number) => {
    if (!profile) return "";
    const i = profile.allowed_sbus.indexOf(id);
    const code = i >= 0 ? profile.sbu_codes[i] : "";
    const nm = i >= 0 ? profile.sbu_names[i] : null;
    return nm ? `${code} — ${nm}` : code;
  };

  return (
    <div className="marketing-tab">
      <div className="biir-hero">
        <div>
          <h2>Campaign Entry</h2>
          <p className="biir-hero-sub">
            {profile
              ? `${profile.name} · ${profile.sbu_codes.join(", ")}`
              : "Submit campaign data for your SBU"}
          </p>
        </div>
        <div className="biir-hero-meta">
          <span className="badge badge-ok">Employee · {profile ? profile.sbu_codes.join(", ") : "—"}</span>
        </div>
      </div>

      <div className="admin-grid">
        <section className="admin-card">
          <h3>New campaign</h3>
          <form onSubmit={submit} className="admin-form">
            <label>
              <span>SBU</span>
              <select
                value={sbuId}
                onChange={(e) => setSbuId(e.target.value === "" ? "" : Number(e.target.value))}
                required
              >
                <option value="">—</option>
                {profile?.allowed_sbus.map((id) => (
                  <option key={id} value={id}>{sbuLabel(id)}</option>
                ))}
              </select>
            </label>

            {fields.map((f) => {
              const val = values[f.key] ?? "";
              return (
                <label key={f.key}>
                  <span>{f.label}</span>
                  {f.type === "select" && f.options?.length ? (
                    <select
                      value={val}
                      onChange={(e) => setValue(f.key, e.target.value)}
                      required={f.required}
                    >
                      {!f.required && <option value="">—</option>}
                      {f.options.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : f.type === "number" ? (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={val}
                      onChange={(e) => setValue(f.key, e.target.value)}
                      required={f.required}
                    />
                  ) : f.type === "date" ? (
                    <input
                      type="date"
                      value={val}
                      onChange={(e) => setValue(f.key, e.target.value)}
                      required={f.required}
                    />
                  ) : (
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => setValue(f.key, e.target.value)}
                      required={f.required}
                    />
                  )}
                </label>
              );
            })}

            <button type="submit" className="btn" disabled={busy}>
              {busy ? "Submitting…" : "Submit campaign"}
            </button>
            {ok && <div className="ok-note">Campaign submitted.</div>}
            {error && <div className="login-error">{error}</div>}
          </form>
        </section>

        <section className="admin-card">
          <h3>My submissions</h3>
          {campaigns.length === 0 ? (
            <p className="no-data">No campaigns submitted yet.</p>
          ) : (
            <div className="mk-table-wrap">
              <table className="scorecard-table mk-table">
                <thead>
                  <tr>
                    <th>SBU</th>
                    <th>Campaign</th>
                    <th>Category</th>
                    <th className="num">Expense (BDT)</th>
                    <th>Month</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="code">{c.sbu_code ?? "—"}</span>
                      </td>
                      <td>
                        <span className="code">{c.campaign_name}</span>
                      </td>
                      <td>{c.category ?? "—"}</td>
                      <td className="num">
                        {c.marketing_expense_total !== null
                          ? c.marketing_expense_total.toLocaleString("en-US")
                          : "—"}
                      </td>
                      <td>{c.report_month ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
