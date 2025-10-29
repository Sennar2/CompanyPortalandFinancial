"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CSVLink } from "react-csv";
import { supabase } from "../../src/lib/supabaseClient";

import FinancialHeader from "../../src/components/financial/FinancialHeader";
import InsightsBar from "../../src/components/financial/InsightsBar";
import ComplianceBar from "../../src/components/financial/ComplianceBar";
import RankingTable from "../../src/components/financial/RankingTable";
import KPIBlock from "../../src/components/financial/KPIBlock";
import ChartSection from "../../src/components/financial/ChartSection";
import FinancialFooter from "../../src/components/financial/FinancialFooter";

// ─────────────────────────────
// CONFIG / CONSTANTS
// ─────────────────────────────

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

// individual shops (also for ranking)
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

const PAYROLL_TARGET = 35; // %
const FOOD_TARGET = 12.5; // %
const DRINK_TARGET = 5.5; // %

// ─────────────────────────────
// HELPERS
// ─────────────────────────────

function formatCurrency(val: any) {
  if (val === undefined || val === null || isNaN(val)) return "£0";
  return "£" + Number(val).toLocaleString();
}

// extract number from "W43"
function parseWeekNum(weekStr: any) {
  const num = parseInt(String(weekStr || "").replace(/[^\d]/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

// ISO week (Mon-Sun)
function getISOWeek(date = new Date()) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return weekNo > 52 ? 52 : weekNo;
}

function getCurrentWeekLabel() {
  return `W${getISOWeek(new Date())}`;
}

// parse a Google Sheets tab into objects
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

// Fetch sheet tab
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

// roll up brand tabs by Week
function rollupByWeek(rowsArray: any[]) {
  if (!rowsArray.length) return [];
  const grouped: Record<string, any[]> = {};

  for (const row of rowsArray) {
    const w = String(row.Week || "").trim();
    if (!grouped[w]) grouped[w] = [];
    grouped[w].push(row);
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

// Map Week → Period / Quarter (same mapping logic as before)
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

function decorateWithPeriodQuarter(rows: any[], mapArr: any[]) {
  return rows.map((item) => {
    const w = String(item.Week || "").trim();
    const match = mapArr.find((x: any) => x.week === w);
    return {
      ...item,
      Period: match?.period || "P?",
      Quarter: match?.quarter || "Q?",
    };
  });
}

function groupMergedRowsByBucket(rows: any[], bucketKey: string) {
  if (!rows.length) return [];
  const grouped: Record<string, any[]> = {};

  rows.forEach((row) => {
    const key = row[bucketKey];
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  });

  const numericKeys = Object.keys(rows[0]).filter(
    (k) => typeof rows[0][k] === "number"
  );

  return Object.entries(grouped).map(([label, groupRows]) => {
    const sums: Record<string, number> = {};
    numericKeys.forEach((col) => {
      sums[col] = groupRows.reduce((total, r) => total + (r[col] || 0), 0);
    });
    return {
      Week: label,
      ...sums,
    };
  });
}

// build insights bundle for "last completed week"
function computeInsightsBundle(rows: any[]) {
  if (!rows || rows.length === 0) return null;

  const decorated = rows.map((r: any) => ({
    ...r,
    __weekNum: parseWeekNum(r.Week),
  }));

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

  // try exact
  let latestRow = decorated.find(
    (r) => r.__weekNum === snapshotWeekNum && rowHasData(r)
  );

  // fallback <= snapshotWeekNum
  if (!latestRow) {
    const candidates = decorated
      .filter((r) => r.__weekNum <= snapshotWeekNum && rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = candidates[candidates.length - 1];
  }

  // final fallback any non-empty
  if (!latestRow) {
    const candidates = decorated
      .filter((r) => rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = candidates[candidates.length - 1];
  }

  if (!latestRow) return null;

  const usedWeekNum = latestRow.__weekNum;
  const wkLabel = latestRow.Week || `W${usedWeekNum}`;

  // last 4-week signed avg of Payroll_v%
  const last4Weeks = [
    usedWeekNum,
    usedWeekNum - 1,
    usedWeekNum - 2,
    usedWeekNum - 3,
  ].filter((n) => n > 0);

  const last4Rows = decorated.filter((r) =>
    last4Weeks.includes(r.__weekNum)
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
    wkLabel,
    salesActual,
    salesBudget,
    salesVar,
    salesVarPct,
    payrollPct,
    foodPct,
    drinkPct,
    salesVsLastYearPct,
    avgPayrollVar4w,
    currentWeekLabel: getCurrentWeekLabel(),
  };
}

// build site ranking rows (only for admin/operation)
async function buildRankingData(roleLower: string) {
  if (roleLower !== "admin" && roleLower !== "operation") {
    return [];
  }

  const perSite = await Promise.all(
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

  const cleaned = perSite.filter(Boolean) as any[];
  cleaned.sort((a, b) => b.payrollPct - a.payrollPct);
  return cleaned;
}

// y-axis money ticks for charts
function yTickFormatter(val: any) {
  if (val === 0) return "£0";
  if (!val) return "";
  return "£" + Number(val).toLocaleString();
}

// tooltip formatter for charts
function tooltipFormatter(value: any, name: any) {
  return [formatCurrency(value), name];
}

// chart config for ChartSection
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

// ─────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────

export default function FinancialPage() {
  // auth
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // allowed locs
  const [allowedLocations, setAllowedLocations] = useState<string[]>([]);
  const [initialLocation, setInitialLocation] = useState<string>("");

  // UI selections
  const [location, setLocation] = useState<string>("");
  const [period, setPeriod] = useState<string>("Week");

  // sheet data
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [filteredData, setFilteredData] = useState<any[]>([]);

  // insights
  const [insights, setInsights] = useState<any>(null);

  // ranking
  const [rankingData, setRankingData] = useState<any[]>([]);

  // chart tab
  const [activeTab, setActiveTab] = useState<string>("Sales");

  // loading states
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string>("");

  const [currentWeekNow] = useState(getCurrentWeekLabel());

  // week -> period/quarter map
  const WEEK_TO_PERIOD_QUARTER = useMemo(() => {
    return buildWeekToPeriodQuarter();
  }, []);

  // watch session
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

  // load profile, decide which locations they may see
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

      const roleLower = String(data.role || "").toLowerCase();
      let locs: string[] = [];

      if (roleLower === "admin" || roleLower === "operation") {
        locs = [
          "GroupOverview",
          "La Mia Mamma (Brand)",
          "Fish and Bubbles (Brand)",
          "Made in Italy (Brand)",
          ...STORE_LOCATIONS,
        ];
      } else if (roleLower === "manager") {
        if (data.home_location) locs = [data.home_location];
      } else {
        if (data.home_location) locs = [data.home_location];
      }

      setAllowedLocations(locs);
      setInitialLocation(locs[0] || "");
      setAuthLoading(false);
    }

    loadProfile();
  }, [session]);

  // sync first allowed location into local select
  useEffect(() => {
    if (!location && initialLocation) {
      setLocation(initialLocation);
    }
  }, [initialLocation, location]);

  // fetch rows for current location
  useEffect(() => {
    async function loadRows() {
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
          rows = await fetchTab(location);
          rows.sort(
            (a, b) => parseWeekNum(a.Week) - parseWeekNum(b.Week)
          );
        }

        setRawRows(rows);

        const snap = computeInsightsBundle(rows);
        setInsights(snap);
      } catch (err: any) {
        console.error(err);
        setRawRows([]);
        setInsights(null);
        setFetchError(
          err instanceof Error ? err.message : "Unknown error loading data"
        );
      } finally {
        setLoadingData(false);
      }
    }

    loadRows();
  }, [location]);

  // rebuild filteredData whenever rawRows or period changes
  useEffect(() => {
    if (!rawRows.length) {
      setFilteredData([]);
      return;
    }

    if (period === "Week") {
      const decorated = decorateWithPeriodQuarter(
        rawRows,
        WEEK_TO_PERIOD_QUARTER
      );
      setFilteredData(decorated);
      return;
    }

    if (period === "Period") {
      const decorated = decorateWithPeriodQuarter(
        rawRows,
        WEEK_TO_PERIOD_QUARTER
      );
      const periodAgg = groupMergedRowsByBucket(decorated, "Period");
      setFilteredData(periodAgg);
      return;
    }

    const decorated = decorateWithPeriodQuarter(
      rawRows,
      WEEK_TO_PERIOD_QUARTER
    );
    const quarterAgg = groupMergedRowsByBucket(decorated, "Quarter");
    setFilteredData(quarterAgg);
  }, [rawRows, period, WEEK_TO_PERIOD_QUARTER]);

  // build ranking (admin/operation only)
  useEffect(() => {
    async function loadRanking() {
      const roleLower = String(profile?.role || "").toLowerCase();
      const data = await buildRankingData(roleLower);
      setRankingData(data);
    }
    loadRanking();
  }, [profile]);

  // role gate
  const roleLower = String(profile?.role || "").toLowerCase();
  const canViewFinance =
    roleLower === "admin" ||
    roleLower === "operation" ||
    roleLower === "manager";

  // ────────── GUARDS ──────────
  if (authLoading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center text-sm text-gray-500 font-medium">
        Loading profile…
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center text-center px-4">
        <div className="bg-white border border-gray-200 rounded-xl shadow-md max-w-xs p-4 text-red-600 font-medium text-sm leading-relaxed">
          You are not signed in.
        </div>
      </div>
    );
  }

  if (!canViewFinance) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center text-center px-4">
        <div className="bg-white border border-gray-200 rounded-xl shadow-md max-w-xs p-4 text-red-600 font-medium text-sm leading-relaxed">
          You don&apos;t have permission to view Financial Performance.
        </div>
      </div>
    );
  }

  if (!allowedLocations.length || !initialLocation) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center text-center px-4">
        <div className="bg-white border border-gray-200 rounded-xl shadow-md max-w-xs p-4 text-red-600 font-medium text-sm leading-relaxed">
          No location access configured for this account.
        </div>
      </div>
    );
  }

  // ────────── PAGE UI ──────────
  return (
    <div className="bg-gray-50 min-h-screen text-gray-900 font-[Inter,system-ui,sans-serif]">
      {/* SINGLE HEADER */}
      <div className="w-full bg-white border-b border-gray-200">
        <FinancialHeader />
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 space-y-10">
        {/* Top row: title + filters (this is the layout you had before) */}
        <section className="pt-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            {/* Left: Performance / Current Week */}
            <div>
              <div className="text-sm font-semibold text-gray-800">
                Performance 2025
              </div>
              <div className="text-xs text-gray-500">
                Current Week: {currentWeekNow}
              </div>
            </div>

            {/* Right: filters side by side */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 lg:gap-6">
              {/* Location */}
              <div className="flex flex-col text-left">
                <label className="text-[0.7rem] font-semibold uppercase tracking-wide text-gray-700 mb-1">
                  Select Location
                </label>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="rounded-full border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10 min-w-[14rem]"
                >
                  {allowedLocations.map((loc) => (
                    <option key={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              {/* Period */}
              <div className="flex flex-col text-left">
                <label className="text-[0.7rem] font-semibold uppercase tracking-wide text-gray-700 mb-1">
                  Select Period
                </label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="rounded-full border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10 min-w-[10rem]"
                >
                  {PERIODS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* Hero cards row: Current Week + Last Week Results */}
        <InsightsBar
          insights={insights}
          payrollTarget={PAYROLL_TARGET}
          currentWeekNow={currentWeekNow}
        />

        {/* KPI tiles row: Payroll%, Food%, Drink%, Sales vs LY */}
        <ComplianceBar
          insights={insights}
          payrollTarget={PAYROLL_TARGET}
          foodTarget={FOOD_TARGET}
          drinkTarget={DRINK_TARGET}
        />

        {/* Ranking table (admin / operation only) */}
        {(roleLower === "admin" || roleLower === "operation") &&
          rankingData.length > 0 && (
            <RankingTable
              rankingData={rankingData}
              payrollTarget={PAYROLL_TARGET}
              foodTarget={FOOD_TARGET}
              drinkTarget={DRINK_TARGET}
            />
          )}

        {/* KPI block (totals / budget variance etc) */}
        {loadingData && (
          <p className="text-center text-sm text-gray-500 mt-4">
            Loading data…
          </p>
        )}

        {!loadingData && fetchError && (
          <p className="text-center text-sm text-red-600 font-medium mt-4">
            Could not load data: {fetchError}
          </p>
        )}

        {!loadingData && !fetchError && (
          <KPIBlock
            data={filteredData}
            payrollTarget={PAYROLL_TARGET}
            foodTarget={FOOD_TARGET}
            drinkTarget={DRINK_TARGET}
          />
        )}

        {/* Tab buttons for charts */}
        <div className="flex justify-center flex-wrap gap-2 mt-8">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 rounded-lg text-[0.8rem] font-medium border shadow-sm transition ${
                activeTab === tab
                  ? "bg-gray-900 text-white border-gray-900 shadow-lg"
                  : "bg-white text-gray-900 border-gray-300 hover:shadow-md"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Charts + CSV Download */}
        {!loadingData && !fetchError && (
          <ChartSection
            activeTab={activeTab}
            filteredData={filteredData}
            chartConfig={chartConfig as any}
            yTickFormatter={yTickFormatter}
            tooltipFormatter={tooltipFormatter}
            CSVLink={CSVLink}
          />
        )}
      </main>

      <FinancialFooter />
    </div>
  );
}
