"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabaseClient";

// ⭐ IMPORT ALL FINANCIAL COMPONENTS USING ../../src/... ⭐
import FinancialHeader from "../../src/components/financial/FinancialHeader";
import InsightsBar from "../../src/components/financial/InsightsBar";
import ComplianceBar from "../../src/components/financial/ComplianceBar";
import RankingTable from "../../src/components/financial/RankingTable";
import KPIBlock from "../../src/components/financial/KPIBlock";
import ChartSection from "../../src/components/financial/ChartSection";
import FinancialFooter from "../../src/components/financial/FinancialFooter";

// ─────────────────────────────
// CONSTANTS / CONFIG
// ─────────────────────────────

const API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_API_KEY ||
  "AIzaSyB_dkFpvk6w_d9dPD_mWVhfB8-lly-9FS8";

const SPREADSHEET_ID =
  process.env.NEXT_PUBLIC_SHEET_ID ||
  "1PPVSEcZ6qLOEK2Z0uRLgXCnS_maazWFO_yMY648Oq1g";

// Brand rollups: brand -> list of sheet tabs
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

// store-level tabs
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

// dropdown values for period selection
const PERIODS = ["Week", "Period", "Quarter"];

// for the bottom ChartSection tab buttons
const TABS = ["Sales", "Payroll", "Food", "Drink"];

// targets
const PAYROLL_TARGET = 35; // %
const FOOD_TARGET = 12.5;  // %
const DRINK_TARGET = 5.5;  // %

// ─────────────────────────────
// SMALL HELPERS
// ─────────────────────────────

// "£" formatting
function formatCurrency(val: any) {
  if (val === undefined || val === null || isNaN(val)) return "-";
  return "£" + Number(val).toLocaleString();
}

// "W43" -> 43
function parseWeekNum(weekStr: string | undefined) {
  const num = parseInt(String(weekStr || "").replace(/[^\d]/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

// get ISO-ish current week number, with cap at 52
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

// parse Google Sheets response (values[][]) into array of objects
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

// call Sheets API for a tab
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

// roll up multiple rows across many tabs into 1 row per Week
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

// Build "Period" and "Quarter" from Week numbers
function buildWeekPeriodQuarterMap() {
  // mimic 13-week quarters / 4-4-5 style buckets
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

// Take rows and add Period + Quarter
function mergeRowsWithPeriodQuarter(rows: any[], W2PQ: any[]) {
  return rows.map((item) => {
    const w = String(item.Week || "").trim();
    const match = W2PQ.find((x: any) => x.week === w);
    return {
      ...item,
      Period: match?.period || "P?",
      Quarter: match?.quarter || "Q?",
    };
  });
}

// Summarise array of rows into "bucketKey" = Week, Period, or Quarter
function groupMergedRowsBy(mergedRows: any[], bucketKey: "Period" | "Quarter") {
  if (!mergedRows.length) return [];

  const grouped = mergedRows.reduce((acc: any, row: any) => {
    const key = row[bucketKey];
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  const numericKeys = Object.keys(mergedRows[0]).filter(
    (k) => typeof mergedRows[0][k] === "number"
  );

  return Object.entries(grouped).map(([label, rows]: any) => {
    const sums: any = {};
    numericKeys.forEach((col) => {
      sums[col] = rows.reduce((total: number, r: any) => total + (r[col] || 0), 0);
    });
    return {
      Week: label,
      ...sums,
    };
  });
}

// compute snapshot for "last finished week" and 4-week avg of Payroll_v%
function computeInsightsBundle(rows: any[]) {
  if (!rows || rows.length === 0) return null;

  // decorate rows with numeric week
  const decorated = rows.map((r: any) => ({
    ...r,
    __weekNum: parseWeekNum(r.Week),
  }));

  // find snapshot week = currentWeek-1
  const currentWeekNum = getISOWeek();
  const snapshotWeekNum =
    currentWeekNum - 1 <= 0 ? currentWeekNum : currentWeekNum - 1;

  // row has data?
  function rowHasData(r: any) {
    return (
      (r.Sales_Actual && r.Sales_Actual !== 0) ||
      (r.Payroll_Actual && r.Payroll_Actual !== 0) ||
      (r.Sales_Budget && r.Sales_Budget !== 0)
    );
  }

  // prefer EXACT snapshotWeekNum with data
  let latestRow = decorated.find(
    (r: any) => r.__weekNum === snapshotWeekNum && rowHasData(r)
  );

  // fallback: most recent <= snapshotWeekNum with data
  if (!latestRow) {
    const candidates = decorated
      .filter((r: any) => r.__weekNum <= snapshotWeekNum && rowHasData(r))
      .sort((a: any, b: any) => a.__weekNum - b.__weekNum);
    latestRow = candidates[candidates.length - 1];
  }

  // final fallback: just most recent row with data overall
  if (!latestRow) {
    const candidates = decorated
      .filter((r: any) => rowHasData(r))
      .sort((a: any, b: any) => a.__weekNum - b.__weekNum);
    latestRow = candidates[candidates.length - 1];
  }

  if (!latestRow) return null;

  const weekNumWeUse = latestRow.__weekNum;
  const wkLabel = latestRow.Week || `W${weekNumWeUse}`;

  // window for 4-week avg of Payroll_v%
  const windowWeeks = [
    weekNumWeUse,
    weekNumWeUse - 1,
    weekNumWeUse - 2,
    weekNumWeUse - 3,
  ].filter((n) => n > 0);

  const last4Rows = decorated.filter((r: any) =>
    windowWeeks.includes(r.__weekNum)
  );

  function parsePayrollVar(val: any): number {
    if (val === undefined || val === null) return 0;
    const cleaned = String(val).replace("%", "").trim();
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? 0 : num;
  }

  const payrollTrendVals = last4Rows.map((row: any) =>
    parsePayrollVar(row["Payroll_v%"])
  );

  const avgPayrollVar4w =
    payrollTrendVals.length > 0
      ? payrollTrendVals.reduce((sum: number, n: number) => sum + n, 0) /
        payrollTrendVals.length
      : 0;

  // build metrics from that snapshot row
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
    currentWeekLabel: getCurrentWeekLabel(), // "W44"
  };
}

// ─────────────────────────────
// MAIN PAGE COMPONENT
// ─────────────────────────────

export default function FinancialPage() {
  // auth
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // access
  const [allowedLocations, setAllowedLocations] = useState<string[]>([]);
  const [initialLocation, setInitialLocation] = useState("");

  // dashboard state
  const [location, setLocation] = useState("");
  const [period, setPeriod] = useState("Week"); // Week | Period | Quarter
  const [activeTab, setActiveTab] = useState("Sales");

  // sheet data
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [fetchError, setFetchError] = useState("");

  // derived
  const [insights, setInsights] = useState<any>(null); // last week bundle
  const [rankingData, setRankingData] = useState<any[]>([]); // site table

  const currentWeekNow = getCurrentWeekLabel(); // e.g. "W44"

  // ------------------------------------------------
  // AUTH: pull session, profile, allowed locations
  // ------------------------------------------------
  useEffect(() => {
    let sub: any;
    async function initAuth() {
      // session
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
    initAuth();

    return () => {
      if (sub) sub.subscription.unsubscribe();
    };
  }, []);

  // load profile when session is ready
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

      // compute allowed sites for this role
      const roleLower = (data.role || "").toLowerCase();

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
        locs = [data.home_location || STORE_LOCATIONS[0]];
      } else {
        // basic user shouldn't really be here
        locs = [data.home_location || STORE_LOCATIONS[0]];
      }

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
    roleLower === "manager";

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  // ------------------------------------------------
  // Once we know initialLocation, set it into state
  // ------------------------------------------------
  useEffect(() => {
    if (!location && initialLocation) {
      setLocation(initialLocation);
    }
  }, [initialLocation, location]);

  // ------------------------------------------------
  // Fetch SHEET data (for selected location or brand/group)
  // ------------------------------------------------
  useEffect(() => {
    async function loadData() {
      if (!location) return;
      try {
        setLoadingData(true);
        setFetchError("");

        const isBrand = !!BRAND_GROUPS[location];
        let rows: any[] = [];

        if (isBrand) {
          // brand rollup across multiple tabs
          const allData = await Promise.all(
            BRAND_GROUPS[location].map((site) => fetchTab(site))
          );
          rows = rollupByWeek(allData.flat());
        } else {
          // direct tab (GroupOverview or single site)
          rows = await fetchTab(location);
          rows.sort(
            (a: any, b: any) => parseWeekNum(a.Week) - parseWeekNum(b.Week)
          );
        }

        setRawRows(rows);

        // compute last-week insights (snapshots etc.)
        const bundle = computeInsightsBundle(rows);
        setInsights(bundle);
      } catch (err: any) {
        console.error("loadData error", err);
        setFetchError(err?.message || "Unknown error loading data");
        setRawRows([]);
        setInsights(null);
      } finally {
        setLoadingData(false);
      }
    }

    loadData();
  }, [location]);

  // ------------------------------------------------
  // Build RANKING table (for ops/admin only)
  // ------------------------------------------------
  useEffect(() => {
    async function buildRanking() {
      if (roleLower !== "admin" && roleLower !== "operation") {
        setRankingData([]);
        return;
      }

      try {
        const result = await Promise.all(
          STORE_LOCATIONS.map(async (loc) => {
            const rows = await fetchTab(loc);
            if (!rows || rows.length === 0) return null;

            const sorted = [...rows].sort(
              (a: any, b: any) => parseWeekNum(a.Week) - parseWeekNum(b.Week)
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
        // sort by highest payroll%
        cleaned.sort((a, b) => b.payrollPct - a.payrollPct);
        setRankingData(cleaned);
      } catch (err) {
        console.error("Ranking build failed:", err);
        setRankingData([]);
      }
    }

    buildRanking();
  }, [roleLower]);

  // ------------------------------------------------
  // Derive filteredData for KPIBlock + charts (Week/Period/Quarter)
  // ------------------------------------------------
  const WEEK_TO_PERIOD_QUARTER = useMemo(() => buildWeekPeriodQuarterMap(), []);
  const mergedRows = useMemo(
    () => mergeRowsWithPeriodQuarter(rawRows, WEEK_TO_PERIOD_QUARTER),
    [rawRows, WEEK_TO_PERIOD_QUARTER]
  );

  const filteredData = useMemo(() => {
    if (!mergedRows.length) return [];
    if (period === "Week") return mergedRows;
    if (period === "Period") return groupMergedRowsBy(mergedRows, "Period");
    return groupMergedRowsBy(mergedRows, "Quarter");
  }, [mergedRows, period]);

  // chart line configs
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
    return [formatCurrency(value), name];
  };

  // ------------------------------------------------
  // GUARDS (auth / access)
  // ------------------------------------------------
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Loading profile…
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center shadow">
          <div className="text-red-600 font-semibold text-sm">
            You are not signed in.
          </div>
        </div>
      </div>
    );
  }

  if (!canViewFinance) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center shadow max-w-xs">
          <div className="text-red-600 font-semibold text-sm">
            You don&apos;t have permission to view Financial Performance.
          </div>
        </div>
      </div>
    );
  }

  if (!allowedLocations.length || !initialLocation) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center shadow max-w-xs">
          <div className="text-red-600 font-semibold text-sm">
            No location access configured for this account.
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------
  // MAIN UI
  // ------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-[system-ui]">
      {/* TOP PORTAL HEADER (same vibe as homepage header) */}
      <div className="w-full bg-white border-b border-gray-200">
        <FinancialHeader
          profile={profile}
          onSignOut={handleSignOut}
          // these props exist on FinancialHeader in your repo:
          // allowedLocations, location, setLocation, period, setPeriod, PERIODS
          allowedLocations={allowedLocations}
          location={location}
          setLocation={setLocation}
          period={period}
          setPeriod={setPeriod}
          PERIODS={PERIODS}
        />
      </div>

      {/* PAGE WRAPPER */}
      <main className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* PAGE TITLE + CURRENT WEEK */}
        <section className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              Financial Dashboard
            </h1>
            <p className="text-xs text-gray-500">
              Current Week: {currentWeekNow}
            </p>
          </div>

          {/* FILTER BAR (centered on mobile, right on desktop) */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
            {/* Location select */}
            <div className="flex flex-col">
              <label className="text-[11px] font-medium text-gray-600">
                Select Location
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-48 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-gray-900 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10"
              >
                {allowedLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>

            {/* Period select */}
            <div className="flex flex-col">
              <label className="text-[11px] font-medium text-gray-600">
                Select Period
              </label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-32 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-gray-900 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10"
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

        {/* HERO INSIGHTS (Current Week + Last Week Results) */}
        <InsightsBar
          insights={insights}
          payrollTarget={PAYROLL_TARGET}
          currentWeekNow={currentWeekNow}
        />

        {/* KPI ROW (Payroll / Food / Drink / Sales vs LY) */}
        <ComplianceBar
          insights={insights}
          payrollTarget={PAYROLL_TARGET}
          foodTarget={FOOD_TARGET}
          drinkTarget={DRINK_TARGET}
        />

        {/* SITE RANKING (ops/admin only) */}
        {(roleLower === "admin" || roleLower === "operation") &&
          rankingData.length > 0 && (
            <RankingTable
              rankingData={rankingData}
              payrollTarget={PAYROLL_TARGET}
              foodTarget={FOOD_TARGET}
              drinkTarget={DRINK_TARGET}
            />
          )}

        {/* KPI BLOCK (aggregates for chosen period) */}
        {loadingData ? (
          <p className="text-center text-gray-500 text-sm">
            Loading data…
          </p>
        ) : fetchError ? (
          <p className="text-center text-red-600 font-medium text-sm">
            Could not load data: {fetchError}
          </p>
        ) : (
          <KPIBlock
            data={filteredData}
            payrollTarget={PAYROLL_TARGET}
            foodTarget={FOOD_TARGET}
            drinkTarget={DRINK_TARGET}
          />
        )}

        {/* TAB SWITCHER: Sales / Payroll / Food / Drink */}
        <div className="flex flex-wrap justify-center gap-2">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg border text-sm font-medium px-3 py-2 shadow-sm transition ${
                activeTab === tab
                  ? "bg-gray-900 text-white border-gray-900 shadow-xl"
                  : "bg-white text-gray-900 border-gray-300 hover:bg-gray-100"
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
            yTickFormatter={yTickFormatter}
            tooltipFormatter={tooltipFormatter}
          />
        )}

        {/* FOOTER */}
        <FinancialFooter />
      </main>
    </div>
  );
}