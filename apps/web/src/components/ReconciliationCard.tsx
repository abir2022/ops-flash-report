import { useQuery } from "@tanstack/react-query";
import { fetchReconciliation } from "../api/client";
import { fmt } from "../lib/format";

const RECON_ONLY_NAMES =
  "NexaGroup Logistics Ltd., Partner Feed Ltd., Fields Agro Essence, " +
  "NexaGroup Air Service Ltd., Skyline Travel & Tours";

export function ReconciliationCard({
  reportDate,
  export: isExport = false,
}: {
  reportDate: string;
  export?: boolean;
}) {
  const { data: r } = useQuery({
    queryKey: ["reconciliation", reportDate],
    queryFn: () => fetchReconciliation(reportDate),
  });

  if (!r) return null;

  const nonReportFreight = (r.g5all ?? 0) - (r.rpt_frt ?? 0);

  return (
    <div className="recon-card">
      <h3>Revenue Reconciliation — MTD</h3>

      <p className="recon-explain">
        Two views of the same month&rsquo;s revenue, tied back to the full GL.
        <strong> Report total</strong> (left) is what this flash report tracks —
        local sales from the core SBUs plus freight from the shipping companies.
        <strong> Full GL total</strong> (right) is the entire revenue
        sub-schedule, including foreign sales, agency income, other income and
        the service entities kept out of the daily flash. The two are not meant
        to be equal — the gap is the revenue that sits outside the report&rsquo;s
        scope.
      </p>

      <div className="recon-grid">
        <div className="recon-col">
          <h4>Our Report Total (sub-schedule)</h4>
          <table>
            <tbody>
              <tr>
                <td>GL 3010001 Sales (Local)</td>
                <td className="val">{fmt(r.rpt_gl1)}</td>
              </tr>
              <tr className="hint">
                <td>Report SBUs excl. recon ({RECON_ONLY_NAMES})</td>
                <td />
              </tr>
              <tr>
                <td>GL 3010005 Freight (freight SBUs)</td>
                <td className="val">{fmt(r.rpt_frt)}</td>
              </tr>
              <tr className="total">
                <td>Report Total</td>
                <td className="val">{fmt(r.rpt_tot)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="recon-col">
          <h4>Full GL Revenue (sub-schedule)</h4>
          <table>
            <tbody>
              <tr>
                <td>GL 3010001 Sales (Local)</td>
                <td className="val">{fmt(r.g1all)}</td>
              </tr>
              <tr>
                <td>GL 3010002 Sales (Foreign)</td>
                <td className="val">{fmt(r.g2all)}</td>
              </tr>
              <tr>
                <td>GL 3010005 Freight Income</td>
                <td className="val">{fmt(r.g5all)}</td>
              </tr>
              <tr>
                <td>GL 3010006 Agency Income</td>
                <td className="val">{fmt(r.g6all)}</td>
              </tr>
              <tr>
                <td>GL 3010004 Other Income</td>
                <td className="val">{fmt(r.g4all)}</td>
              </tr>
              <tr className="total">
                <td>Full GL Total</td>
                <td className="val">{fmt(r.full_tot)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <details className="recon-detail" open={isExport}>
        <summary>Why the totals differ — see the full gap breakdown</summary>
        <div className="recon-detail-body">
          <table className="recon-math">
            <tbody>
              <tr>
                <td>Full GL total (right)</td>
                <td className="val">{fmt(r.full_tot)}</td>
              </tr>
              <tr>
                <td>&minus; Report total (left)</td>
                <td className="val">{fmt(r.rpt_tot)}</td>
              </tr>
              <tr className="total">
                <td>= Gap</td>
                <td className="val">{fmt(r.gap)}</td>
              </tr>
            </tbody>
          </table>

          <h5>The gap is made of (each excluded from the flash):</h5>
          <table>
            <tbody>
              <tr>
                <td>Foreign sales — GL 3010002</td>
                <td className="val">{fmt(r.g2all)}</td>
              </tr>
              <tr>
                <td>Agency income — GL 3010006</td>
                <td className="val">{fmt(r.g6all)}</td>
              </tr>
              <tr>
                <td>Other income — GL 3010004</td>
                <td className="val">{fmt(r.g4all)}</td>
              </tr>
              <tr>
                <td>Local sales — 5 service entities</td>
                <td className="val">{fmt(r.excl)}</td>
              </tr>
              <tr className="hint">
                <td>{RECON_ONLY_NAMES}</td>
                <td />
              </tr>
              <tr>
                <td>Freight from non-shipping SBUs</td>
                <td className="val">{fmt(nonReportFreight)}</td>
              </tr>
              <tr className="total">
                <td>Total excluded (= gap)</td>
                <td className="val">{fmt(r.gap)}</td>
              </tr>
            </tbody>
          </table>

          <p className="ac-hint">
            The flash shows only core SBU sales + the shipping business, so these
            items appear on the full-GL side only. A non-zero gap is normal every
            day; a sudden jump is what to investigate.
          </p>
        </div>
      </details>
    </div>
  );
}
