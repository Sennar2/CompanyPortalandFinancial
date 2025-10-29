// src/components/financial/ComplianceBar.tsx
// This version is TS-friendly and matches the portal style.
// complianceSnapshot is now OPTIONAL.

import React from "react";

type InsightsShape = {
  wkLabel: string; // e.g. "W43"
  salesActual: number;
  salesBudget: number;
  salesVar: number;
  salesVarPct: number;
  payrollPct: number;
  foodPct: number;
  drinkPct: number;
  salesVsLastYearPct: number;
  avgPayrollVar4w: number; // 4-week avg of Payroll_v%
  currentWeekLabel?: string; // not strictly needed here
};

type ComplianceBarProps = {
  insights: InsightsShape | null;
  payrollTarget: number;
  foodTarget: number;
  drinkTarget: number;
  // this was previously required and caused the Vercel error.
  // now it's optional.
  complianceSnapshot?: InsightsShape | null;
};

export default function ComplianceBar({
  insights,
  payrollTarget,
  foodTarget,
  drinkTarget,
  complianceSnapshot,
}: ComplianceBarProps) {
  // The snapshot we render:
  // if a separate complianceSnapshot was passed, use it.
  // else just reuse insights.
  const snapshot = complianceSnapshot ?? insights;

  // If we truly don't have data, render a tiny "no data" pill
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

  const {
    wkLabel,
    payrollPct,
    foodPct,
    drinkPct,
    salesVsLastYearPct,
    avgPayrollVar4w,
  } = snapshot;

  // --- Traffic light colour logic from avgPayrollVar4w ---
  // Rule you gave:
  //   if avg < 1            => green
  //   if 1 <= avg < 2        => amber / yellow
  //   if avg >= 2            => red
  //
  // You also said we must include negative values in the average,
  // but classification depends on the magnitude (absolute value).
  const magnitude = Math.abs(avgPayrollVar4w ?? 0);

  let dotColor = "#10B981"; // green
  if (magnitude >= 1 && magnitude < 2) {
    dotColor = "#FACC15"; // amber/yellow
  } else if (magnitude >= 2) {
    dotColor = "#EF4444"; // red
  }

  // helpers
  function pct(val: number | undefined | null) {
    if (val === undefined || val === null || Number.isNaN(val)) {
      return "0.0%";
    }
    return `${Number(val).toFixed(1)}%`;
  }

  const payrollIsOk = payrollPct <= payrollTarget;
  const foodIsOk = foodPct <= foodTarget;
  const drinkIsOk = drinkPct <= drinkTarget;
  const salesVsLyOk = (salesVsLastYearPct ?? 0) >= 0;

  // shared styles (inline so we don't rely on globals in prod build)
  const cardBase: React.CSSProperties = {
    backgroundColor: "#fff",
    borderRadius: "0.75rem",
    boxShadow:
      "0 24px 40px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
    padding: "1rem 1.25rem",
    flex: "1 1 200px",
    minWidth: "200px",
    fontFamily: "Inter, system-ui, sans-serif",
  };

  const headerRow: React.CSSProperties = {
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

  const wkCluster: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    flexWrap: "wrap",
  };

  const dotStyle: React.CSSProperties = {
    width: "14px",
    height: "14px",
    borderRadius: "999px",
    backgroundColor: dotColor,
    boxShadow: "0 0 4px rgba(0,0,0,0.15)",
    border: "2px solid white",
    flexShrink: 0,
  };

  const goodVal: React.CSSProperties = {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#10B981",
    lineHeight: 1.2,
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  };

  const badVal: React.CSSProperties = {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#EF4444",
    lineHeight: 1.2,
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  };

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
      {/* Payroll % */}
      <div style={cardBase}>
        <div style={headerRow}>
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

        <div style={payrollIsOk ? goodVal : badVal}>
          <span>{pct(payrollPct)}</span>
          <span>{payrollIsOk ? "✓" : "✕"}</span>
        </div>
      </div>

      {/* Food % */}
      <div style={cardBase}>
        <div style={headerRow}>
          <span style={{ fontWeight: 600, color: "#111827" }}>Food %</span>
          <div style={wkCluster}>
            <span>
              <strong>{wkLabel}</strong> • Target ≤ {foodTarget}%
            </span>
          </div>
        </div>

        <div style={foodIsOk ? goodVal : badVal}>
          <span>{pct(foodPct)}</span>
          <span>{foodIsOk ? "✓" : "✕"}</span>
        </div>
      </div>

      {/* Drink % */}
      <div style={cardBase}>
        <div style={headerRow}>
          <span style={{ fontWeight: 600, color: "#111827" }}>Drink %</span>
          <div style={wkCluster}>
            <span>
              <strong>{wkLabel}</strong> • Target ≤ {drinkTarget}%
            </span>
          </div>
        </div>

        <div style={drinkIsOk ? goodVal : badVal}>
          <span>{pct(drinkPct)}</span>
          <span>{drinkIsOk ? "✓" : "✕"}</span>
        </div>
      </div>

      {/* Sales vs LY */}
      <div style={cardBase}>
        <div style={headerRow}>
          <span style={{ fontWeight: 600, color: "#111827" }}>
            Sales vs LY
          </span>
          <div style={wkCluster}>
            <span>
              <strong>{wkLabel}</strong> • Target ≥ 0%
            </span>
          </div>
        </div>

        <div style={salesVsLyOk ? goodVal : badVal}>
          <span>{pct(salesVsLastYearPct)}</span>
          <span>{salesVsLyOk ? "✓" : "✕"}</span>
        </div>
      </div>
    </section>
  );
}
