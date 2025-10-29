"use client";

import React from "react";

type Insights = {
  wkLabel: string;
  salesActual: number;
  salesBudget: number;
  salesVar: number;
  salesVarPct: number;
  payrollPct: number;
} | null;

type InsightsBarProps = {
  insights: Insights;
  payrollTarget: number;
};

function formatGBP(n: number | undefined | null) {
  if (n === undefined || n === null || isNaN(n as any)) return "£0";
  return "£" + Number(n).toLocaleString();
}

export default function InsightsBar({
  insights,
  payrollTarget,
}: InsightsBarProps) {
  if (!insights) return null;

  const salesVarGood = insights.salesVar >= 0;
  const payrollGood = insights.payrollPct <= payrollTarget;

  return (
    <div className="bg-white border rounded-xl shadow p-4 w-full md:w-auto">
      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
        Last Week ({insights.wkLabel || "—"})
      </div>

      {/* Sales vs Budget */}
      <div className="mt-3 text-sm text-gray-800 space-y-1 leading-snug">
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

      {/* Payroll % vs target */}
      <div className="mt-4 text-sm leading-snug">
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
  );
}
