// ---------------------------------------------------------------------------
// Demo mode — in-memory supabase-js client shim.
//
// Implements the exact query-builder surface the app uses (api/client.ts,
// App.tsx, Login.tsx, lib/auth.ts) so the UI runs with zero env / zero
// backend. Backed by the deterministic fixtures in demoStore.ts.
//
// It is intentionally NOT a full SupabaseClient — only the verbs the app
// calls are implemented (from/select/eq/in/order/limit/single/maybeSingle,
// best-effort insert/update/delete, rpc, and a fake auth namespace).
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTable, rpc } from "./demoStore";
import { DEMO_ADMIN_EMAIL } from "./demoData";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string; code?: string; details?: string; hint?: string } | null };

function fail(message: string, code = "PGRST116"): Result {
  return { data: null, error: { message, code } };
}

// loose filter match mirroring PostgREST coercion for the types we use.
function matches(row: Row, col: string, val: unknown): boolean {
  const rv = row[col];
  if (typeof val === "boolean") return Boolean(rv) === val;
  if (val === null) return rv === null || rv === undefined;
  // compare as strings for dates/ids; numbers normalise.
  if (typeof val === "number") return Number(rv) === val;
  if (typeof rv === "number") return String(val) === String(rv);
  return String(rv) === String(val);
}

function project(rows: Row[], cols?: string): Row[] {
  if (!cols || cols.trim() === "*" || cols.trim() === "") return rows.map((r) => ({ ...r }));
  const keys = cols.split(",").map((k) => k.trim().split(":").pop()!.trim()).filter(Boolean);
  return rows.map((r) => {
    const out: Row = {};
    for (const k of keys) if (k in r) out[k] = r[k];
    return out;
  });
}

class DemoQueryBuilder implements PromiseLike<Result> {
  private preds: { col: string; val: unknown }[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private limitN: number | null = null;
  private wantSingle = false;
  private wantMaybe = false;
  private cols: string | undefined;
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;

  constructor(private table: string) {}

  select(cols?: string): this {
    this.mode = "select";
    this.cols = cols;
    return this;
  }
  eq(col: string, val: unknown): this {
    this.preds.push({ col, val });
    return this;
  }
  in(col: string, vals: unknown[]): this {
    this.preds.push({ col, val: { __in: vals } });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  single(): this {
    this.wantSingle = true;
    return this;
  }
  maybeSingle(): this {
    this.wantMaybe = true;
    return this;
  }
  insert(payload: Row | Row[]): this {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row): this {
    this.mode = "update";
    this.payload = payload;
    return this;
  }
  delete(): this {
    this.mode = "delete";
    return this;
  }

  then<R>(onfulfilled?: ((value: Result) => R | PromiseLike<R>) | null): PromiseLike<R> {
    return Promise.resolve(this.run()).then(onfulfilled ?? undefined);
  }

  private run(): Result {
    // Mutations are accepted in-memory only (the app drives writes through
    // rpc(), so these are best-effort and never hit a real store).
    if (this.mode !== "select") return this.runMutation();

    let rows = getTable(this.table);

    // apply predicates (AND)
    rows = rows.filter((r) =>
      this.preds.every(({ col, val }) =>
        typeof val === "object" && val !== null && "__in" in (val as Row)
          ? (val as { __in: unknown[] }).__in.some((v) => matches(r, col, v))
          : matches(r, col, val)
      )
    );

    // apply order (first order = primary key)
    if (this.orders.length) {
      rows = rows.slice().sort((a, b) => {
        for (const o of this.orders) {
          const av = a[o.col];
          const bv = b[o.col];
          if (av === bv) continue;
          if (av === null || av === undefined) return 1;
          if (bv === null || bv === undefined) return -1;
          const cmp = typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
          return o.asc ? cmp : -cmp;
        }
        return 0;
      });
    }

    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    rows = project(rows, this.cols);

    if (this.wantSingle) {
      if (rows.length !== 1) return fail(`JSON object requested, multiple (or no) rows returned`);
      return { data: rows[0], error: null };
    }
    if (this.wantMaybe) {
      if (rows.length === 0) return { data: null, error: null };
      if (rows.length > 1) return fail("Multiple rows returned for a maybeSingle() query");
      return { data: rows[0], error: null };
    }
    return { data: rows, error: null };
  }

  private runMutation(): Result {
    const list = Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : [];
    if (this.mode === "insert") {
      return { data: list, error: null };
    }
    if (this.mode === "update") {
      return { data: this.payload ?? null, error: null };
    }
    // delete
    return { data: null, error: null };
  }
}

// ---- fake auth -------------------------------------------------------------

type DemoUser = { id: string; email: string; role: "authenticated" };
type DemoSession = { access_token: string; token_type: string; user: DemoUser };

let currentSession: DemoSession | null = {
  access_token: "demo-token",
  token_type: "bearer",
  user: { id: "00000000-0000-4000-8000-0000000000ad", email: DEMO_ADMIN_EMAIL, role: "authenticated" },
};

type AuthCb = (event: string, session: DemoSession | null) => void;
const authListeners = new Set<AuthCb>();

function emit(event: string, session: DemoSession | null): void {
  for (const cb of authListeners) {
    try {
      cb(event, session);
    } catch {
      /* ignore listener errors */
    }
  }
}

const auth = {
  async getSession(): Promise<{ data: { session: DemoSession | null } }> {
    return { data: { session: currentSession } };
  },
  async getUser(): Promise<{ data: { user: DemoUser | null } }> {
    return { data: { user: currentSession?.user ?? null } };
  },
  async signInWithPassword(_creds: { email: string; password: string }): Promise<{ data: { session: DemoSession | null; user: DemoUser | null }; error: null }> {
    // Demo accepts ANY credentials.
    const email = _creds?.email && _creds.email.includes("@") ? _creds.email : DEMO_ADMIN_EMAIL;
    currentSession = {
      access_token: "demo-token",
      token_type: "bearer",
      user: { id: "00000000-0000-4000-8000-0000000000ad", email, role: "authenticated" },
    };
    emit("SIGNED_IN", currentSession);
    return { data: { session: currentSession, user: currentSession.user }, error: null };
  },
  async signOut(): Promise<{ error: null }> {
    currentSession = null;
    emit("SIGNED_OUT", null);
    return { error: null };
  },
  onAuthStateChange(callback: AuthCb): { data: { subscription: { unsubscribe(): void } } } {
    authListeners.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe: () => authListeners.delete(callback),
        },
      },
    };
  },
};

// ---- the client ------------------------------------------------------------

export const demoClient = {
  from(table: string): DemoQueryBuilder {
    return new DemoQueryBuilder(table);
  },
  async rpc(name: string, params: Record<string, unknown> = {}): Promise<Result> {
    return rpc(name, params);
  },
  auth,
} as unknown as SupabaseClient;

export type DemoClient = typeof demoClient;
