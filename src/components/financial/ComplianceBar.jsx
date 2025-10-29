// src/components/financial/ComplianceBar.jsx
import React from "react";

export default function ComplianceBar({
  insights,
  payrollTarget,
  foodTarget,
  drinkTarget,
  complianceSnapshot,
}) {
  if (!insights) return null;

  // pick dot color from complianceSnapshot.colourClass
  let dotColor = "#10b981"; // green
  if (complianceSnapshot?.colourClass === "amber") {
    dotColor = "#facc15";
  } else if (complianceSnapshot?.colourClass === "red") {
    dotColor = "#ef4444";
  }

  const wkLabel = complianceSnapshot?.wkLabel || insights.wkLabel || "";

  // helper to render each KPI compliance card
  function ComplianceCard({
    title,
    valuePct,
    targetText,
    inTarget,
  }) {
    return (
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "0.75rem",
          border: "1px solid #e5e7eb",
          boxShadow:
            "0 24px 40px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
          padding: "1rem",
          minWidth: "200px",
          flex: "1 1 200px",
          fontSize: "0.9rem",
          lineHeight: 1.4,
          color: "#111827",
        }}
      >
        {/* header row inside card */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "space-between",
            fontSize: "0.8rem",
            fontWeight: 500,
            color: "#111827",
            marginBottom: "0.5rem",
          }}
        >
          <span>{title}</span>

          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              color: "#6b7280",
              fontSize: "0.75rem",
              fontWeight: 400,
            }}
          >
            {/* only show dot on Payroll card (first card),
                for the others we still show wk + Target but no dot */}
            {title === "Payroll %" && (
              <span
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "9999px",
                  backgroundColor: dotColor,
                  boxShadow: "0 0 8px rgba(0,0,0,0.3)",
                  border: "2px solid white",
                }}
              />
            )}
            <strong style={{ color: "#111827" }}>{wkLabel}</strong>
            <span>• {targetText}</span>
          </span>
        </div>

        {/* value line */}
        <div
          style={{
            fontSize: "1.125rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.4rem",
            color: inTarget ? "#059669" : "#dc2626",
          }}
        >
          <span>{valuePct.toFixed(1)}%</span>
          <span
            style={{
              fontSize: "1rem",
              lineHeight: 1,
              color: inTarget ? "#4f46e5" : "#dc2626",
              fontWeight: 600,
            }}
          >
            {inTarget ? "✓" : "✕"}
          </span>
        </div>
      </div>
    );
  }

  // derive the values we show
  const payrollPct = insights.payrollPct || 0;
  const foodPct = insights.foodPct || 0;
  const drinkPct = insights.drinkPct || 0;
  const salesVsLastYearPct = insights.salesVsLastYearPct || 0;

  const payrollOk = payrollPct <= payrollTarget;
  const foodOk = foodPct <= foodTarget;
  const drinkOk = drinkPct <= drinkTarget;
  const lastYearOk = salesVsLastYearPct >= 0;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "1rem",
        justifyContent: "center",
        margin: "1rem auto",
        maxWidth: "1100px",
        paddingLeft: "1rem",
        paddingRight: "1rem",
      }}
    >
      <ComplianceCard
        title="Payroll %"
        valuePct={payrollPct}
        targetText={`Target ≤ ${payrollTarget}%`}
        inTarget={payrollOk}
      />

      <ComplianceCard
        title="Food %"
        valuePct={foodPct}
        targetText={`Target ≤ ${foodTarget}%`}
        inTarget={foodOk}
      />

      <ComplianceCard
        title="Drink %"
        valuePct={drinkPct}
        targetText={`Target ≤ ${drinkTarget}%`}
        inTarget={drinkOk}
      />

      <ComplianceCard
        title="Sales vs LY"
        valuePct={salesVsLastYearPct}
        targetText={`Target ≥ 0%`}
        inTarget={lastYearOk}
      />
    </div>
  );
}
