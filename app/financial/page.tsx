"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CSVLink } from "react-csv";

import { supabase } from "../../src/lib/supabaseClient";

import ComplianceBar from "../../src/components/financial/ComplianceBar";
import RankingTable from "../../src/components/financial/RankingTable";
import KPIBlock from "../../src/components/financial/KPIBlock";
import ChartSection from "../../src/components/financial/ChartSection";

// ─────────────────────────────────────────────
// CONSTANTS / CONFIG
// ─────────────────────────────────────────────

// NOTE: keep these targets exactly as requested
const PAYROLL_TARGET = 35; // %
const FOOD_TARGET = 12.5; // %
const DRINK_TARGET = 5.5; // %

const API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_API_KEY ||
  "AIzaSyB_dkFpvk6w_d9dPD_mWVhfB8-lly-9FS8";

const SPREADSHEET_ID =
  process.env.NEXT_PUBLIC_SHEET_ID ||
  "1PPVSEcZ6qLOEK2Z0uRLgXCnS_maazWFO_yMY648Oq1g";

const BRAND_GROUPS: Record<string, string[]> = {
  "La Mia Mamma (Brand)": [
    "La Mia Mamma - Chelsea",
    "La Mia Mamma - Hollywood Road",
    "La Mia Mamma - Notting Hill",
    "La Mia Mamma - Battersea",
  ],
  "Fish and Bubbles (Brand)": [
    "Fish and Bubbles - Fulham",
    "Fish and Bubbles - Notting Hill",
  ],
  "Made in Italy (Brand)": [
    "Made in Italy - Chelsea",
    "Made in Italy - Battersea",
  ],
};

const STORE_LOCATIONS = [
  "La Mia Mamma - Chelsea",
  "La Mia Mamma - Hollywood Road",
  "La Mia Mamma - Notting Hill",
  "La Mia Mamma - Battersea",
  "Fish and Bubbles - Fulham",
  "Fish and Bubbles - Notting Hill",
  "Made in Italy - Chelsea",
  "Made in Italy - Battersea",
];

const PERIODS = ["Week", "Period", "Quarter"];

//
// chartConfig is used by <ChartSection />
//
const chartConfig: Record<
  string,
  { key: string; color: string; name: string }[]
> = {
  Sales: [
    { key: "Sales_Actual", color: "#4ade80", name: "Actual" },
    { key: "Sales_Budget", color: "#60a5fa", name: "Budget" },
    { key: "Sales_LastYear", color: "#fbbf24", name: "Last Year" },
  ],
  Payroll: [
    { key: "Payroll_Actual", color: "#4ade80", name: "Actual" },
    { key: "Payroll_Budget", color: "#60a5fa", name: "Budget" },
    { key: "Payroll_Theo", color: "#a78bfa", name: "Theo" },
  ],
  Food: [
    { key: "Food_Actual", color: "#4ade80", name: "Actual" },
    { key: "Food_Budget", color: "#60a5fa", name: "Budget" },
    { key: "Food_Theo", color: "#a78bfa", name: "Theo" },
  ],
  Drink: [
    { key: "Drink_Actual", color: "#4ade80", name: "Actual" },
    { key: "Drink_Budget", color: "#60a5fa", name: "Budget" },
    { key: "Drink_Theo", color: "#a78bfa", name: "Theo" },
  ],
};

const TABS = ["Sales", "Payroll", "Food", "Drink"];

// ─────────────────────────────────────────────
// SMALL HELPERS
// ─────────────────────────────────────────────

// parse "W43" -> 43
function parseWeekNum(weekStr: string | undefined) {
  const num = parseInt(String(weekStr || "").replace(/[^\d]/g, ""), 10);
  return Number.isNaN(num) ? 0 : num;
}

// ISO week number (Mon-Sun weeks)
// we clamp >52 to 52 because your mapping array only goes to 52
function getISOWeek(date = new Date()) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7; // sunday -> 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const diffDays = (d.getTime() - yearStart.getTime()) / 86400000 + 1;
  const weekNo = Math.ceil(diffDays / 7);
  return weekNo > 52 ? 52 : weekNo;
}

function getCurrentWeekLabel() {
  return `W${getISOWeek(new Date())}`;
}

// take values from Google Sheets API and turn into objects
function parseSheetValues(values: any[][] | undefined) {
  if (!values || values.length < 2) return [];
  const [headers, ...rows] = values;
  return rows.map((row) =>
    headers.reduce((obj: any, key: string, idx: number) => {
      let value = row[idx];
      if (key === "LocationBreakdown" && typeof value === "string") {
        try {
          value = JSON.parse(value);
        } catch {
          value = {};
        }
      } else if (!isNaN(value)) {
        value = Number(value);
      }
      obj[key] = value;
      return obj;
    }, {})
  );
}

// fetch one tab
async function fetchTab(tabName: string) {
  const range = `${tabName}!A1:Z100`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
    range
  )}?key=${API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} loading "${tabName}"`);
  }
  const json = await res.json();
  return parseSheetValues(json.values);
}

// When we merge multiple sites (brand view), we sum numeric cols per week
function rollupByWeek(rowsArray: any[]) {
  if (!rowsArray.length) return [];
  const grouped: Record<string, any[]> = {};

  for (const row of rowsArray) {
    const label = String(row.Week || "").trim();
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(row);
  }

  const numericKeys = Object.keys(rowsArray[0]).filter(
    (k) => typeof rowsArray[0][k] === "number"
  );

  const merged = Object.entries(grouped).map(([weekLabel, rows]) => {
    const totals: Record<string, number> = {};
    numericKeys.forEach((col) => {
      totals[col] = rows.reduce((sum, r) => sum + (r[col] || 0), 0);
    });
    return {
      Week: weekLabel,
      ...totals,
    };
  });

  merged.sort(
    (a: any, b: any) => parseWeekNum(a.Week) - parseWeekNum(b.Week)
  );

  return merged;
}

/**
 * computeInsightsBundle(rows)
 *
 * We want LAST CLOSED WEEK, not an empty W52 etc.
 * Then we calculate:
 *  - salesActual / salesBudget / var / var%
 *  - payrollPct, foodPct, drinkPct
 *  - salesVsLastYearPct
 *  - avgPayrollVar4w = average of Payroll_v% over that week and previous 3
 *
 * returns null if nothing useful.
 */
function computeInsightsBundle(rows: any[]) {
  if (!rows || rows.length === 0) return null;

  // decorate rows with numeric week value
  const decorated = rows.map((r: any) => ({
    ...r,
    __weekNum: parseWeekNum(r.Week),
  }));

  // figure out which week we consider "last complete"
  const currentWeekNum = getISOWeek(new Date()); // e.g. 44 now
  const snapshotWeekNum =
    currentWeekNum - 1 <= 0 ? currentWeekNum : currentWeekNum - 1; // e.g. 43

  // helper: is there real data?
  function rowHasData(r: any) {
    return (
      (r.Sales_Actual && r.Sales_Actual !== 0) ||
      (r.Payroll_Actual && r.Payroll_Actual !== 0) ||
      (r.Sales_Budget && r.Sales_Budget !== 0)
    );
  }

  // first try EXACT snapshotWeekNum with data
  let latestRow = decorated.find(
    (r) => r.__weekNum === snapshotWeekNum && rowHasData(r)
  );

  // fallback: most recent row <= snapshotWeekNum with data
  if (!latestRow) {
    const candidates = decorated
      .filter((r) => r.__weekNum <= snapshotWeekNum && rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = candidates[candidates.length - 1];
  }

  // final fallback: just last row with any data at all
  if (!latestRow) {
    const candidates = decorated
      .filter((r) => rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = candidates[candidates.length - 1];
  }

  if (!latestRow) return null;

  const weekNumWeUse = latestRow.__weekNum;
  const wkLabel = latestRow.Week || `W${weekNumWeUse}`;

  // build [weekNumWeUse, -1, -2, -3] to compute 4-week avg of Payroll_v%
  const windowWeeks = [
    weekNumWeUse,
    weekNumWeUse - 1,
    weekNumWeUse - 2,
    weekNumWeUse - 3,
  ].filter((n) => n > 0);

  const last4Rows = decorated.filter((r) =>
    windowWeeks.includes(r.__weekNum)
  );

  function parsePayrollVar(val: any): number {
    if (val === undefined || val === null) return 0;
    const cleaned = String(val).replace("%", "").trim();
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? 0 : num;
  }

  const payrollTrendVals = last4Rows.map((row) =>
    parsePayrollVar(row["Payroll_v%"])
  );

  const avgPayrollVar4w =
    payrollTrendVals.length > 0
      ? payrollTrendVals.reduce((sum, n) => sum + n, 0) /
        payrollTrendVals.length
      : 0;

  // metrics
  const salesActual = latestRow.Sales_Actual || 0;
  const salesBudget = latestRow.Sales_Budget || 0;
  const salesLastYear = latestRow.Sales_LastYear || 0;

  const salesVar = salesActual - salesBudget;
  const salesVarPct =
    salesBudget !== 0 ? (salesVar / salesBudget) * 100 : 0;

  const payrollPct =
    salesActual !== 0
      ? (latestRow.Payroll_Actual / salesActual) * 100
      : 0;

  const foodPct =
    salesActual !== 0
      ? (latestRow.Food_Actual / salesActual) * 100
      : 0;

  const drinkPct =
    salesActual !== 0
      ? (latestRow.Drink_Actual / salesActual) * 100
      : 0;

  const salesVsLastYearPct =
    salesLastYear !== 0
      ? ((salesActual - salesLastYear) / salesLastYear) * 100
      : 0;

  return {
    wkLabel, // e.g. "W43"
    salesActual,
    salesBudget,
    salesVar,
    salesVarPct,
    payrollPct,
    foodPct,
    drinkPct,
    salesVsLastYearPct,
    avgPayrollVar4w,
  };
}

// build WEEK_TO_PERIOD_QUARTER map
function buildWeekMap() {
  return Array.from({ length: 52 }, (_, i) => {
    const w = i + 1;
    let periodVal;
    let quarterVal;
    if (w <= 13) {
      quarterVal = "Q1";
      periodVal = w <= 4 ? "P1" : w <= 8 ? "P2" : "P3";
    } else if (w <= 26) {
      quarterVal = "Q2";
      periodVal = w <= 17 ? "P4" : w <= 21 ? "P5" : "P6";
    } else if (w <= 39) {
      quarterVal = "Q3";
      periodVal = w <= 30 ? "P7" : w <= 34 ? "P8" : "P9";
    } else {
      quarterVal = "Q4";
      periodVal = w <= 43 ? "P10" : w <= 47 ? "P11" : "P12";
    }
    return { week: `W${w}`, period: periodVal, quarter: quarterVal };
  });
}

// group mergedRows by a bucket (Period or Quarter)
function groupMergedRowsBy(mergedRows: any[], bucketKey: "Period" | "Quarter") {
  if (!mergedRows.length) return [];
  const grouped: Record<string, any[]> = {};
  for (const row of mergedRows) {
    const k = row[bucketKey];
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(row);
  }

  const numericKeys = Object.keys(mergedRows[0]).filter(
    (c) => typeof mergedRows[0][c] === "number"
  );

  return Object.entries(grouped).map(([label, bucketRows]) => {
    const sums: Record<string, number> = {};
    numericKeys.forEach((col) => {
      sums[col] = bucketRows.reduce((tot, r) => tot + (r[col] || 0), 0);
    });
    return {
      Week: label,
      ...sums,
    };
  });
}

function formatCurrency(val: any) {
  if (val === undefined || val === null || isNaN(val)) return "£0";
  return "£" + Number(val).toLocaleString();
}

// helpers for coloured % text
function pctColorClass(
  valuePct: number,
  targetPct: number,
  invertLowerIsGood = true
) {
  // invertLowerIsGood=true means "lower is better" (like payroll cost %)
  // if false, higher is better
  if (Number.isNaN(valuePct)) return "text-gray-600";

  if (invertLowerIsGood) {
    if (valuePct <= targetPct) return "text-green-600";
    if (valuePct <= targetPct + 2) return "text-yellow-500";
    return "text-red-600";
  } else {
    // not used right now, but here if we ever need it
    if (valuePct >= targetPct) return "text-green-600";
    if (valuePct >= targetPct - 2) return "text-yellow-500";
    return "text-red-600";
  }
}

// ─────────────────────────────────────────────
// INLINE SUBCOMPONENT: HEADER BAR
// (No external FinancialHeader import = no TS drama)
// ─────────────────────────────────────────────
function HeaderBar({
  profile,
  onSignOut,
}: {
  profile: any;
  onSignOut: () => void | Promise<void>;
}) {
  return (
    <header className="w-full border-b bg-white/90 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3 md:py-4">
        {/* LEFT: logo + portal text */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="La Mia Mamma"
              width={40}
              height={40}
              className="rounded-sm object-contain"
            />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-gray-900">
                La Mia Mamma Portal
              </span>
              <span className="text-[11px] text-gray-500 -mt-0.5">
                Financial Performance
              </span>
            </div>
          </Link>
        </div>

        {/* RIGHT: user info + logout */}
        <div className="flex items-center gap-3 text-sm">
          {profile ? (
            <>
              <div className="text-right leading-tight hidden sm:block">
                <div className="text-gray-900 font-medium text-[13px] truncate max-w-[140px]">
                  {profile.full_name || "User"}
                </div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wide">
                  {profile.role || "user"}
                </div>
              </div>

              <button
                onClick={onSignOut}
                className="rounded-md bg-gray-900 text-white text-[12px] font-semibold px-3 py-1.5 hover:bg-black transition"
              >
                Log out
              </button>
            </>
          ) : (
            <div className="h-[30px] w-[80px] bg-gray-200 rounded animate-pulse" />
          )}
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────
// INLINE SUBCOMPONENT: INSIGHTS HERO
// (Current Week label + Last Week performance)
// ─────────────────────────────────────────────
function InsightsHero({
  insights,
  currentWeekNow,
}: {
  insights: any; // from computeInsightsBundle
  currentWeekNow: string;
}) {
  if (!insights) return null;

  const lastWeekLabel = insights.wkLabel || "Last Week";
  const payrollClass = pctColorClass(insights.payrollPct, PAYROLL_TARGET, true);
  const foodClass = pctColorClass(insights.foodPct, FOOD_TARGET, true);
  const drinkClass = pctColorClass(insights.drinkPct, DRINK_TARGET, true);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-7xl mx-auto px-4">
      {/* LEFT CARD: Last Closed Week Performance */}
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-6 flex flex-col">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Last Closed Week
            </div>
            <div className="text-xl font-bold text-gray-900">
              {lastWeekLabel}
            </div>
          </div>
          <div className="text-right text-[11px] text-gray-500 leading-tight">
            <div>vs Budget</div>
            <div
              className={
                insights.salesVar >= 0 ? "text-green-600" : "text-red-600"
              }
            >
              {insights.salesVar >= 0 ? "+" : ""}
              {formatCurrency(insights.salesVar)} (
              {insights.salesVarPct.toFixed(1)}%)
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-y-4 text-sm">
          <div>
            <div className="text-gray-500 text-xs uppercase font-semibold tracking-wide">
              Sales Actual
            </div>
            <div className="text-gray-900 font-semibold text-base">
              {formatCurrency(insights.salesActual)}
            </div>
            <div className="text-[11px] text-gray-500">
              Budget {formatCurrency(insights.salesBudget)}
            </div>
          </div>

          <div>
            <div className="text-gray-500 text-xs uppercase font-semibold tracking-wide">
              Vs LY
            </div>
            <div
              className={
                insights.salesVsLastYearPct >= 0
                  ? "text-green-600 font-semibold text-base"
                  : "text-red-600 font-semibold text-base"
              }
            >
              {insights.salesVsLastYearPct >= 0 ? "+" : ""}
              {insights.salesVsLastYearPct.toFixed(1)}%
            </div>
            <div className="text-[11px] text-gray-500">
              Yr-on-Yr sales %
            </div>
          </div>

          <div>
            <div className="text-gray-500 text-xs uppercase font-semibold tracking-wide">
              Payroll %
            </div>
            <div className={`font-semibold text-base ${payrollClass}`}>
              {insights.payrollPct.toFixed(1)}%
            </div>
            <div className="text-[11px] text-gray-500">
              Target {PAYROLL_TARGET}%
            </div>
          </div>

          <div>
            <div className="text-gray-500 text-xs uppercase font-semibold tracking-wide">
              Food %
            </div>
            <div className={`font-semibold text-base ${foodClass}`}>
              {insights.foodPct.toFixed(1)}%
            </div>
            <div className="text-[11px] text-gray-500">
              Target {FOOD_TARGET}%
            </div>
          </div>

          <div>
            <div className="text-gray-500 text-xs uppercase font-semibold tracking-wide">
              Drink %
            </div>
            <div className={`font-semibold text-base ${drinkClass}`}>
              {insights.drinkPct.toFixed(1)}%
            </div>
            <div className="text-[11px] text-gray-500">
              Target {DRINK_TARGET}%
            </div>
          </div>

          <div>
            <div className="text-gray-500 text-xs uppercase font-semibold tracking-wide">
              4-wk Payroll Trend
            </div>
            <div
              className={`font-semibold text-base ${
                insights.avgPayrollVar4w < 1
                  ? "text-green-600"
                  : insights.avgPayrollVar4w < 2
                  ? "text-yellow-500"
                  : "text-red-600"
              }`}
            >
              {insights.avgPayrollVar4w >= 0 ? "+" : ""}
              {insights.avgPayrollVar4w.toFixed(2)}%
            </div>
            <div className="text-[11px] text-gray-500">
              Avg Payroll_v% (4w)
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT CARD: Current Week label / status */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl text-white shadow-xl p-6 flex flex-col">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-200">
              Current Week
            </div>
            <div className="text-xl font-bold">{currentWeekNow}</div>
          </div>

          <div className="text-right text-[11px] leading-tight text-indigo-200">
            <div>Last closed:</div>
            <div className="font-semibold text-white">
              {lastWeekLabel}
            </div>
          </div>
        </div>

        <p className="text-sm text-indigo-100 leading-relaxed">
          You&apos;re tracking{" "}
          <span
            className={
              insights.salesVarPct >= 0
                ? "text-green-300 font-semibold"
                : "text-red-300 font-semibold"
            }
          >
            {insights.salesVarPct >= 0 ? "+" : ""}
            {insights.salesVarPct.toFixed(1)}%
          </span>{" "}
          vs budget in {lastWeekLabel}, with payroll at{" "}
          <span className="font-semibold text-white">
            {insights.payrollPct.toFixed(1)}%
          </span>{" "}
          and a 4-week payroll trend of{" "}
          <span
            className={
              insights.avgPayrollVar4w < 1
                ? "text-green-300 font-semibold"
                : insights.avgPayrollVar4w < 2
                ? "text-yellow-300 font-semibold"
                : "text-red-300 font-semibold"
            }
          >
            {insights.avgPayrollVar4w >= 0 ? "+" : ""}
            {insights.avgPayrollVar4w.toFixed(2)}%
          </span>
          .
        </p>

        <div className="mt-6 text-[11px] text-indigo-200 leading-tight">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            <span>On / under target</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]" />
            <span>Slightly off target</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]" />
            <span>Needs attention</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function FinancialPage() {
  const router = useRouter();

  // auth / profile
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // allowed locations for dropdown
  const [allowedLocations, setAllowedLocations] = useState<string[]>([]);
  const [initialLocation, setInitialLocation] = useState<string>("");

  // UI state
  const [location, setLocation] = useState<string>("");
  const [period, setPeriod] = useState<string>("Week");
  const [activeTab, setActiveTab] = useState<string>("Sales");

  // sheet data
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string>("");

  // ranking info
  const [rankingData, setRankingData] = useState<any[]>([]);

  // memoize currentWeek label (current real-time)
  const [currentWeekNow] = useState<string>(getCurrentWeekLabel());

  // 1. bootstrap session watcher
  useEffect(() => {
    let sub: any;
    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session);

      const { data: listener } = supabase.auth.onAuthStateChange(
        (_event, newSession) => {
          setSession(newSession);
          if (!newSession) {
            setProfile(null);
            setAllowedLocations([]);
            setInitialLocation("");
          }
        }
      );
      sub = listener;
    }
    init();

    return () => {
      if (sub) sub.subscription.unsubscribe();
    };
  }, []);

  // 2. load profile for current user
  useEffect(() => {
    async function loadProfile() {
      if (!session) {
        setAuthLoading(false);
        return;
      }
      setAuthLoading(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, role, home_location")
        .eq("id", session.user.id)
        .single();

      if (error) {
        console.error("profile load error", error);
        setProfile(null);
        setAllowedLocations([]);
        setInitialLocation("");
        setAuthLoading(false);
        return;
      }

      setProfile(data);

      // role logic
      const roleLower = String(data.role || "").toLowerCase();
      const home = data.home_location;

      let locs: string[] = [];

      if (
        roleLower === "admin" ||
        roleLower === "operation" ||
        roleLower === "ops"
      ) {
        locs = [
          "GroupOverview",
          "La Mia Mamma (Brand)",
          "Fish and Bubbles (Brand)",
          "Made in Italy (Brand)",
          "La Mia Mamma - Chelsea",
          "La Mia Mamma - Hollywood Road",
          "La Mia Mamma - Notting Hill",
          "La Mia Mamma - Battersea",
          "Fish and Bubbles - Fulham",
          "Fish and Bubbles - Notting Hill",
          "Made in Italy - Chelsea",
          "Made in Italy - Battersea",
        ];
      } else if (
        roleLower === "manager" ||
        roleLower === "user"
      ) {
        // locked to home location
        const only =
          home ||
          "La Mia Mamma - Chelsea";
        locs = [only];
      } else {
        locs = [];
      }

      setAllowedLocations(locs);
      setInitialLocation(locs[0] || "");

      setAuthLoading(false);
    }

    loadProfile();
  }, [session]);

  // 3. set initial location once we know it
  useEffect(() => {
    if (!location && initialLocation) {
      setLocation(initialLocation);
    }
  }, [initialLocation, location]);

  // WEEK_TO_PERIOD_QUARTER map
  const WEEK_TO_PERIOD_QUARTER = useMemo(() => {
    return buildWeekMap();
  }, []);

  // 4. fetch data whenever location changes
  useEffect(() => {
    async function load() {
      if (!location) return;
      try {
        setLoadingData(true);
        setFetchError("");

        const isBrand = !!BRAND_GROUPS[location];
        let rows: any[] = [];

        if (isBrand) {
          // brand rollup
          const allData = await Promise.all(
            BRAND_GROUPS[location].map((site) => fetchTab(site))
          );
          rows = rollupByWeek(allData.flat());
        } else {
          // single site or GroupOverview
          rows = await fetchTab(location);
          // sort them ascending by numeric week
          rows.sort(
            (a: any, b: any) => parseWeekNum(a.Week) - parseWeekNum(b.Week)
          );
        }

        setRawRows(rows);
      } catch (err: any) {
        console.error(err);
        setFetchError(err?.message || "Error loading data");
        setRawRows([]);
      } finally {
        setLoadingData(false);
      }
    }

    load();
  }, [location]);

  // 5. decorate rawRows with Period / Quarter
  const mergedRows = useMemo(() => {
    return rawRows.map((item) => {
      const w = String(item.Week || "").trim();
      const match = WEEK_TO_PERIOD_QUARTER.find((x) => x.week === w);
      return {
        ...item,
        Period: match?.period || "P?",
        Quarter: match?.quarter || "Q?",
      };
    });
  }, [rawRows, WEEK_TO_PERIOD_QUARTER]);

  // 6. filter data by (Week | Period | Quarter)
  const filteredData = useMemo(() => {
    if (!mergedRows.length) return [];
    if (period === "Week") return mergedRows;
    if (period === "Period") return groupMergedRowsBy(mergedRows, "Period");
    return groupMergedRowsBy(mergedRows, "Quarter");
  }, [mergedRows, period]);

  // 7. insights for hero/compliance
  const insights = useMemo(() => computeInsightsBundle(mergedRows), [mergedRows]);

  // 8. ranking table (admin/ops only)
  useEffect(() => {
    async function buildRanking() {
      if (!profile) {
        setRankingData([]);
        return;
      }
      const roleLower = String(profile.role || "").toLowerCase();
      const canSee =
        roleLower === "admin" ||
        roleLower === "operation" ||
        roleLower === "ops";
      if (!canSee) {
        setRankingData([]);
        return;
      }

      try {
        const result = await Promise.all(
          STORE_LOCATIONS.map(async (loc) => {
            const rows = await fetchTab(loc);
            if (!rows || rows.length === 0) return null;

            // last meaningful row
            const sorted = [...rows].sort(
              (a, b) => parseWeekNum(a.Week) - parseWeekNum(b.Week)
            );

            // reuse same "last closed week" logic for each store
            const snapshot = computeInsightsBundle(sorted);
            if (!snapshot) return null;

            return {
              location: loc,
              week: snapshot.wkLabel,
              payrollPct: snapshot.payrollPct,
              foodPct: snapshot.foodPct,
              drinkPct: snapshot.drinkPct,
              salesVar: snapshot.salesVar, // £ over/under budget
            };
          })
        );

        const cleaned = result.filter(Boolean) as any[];
        // sort worst payroll first (highest % cost)
        cleaned.sort((a, b) => b.payrollPct - a.payrollPct);
        setRankingData(cleaned);
      } catch (err) {
        console.error("Ranking build failed:", err);
        setRankingData([]);
      }
    }

    buildRanking();
  }, [profile]);

  // signout
  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  // guards
  if (authLoading) {
    return (
      <main className="min-h-[80vh] flex items-center justify-center text-gray-500 text-sm">
        Loading profile…
      </main>
    );
  }

  if (!session || !profile) {
    return (
      <main className="min-h-[80vh] flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-xl shadow p-4 text-center text-red-600 text-sm font-medium max-w-xs">
          You are not signed in.
        </div>
      </main>
    );
  }

  const roleLower = String(profile.role || "").toLowerCase();
  const canViewFinance =
    roleLower === "admin" ||
    roleLower === "operation" ||
    roleLower === "ops" ||
    roleLower === "manager";

  if (!canViewFinance) {
    return (
      <main className="min-h-[80vh] flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-xl shadow p-4 text-center text-red-600 text-sm font-medium max-w-xs">
          You don&apos;t have permission to view Financial Performance.
        </div>
      </main>
    );
  }

  if (!allowedLocations.length || !initialLocation) {
    return (
      <main className="min-h-[80vh] flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-xl shadow p-4 text-center text-red-600 text-sm font-medium max-w-xs">
          No location access configured for this account.
        </div>
      </main>
    );
  }

  // ─────────────────────────────────────────────
  // PAGE UI
  // ─────────────────────────────────────────────
  return (
    <div className="bg-gray-50 min-h-screen text-gray-900 font-[Inter,system-ui,sans-serif]">
      {/* HEADER */}
      <HeaderBar profile={profile} onSignOut={handleSignOut} />

      <main className="max-w-7xl mx-auto w-full px-4 py-8 space-y-10">
        {/* FILTER ROW (centered, lots of air so Ranking isn't squashed) */}
        <div className="flex flex-col items-center gap-6">
          {/* Location Selector */}
          <div className="text-center">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
              Location
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-64 px-4 py-2 border rounded-full shadow text-sm bg-white text-gray-700"
            >
              {allowedLocations.map((loc) => (
                <option key={loc}>{loc}</option>
              ))}
            </select>
          </div>

          {/* Period Selector */}
          <div className="text-center">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
              View
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-64 px-4 py-2 border rounded-full shadow text-sm bg-white text-gray-700"
            >
              {PERIODS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        {/* HERO INSIGHTS SECTION (Last Week + Current Week) */}
        <InsightsHero insights={insights} currentWeekNow={currentWeekNow} />

        {/* COMPLIANCE BAR (traffic light etc.) */}
        <ComplianceBar
          insights={insights}
          payrollTarget={PAYROLL_TARGET}
          foodTarget={FOOD_TARGET}
          drinkTarget={DRINK_TARGET}
        />

        {/* RANKING TABLE (only admin/ops/etc). We gave it breathing room below controls */}
        {(roleLower === "admin" ||
          roleLower === "operation" ||
          roleLower === "ops") &&
          rankingData.length > 0 && (
            <RankingTable
              rankingData={rankingData}
              payrollTarget={PAYROLL_TARGET}
              foodTarget={FOOD_TARGET}
              drinkTarget={DRINK_TARGET}
            />
          )}

        {/* DATA LOAD STATES */}
        {loadingData && (
          <p className="text-center text-sm text-gray-500">Loading data…</p>
        )}

        {!loadingData && fetchError && (
          <p className="text-center text-sm text-red-600 font-medium">
            Could not load data: {fetchError}
          </p>
        )}

        {/* KPI BLOCK */}
        {!loadingData && !fetchError && (
          <KPIBlock
            data={filteredData}
            payrollTarget={PAYROLL_TARGET}
            foodTarget={FOOD_TARGET}
            drinkTarget={DRINK_TARGET}
          />
        )}

        {/* TAB BUTTONS (Sales / Payroll / Food / Drink) */}
        <div className="flex flex-wrap justify-center gap-2 pt-4">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 rounded-lg border text-xs font-medium shadow-sm transition
                ${
                  activeTab === tab
                    ? "bg-gray-900 text-white border-gray-900 shadow-xl"
                    : "bg-white text-gray-900 border-gray-300 hover:shadow-md"
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* CHART SECTION */}
        {!loadingData && !fetchError && (
          <ChartSection
            activeTab={activeTab}
            filteredData={filteredData}
            chartConfig={chartConfig}
            yTickFormatter={(val: any) => {
              if (val === 0) return "£0";
              if (!val) return "";
              return "£" + Number(val).toLocaleString();
            }}
            tooltipFormatter={(value: any, name: string) => {
              return [formatCurrency(value), name];
            }}
            CSVLink={CSVLink}
          />
        )}

        {/* FOOTER */}
        <footer className="text-center text-[11px] text-gray-400 pt-10 pb-16">
          <p>
            App developed by{" "}
            <a
              href="https://honeysucklesdesign.co.uk"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-700 underline"
            >
              Honeysuckles Design / Daniele Raicaldo
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
