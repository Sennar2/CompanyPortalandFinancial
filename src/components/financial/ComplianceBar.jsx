"use client";

import React from "react";

type ComplianceInsights = {
  wkLabel: string;
  payrollPct: number;
  foodPct: number;
  drinkPct: number;
  salesVsLastYearPct: number;
  avgPayrollVar4w: number; // rolling average of Payroll_v% last 4 weeks
} | null;

type ComplianceBarProps = {
  insights: ComplianceInsights;
};

const PAYROLL_TARGET = 35; // ≤ 35%
const FOOD_TARGET = 12.5; // ≤ 12.5%
const DRINK_TARGET = 5.5; // ≤ 5.5%
const LY_TARGET = 0; // ≥ 0%

// colour helper for avgPayrollVar4w
function getTrendColor(avg: number | undefined | null) {
  if (avg === undefined || avg === null || Number.isNaN(avg)) {
    return "bg-gray-400";
  }

  // use magnitude of the average, not the signed value
  const mag = Math.abs(avg);

  if (mag < 1) return "bg-green-500";     // very tight, stable
  if (mag < 2) return "bg-yellow-400";    // drifting / needs attention
  return "bg-red-500";                    // out of control
}


// A reusable stat card component
function StatCard({
  title,
  valuePct,
  ok,
  targetText,
  weekLabel,
  showTrendDot,
  trendColor,
}: {
  title: string;
  valuePct: number;
  ok: boolean;
  targetText: string;
  weekLabel: string;
  showTrendDot?: boolean;
  trendColor?: string;
}) {
  return (
    <div className="bg-white rounded-xl border shadow p-4 flex flex-col min-w-[200px]">
      {/* header line */}
      <div className="flex justify-between items-start text-[11px] leading-none">
        <div className="text-gray-800 font-semibold text-[13px]">
          {title}
        </div>

        <div className="flex items-center gap-2 text-right text-gray-500 font-normal">
          {showTrendDot ? (
            <span
              className={`inline-block w-3.5 h-3.5 rounded-full ${trendColor} border border-white shadow-[0_0_4px_rgba(0,0,0,0.4)]`}
              title="4-week payroll trend"
            />
          ) : null}

          <div className="text-right leading-tight">
            <span className="font-semibold text-gray-700">{weekLabel}</span>{" "}
            • {targetText}
          </div>
        </div>
      </div>

      {/* value */}
      <div
        className={`mt-3 text-xl font-bold flex items-center gap-2 ${
          ok ? "text-green-600" : "text-red-600"
        }`}
      >
        {isNaN(valuePct) ? "0.0%" : `${valuePct.toFixed(1)}%`}{" "}
        <span
          className={`text-xs font-bold ${
            ok ? "text-green-600" : "text-red-600"
          }`}
        >
          {ok ? "✔" : "✘"}
        </span>
      </div>
    </div>
  );
}

export default function ComplianceBar({ insights }: ComplianceBarProps) {
  if (!insights) return null;

  // Pass/fail checks vs hard targets
  const payrollOk = insights.payrollPct <= PAYROLL_TARGET;
  const foodOk = insights.foodPct <= FOOD_TARGET;
  const drinkOk = insights.drinkPct <= DRINK_TARGET;
  const lyOk = insights.salesVsLastYearPct >= LY_TARGET;

  // traffic light circle colour from avg of last 4 weeks Payroll_v%
  const trendColor = getTrendColor(insights.avgPayrollVar4w);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {/* Payroll % card WITH status dot */}
      <StatCard
        title="Payroll %"
        valuePct={insights.payrollPct || 0}
        ok={payrollOk}
        targetText={`Target ≤ ${PAYROLL_TARGET}%`}
        weekLabel={insights.wkLabel || "—"}
        showTrendDot={true}
        trendColor={trendColor}
      />

      {/* Food % */}
      <StatCard
        title="Food %"
        valuePct={insights.foodPct || 0}
        ok={foodOk}
        targetText={`Target ≤ ${FOOD_TARGET}%`}
        weekLabel={insights.wkLabel || "—"}
      />

      {/* Drink % */}
      <StatCard
        title="Drink %"
        valuePct={insights.drinkPct || 0}
        ok={drinkOk}
        targetText={`Target ≤ ${DRINK_TARGET}%`}
        weekLabel={insights.wkLabel || "—"}
      />

      {/* Sales vs LY */}
      <StatCard
        title="Sales vs LY"
        valuePct={insights.salesVsLastYearPct || 0}
        ok={lyOk}
        targetText={`Target ≥ ${LY_TARGET}%`}
        weekLabel={insights.wkLabel || "—"}
      />
    </div>
  );
}
