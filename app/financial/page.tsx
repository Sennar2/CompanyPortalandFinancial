"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CSVLink } from "react-csv";
import { supabase } from "../../src/lib/supabaseClient";

import InsightsBar from "../../src/components/financial/InsightsBar";
import ComplianceBar from "../../src/components/financial/ComplianceBar";
import RankingTable from "../../src/components/financial/RankingTable";
import KPIBlock from "../../src/components/financial/KPIBlock";
import ChartSection from "../../src/components/financial/ChartSection";
import FinancialFooter from "../../src/components/financial/FinancialFooter";

// ─────────────────────────
// CONSTANTS
// ─────────────────────────

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
const TABS = ["Sales", "Payroll", "Food", "Drink"];

// ─────────────────────────
// HELPERS
// ─────────────────────────

// "W43" -> 43
function parseWeekNum(weekStr: any) {
  const num = parseInt(String(weekStr || "").replace(/[^\d]/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

// ISO week (Mon-Sun style)
function getISOWeek(date = new Date()) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return weekNo > 52 ? 52 : weekNo;
}
function getCurrentWeekLabel() {
  return `W${getISOWeek(new Date())}`;
}

// parse Google Sheets tab -> array of row objects
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

// GET one sheet tab
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

// merge multiple site tabs into week totals (for a Brand)
function rollupByWeek(rowsArr: any[]) {
  if (!rowsArr.length) return [];
  const grouped: Record<string, any[]> = {};
  for (const row of rowsArr) {
    const w = String(row.Week || "").trim();
    if (!grouped[w]) grouped[w] = [];
    grouped[w].push(row);
  }

  const numericKeys = Object.keys(rowsArr[0]).filter(
    (k) => typeof rowsArr[0][k] === "number"
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

  // sort by week number ascending
  merged.sort(
    (a: any, b: any) => parseWeekNum(a.Week) - parseWeekNum(b.Week)
  );

  return merged;
}

// Builds Week -> Period,Quarter lookup
function buildWeekToPeriodQuarter() {
  return Array.from({ length: 52 }, (_, i) => {
    const w = i + 1;
    let periodVal;
    let quarter;
    if (w <= 13) {
      quarter = "Q1";
      periodVal = w <= 4 ? "P1" : w <= 8 ? "P2" : "P3";
    } else if (w <= 26) {
      quarter = "Q2";
      periodVal = w <= 17 ? "P4" : w <= 21 ? "P5" : "P6";
    } else if (w <= 39) {
      quarter = "Q3";
      periodVal = w <= 30 ? "P7" : w <= 34 ? "P8" : "P9";
    } else {
      quarter = "Q4";
      periodVal = w <= 43 ? "P10" : w <= 47 ? "P11" : "P12";
    }
    return { week: `W${w}`, period: periodVal, quarter };
  });
}

/**
 * computeInsightsBundle
 * Picks "last completed week" (currentWeek-1 with data),
 * and returns everything the dashboard cards need, plus
 * avgPayrollVar4w.
 */
function computeInsightsBundle(rows: any[]) {
  if (!rows || rows.length === 0) return null;

  // decorate rows with numeric week
  const decorated = rows.map((r) => ({
    ...r,
    __weekNum: parseWeekNum(r.Week),
  }));

  // choose snapshot week = current ISO week - 1
  const currentWeekNum = getISOWeek(new Date());
  const snapshotWeekNum =
    currentWeekNum - 1 <= 0 ? currentWeekNum : currentWeekNum - 1;

  function rowHasData(r: any) {
    return (
      (r.Sales_Actual && r.Sales_Actual !== 0) ||
      (r.Payroll_Actual && r.Payroll_Actual !== 0) ||
      (r.Sales_Budget && r.Sales_Budget !== 0)
    );
  }

  // try exact snapshotWeekNum first
  let latestRow = decorated.find(
    (r) => r.__weekNum === snapshotWeekNum && rowHasData(r)
  );

  // fallback: most recent <= snapshotWeekNum that has data
  if (!latestRow) {
    const cands = decorated
      .filter((r) => r.__weekNum <= snapshotWeekNum && rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = cands[cands.length - 1];
  }

  // final fallback: any row with data
  if (!latestRow) {
    const cands = decorated
      .filter((r) => rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = cands[cands.length - 1];
  }

  if (!latestRow) return null;

  const usedWeekNum = latestRow.__weekNum;
  const wkLabel = latestRow.Week || `W${usedWeekNum}`;

  // compute last-4-weeks avg of Payroll_v%
  const windowWeeks = [
    usedWeekNum,
    usedWeekNum - 1,
    usedWeekNum - 2,
    usedWeekNum - 3,
  ].filter((n) => n > 0);

  function parsePayrollVar(val: any): number {
    if (val === undefined || val === null) return 0;
    const cleaned = String(val).replace("%", "").trim();
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? 0 : num;
  }

  const last4Rows = decorated.filter((r) =>
    windowWeeks.includes(r.__weekNum)
  );
  const payrollTrendVals = last4Rows.map((row) =>
    parsePayrollVar(row["Payroll_v%"])
  );

  const avgPayrollVar4w =
    payrollTrendVals.length > 0
      ? payrollTrendVals.reduce((sum, n) => sum + n, 0) /
        payrollTrendVals.length
      : 0;

  // KPIs
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
    wkLabel, // e.g. "W43" (last completed week)
    salesActual,
    salesBudget,
    salesVar,
    salesVarPct,
    payrollPct,
    foodPct,
    drinkPct,
    salesVsLastYearPct,
    avgPayrollVar4w,
    currentWeekLabel: getCurrentWeekLabel(), // e.g. "W44"
  };
}

// role -> which tabs you can view
function computeAllowedLocationsForProfile(profile: any) {
  if (!profile) return [];
  const roleLower = (profile.role || "").toLowerCase();
  const home = profile.home_location;

  if (
    roleLower === "admin" ||
    roleLower === "operation" ||
    roleLower === "ops"
  ) {
    return [
      "GroupOverview",
      "La Mia Mamma (Brand)",
      "Fish and Bubbles (Brand)",
      "Made in Italy (Brand)",
      ...STORE_LOCATIONS,
    ];
  }

  if (roleLower === "manager") {
    return [home];
  }

  return [home].filter(Boolean);
}

// ─────────────────────────
// PAGE COMPONENT
// ─────────────────────────

export default function FinancialPage() {
  // auth
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // permissions
  const [allowedLocations, setAllowedLocations] = useState<string[]>([]);
  const [initialLocation, setInitialLocation] = useState<string>("");

  // UI state
  const [location, setLocation] = useState<string>("");
  const [period, setPeriod] = useState<string>("Week");
  const [activeTab, setActiveTab] = useState<string>("Sales");

  // data state
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [rankingData, setRankingData] = useState<any[]>([]);

  const [currentWeekNow] = useState(getCurrentWeekLabel());

  // keep session synced
  useEffect(() => {
    let sub: any;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session);

      const { data: listener } = await supabase.auth.onAuthStateChange(
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
    })();

    return () => {
      if (sub) sub.subscription.unsubscribe();
    };
  }, []);

  // load profile
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

      const locs = computeAllowedLocationsForProfile(data);
      setAllowedLocations(locs);
      setInitialLocation(locs[0] || "");

      setAuthLoading(false);
    }

    loadProfile();
  }, [session]);

  const roleLower = (profile?.role || "").toLowerCase();
  const canViewFinance =
    roleLower === "admin" ||
    roleLower === "operation" ||
    roleLower === "ops" ||
    roleLower === "manager";

  // auto-set first location
  useEffect(() => {
    if (!location && initialLocation) {
      setLocation(initialLocation);
    }
  }, [initialLocation, location]);

  // Week -> Period,Quarter map
  const WEEK_TO_PERIOD_QUARTER = useMemo(buildWeekToPeriodQuarter, []);

  // decorate rows with Period + Quarter
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

  // groupMergedRowsBy for "Period" / "Quarter"
  function groupMergedRowsBy(bucketKey: "Period" | "Quarter") {
    if (!mergedRows.length) return [];
    const grouped: Record<string, any[]> = {};
    for (const row of mergedRows) {
      const key = row[bucketKey];
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    }

    const numericKeys = Object.keys(mergedRows[0]).filter(
      (k) => typeof mergedRows[0][k] === "number"
    );

    return Object.entries(grouped).map(([label, rows]) => {
      const sums: Record<string, number> = {};
      numericKeys.forEach((col) => {
        sums[col] = rows.reduce((total, r) => total + (r[col] || 0), 0);
      });
      return {
        Week: label,
        ...sums,
      };
    });
  }

  const filteredData = useMemo(() => {
    if (!mergedRows.length) return [];
    if (period === "Week") return mergedRows;
    if (period === "Period") return groupMergedRowsBy("Period");
    return groupMergedRowsBy("Quarter");
  }, [mergedRows, period]);

  // insights = last completed week snapshot, avgPayrollVar4w etc
  const insights = useMemo(
    () => computeInsightsBundle(mergedRows),
    [mergedRows]
  );

  // fetch rows for the current location
  useEffect(() => {
    async function load() {
      if (!location) return;
      try {
        setLoadingData(true);
        setFetchError("");

        const isBrand = !!BRAND_GROUPS[location];
        let rows: any[] = [];

        if (isBrand) {
          const allData = await Promise.all(
            BRAND_GROUPS[location].map((site) => fetchTab(site))
          );
          rows = rollupByWeek(allData.flat());
        } else {
          // "GroupOverview" or an individual store tab
          rows = await fetchTab(location);
          rows.sort(
            (a, b) => parseWeekNum(a.Week) - parseWeekNum(b.Week)
          );
        }

        setRawRows(rows);
      } catch (err: any) {
        console.error(err);
        setFetchError(
          err instanceof Error
            ? err.message
            : "Unknown error loading data"
        );
        setRawRows([]);
      } finally {
        setLoadingData(false);
      }
    }

    load();
  }, [location]);

  // ranking for admin/ops
  useEffect(() => {
    async function buildRanking() {
      if (
        roleLower !== "admin" &&
        roleLower !== "operation" &&
        roleLower !== "ops"
      ) {
        setRankingData([]);
        return;
      }

      try {
        const result = await Promise.all(
          STORE_LOCATIONS.map(async (loc) => {
            const rows = await fetchTab(loc);
            if (!rows || rows.length === 0) return null;

            const sorted = [...rows].sort(
              (a, b) => parseWeekNum(a.Week) - parseWeekNum(b.Week)
            );
            const latest = sorted[sorted.length - 1];
            if (!latest) return null;

            const salesActual = latest.Sales_Actual || 0;
            const salesBudget = latest.Sales_Budget || 0;

            const payrollPct =
              salesActual !== 0
                ? (latest.Payroll_Actual / salesActual) * 100
                : 0;

            const foodPct =
              salesActual !== 0
                ? (latest.Food_Actual / salesActual) * 100
                : 0;

            const drinkPct =
              salesActual !== 0
                ? (latest.Drink_Actual / salesActual) * 100
                : 0;

            const salesVar = salesActual - salesBudget;

            return {
              location: loc,
              week: latest.Week,
              payrollPct,
              foodPct,
              drinkPct,
              salesVar,
            };
          })
        );

        const cleaned = result.filter(Boolean) as any[];
        cleaned.sort((a, b) => b.payrollPct - a.payrollPct);
        setRankingData(cleaned);
      } catch (err) {
        console.error("Ranking build failed:", err);
        setRankingData([]);
      }
    }

    buildRanking();
  }, [roleLower]);

  // chart config
  const chartConfig = {
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

  const yTickFormatter = (val: any) => {
    if (val === 0) return "£0";
    if (!val) return "";
    return "£" + Number(val).toLocaleString();
  };

  const tooltipFormatter = (value: any, name: any) => {
    return ["£" + Number(value).toLocaleString(), name];
  };

  // ─────────────────────────
  // AUTH GUARDS
  // ─────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 font-medium text-sm">
        Loading profile…
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center font-sans">
        <div className="bg-white border border-gray-200 rounded-xl shadow-xl text-center text-red-600 font-medium text-sm px-4 py-3 max-w-xs">
          You are not signed in.
        </div>
      </div>
    );
  }

  if (!canViewFinance) {
    return (
      <div className="min-h-screen flex items-center justify-center font-sans">
        <div className="bg-white border border-gray-200 rounded-xl shadow-xl text-center text-red-600 font-medium text-sm px-4 py-3 max-w-xs">
          You don&apos;t have permission to view Financial Performance.
        </div>
      </div>
    );
  }

  if (!allowedLocations.length || !initialLocation) {
    return (
      <div className="min-h-screen flex items-center justify-center font-sans">
        <div className="bg-white border border-gray-200 rounded-xl shadow-xl text-center text-red-600 font-medium text-sm px-4 py-3 max-w-xs">
          No location access configured for this account.
        </div>
      </div>
    );
  }

  // ─────────────────────────
  // PAGE RENDER
  // (HEADER from layout.tsx already, so DO NOT render another header here)
  // ─────────────────────────

  return (
    <main className="bg-gray-50 min-h-screen font-sans text-gray-900 p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top row: title + selects */}
      <section className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        {/* Left: title */}
        <div className="flex-1">
          <div className="text-xs font-semibold text-gray-500 leading-tight">
            Performance {new Date().getFullYear()}
          </div>
          <h1 className="text-lg font-semibold text-gray-900 leading-snug flex flex-wrap items-baseline gap-2">
            <span>Financial Dashboard</span>
            <span className="text-[11px] text-gray-500 font-normal">
              Current Week: {currentWeekNow}
            </span>
          </h1>
        </div>

        {/* Right: selectors */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Location */}
          <div className="flex flex-col text-sm">
            <label className="text-[11px] font-semibold text-gray-700 mb-1 leading-none">
              Select Location
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="bg-white border border-gray-300 rounded-full text-sm text-gray-900 px-3 py-2 shadow-sm"
            >
              {allowedLocations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          {/* Period */}
          <div className="flex flex-col text-sm">
            <label className="text-[11px] font-semibold text-gray-700 mb-1 leading-none">
              Select Period
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-white border border-gray-300 rounded-full text-sm text-gray-900 px-3 py-2 shadow-sm"
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Row 1: Two big cards (Current Week / Last Week Results) */}
      <InsightsBar
        insights={insights}
        payrollTarget={PAYROLL_TARGET}
      />

      {/* Row 2: Compliance KPIs (Payroll%, Food%, Drink%, Sales vs LY) */}
      <ComplianceBar
        insights={insights}
        payrollTarget={PAYROLL_TARGET}
        foodTarget={FOOD_TARGET}
        drinkTarget={DRINK_TARGET}
      />

      {/* Ranking table (admin / ops only) */}
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

      {/* KPI block for totals */}
      {!loadingData && !fetchError && (
        <KPIBlock
          data={filteredData}
          payrollTarget={PAYROLL_TARGET}
          foodTarget={FOOD_TARGET}
          drinkTarget={DRINK_TARGET}
        />
      )}

      {/* Tab buttons */}
      <div className="flex flex-wrap justify-center gap-2 mt-6 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-sm font-medium border rounded-lg px-3 py-2 shadow-sm ${
              activeTab === tab
                ? "bg-gray-900 text-white shadow-2xl"
                : "bg-white text-gray-900 border-gray-300 shadow"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Chart section */}
      {!loadingData && !fetchError && (
        <ChartSection
          activeTab={activeTab}
          filteredData={filteredData}
          chartConfig={chartConfig}
          yTickFormatter={yTickFormatter}
          tooltipFormatter={tooltipFormatter}
          CSVLink={CSVLink}
        />
      )}

      {/* Status / errors */}
      {loadingData && (
        <p className="text-center text-sm text-gray-500 mt-4">
          Loading data…
        </p>
      )}

      {!loadingData && fetchError && (
        <p className="text-center text-sm font-medium text-red-600 mt-4">
          Could not load data: {fetchError}
        </p>
      )}

      <FinancialFooter />
    </main>
  );
}