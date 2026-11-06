import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  adminCreateEmployee,
  adminDeleteEmployee,
  adminListEmployees,
  adminReactivateEmployee,
  adminResetEmployeePassword,
  adminRevokeEmployee,
  adminUpdateEmployee,
  fetchRefreshStatus,
  fetchSbus,
  requestRefresh,
} from "../api/client";
import type { EmployeeCapability, EmployeeRow, RefreshRequestRow, SbuDim } from "../types";
import { SbuPicker } from "./admin/SbuPicker";
import { RomiResponsesPanel } from "./admin/RomiResponsesPanel";

function defaultExpiry(): string {
  const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

const refreshTone: Record<string, string> = {
  pending: "band-watch",
  running: "band-watch",
  success: "band-good",
  failed: "band-risk",
};

const CAPABILITIES: EmployeeCapability[] = ["view", "romi", "both"];

export function AdminPanel() {
  const [sbus, setSbus] = useState<SbuDim[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [revealedEmployee, setRevealedEmployee] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [eName, setEName] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eSbus, setESbus] = useState<Set<number>>(new Set());
  const [eCapability, setECapability] = useState<EmployeeCapability>("view");
  const [ePass, setEPass] = useState("");
  const [eExpiry, setEExpiry] = useState(defaultExpiry());
  const [eBusy, setEBusy] = useState(false);
  const [eError, setEError] = useState("");

  const [refreshReq, setRefreshReq] = useState<RefreshRequestRow | null>(null);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshError, setRefreshError] = useState("");

  const loadSbus = useCallback(async () => {
    try {
      setSbus(await fetchSbus());
    } catch {
      setSbus([]);
    }
  }, []);

  const refreshEmployees = useCallback(async () => {
    try {
      setEmployees(await adminListEmployees());
    } catch (e) {
      setEError(e instanceof Error ? e.message : "Failed to load employees");
    }
  }, []);

  const loadRefreshStatus = useCallback(async () => {
    try {
      setRefreshReq(await fetchRefreshStatus());
    } catch {
      setRefreshReq(null);
    }
  }, []);

  useEffect(() => {
    loadSbus();
    refreshEmployees();
    loadRefreshStatus();
  }, [loadSbus, refreshEmployees, loadRefreshStatus]);

  useEffect(() => {
    if (!refreshReq) return;
    if (refreshReq.status !== "pending" && refreshReq.status !== "running") return;
    const t = setInterval(loadRefreshStatus, 3000);
    return () => clearInterval(t);
  }, [refreshReq, loadRefreshStatus]);

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  function toggleEmployeeSbu(id: number) {
    setESbus((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createEmployee(e: FormEvent) {
    e.preventDefault();
    setEError("");
    setEBusy(true);
    try {
      const allowedSbus = Array.from(eSbus).sort((a, b) => a - b);
      await adminCreateEmployee({
        name: eName.trim(),
        email: eEmail.trim().toLowerCase(),
        phone: ePhone.trim(),
        allowed_sbus: allowedSbus,
        capability: eCapability,
        password: ePass,
        expires_at: eExpiry ? new Date(eExpiry).toISOString() : null,
      });
      setEName("");
      setEEmail("");
      setEPhone("");
      setESbus(new Set());
      setECapability("view");
      setEPass("");
      setEExpiry(defaultExpiry());
      await refreshEmployees();
    } catch (err) {
      setEError(err instanceof Error ? err.message : "Failed to create employee");
    } finally {
      setEBusy(false);
    }
  }

  async function revokeEmployee(id: string) {
    setEError("");
    try {
      await adminRevokeEmployee(id);
      await refreshEmployees();
    } catch (err) {
      setEError(err instanceof Error ? err.message : "Failed to revoke employee");
    }
  }

  async function reactivateEmployee(id: string) {
    setEError("");
    try {
      await adminReactivateEmployee(id);
      await refreshEmployees();
    } catch (err) {
      setEError(err instanceof Error ? err.message : "Failed to reactivate employee");
    }
  }

  async function updateEmployeeCapability(id: string, capability: EmployeeCapability) {
    setEError("");
    setUpdatingId(id);
    try {
      await adminUpdateEmployee(id, capability);
      await refreshEmployees();
    } catch (err) {
      setEError(err instanceof Error ? err.message : "Failed to update employee access");
    } finally {
      setUpdatingId(null);
    }
  }

  async function resetEmployeePw(id: string) {
    setEError("");
    try {
      await adminResetEmployeePassword(id);
      await refreshEmployees();
      setRevealedEmployee(id);
    } catch (err) {
      setEError(err instanceof Error ? err.message : "Failed to reset employee password");
    }
  }

  async function delEmployee(id: string) {
    setEError("");
    try {
      await adminDeleteEmployee(id);
      setRevealedEmployee(null);
      await refreshEmployees();
    } catch (err) {
      setEError(err instanceof Error ? err.message : "Failed to delete employee");
    }
  }

  async function doRefresh() {
    setRefreshError("");
    setRefreshBusy(true);
    try {
      setRefreshReq(await requestRefresh());
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Failed to request refresh");
    } finally {
      setRefreshBusy(false);
    }
  }

  return (
    <div className="admin-panel">
      <div className="admin-grid">
        <section className="admin-card">
          <h3>Refresh Database</h3>
          <p className="no-data">
            Pulls the latest numbers from the DWH into this report. The refresh runs on the
            office PC (it must be on and connected); this page just queues the request.
          </p>
          <button
            type="button"
            className="btn"
            disabled={refreshBusy || refreshReq?.status === "pending" || refreshReq?.status === "running"}
            onClick={doRefresh}
          >
            {refreshBusy ? "Requesting…" : "Refresh now"}
          </button>
          {refreshError && <div className="login-error">{refreshError}</div>}
          {refreshReq && (
            <div className="guest-row">
              <div className="guest-row-main">
                <div className="guest-user">
                  <span className={`band ${refreshTone[refreshReq.status] ?? ""}`}>
                    {refreshReq.status}
                  </span>
                </div>
                <div className="guest-meta">
                  requested {fmtDate(refreshReq.requested_at)}
                  {refreshReq.started_at ? ` · started ${fmtDate(refreshReq.started_at)}` : ""}
                  {refreshReq.finished_at ? ` · finished ${fmtDate(refreshReq.finished_at)}` : ""}
                </div>
                {refreshReq.report_date && (
                  <div className="guest-meta">data through {refreshReq.report_date}</div>
                )}
                {refreshReq.error && <div className="login-error">{refreshReq.error}</div>}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="admin-grid">
        <section className="admin-card">
          <h3>Create Employee</h3>
          <form onSubmit={createEmployee} className="admin-form">
            <label>
              <span>Name</span>
              <input value={eName} onChange={(e) => setEName(e.target.value)} required />
            </label>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={eEmail}
                onChange={(e) => setEEmail(e.target.value)}
                required
              />
            </label>
            <label>
              <span>Phone</span>
              <input value={ePhone} onChange={(e) => setEPhone(e.target.value)} />
            </label>
            <label>
              <span>Access</span>
              <select
                value={eCapability}
                onChange={(e) => setECapability(e.target.value as EmployeeCapability)}
              >
                {CAPABILITIES.map((c) => (
                  <option key={c} value={c}>
                    {c === "view"
                      ? "Guest view (read-only)"
                      : c === "romi"
                        ? "ROMI campaign entry"
                        : "Both"}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-sbu-head">
              <span>Allowed SBUs</span>
            </div>
            <SbuPicker
              sbus={sbus}
              selected={eSbus}
              onToggle={toggleEmployeeSbu}
              onSelectAll={() => setESbus(new Set(sbus.map((s) => s.id)))}
              onClear={() => setESbus(new Set())}
            />
            <label>
              <span>Password</span>
              <input
                type="password"
                value={ePass}
                onChange={(e) => setEPass(e.target.value)}
                minLength={8}
                required
              />
            </label>
            <label>
              <span>View expires (optional)</span>
              <input
                type="datetime-local"
                value={eExpiry}
                onChange={(e) => setEExpiry(e.target.value)}
              />
            </label>
            <button type="submit" className="btn" disabled={eBusy || eSbus.size === 0}>
              {eBusy ? "Creating…" : "Create employee"}
            </button>
            {eError && <div className="login-error">{eError}</div>}
          </form>
        </section>

        <section className="admin-card">
          <h3>Employees</h3>
          <button type="button" className="btn-ghost sm" onClick={refreshEmployees}>
            Refresh
          </button>
          <div className="guest-list">
            {employees.length === 0 && <p className="no-data">No employees created yet.</p>}
            {employees.map((o) => (
              <div key={o.user_id} className="guest-row">
                <div className="guest-row-main">
                  <div className="guest-user">
                    {o.name}
                    <span className={`band ${o.is_active ? "band-good" : "band-risk"}`}>
                      {o.is_active ? "active" : "revoked"}
                    </span>
                    <span className="band band-watch">{o.capability}</span>
                  </div>
                  <div className="guest-meta">
                    {o.email} · {o.sbu_codes.join(", ")}
                  </div>
                  <div className="guest-meta">
                    {o.phone ? `${o.phone} · ` : ""}created {fmtDate(o.created_at)}
                    {o.expires_at ? ` · view expires ${fmtDate(o.expires_at)}` : ""}
                  </div>
                  <div className="guest-meta guest-access">
                    <span className="reveal-label">Access</span>
                    <select
                      value={o.capability}
                      disabled={updatingId === o.user_id}
                      onChange={(e) =>
                        updateEmployeeCapability(o.user_id, e.target.value as EmployeeCapability)
                      }
                    >
                      {CAPABILITIES.map((c) => (
                        <option key={c} value={c}>
                          {c === "view"
                            ? "View only"
                            : c === "romi"
                              ? "ROMI only"
                              : "Both (view + ROMI)"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="guest-actions">
                  <button
                    type="button"
                    className="btn-ghost sm"
                    onClick={() => setRevealedEmployee(revealedEmployee === o.user_id ? null : o.user_id)}
                  >
                    Reveal
                  </button>
                  <button type="button" className="btn-ghost sm" onClick={() => resetEmployeePw(o.user_id)}>
                    Reset password
                  </button>
                  {o.is_active ? (
                    <button type="button" className="btn-ghost sm danger" onClick={() => revokeEmployee(o.user_id)}>
                      Revoke
                    </button>
                  ) : (
                    <button type="button" className="btn-ghost sm" onClick={() => reactivateEmployee(o.user_id)}>
                      Reactivate
                    </button>
                  )}
                  <button type="button" className="btn-ghost sm danger" onClick={() => delEmployee(o.user_id)}>
                    Delete
                  </button>
                </div>
                {revealedEmployee === o.user_id && (
                  <div className="guest-reveal">
                    <div className="guest-meta">
                      <span className="reveal-label">Email</span> {o.email}
                    </div>
                    <div className="guest-meta">
                      <span className="reveal-label">Password</span>{" "}
                      {o.password ? (
                        <code className="passcode">{o.password}</code>
                      ) : (
                        <span className="no-data">not stored — reset to set a new one</span>
                      )}
                    </div>
                    <div className="guest-meta">
                      <span className="reveal-label">Login URL</span>{" "}
                      <code>{window.location.origin}</code>
                      <button
                        type="button"
                        className="btn-ghost sm"
                        onClick={() => copy(window.location.origin, `origin-${o.user_id}`)}
                      >
                        {copied === `origin-${o.user_id}` ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="admin-grid">
        <section className="admin-card">
          <h3>Campaign Entry</h3>
          <p className="no-data">
            Employees with the ROMI or Both access log in with their own email and password,
            then see the campaign entry form for their assigned SBUs. No separate survey link
            is needed.
          </p>
        </section>
      </div>

      <RomiResponsesPanel />
    </div>
  );
}
