"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CSVLink } from "react-csv";
import { supabase } from "../../src/lib/supabaseClient";

// financial components
import FinancialHeader from "../../src/components/financial/FinancialHeader";
import InsightsBar from "../../src/components/financial/InsightsBar";
import ComplianceBar from "../../src/components/financial/ComplianceBar";
import RankingTable from "../../src/components/financial/RankingTable";
import KPIBlock from "../../src/components/financial/KPIBlock";
import ChartSection from "../../src/components/financial/ChartSection";
import FinancialFooter from "../../src/components/financial/FinancialFooter";

// ─────────────────────────────────────────
// CONSTANTS / CONFIG
// ─────────────────────────────────────────

// Public sheet + key (already in repo)
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

// All store tabs in the sheet, used for ranking
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

function formatCurrency(val: any) {
  if (val === undefined || val === null || isNaN(val)) return "£0";
  return "£" + Number(val).toLocaleString();
}

// turn "W43" => 43 as number
function parseWeekNum(weekStr: any) {
  const num = parseInt(String(weekStr || "").replace(/[^\d]/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

// ISO week number (Mon-Sun ISO week)
function getISOWeek(date = new Date()) {
  // standard ISO week calc
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

// parse Google Sheets response -> array of row objects
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

// fetch a single tab from GSheets
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

// roll up many location rows (for a brand) by Week (sum numeric cols)
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

// map Week -> Period/Quarter to support rollups (Period, Quarter views)
function buildWeekToPeriodQuarter() {
  // This is a manual mapping for 52w -> P1..P12, Q1..Q4
  // The actual mapping we used earlier:
  //  - W1-13  => Q1, split into P1,P2,P3
  //  - W14-26 => Q2, split into P4,P5,P6
  //  - W27-39 => Q3, split into P7,P8,P9
  //  - W40-52 => Q4, split into P10,P11,P12
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

// turn weekly rows -> add Period / Quarter fields from mapping
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

// group decorated rows by a bucket (Period or Quarter) summing numerics
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
      Week: label, // for charts we still call it Week but it's "P#" or "Q#"
      ...sums,
    };
  });
}

// computeInsightsBundle
// - Pick "last completed" week (currentWeek-1 with data).
// - Compute 4-week avg Payroll_v% using signed values (negatives and positives).
function computeInsightsBundle(rows: any[]) {
  if (!rows || rows.length === 0) return null;

  // decorate with parsed numeric week
  const decorated = rows.map((r: any) => ({
    ...r,
    __weekNum: parseWeekNum(r.Week),
  }));

  const currentWeekNum = getISOWeek(new Date());
  // last fully completed week:
  const snapshotWeekNum =
    currentWeekNum - 1 <= 0 ? currentWeekNum : currentWeekNum - 1;

  function rowHasData(r: any) {
    return (
      (r.Sales_Actual && r.Sales_Actual !== 0) ||
      (r.Payroll_Actual && r.Payroll_Actual !== 0) ||
      (r.Sales_Budget && r.Sales_Budget !== 0)
    );
  }

  // Try exact match for snapshotWeekNum first
  let latestRow = decorated.find(
    (r) => r.__weekNum === snapshotWeekNum && rowHasData(r)
  );

  // Fallback: most recent <= snapshotWeekNum with data
  if (!latestRow) {
    const candidates = decorated
      .filter((r) => r.__weekNum <= snapshotWeekNum && rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = candidates[candidates.length - 1];
  }

  // Final fallback: just take last non-empty row at all
  if (!latestRow) {
    const candidates = decorated
      .filter((r) => rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = candidates[candidates.length - 1];
  }

  if (!latestRow) return null; // still nothing

  const usedWeekNum = latestRow.__weekNum;
  const wkLabel = latestRow.Week || `W${usedWeekNum}`;

  // build window of last 4 weeks including that week
  const windowWeeks = [
    usedWeekNum,
    usedWeekNum - 1,
    usedWeekNum - 2,
    usedWeekNum - 3,
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

  // signed average (e.g. -4.2, +2.5, +2, -6.25 => avg -1.48)
  const payrollTrendVals = last4Rows.map((row) =>
    parsePayrollVar(row["Payroll_v%"])
  );
  const avgPayrollVar4w =
    payrollTrendVals.length > 0
      ? payrollTrendVals.reduce((sum, n) => sum + n, 0) /
        payrollTrendVals.length
      : 0;

  // calc metrics
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

// ranking table data (site-level latest week)
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

// y axis money formatter for charts
function yTickFormatter(val: any) {
  if (val === 0) return "£0";
  if (!val) return "";
  return "£" + Number(val).toLocaleString();
}

// tooltip formatter for charts
function tooltipFormatter(value: any, name: any) {
  return [formatCurrency(value), name];
}

// chartConfig for <ChartSection />
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

// ─────────────────────────────────────────
// MAIN PAGE COMPONENT
// ─────────────────────────────────────────

export default function FinancialPage() {
  // auth/session/profile
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // allowed locations (dropdown)
  const [allowedLocations, setAllowedLocations] = useState<string[]>([]);
  const [initialLocation, setInitialLocation] = useState<string>("");

  // UI selections
  const [location, setLocation] = useState<string>("");
  const [period, setPeriod] = useState<string>("Week"); // Week | Period | Quarter

  // sheet data
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [filteredData, setFilteredData] = useState<any[]>([]);

  // insights bundle (last week sales/payroll etc)
  const [insights, setInsights] = useState<any>(null);

  // ranking table
  const [rankingData, setRankingData] = useState<any[]>([]);

  // chart tab state
  const [activeTab, setActiveTab] = useState<string>("Sales");

  // data loading / errors
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string>("");

  const [currentWeekNow] = useState(getCurrentWeekLabel());

  // build once
  const WEEK_TO_PERIOD_QUARTER = useMemo(() => {
    return buildWeekToPeriodQuarter();
  }, []);

  // 1. watch auth session
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

  // 2. load profile
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

      // admin / operation can see everything
      if (roleLower === "admin" || roleLower === "operation") {
        locs = [
          "GroupOverview",
          "La Mia Mamma (Brand)",
          "Fish and Bubbles (Brand)",
          "Made in Italy (Brand)",
          ...STORE_LOCATIONS,
        ];
      } else if (roleLower === "manager") {
        // manager sees only their home_location
        if (data.home_location) {
          locs = [data.home_location];
        }
      } else {
        // default: restrict (shouldn't normally hit finance anyway)
        if (data.home_location) {
          locs = [data.home_location];
        }
      }

      setAllowedLocations(locs);
      setInitialLocation(locs[0] || "");

      setAuthLoading(false);
    }

    loadProfile();
  }, [session]);

  // 3. keep local location in sync with first allowed
  useEffect(() => {
    if (!location && initialLocation) {
      setLocation(initialLocation);
    }
  }, [initialLocation, location]);

  // 4. fetch sheet rows for selected location/brand/group
  useEffect(() => {
    async function loadRows() {
      if (!location) return;

      try {
        setLoadingData(true);
        setFetchError("");

        const isBrand = !!BRAND_GROUPS[location];
        let rows: any[] = [];

        if (isBrand) {
          // aggregate brand across multiple site tabs
          const allData = await Promise.all(
            BRAND_GROUPS[location].map((site) => fetchTab(site))
          );
          rows = rollupByWeek(allData.flat());
        } else {
          // single site or "GroupOverview"
          rows = await fetchTab(location);
          rows.sort(
            (a, b) => parseWeekNum(a.Week) - parseWeekNum(b.Week)
          );
        }

        setRawRows(rows);

        // precompute insights bundle from these weekly rows
        const snapshot = computeInsightsBundle(rows);
        setInsights(snapshot);
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

  // 5. rebuild filteredData whenever rawRows or period changes
  useEffect(() => {
    if (!rawRows.length) {
      setFilteredData([]);
      return;
    }

    if (period === "Week") {
      // decorate so KPIBlock & chart x-axis show "W##"
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

    // Quarter
    const decorated = decorateWithPeriodQuarter(
      rawRows,
      WEEK_TO_PERIOD_QUARTER
    );
    const quarterAgg = groupMergedRowsByBucket(decorated, "Quarter");
    setFilteredData(quarterAgg);
  }, [rawRows, period, WEEK_TO_PERIOD_QUARTER]);

  // 6. build ranking table (only admins / ops)
  useEffect(() => {
    async function loadRanking() {
      const roleLower = String(profile?.role || "").toLowerCase();
      const data = await buildRankingData(roleLower);
      setRankingData(data);
    }
    loadRanking();
  }, [profile]);

  // ─────────────────────────────────────────
  //  RENDER GUARDS
  // ─────────────────────────────────────────

  const roleLower = String(profile?.role || "").toLowerCase();
  const canViewFinance =
    roleLower === "admin" ||
    roleLower === "operation" ||
    roleLower === "manager";

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

  // ─────────────────────────────────────────
  //  PAGE LAYOUT
  // ─────────────────────────────────────────

  return (
    <div className="bg-gray-50 min-h-screen text-gray-900 font-[Inter,system-ui,sans-serif]">
      {/* SINGLE HEADER (this kills the duplicate) */}
      <div className="w-full bg-white border-b border-gray-200">
        <FinancialHeader />
      </div>

      {/* FILTER ROW (LOCATION / VIEW) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center text-[0.7rem] font-semibold uppercase tracking-wide text-gray-500 mb-4">
          Filters
        </div>

        <div className="grid max-w-xl mx-auto gap-6 sm:grid-cols-2">
          {/* Location select */}
          <div className="flex flex-col items-center">
            <label className="text-[0.7rem] font-semibold uppercase tracking-wide text-gray-700 mb-2">
              Location
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-full border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10 max-w-xs"
            >
              {allowedLocations.map((loc) => (
                <option key={loc}>{loc}</option>
              ))}
            </select>
          </div>

          {/* Period select */}
          <div className="flex flex-col items-center">
            <label className="text-[0.7rem] font-semibold uppercase tracking-wide text-gray-700 mb-2">
              View
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full rounded-full border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10 max-w-xs"
            >
              {PERIODS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* DASHBOARD CONTENT WRAPPER */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 space-y-10">
        {/* HERO INSIGHTS (Current Week + Last Week Results) */}
        <InsightsBar
          insights={insights}
          payrollTarget={PAYROLL_TARGET}
          currentWeekNow={currentWeekNow}
        />

        {/* Compliance row (Payroll %, Food %, Drink %, Sales vs LY)
            This already shows the big coloured dot and targets based on last week. */}
        <ComplianceBar
          insights={insights}
          payrollTarget={PAYROLL_TARGET}
          foodTarget={FOOD_TARGET}
          drinkTarget={DRINK_TARGET}
        />

        {/* Ranking table (admins / ops only) */}
        {(roleLower === "admin" || roleLower === "operation") &&
          rankingData.length > 0 && (
            <RankingTable
              rankingData={rankingData}
              payrollTarget={PAYROLL_TARGET}
              foodTarget={FOOD_TARGET}
              drinkTarget={DRINK_TARGET}
            />
          )}

        {/* KPI block (Totals / Variance cards etc), for the chosen view (Week/Period/Quarter) */}
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

        {/* TAB SWITCHER (Sales / Payroll / Food / Drink) */}
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

        {/* CHARTS + CSV EXPORT */}
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

      {/* FOOTER */}
      <FinancialFooter />
    </div>
  );
}
