"use client";

import React from "react";

function formatCurrency(val) {
  if (val === undefined || val === null || isNaN(val)) return "-";
  return "£" + Number(val).toLocaleString();
}

export default function KPIBlock({
  data,
  payrollTarget,
  foodTarget,
  drinkTarget,
}) {
  if (!data || data.length === 0) return null;

  const total = (key) =>
    data.reduce((sum, row) => sum + (row[key] || 0), 0);

  const totalSales = total("Sales_Actual");
  const salesVsBudget = total("Sales_Actual") - total("Sales_Budget");

  const payrollPct = totalSales
    ? (total("Payroll_Actual") / totalSales) * 100
    : 0;
  const foodPct = totalSales
    ? (total("Food_Actual") / totalSales) * 100
    : 0;
  const drinkPct = totalSales
    ? (total("Drink_Actual") / totalSales) * 100
    : 0;

  const kpis = [
    {
      label: "Total Sales",
      value: formatCurrency(totalSales),
      positive: true,
    },
    {
      label: "Sales vs Budget",
      value: formatCurrency(salesVsBudget),
      positive: salesVsBudget >= 0,
    },
    {
      label: "Payroll %",
      value: `${payrollPct.toFixed(1)}%`,
      positive: payrollPct <= payrollTarget,
    },
    {
      label: "Food Cost %",
      value: `${foodPct.toFixed(1)}%`,
      positive: foodPct <= foodTarget,
    },
    {
      label: "Drink Cost %",
      value: `${drinkPct.toFixed(1)}%`,
      positive: drinkPct <= drinkTarget,
    },
  ];

  return (
    <div
      style={{
        maxWidth: "1400px",
        marginLeft: "auto",
        marginRight: "auto",
        padding: "0 1rem",
        display: "flex",
        flexWrap: "wrap",
        gap: "1rem",
        justifyContent: "center",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {kpis.map((kpi, idx) => (
        <div
          key={idx}
          style={{
            flex: "1 1 200px",
            maxWidth: "240px",
            minWidth: "200px",
            backgroundColor: "#fff",
            borderRadius: "0.75rem",
            boxShadow:
              "0 24px 40px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
            border: "1px solid rgba(0,0,0,0.05)",
            padding: "1rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "0.9rem",
              fontWeight: 500,
              color: "#4b5563",
              marginBottom: "0.5rem",
              lineHeight: 1.3,
            }}
          >
            {kpi.label}
          </div>
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              color: kpi.positive ? "#059669" : "#dc2626",
              lineHeight: 1.2,
            }}
          >
            {kpi.value}
          </div>
        </div>
      ))}
    </div>
  );
}
