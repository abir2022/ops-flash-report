// Ops Flash Report — freshness watchdog.
// Runs on a cron; queries the latest ETL refresh_run in Supabase and posts
// an alert (generic webhook) if the pipeline is stale or has failed.

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ALERT_WEBHOOK_URL: string;
  STALE_HOURS: string;
}

interface RefreshRun {
  status: string;
  started_at: string;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(check(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === "/check") {
      const result = await check(env);
      return Response.json({ ok: result === "ok", result });
    }
    return new Response("Ops Flash freshness watchdog", { status: 200 });
  },
};

async function check(env: Env): Promise<string> {
  const staleHours = Number(env.STALE_HOURS ?? "12");
  const url = `${env.SUPABASE_URL}/rest/v1/refresh_run?select=status,started_at&order=started_at.desc&limit=1`;

  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  if (!res.ok) {
    await alert(env, `Freshness check failed: HTTP ${res.status}`);
    return "error";
  }

  const rows = (await res.json()) as RefreshRun[];
  if (!rows.length) {
    await alert(env, "No ETL refresh has ever run — pipeline has not published any data.");
    return "missing";
  }

  const latest = rows[0];
  const ageH = (Date.now() - Date.parse(latest.started_at)) / 3_600_000;

  if (latest.status !== "success") {
    await alert(env, `Ops Flash ETL last run status = "${latest.status}" (${ageH.toFixed(1)}h ago).`);
    return "failed";
  }

  if (ageH > staleHours) {
    await alert(env, `Ops Flash ETL is stale — last successful run ${ageH.toFixed(1)}h ago.`);
    return "stale";
  }

  return "ok";
}

async function alert(env: Env, text: string): Promise<void> {
  if (!env.ALERT_WEBHOOK_URL) return;
  const payload = JSON.stringify({ text });
  try {
    await fetch(env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
  } catch (e) {
    console.error("alert failed", e);
  }
}
