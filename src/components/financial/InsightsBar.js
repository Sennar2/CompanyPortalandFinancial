"use client";

import React from "react";

export default function InsightsBar({
  insights,
  currentWeekNow,
  payrollTarget,
}) {
  if (!insights) return null;

  const {
    wkLabel,
    salesActual,
    salesBudget,
    salesVar,
    salesVarPct,
    payrollPct,
  } = insights;

  const salesGood = salesVar >= 0;
  const payrollGood = payrollPct <= payrollTarget;

  return (
    <div
      style={{
        maxWidth: "1400px",
        margin: "0 auto",
        padding: "0 1rem",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "1rem",
        marginBottom: "1.5rem",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Current Week */}
      <div
        style={{
          flex: "1 1 220px",
          minWidth: "220px",
          backgroundColor: "#fff",
          borderRadius: "0.75rem",
          border: "1px solid rgba(0,0,0,0.05)",
          boxShadow:
            "0 24px 40px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
          padding: "1rem",
        }}
      >
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: 500,
            color: "#4b5563",
            marginBottom: "0.4rem",
          }}
        >
          Current Week
        </div>
        <div
          style={{
            fontSize: "1.4rem",
            fontWeight: 600,
            color: "#111827",
            lineHeight: 1.2,
          }}
        >
          {currentWeekNow || "—"}
        </div>
        <div
          style={{
            fontSize: "0.75rem",
            color: "#6b7280",
            lineHeight: 1.4,
            marginTop: "0.25rem",
          }}
        >
          Today&apos;s trading period
        </div>
      </div>

      {/* Last Week Summary */}
      <div
        style={{
          flex: "1 1 320px",
          minWidth: "280px",
          backgroundColor: "#fff",
          borderRadius: "0.75rem",
          border: "1px solid rgba(0,0,0,0.05)",
          boxShadow:
            "0 24px 40px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
          padding: "1rem",
        }}
      >
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: 500,
            color: "#4b5563",
            marginBottom: "0.4rem",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            rowGap: "0.25rem",
          }}
        >
          <span>Last Week Results</span>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 400,
              color: "#6b7280",
            }}
          >
            {wkLabel || "W-"}
          </span>
        </div>

        {/* Sales vs Budget */}
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: 500,
            color: "#4b5563",
            marginBottom: "0.25rem",
            lineHeight: 1.4,
          }}
        >
          Sales vs Budget
        </div>

        <div
          style={{
            fontSize: "1rem",
            fontWeight: 600,
            lineHeight: 1.2,
            color: salesGood ? "#059669" : "#dc2626",
          }}
        >
          {salesVar >= 0 ? "+" : ""}
          £{Math.round(salesVar).toLocaleString()}{" "}
          <span
            style={{
              fontSize: "0.8rem",
              fontWeight: 500,
              marginLeft: "0.4rem",
              color: salesGood ? "#059669" : "#dc2626",
            }}
          >
            ({salesVarPct >= 0 ? "+" : ""}
            {salesVarPct.toFixed(1)}%)
          </span>
        </div>

        <div
          style={{
            fontSize: "0.75rem",
            color: "#6b7280",
            lineHeight: 1.4,
            marginTop: "0.25rem",
            marginBottom: "0.75rem",
          }}
        >
          Actual £{Math.round(salesActual).toLocaleString()} vs Budget £
          {Math.round(salesBudget).toLocaleString()}
        </div>

        {/* Payroll % */}
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: 500,
            color: "#4b5563",
            marginBottom: "0.25rem",
            lineHeight: 1.4,
          }}
        >
          Payroll %
        </div>

        <div
          style={{
            fontSize: "1.25rem",
            fontWeight: 600,
            lineHeight: 1.2,
            color: payrollGood ? "#059669" : "#dc2626",
          }}
        >
          {payrollPct.toFixed(1)}%
        </div>
        <div
          style={{
            fontSize: "0.75rem",
            color: "#6b7280",
            lineHeight: 1.4,
            marginTop: "0.25rem",
          }}
        >
          Target ≤ {payrollTarget}%
        </div>
      </div>
    </div>
  );
}
