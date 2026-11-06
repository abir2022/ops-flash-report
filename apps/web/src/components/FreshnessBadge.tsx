import { useQuery } from "@tanstack/react-query";
import { fetchFreshness } from "../api/client";
import { num } from "../lib/format";

export function FreshnessBadge() {
  const { data } = useQuery({ queryKey: ["freshness"], queryFn: fetchFreshness });

  if (!data) return <span className="badge badge-unknown">Freshness —</span>;

  const status = data.status;
  const cls =
    status === "success" ? "badge-ok" : status === "stalled" ? "badge-stall" : "badge-fail";

  const syncedAt = data.dwh_synced_at
    ? new Date(data.dwh_synced_at).toLocaleString()
    : "—";

  const hours = data.dwh_synced_at
    ? (Date.now() - new Date(data.dwh_synced_at).getTime()) / 3_600_000
    : null;

  return (
    <span className={`badge ${cls}`} title={`Data synced ${syncedAt}`}>
      {status === "success" ? "Live" : status.toUpperCase()} · updated{" "}
      {hours === null ? "—" : `${num(hours)?.toFixed(1)}h`} ago
    </span>
  );
}
