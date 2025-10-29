"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// components
import FinancialHeader from "@/components/financial/FinancialHeader";
import InsightsBar from "@/components/financial/InsightsBar";
import ComplianceBar from "@/components/financial/ComplianceBar";
import RankingTable from "@/components/financial/RankingTable";
import KPIBlock from "@/components/financial/KPIBlock";
import ChartSection from "@/components/financial/ChartSection";
import FinancialFooter from "@/components/financial/FinancialFooter";

import { CSVLink } from "react-csv";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ─────────────────────────────
// CONFIG
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
  if (val === undefined || val === null || isNaN(val)) return "-";
  return "£" + Number(val).toLocaleString();
}

function parseWeekNum(weekStr: any) {
  const num = parseInt(String(weekStr || "").replace(/[^\d]/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

function rollupBy(rows: any[], bucketKey: string) {
  if (!rows.length) return [];

  const grouped: Record<string, any[]> = rows.reduce((acc, row) => {
    const key = String(row[bucketKey]).trim();
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {} as Record<string, any[]>);

  const numericKeys = Object.keys(rows[0]).filter(
    (k) => typeof rows[0][k] === "number"
  );

  const combined = Object.entries(grouped).map(([label, groupRows]) => {
    const totals: Record<string, number> = {};
    numericKeys.forEach((nk) => {
      totals[nk] = groupRows.reduce((sum, r) => sum + (r[nk] || 0), 0);
    });
    return {
      ...totals,
      [bucketKey]: label,
    };
  });

  if (bucketKey === "Week") {
    combined.sort((a, b) => parseWeekNum(a.Week) - parseWeekNum(b.Week));
  }

  return combined;
}

function getISOWeek(date = new Date()) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.valueOf() - yearStart.valueOf()) / 86400000 + 1) / 7);
  return weekNo > 52 ? 52 : weekNo;
}

function getCurrentWeekLabel() {
  return `W${getISOWeek(new Date())}`;
}

function computeLatestWeekInsights(rawRows: any[]) {
  // we already used this logic in financial.js to pick the last completed week
  if (!rawRows || rawRows.length === 0) return null;

  const sorted = [...rawRows].sort(
    (a, b) => parseWeekNum(a.Week) - parseWeekNum(b.Week)
  );
  const latest = sorted[sorted.length - 1];
  if (!latest) return null;

  const wkLabel = latest.Week;

  const salesActual = latest.Sales_Actual || 0;
  const salesBudget = latest.Sales_Budget || 0;
  const salesLastYear = latest.Sales_LastYear || 0;

  const salesVar = salesActual - salesBudget;
  const salesVarPct =
    salesBudget !== 0 ? (salesVar / salesBudget) * 100 : 0;

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
  };
}

function computeAllowedLocationsForProfile(profile: any) {
  if (!profile) return [];
  const roleLower = (profile.role || "").toLowerCase();
  const home = profile.home_location;

  // "operation" or "admin" see everything and brands + group
  if (roleLower === "admin" || roleLower === "operation") {
    return [
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
  }

  if (roleLower === "manager") {
    return [home];
  }

  return [];
}

function parseSheetValues(values: any[][]) {
  if (!values || values.length < 2) return [];
  const [headers, ...rows] = values;
  return rows.map((row) =>
    headers.reduce((obj: any, key: string, idx: number) => {
      let value: any = row[idx];
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

async function fetchTabFromSheet(tabName: string) {
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

// ─────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────

export default function FinancialPage() {
  // 1. auth & profile
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [allowedLocations, setAllowedLocations] = useState<string[]>([]);
  const [initialLocation, setInitialLocation] = useState("");

  // 2. dashboard state
  const [location, setLocation] = useState("");
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("Sales");
  const [period, setPeriod] = useState("Week");
  const [loadingData, setLoadingData] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [rankingData, setRankingData] = useState<any[]>([]);

  const [currentWeekNow] = useState(getCurrentWeekLabel());

  // watch Supabase session
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
    roleLower === "manager";

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  // set default location once we know allowed
  useEffect(() => {
    if (!location && initialLocation) {
      setLocation(initialLocation);
    }
  }, [initialLocation, location]);

  // quarter / period mapping
  const WEEK_TO_PERIOD_QUARTER = useMemo(() => {
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
  }, []);

  // fetch the sheet data for the current location/brand
  useEffect(() => {
    async function load() {
      if (!location) return;

      try {
        setLoadingData(true);
        setFetchError("");

        const isBrand = BRAND_GROUPS[location];
        let rows: any[];

        if (isBrand) {
          const allData = await Promise.all(
            BRAND_GROUPS[location].map((siteName) =>
              fetchTabFromSheet(siteName)
            )
          );
          // merge store rows then roll them up by Week
          rows = rollupBy(allData.flat(), "Week");
        } else {
          rows = await fetchTabFromSheet(location);
        }

        setRawRows(rows);
      } catch (err: any) {
        setFetchError(err?.message || "Error loading data");
        setRawRows([]);
      } finally {
        setLoadingData(false);
      }
    }

    load();
  }, [location]);

  // decorate rows with Period / Quarter
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

  // group by period/quarter for charts
  const groupMergedRowsBy = (bucketKey: "Period" | "Quarter") => {
    if (!mergedRows.length) return [];
    const grouped: Record<string, any[]> = mergedRows.reduce(
      (acc, row) => {
        const key = row[bucketKey];
        if (!acc[key]) acc[key] = [];
        acc[key].push(row);
        return acc;
      },
      {} as Record<string, any[]>
    );

    const numericKeys = Object.keys(mergedRows[0]).filter(
      (k) => typeof mergedRows[0][k] === "number"
    );

    return Object.entries(grouped).map(([label, rows]) => {
      const sums: Record<string, number> = {};
      numericKeys.forEach((col) => {
        sums[col] = rows.reduce(
          (total, r) => total + (r[col] || 0),
          0
        );
      });
      return {
        Week: label,
        ...sums,
      };
    });
  };

  const filteredData = useMemo(() => {
    if (!mergedRows.length) return [];
    if (period === "Week") return mergedRows;
    if (period === "Period") return groupMergedRowsBy("Period");
    return groupMergedRowsBy("Quarter");
  }, [mergedRows, period]);

  const insights = useMemo(
    () => computeLatestWeekInsights(mergedRows),
    [mergedRows]
  );

  // Ranking table (worst payroll etc)
  useEffect(() => {
    async function buildRanking() {
      if (roleLower !== "admin" && roleLower !== "operation") {
        setRankingData([]);
        return;
      }

      try {
        const all = await Promise.all(
          STORE_LOCATIONS.map(async (site) => {
            const rows = await fetchTabFromSheet(site);
            if (!rows || rows.length === 0) return null;

            const snap = computeLatestWeekInsights(rows);
            if (!snap) return null;

            const {
              wkLabel,
              salesActual,
              salesBudget,
              payrollPct,
              foodPct,
              drinkPct,
            } = snap;

            const salesVar = (salesActual || 0) - (salesBudget || 0);

            return {
              location: site,
              week: wkLabel,
              payrollPct: payrollPct || 0,
              foodPct: foodPct || 0,
              drinkPct: drinkPct || 0,
              salesVar,
            };
          })
        );

        const cleaned = all.filter(Boolean) as any[];
        cleaned.sort((a, b) => b.payrollPct - a.payrollPct);
        setRankingData(cleaned);
      } catch {
        setRankingData([]);
      }
    }

    buildRanking();
  }, [roleLower]);

  // chart config stays same
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

  // guards
  if (authLoading) {
    return (
      <>
        <FinancialHeader />
        <main className="max-w-7xl mx-auto px-4 py-10 text-center text-gray-500 text-sm">
          Loading profile…
        </main>
      </>
    );
  }

  if (!session || !profile) {
    return (
      <>
        <FinancialHeader />
        <main className="max-w-7xl mx-auto px-4 py-10 text-center">
          <div className="inline-block rounded-xl border border-gray-200 bg-white px-4 py-3 text-red-600 font-medium text-sm shadow">
            You are not signed in.
          </div>
        </main>
      </>
    );
  }

  if (!canViewFinance) {
    return (
      <>
        <FinancialHeader />
        <main className="max-w-7xl mx-auto px-4 py-10 text-center">
          <div className="inline-block rounded-xl border border-gray-200 bg-white px-4 py-3 text-red-600 font-medium text-sm shadow max-w-xs">
            You don&apos;t have permission to view Financial
            Performance.
          </div>
        </main>
      </>
    );
  }

  if (!allowedLocations.length || !initialLocation) {
    return (
      <>
        <FinancialHeader />
        <main className="max-w-7xl mx-auto px-4 py-10 text-center">
          <div className="inline-block rounded-xl border border-gray-200 bg-white px-4 py-3 text-red-600 font-medium text-sm shadow max-w-xs">
            No location access configured for this account.
          </div>
        </main>
      </>
    );
  }

  // MAIN RENDER
  return (
    <>
      {/* portal-style sticky header */}
      <FinancialHeader />

      <main className="max-w-7xl mx-auto px-4 pt-6 pb-16 space-y-8 bg-gray-50 min-h-screen">
        {/* controls row (location + period) */}
        <section className="flex flex-col sm:flex-row sm:items-end gap-4 flex-wrap">
          <div className="flex flex-col">
            <label className="text-[12px] font-semibold text-gray-700 mb-1">
              Select Location / Brand
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 shadow-sm min-w-[220px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {allowedLocations?.map((loc) => (
                <option key={loc} value={loc}>
                  {loc === "GroupOverview" ? "Group Overview" : loc}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-[12px] font-semibold text-gray-700 mb-1">
              Select Period
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 shadow-sm min-w-[140px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {PERIODS?.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Insights row (Current week / Last week results) + KPI mini cards */}
        <InsightsBar
          insights={insights}
          currentWeekNow={currentWeekNow}
          payrollTarget={PAYROLL_TARGET}
        />

        <ComplianceBar
          insights={insights}
          payrollTarget={PAYROLL_TARGET}
          foodTarget={FOOD_TARGET}
          drinkTarget={DRINK_TARGET}
        />

        {(roleLower === "admin" || roleLower === "operation") &&
          rankingData.length > 0 && (
            <RankingTable
              rankingData={rankingData}
              payrollTarget={PAYROLL_TARGET}
              foodTarget={FOOD_TARGET}
              drinkTarget={DRINK_TARGET}
            />
          )}

        {loadingData && (
          <p className="text-center text-gray-500 text-sm">
            Loading data…
          </p>
        )}

        {!loadingData && fetchError && (
          <p className="text-center text-red-600 font-medium text-sm">
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

        {/* tab buttons */}
        <div className="flex justify-center flex-wrap gap-2 mt-6 mb-4">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 rounded-lg text-[13px] font-medium border shadow-sm ${
                activeTab === tab
                  ? "bg-gray-900 text-white border-gray-900 shadow-[0_12px_24px_rgba(0,0,0,0.4),0_4px_12px_rgba(0,0,0,0.4)]"
                  : "bg-white text-gray-900 border-gray-300 shadow-[0_8px_16px_rgba(0,0,0,0.05),0_2px_4px_rgba(0,0,0,0.03)]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

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

        <FinancialFooter />
      </main>
    </>
  );
}