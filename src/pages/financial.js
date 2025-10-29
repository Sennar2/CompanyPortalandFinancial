// src/pages/financial.js

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { CSVLink } from "react-csv";

// bring in tailwind JUST for this page (you created this file)

// supabase client (same one the portal uses)
import { supabase } from "../lib/supabaseClient";

// existing subcomponents that already work with inline styles
import InsightsBar from "../components/financial/InsightsBar";
import ComplianceBar from "../components/financial/ComplianceBar";
import RankingTable from "../components/financial/RankingTable";
import KPIBlock from "../components/financial/KPIBlock";
import ChartSection from "../components/financial/ChartSection";
import FinancialFooter from "../components/financial/FinancialFooter";

/* ------------------------------------------------------------------
   CONSTANTS / HELPERS
-------------------------------------------------------------------*/

const API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_API_KEY ||
  "AIzaSyB_dkFpvk6w_d9dPD_mWVhfB8-lly-9FS8";

const SPREADSHEET_ID =
  process.env.NEXT_PUBLIC_SHEET_ID ||
  "1PPVSEcZ6qLOEK2Z0uRLgXCnS_maazWFO_yMY648Oq1g";

// Brand rollups
const BRAND_GROUPS = {
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

// individual sites, used for ranking
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
const FOOD_TARGET = 12.5;  // %
const DRINK_TARGET = 5.5;  // %

function formatCurrency(val) {
  if (val === undefined || val === null || isNaN(val)) return "-";
  return "£" + Number(val).toLocaleString();
}

// turn "W43" -> 43
function parseWeekNum(weekStr) {
  const num = parseInt(String(weekStr || "").replace(/[^\d]/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

// sum numeric columns by a key (e.g. "Week") for brand rollups
function rollupBy(rows, bucketKey) {
  if (!rows.length) return [];

  const grouped = rows.reduce((acc, row) => {
    const key = String(row[bucketKey]).trim();
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  const numericKeys = Object.keys(rows[0]).filter(
    (k) => typeof rows[0][k] === "number"
  );

  const combined = Object.entries(grouped).map(([label, groupRows]) => {
    const totals = {};
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

/**
 * getCurrentWeekNumber()
 * ISO-ish week calc so we can say "current week is 44"
 */
function getCurrentWeekNumber() {
  const now = new Date();
  const tmp = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  );
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const diffDays = (tmp - yearStart) / 86400000 + 1;
  let w = Math.ceil(diffDays / 7);
  if (w > 52) w = 52;
  return w;
}

/**
 * computeInsightsBundle()
 * Build the summary for "Current Week" and "Last Week Results"
 * + figure out the last *real* completed week (not the fake W52/no data issue).
 * + compute 4-week payroll variance avg for ComplianceBar's traffic light.
 */
function computeInsightsBundle(rows) {
  if (!rows || rows.length === 0) return null;

  // decorate with numeric week index
  const decorated = rows.map((r) => ({
    ...r,
    __weekNum: parseWeekNum(r.Week),
  }));

  const currentWeekNum = getCurrentWeekNumber();
  const snapshotWeekNum =
    currentWeekNum - 1 <= 0 ? currentWeekNum : currentWeekNum - 1;

  function rowHasData(r) {
    return (
      (r.Sales_Actual && r.Sales_Actual !== 0) ||
      (r.Payroll_Actual && r.Payroll_Actual !== 0) ||
      (r.Sales_Budget && r.Sales_Budget !== 0)
    );
  }

  // prefer exact snapshotWeekNum with real data
  let latestRow = decorated.find(
    (r) => r.__weekNum === snapshotWeekNum && rowHasData(r)
  );

  // fallback: newest row <= snapshotWeekNum that has data
  if (!latestRow) {
    const cands = decorated
      .filter((r) => r.__weekNum <= snapshotWeekNum && rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = cands[cands.length - 1];
  }

  // last fallback: newest row that has *any* data
  if (!latestRow) {
    const cands = decorated
      .filter((r) => rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = cands[cands.length - 1];
  }

  if (!latestRow) return null;

  const usedWeekNum = latestRow.__weekNum; // e.g. 43
  const wkLabel = latestRow.Week || `W${usedWeekNum}`;

  // last 4-week window for Payroll_v% avg
  const windowWeeks = [
    usedWeekNum,
    usedWeekNum - 1,
    usedWeekNum - 2,
    usedWeekNum - 3,
  ].filter((n) => n > 0);

  const last4Rows = decorated.filter((r) =>
    windowWeeks.includes(r.__weekNum)
  );

  function parsePayrollVar(val) {
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
      ? payrollTrendVals.reduce((s, n) => s + n, 0) /
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
    wkLabel,              // "W43"
    salesActual,
    salesBudget,
    salesVar,
    salesVarPct,
    payrollPct,
    foodPct,
    drinkPct,
    salesVsLastYearPct,
    avgPayrollVar4w,
    currentWeekLabel: `W${getCurrentWeekNumber()}`, // for the "Current Week" card
  };
}

// take raw google sheet tab -> objects
function parseSheetValues(values) {
  if (!values || values.length < 2) return [];
  const [headers, ...rows] = values;
  return rows.map((row) =>
    headers.reduce((obj, key, idx) => {
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

// fetch a sheet tab
async function fetchTab(tabName) {
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

// figure out allowed dropdown options for this user
function computeAllowedLocationsForProfile(profile) {
  if (!profile) return [];

  const roleLower = (profile.role || "").toLowerCase();
  const home = profile.home_location;

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

  // default (shouldn't really happen for finance)
  return [];
}

/* ------------------------------------------------------------------
   TOP BAR HEADER COMPONENT
   (matches portal style: logo+text on left, admin + logout on right)
-------------------------------------------------------------------*/

function PageTopHeader({ profile, onSignOut }) {
  return (
    <header className="w-full border-b bg-white">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-start md:justify-between px-4 py-4 gap-4">
        {/* LEFT: logo + portal label */}
        <div className="flex items-start gap-3">
          <Link href="/" className="flex items-start gap-2">
            {/* rolling pin logo */}
            <Image
              src="/logo.png"
              alt="La Mia Mamma"
              width={48}
              height={48}
              className="object-contain"
            />
            <div className="leading-tight text-gray-900">
              <div className="text-sm font-semibold text-gray-900">
                La Mia Mamma Portal
              </div>
              <div className="text-[11px] text-gray-500">
                Staff Access
              </div>
            </div>
          </Link>
        </div>

        {/* RIGHT: user info + logout (same vibe as portal) */}
        <div className="flex flex-col items-start md:items-end text-sm text-gray-800">
          {profile?.role === "admin" && (
            <Link
              href="/admin"
              className="inline-block rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[12px] font-semibold text-indigo-700 hover:bg-indigo-100 transition mb-1"
            >
              Admin Panel
            </Link>
          )}

          <div className="leading-tight text-right">
            <div className="text-gray-900 font-medium text-[13px] truncate max-w-[160px]">
              {profile?.full_name || "User"}
            </div>
            <div className="text-[11px] text-gray-500 uppercase tracking-wide">
              {profile?.role || ""}
            </div>
          </div>

          <button
            onClick={onSignOut}
            className="mt-2 inline-block rounded-md bg-gray-900 text-white text-[12px] font-semibold px-3 py-1.5 hover:bg-black transition"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------
   MAIN PAGE COMPONENT
-------------------------------------------------------------------*/

export default function FinancialPage() {
  // 1. AUTH / PROFILE
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [allowedLocations, setAllowedLocations] = useState([]);
  const [initialLocation, setInitialLocation] = useState("");

  useEffect(() => {
    let sub;
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
    roleLower === "manager";

  async function handleSignOut() {
    await supabase.auth.signOut();
    // no router here in pages/, but logging out will kill session
    // user will get kicked out on next render anyway
  }

  // 2. DASHBOARD STATE
  const [location, setLocation] = useState("");
  const [rawRows, setRawRows] = useState([]);
  const [activeTab, setActiveTab] = useState("Sales");
  const [period, setPeriod] = useState("Week");
  const [loadingData, setLoadingData] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [rankingData, setRankingData] = useState([]);

  // which week is "this week"
  const [currentWeekNow] = useState(`W${getCurrentWeekNumber()}`);

  useEffect(() => {
    if (!location && initialLocation) {
      setLocation(initialLocation);
    }
  }, [initialLocation, location]);

  // build helper to map W1..W52 => Period/Quarter
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

  // parse raw sheet into objects
  function parseSheetValuesLocal(values) {
    if (!values || values.length < 2) return [];
    const [headers, ...rows] = values;
    return rows.map((row) =>
      headers.reduce((obj, key, idx) => {
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

  // fetch a single sheet tab
  async function fetchTabLocal(tabName) {
    const range = `${tabName}!A1:Z100`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
      range
    )}?key=${API_KEY}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} loading "${tabName}"`);
    }
    const json = await res.json();
    return parseSheetValuesLocal(json.values);
  }

  // load data for selected location/brand
  useEffect(() => {
    async function load() {
      if (!location) return;
      try {
        setLoadingData(true);
        setFetchError("");

        const isBrand = BRAND_GROUPS[location];
        let rows;
        if (isBrand) {
          const allData = await Promise.all(
            BRAND_GROUPS[location].map((site) => fetchTabLocal(site))
          );
          rows = rollupBy(allData.flat(), "Week");
        } else {
          rows = await fetchTabLocal(location);
        }

        setRawRows(rows);
      } catch (err) {
        console.error(err);
        setFetchError(
          err instanceof Error ? err.message : "Unknown error loading data"
        );
        setRawRows([]);
      } finally {
        setLoadingData(false);
      }
    }

    load();
  }, [location]);

  // enrich rows with Period/Quarter
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

  // group by helper for Period / Quarter
  function groupMergedRowsBy(bucketKey) {
    if (!mergedRows.length) return [];

    const grouped = mergedRows.reduce((acc, row) => {
      const key = row[bucketKey];
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    const numericKeys = Object.keys(mergedRows[0]).filter(
      (k) => typeof mergedRows[0][k] === "number"
    );

    return Object.entries(grouped).map(([label, rows]) => {
      const sums = {};
      numericKeys.forEach((col) => {
        sums[col] = rows.reduce((total, r) => total + (r[col] || 0), 0);
      });
      return {
        Week: label,
        ...sums,
      };
    });
  }

  // final dataset for chart & KPIBlock
  const filteredData = useMemo(() => {
    if (!mergedRows.length) return [];
    if (period === "Week") return mergedRows;
    if (period === "Period") return groupMergedRowsBy("Period");
    return groupMergedRowsBy("Quarter");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedRows, period]);

  // build big insights object
  const insights = useMemo(
    () => computeInsightsBundle(mergedRows),
    [mergedRows]
  );

  // build ranking table (admin & ops only)
  useEffect(() => {
    async function buildRanking() {
      if (roleLower !== "admin" && roleLower !== "operation") {
        setRankingData([]);
        return;
      }

      try {
        const result = await Promise.all(
          STORE_LOCATIONS.map(async (loc) => {
            const rows = await fetchTabLocal(loc);
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

        const cleaned = result.filter(Boolean);
        cleaned.sort((a, b) => b.payrollPct - a.payrollPct);
        setRankingData(cleaned);
      } catch (err) {
        console.error("Ranking build failed:", err);
        setRankingData([]);
      }
    }

    buildRanking();
  }, [roleLower]);

  // chart line definitions
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

  const yTickFormatter = (val) => {
    if (val === 0) return "£0";
    if (!val) return "";
    return "£" + Number(val).toLocaleString();
  };

  const tooltipFormatter = (value, name) => {
    return [formatCurrency(value), name];
  };

  /* ---------------------------------
     RENDER GUARDS
  ----------------------------------*/
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm font-medium">
        Loading profile…
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-xl shadow p-4 text-center text-red-600 text-sm font-medium">
          You are not signed in.
        </div>
      </div>
    );
  }

  if (!canViewFinance) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-xl shadow p-4 text-center text-red-600 text-sm font-medium max-w-xs">
          You don&apos;t have permission to view Financial Performance.
        </div>
      </div>
    );
  }

  if (!allowedLocations.length || !initialLocation) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-xl shadow p-4 text-center text-red-600 text-sm font-medium max-w-xs">
          No location access configured for this account.
        </div>
      </div>
    );
  }

  /* ---------------------------------
     MAIN PAGE
  ----------------------------------*/
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* top header bar (portal style) */}
      <PageTopHeader profile={profile} onSignOut={handleSignOut} />

      {/* main content container */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* PAGE TITLE */}
        <h1 className="text-center text-xl font-semibold text-gray-900">
          Performance 2025
        </h1>

        {/* Controls row: location + period */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-center gap-4 text-sm">
          <div className="flex flex-col">
            <label className="text-gray-700 font-medium mb-1">
              Select Location / Brand
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-64 border rounded-md px-3 py-2 bg-white shadow-sm text-gray-800"
            >
              {allowedLocations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc === "GroupOverview" ? "Group Overview" : loc}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-gray-700 font-medium mb-1">
              Select Period
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-32 border rounded-md px-3 py-2 bg-white shadow-sm text-gray-800"
            >
              {PERIODS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        {/* "Current Week" + "Last Week Results" block
           (this content comes from InsightsBar in your current code) */}
        <InsightsBar
          insights={insights}
          currentWeekNow={currentWeekNow}
          payrollTarget={PAYROLL_TARGET}
        />

        {/* Compliance cards row (Payroll %, Food %, Drink %, Sales vs LY) with traffic light */}
        <ComplianceBar
          insights={insights}
          payrollTarget={PAYROLL_TARGET}
          foodTarget={FOOD_TARGET}
          drinkTarget={DRINK_TARGET}
        />

        {/* Ranking table (admin/ops only) */}
        {(roleLower === "admin" || roleLower === "operation") &&
          rankingData.length > 0 && (
            <RankingTable
              rankingData={rankingData}
              payrollTarget={PAYROLL_TARGET}
              foodTarget={FOOD_TARGET}
              drinkTarget={DRINK_TARGET}
            />
          )}

        {/* Loading / error for main data */}
        {loadingData && (
          <p className="text-center text-gray-500 text-sm font-medium">
            Loading data…
          </p>
        )}

        {!loadingData && fetchError && (
          <p className="text-center text-red-600 text-sm font-medium">
            Could not load data: {fetchError}
          </p>
        )}

        {/* KPI block (Total Sales, Sales vs Budget, Payroll %, etc.) */}
        {!loadingData && !fetchError && (
          <KPIBlock
            data={filteredData}
            payrollTarget={PAYROLL_TARGET}
            foodTarget={FOOD_TARGET}
            drinkTarget={DRINK_TARGET}
          />
        )}

        {/* tab buttons (Sales / Payroll / Food / Drink) */}
        <div className="flex flex-wrap justify-center gap-2 mt-6 mb-4">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 rounded-md text-[13px] font-medium border shadow-sm ${
                activeTab === tab
                  ? "bg-gray-900 text-white border-gray-900 shadow-xl"
                  : "bg-white text-gray-900 border-gray-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* main line chart section with CSV export */}
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

        {/* footer credit */}
        <FinancialFooter />
      </main>
    </div>
  );
}