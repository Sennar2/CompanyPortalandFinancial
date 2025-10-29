"use client";

import React from "react";

type Insights = {
  wkLabel: string;
  salesActual: number;
  salesBudget: number;
  salesVar: number;
  salesVarPct: number;
  payrollPct: number;
  foodPct: number;
  drinkPct: number;
  salesVsLastYearPct: number;
} | null;

type InsightsBarProps = {
  insights: Insights;
  currentWeekNow: string;
  payrollTarget: number;
};

function formatGBP(n: number | undefined | null) {
  if (n === undefined || n === null || isNaN(n as any)) return "£0";
  return "£" + Number(n).toLocaleString();
}

export default function InsightsBar({
  insights,
  currentWeekNow,
  payrollTarget,
}: InsightsBarProps) {
  if (!insights) return null;

  const payrollGood = insights.payrollPct <= payrollTarget;
  const salesVarGood = insights.salesVar >= 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Current week */}
      <div className="bg-white border rounded-xl shadow p-4">
        <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          Current Week
        </div>
        <div className="mt-1 text-2xl font-bold text-gray-900">
          {currentWeekNow}
        </div>
        <div className="text-[11px] text-gray-400 mt-2">
          Live reporting week (Mon–Sun)
        </div>
      </div>

      {/* Last week snapshot */}
      <div className="bg-white border rounded-xl shadow p-4">
        <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          Last Week ({insights.wkLabel || "—"})
        </div>

        <div className="mt-2 text-sm text-gray-800 space-y-1">
          <div>
            <span className="font-semibold text-gray-900">Sales:</span>{" "}
            {formatGBP(insights.salesActual)}{" "}
            <span className="text-[11px] text-gray-500">actual</span>
          </div>
          <div>
            <span className="font-semibold text-gray-900">Budget:</span>{" "}
            {formatGBP(insights.salesBudget)}
          </div>
          <div
            className={`text-sm font-semibold ${
              salesVarGood ? "text-green-600" : "text-red-600"
            }`}
          >
            Var: {formatGBP(insights.salesVar)} (
            {insights.salesVarPct.toFixed(1)}%)
          </div>
        </div>

        <div className="mt-3 text-sm">
          <div className="font-semibold text-gray-900">Payroll %</div>
          <div
            className={`text-sm font-bold ${
              payrollGood ? "text-green-600" : "text-red-600"
            }`}
          >
            {insights.payrollPct.toFixed(1)}%
            <span className="text-xs text-gray-500 font-normal">
              {" "}
              / target {payrollTarget}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
