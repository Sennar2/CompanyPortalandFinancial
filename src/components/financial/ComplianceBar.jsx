// src/components/financial/ComplianceBar.jsx

/**
 * ComplianceBar
 *
 * Shows last completed week's compliance snapshot:
 * - Payroll %
 * - Food %
 * - Drink %
 * - Sales vs LY %
 *
 * We also render the traffic-light dot based on avgPayrollVar4w:
 *   abs(avgPayrollVar4w) < 1     => green
 *   1 <= abs(avgPayrollVar4w) < 2 => amber
 *   abs(avgPayrollVar4w) >= 2    => red
 *
 * Props:
 *   insights: {
 *     wkLabel: string;                // e.g. "W43"
 *     payrollPct: number;
 *     foodPct: number;
 *     drinkPct: number;
 *     salesVsLastYearPct: number;
 *     avgPayrollVar4w: number;        // last-4-week avg of Payroll_v%
 *   } | null
 *
 *   payrollTarget: number (e.g. 35)
 *   foodTarget: number    (e.g. 12.5)
 *   drinkTarget: number   (e.g. 5.5)
 *
 *   complianceSnapshot?: same shape as insights (OPTIONAL)
 *     - if not provided, we reuse `insights`.
 */

export default function ComplianceBar({
  insights,
  payrollTarget,
  foodTarget,
  drinkTarget,
  complianceSnapshot,
}) {
  // Fallback so Vercel build doesn't explode:
  const snapshot = complianceSnapshot ?? insights;

  if (!snapshot) {
    return (
      <section
        style={{
          maxWidth: "1280px",
          margin: "1rem auto",
          padding: "1rem",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: "0.8rem",
          color: "#6b7280",
          textAlign: "center",
        }}
      >
        No data available.
      </section>
    );
  }

  // Destructure what we need from the snapshot
  const {
    wkLabel,
    payrollPct,
    foodPct,
    drinkPct,
    salesVsLastYearPct,
    avgPayrollVar4w,
  } = snapshot;

  // --- Traffic light dot colour logic using avgPayrollVar4w ---
  // you said:
  //   if avg < 1  => green
  //   if 1 < avg < 2 => amber
  //   if avg > 2 => red
  // NOTE: we interpret "avg" as absolute value, because you said
  // e.g. (-1.48%) should be amber (not green) if magnitude is in that band.
  const magnitude = Math.abs(avgPayrollVar4w ?? 0);
  let dotColor = "#10B981"; // green
  if (magnitude >= 1 && magnitude < 2) {
    dotColor = "#FACC15"; // amber/yellow
  } else if (magnitude >= 2) {
    dotColor = "#EF4444"; // red
  }

  // --- Helpers for rendering numeric values nicely ---
  function pct(val) {
    if (val === undefined || val === null || isNaN(val)) {
      return "0.0%";
    }
    return `${Number(val).toFixed(1)}%`;
  }

  const payrollIsOk = payrollPct <= payrollTarget;
  const foodIsOk = foodPct <= foodTarget;
  const drinkIsOk = drinkPct <= drinkTarget;
  const salesVsLyOk = (salesVsLastYearPct ?? 0) >= 0;

  // --- Shared card styles ---
  const cardBase = {
    backgroundColor: "#fff",
    borderRadius: "0.75rem",
    boxShadow:
      "0 24px 40px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
    padding: "1rem 1.25rem",
    flex: "1 1 200px",
    minWidth: "200px",
    fontFamily: "Inter, system-ui, sans-serif",
  };

  // header row inside each card
  const labelRow = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "#6b7280",
    marginBottom: "0.25rem",
    lineHeight: 1.2,
    columnGap: "0.5rem",
  };

  const wkCluster = {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    flexWrap: "wrap",
  };

  // the dot
  const dotStyle = {
    width: "14px",
    height: "14px",
    borderRadius: "999px",
    backgroundColor: dotColor,
    boxShadow: "0 0 4px rgba(0,0,0,0.15)",
    border: "2px solid white",
    flexShrink: 0,
  };

  // green/red value styling
  const goodValue = {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#10B981",
    lineHeight: 1.2,
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  };

  const badValue = {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#EF4444",
    lineHeight: 1.2,
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  };

  // --- Render ---
  return (
    <section
      style={{
        maxWidth: "1280px",
        margin: "1rem auto 0",
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Payroll card */}
      <div style={cardBase}>
        <div style={labelRow}>
          <span style={{ fontWeight: 600, color: "#111827" }}>
            Payroll %
          </span>

          <div style={wkCluster}>
            <span style={dotStyle} />
            <span>
              <strong>{wkLabel}</strong> • Target ≤ {payrollTarget}%
            </span>
          </div>
        </div>

        <div style={payrollIsOk ? goodValue : badValue}>
          <span>{pct(payrollPct)}</span>
          <span>{payrollIsOk ? "✓" : "✕"}</span>
        </div>
      </div>

      {/* Food card */}
      <div style={cardBase}>
        <div style={labelRow}>
          <span style={{ fontWeight: 600, color: "#111827" }}>
            Food %
          </span>

          <div style={wkCluster}>
            <span>
              <strong>{wkLabel}</strong> • Target ≤ {foodTarget}%
            </span>
          </div>
        </div>

        <div style={foodIsOk ? goodValue : badValue}>
          <span>{pct(foodPct)}</span>
          <span>{foodIsOk ? "✓" : "✕"}</span>
        </div>
      </div>

      {/* Drink card */}
      <div style={cardBase}>
        <div style={labelRow}>
          <span style={{ fontWeight: 600, color: "#111827" }}>
            Drink %
          </span>

          <div style={wkCluster}>
            <span>
              <strong>{wkLabel}</strong> • Target ≤ {drinkTarget}%
            </span>
          </div>
        </div>

        <div style={drinkIsOk ? goodValue : badValue}>
          <span>{pct(drinkPct)}</span>
          <span>{drinkIsOk ? "✓" : "✕"}</span>
        </div>
      </div>

      {/* Sales vs LY card */}
      <div style={cardBase}>
        <div style={labelRow}>
          <span style={{ fontWeight: 600, color: "#111827" }}>
            Sales vs LY
          </span>

          <div style={wkCluster}>
            <span>
              <strong>{wkLabel}</strong> • Target ≥ 0%
            </span>
          </div>
        </div>

        <div style={salesVsLyOk ? goodValue : badValue}>
          <span>{pct(salesVsLastYearPct)}</span>
          <span>{salesVsLyOk ? "✓" : "✕"}</span>
        </div>
      </div>
    </section>
  );
}
