"use client";

import React, { useEffect, useMemo, useState } from "react";
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
import { supabase } from "@/lib/supabaseClient"; // <- same supabase client you use everywhere


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

const STORE_LOCATIONS: string[] = [
  "La Mia Mamma - Chelsea",
  "La Mia Mamma - Hollywood Road",
  "La Mia Mamma - Notting Hill",
  "La Mia Mamma - Battersea",
  "Fish and Bubbles - Fulham",
  "Fish and Bubbles - Notting Hill",
  "Made in Italy - Chelsea",
  "Made in Italy - Battersea",
  // NOTE: GroupOverview is handled separately
];

const PERIODS = ["Week", "Period", "Quarter"];
const TABS = ["Sales", "Payroll", "Food", "Drink"];

const PAYROLL_TARGET = 35; // %
const FOOD_TARGET = 12.5; // %
const DRINK_TARGET = 5.5; // %

// ─────────────────────────────
// SMALL HELPERS
// ─────────────────────────────

// currency formatter
function formatCurrency(val: any) {
  if (val === undefined || val === null || isNaN(val)) return "£0";
  return "£" + Number(val).toLocaleString();
}

// "W43" -> 43
function parseWeekNum(weekStr: string | undefined) {
  const num = parseInt(String(weekStr || "").replace(/[^\d]/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

// get current ISO week number in range 1-52
function getISOWeek(date = new Date()) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  let weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  if (weekNo > 52) weekNo = 52;
  return weekNo;
}

// used only to "show" current live week (W44 etc)
function getCurrentWeekLabel() {
  return `W${getISOWeek(new Date())}`;
}

// roll up multiple site tabs into Week rows combined
function rollupByWeek(rowsArray: any[]) {
  if (!rowsArray.length) return [];
  const grouped: Record<string, any[]> = {};

  for (const row of rowsArray) {
    const wk = String(row.Week || "").trim();
    if (!grouped[wk]) grouped[wk] = [];
    grouped[wk].push(row);
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

// parse Google Sheet rows into objects with numeric columns
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

// get one sheet tab
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

/**
 * computeInsightsBundle
 * Finds "last completed" week (not the fake W52 zeros)
 * + computes 4-week avg payroll variance (Payroll_v%)
 */
function computeInsightsBundle(rows: any[]) {
  if (!rows || rows.length === 0) return null;

  // attach numeric week
  const decorated = rows.map((r: any) => ({
    ...r,
    __weekNum: parseWeekNum(r.Week),
  }));

  // pick snapshotWeek = currentISOweek - 1 (the last complete)
  const currentWeekNum = getISOWeek(); // e.g. 44
  const snapshotWeekNum = currentWeekNum - 1 <= 0 ? currentWeekNum : currentWeekNum - 1;

  // a helper to see if a row has "real" data
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
    const candidates = decorated
      .filter((r) => r.__weekNum <= snapshotWeekNum && rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = candidates[candidates.length - 1];
  }

  // final fallback: just the most recent with data at all
  if (!latestRow) {
    const candidates = decorated
      .filter((r) => rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = candidates[candidates.length - 1];
  }

  if (!latestRow) return null;

  const weekNumWeUse = latestRow.__weekNum;
  const wkLabel = latestRow.Week || `W${weekNumWeUse}`;

  // last 4 weeks window to average Payroll_v%
  const windowWeeks = [
    weekNumWeUse,
    weekNumWeUse - 1,
    weekNumWeUse - 2,
    weekNumWeUse - 3,
  ].filter((n) => n > 0);

  const last4Rows = decorated.filter((r) =>
    windowWeeks.includes(r.__weekNum)
  );

  function parsePayrollVar(val: any) {
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

  // compute metrics for that snapshot row
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
    wkLabel, // "W43"
    salesActual,
    salesBudget,
    salesVar,
    salesVarPct,
    payrollPct,
    foodPct,
    drinkPct,
    salesVsLastYearPct,
    avgPayrollVar4w,
    currentWeekLabel: getCurrentWeekLabel(), // show W44 etc
  };
}

// figure out which locations user can see
function computeAllowedLocationsForProfile(profile: any) {
  if (!profile) return [];
  const roleLower = (profile.role || "").toLowerCase();
  const home = profile.home_location;

  if (roleLower === "admin" || roleLower === "operation") {
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

  return [];
}

// ─────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────

export default function FinancialPage() {
  // auth
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // role
  const roleLower = (profile?.role || "").toLowerCase();
  const canViewFinance =
    roleLower === "admin" ||
    roleLower === "operation" ||
    roleLower === "manager";

  // location / data
  const [allowedLocations, setAllowedLocations] = useState<string[]>([]);
  const [initialLocation, setInitialLocation] = useState("");
  const [location, setLocation] = useState("");

  const [rawRows, setRawRows] = useState<any[]>([]);
  const [period, setPeriod] = useState("Week");
  const [activeTab, setActiveTab] = useState("Sales");

  const [loadingData, setLoadingData] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const [rankingData, setRankingData] = useState<any[]>([]);

  const [currentWeekNow] = useState(getCurrentWeekLabel());

  // ─────────────────────────
  // AUTH INIT
  // ─────────────────────────
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

  // ─────────────────────────
  // LOAD PROFILE
  // ─────────────────────────
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

  // pick initial location into local `location`
  useEffect(() => {
    if (!location && initialLocation) {
      setLocation(initialLocation);
    }
  }, [initialLocation, location]);

  // map week -> (Period, Quarter)
  const WEEK_TO_PERIOD_QUARTER = useMemo(() => {
    // 52w year, mapping into P1..P12 and Q1..Q4
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

  // merge week rows with Period / Quarter labels
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

  // helper to group data if user selects "Period" or "Quarter"
  function groupMergedRowsBy(bucketKey: "Period" | "Quarter") {
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
        sums[col] = rows.reduce(
          (total: number, r: any) => total + (r[col] || 0),
          0
        );
      });
      return {
        Week: label,
        ...sums,
      };
    });
  }

  // final dataset depending on selected period
  const filteredData = useMemo(() => {
    if (!mergedRows.length) return [];
    if (period === "Week") return mergedRows;
    if (period === "Period") return groupMergedRowsBy("Period");
    return groupMergedRowsBy("Quarter");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedRows, period]);

  //  insights for hero cards + compliance
  const insights = useMemo(
    () => computeInsightsBundle(mergedRows),
    [mergedRows]
  );

  // ─────────────────────────
  // LOAD DATA (revenue rows) for location / brand / group
  // ─────────────────────────
  useEffect(() => {
    async function load() {
      if (!location) return;
      try {
        setLoadingData(true);
        setFetchError("");

        const isBrand = BRAND_GROUPS[location];
        let rows: any[];

        if (isBrand) {
          // roll up multiple tabs
          const allData = await Promise.all(
            BRAND_GROUPS[location].map((site) => fetchTab(site))
          );
          rows = rollupByWeek(allData.flat());
        } else {
          // single site or "GroupOverview"
          rows = await fetchTab(location);
          rows.sort(
            (a: any, b: any) => parseWeekNum(a.Week) - parseWeekNum(b.Week)
          );
        }

        setRawRows(rows);
      } catch (err: any) {
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

  // ─────────────────────────
  // RANKING (payroll% sort)
  // ─────────────────────────
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
        // Sort highest payroll% first
        cleaned.sort((a, b) => b.payrollPct - a.payrollPct);
        setRankingData(cleaned);
      } catch (err) {
        console.error("Ranking build failed:", err);
        setRankingData([]);
      }
    }

    buildRanking();
  }, [roleLower]);

  // config for the line chart
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

  // ─────────────────────────
  // SIGN OUT
  // ─────────────────────────
  async function handleSignOut() {
    await supabase.auth.signOut();
    // in prod you might want to redirect to /login
  }

  // ─────────────────────────
  // PERMISSION GATES
  // ─────────────────────────
  if (authLoading) {
    return (
      <div style={centerBox}>
        <div style={mutedText}>Loading profile…</div>
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <div style={centerBox}>
        <div style={denyBox}>You are not signed in.</div>
      </div>
    );
  }

  if (!canViewFinance) {
    return (
      <div style={centerBox}>
        <div style={denyBox}>
          You don&apos;t have permission to view Financial Performance.
        </div>
      </div>
    );
  }

  if (!allowedLocations.length || !initialLocation) {
    return (
      <div style={centerBox}>
        <div style={denyBox}>
          No location access configured for this account.
        </div>
      </div>
    );
  }

  // ─────────────────────────
  // MAIN PAGE RENDER
  // ─────────────────────────
  return (
    <div
      style={{
        backgroundColor: "#f9fafb",
        minHeight: "100vh",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#111827",
        paddingBottom: "4rem",
      }}
    >
      {/* HEADER BAR (portal-style) */}
      <header
        style={{
          width: "100%",
          borderBottom: "1px solid #e5e7eb",
          backgroundColor: "#fff",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            flexWrap: "wrap",
            rowGap: "8px",
          }}
        >
          {/* left: logo + text, link back to / */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <a
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                textDecoration: "none",
              }}
            >
              <img
                src="/logo.png"
                alt="La Mia Mamma"
                style={{
                  width: "40px",
                  height: "40px",
                  objectFit: "contain",
                  borderRadius: "4px",
                }}
              />
              <div style={{ lineHeight: 1.2 }}>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#111827",
                  }}
                >
                  La Mia Mamma Portal
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#6b7280",
                  }}
                >
                  Staff Access
                </div>
              </div>
            </a>
          </div>

          {/* right side: admin pill, user, logout */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              fontSize: "12px",
              lineHeight: 1.2,
            }}
          >
            {(roleLower === "admin" || roleLower === "operation") && (
              <a
                href="/admin"
                style={{
                  borderRadius: "9999px",
                  border: "1px solid rgb(199,210,254)",
                  backgroundColor: "rgb(238,242,255)",
                  color: "rgb(67,56,202)",
                  fontWeight: 600,
                  fontSize: "12px",
                  padding: "6px 10px",
                  textDecoration: "none",
                  lineHeight: 1.2,
                }}
              >
                Admin Panel
              </a>
            )}

            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontWeight: 500,
                  color: "#111827",
                  fontSize: "13px",
                  maxWidth: "140px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {profile?.full_name || "User"}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "#6b7280",
                  textTransform: "uppercase",
                  fontWeight: 500,
                  letterSpacing: "0.03em",
                }}
              >
                {profile?.role || ""}
              </div>
            </div>

            <button
              onClick={handleSignOut}
              style={{
                borderRadius: "6px",
                backgroundColor: "#111827",
                color: "#fff",
                fontWeight: 600,
                fontSize: "12px",
                padding: "6px 10px",
                lineHeight: 1.2,
                border: "none",
                cursor: "pointer",
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* MAIN BODY */}
      <main
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "24px 16px 64px 16px",
        }}
      >
        {/* Title row */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "flex-start",
            rowGap: "8px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: "12px",
                color: "#6b7280",
                fontWeight: 500,
                lineHeight: 1.2,
                marginBottom: "2px",
              }}
            >
              Performance 2025
            </div>
            <h1
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "#111827",
                lineHeight: 1.3,
              }}
            >
              Financial Dashboard{" "}
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 400,
                  color: "#6b7280",
                  marginLeft: "6px",
                }}
              >
                Current Week: {currentWeekNow}
              </span>
            </h1>
          </div>
        </div>

        {/* FILTER ROW: centered location / period */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "24px",
            marginTop: "24px",
            marginBottom: "24px",
          }}
        >
          {/* Location selector */}
          <div style={{ textAlign: "left" }}>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 500,
                color: "#374151",
                marginBottom: "4px",
                lineHeight: 1.2,
                textAlign: "left",
              }}
            >
              Select Location
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              style={{
                appearance: "none",
                WebkitAppearance: "none",
                MozAppearance: "none",
                border: "1px solid rgb(209,213,219)",
                borderRadius: "8px",
                backgroundColor: "#fff",
                padding: "8px 10px",
                fontSize: "14px",
                color: "#111827",
                lineHeight: 1.2,
                minWidth: "200px",
                boxShadow:
                  "0 10px 30px rgba(0,0,0,0.06),0 4px 12px rgba(0,0,0,0.04)",
              }}
            >
              {allowedLocations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          {/* Period selector */}
          <div style={{ textAlign: "left" }}>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 500,
                color: "#374151",
                marginBottom: "4px",
                lineHeight: 1.2,
                textAlign: "left",
              }}
            >
              Select Period
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              style={{
                appearance: "none",
                WebkitAppearance: "none",
                MozAppearance: "none",
                border: "1px solid rgb(209,213,219)",
                borderRadius: "8px",
                backgroundColor: "#fff",
                padding: "8px 10px",
                fontSize: "14px",
                color: "#111827",
                lineHeight: 1.2,
                minWidth: "160px",
                boxShadow:
                  "0 10px 30px rgba(0,0,0,0.06),0 4px 12px rgba(0,0,0,0.04)",
              }}
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* HERO INSIGHTS (Current Week + Last Week Results) */}
        <InsightsBar
          insights={insights}
          payrollTarget={PAYROLL_TARGET}
          currentWeekNow={currentWeekNow}
        />

        {/* COMPLIANCE KPIs ROW */}
        <div style={{ marginTop: "24px" }}>
          <ComplianceBar
            insights={insights}
            payrollTarget={PAYROLL_TARGET}
            foodTarget={FOOD_TARGET}
            drinkTarget={DRINK_TARGET}
          />
        </div>

        {/* RANKING TABLE */}
        {(roleLower === "admin" || roleLower === "operation") &&
          rankingData.length > 0 && (
            <div style={{ marginTop: "32px" }}>
              <RankingTable
                rankingData={rankingData}
                payrollTarget={PAYROLL_TARGET}
                foodTarget={FOOD_TARGET}
                drinkTarget={DRINK_TARGET}
              />
            </div>
          )}

        {/* HISTORICAL KPI BLOCK + CHARTS */}
        {loadingData && (
          <p
            style={{
              textAlign: "center",
              marginTop: "2rem",
              color: "#6b7280",
            }}
          >
            Loading data…
          </p>
        )}

        {!loadingData && fetchError && (
          <p
            style={{
              textAlign: "center",
              marginTop: "2rem",
              color: "#dc2626",
              fontWeight: 500,
            }}
          >
            Could not load data: {fetchError}
          </p>
        )}

        {!loadingData && !fetchError && (
          <>
            {/* KPIBlock (Totals etc.) */}
            <div style={{ marginTop: "32px" }}>
              <KPIBlock
                data={filteredData}
                payrollTarget={PAYROLL_TARGET}
                foodTarget={FOOD_TARGET}
                drinkTarget={DRINK_TARGET}
              />
            </div>

            {/* Tab buttons */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                flexWrap: "wrap",
                marginTop: "24px",
                marginBottom: "16px",
                gap: "8px",
              }}
            >
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    backgroundColor:
                      activeTab === tab ? "#111827" : "#fff",
                    color:
                      activeTab === tab ? "#fff" : "#111827",
                    border: "1px solid #d1d5db",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    fontSize: "13px",
                    fontWeight: 500,
                    lineHeight: 1.2,
                    cursor: "pointer",
                    boxShadow:
                      activeTab === tab
                        ? "0 12px 24px rgba(0,0,0,0.4)"
                        : "0 8px 16px rgba(0,0,0,0.05)",
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Chart */}
            <ChartSection
              activeTab={activeTab}
              filteredData={filteredData}
              chartConfig={chartConfig}
              yTickFormatter={yTickFormatter}
              tooltipFormatter={tooltipFormatter}
              CSVLink={CSVLink}
            />
          </>
        )}
      </main>

      <FinancialFooter />
    </div>
  );
}

// ─────────────────────────
// STYLE HELPERS FOR STATES
// ─────────────────────────

const centerBox: React.CSSProperties = {
  minHeight: "80vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "Inter, system-ui, sans-serif",
};

const denyBox: React.CSSProperties = {
  backgroundColor: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: "0.75rem",
  padding: "1rem 1.25rem",
  maxWidth: "320px",
  textAlign: "center",
  color: "#dc2626",
  fontWeight: 500,
  fontSize: "0.9rem",
  lineHeight: 1.4,
  boxShadow:
    "0 24px 40px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
};

const mutedText: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "0.9rem",
  lineHeight: 1.4,
  fontWeight: 500,
};
