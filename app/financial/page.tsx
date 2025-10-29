"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../src/lib/supabaseClient";
import { CSVLink } from "react-csv";

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
 * and returns:
 * - last week's sales, payroll%, etc
 * - avgPayrollVar4w = avg of Payroll_v% last 4 weeks (can be + or -)
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

  // UI
  const [location, setLocation] = useState<string>("");
  const [period, setPeriod] = useState<string>("Week");
  const [activeTab, setActiveTab] = useState<string>("Sales");

  // data
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

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  // pick first allowed location once we know it
  useEffect(() => {
    if (!location && initialLocation) {
      setLocation(initialLocation);
    }
  }, [initialLocation, location]);

  // build map Week->Period/Quarter once
  const WEEK_TO_PERIOD_QUARTER = useMemo(buildWeekToPeriodQuarter, []);

  // decorate rows with Period + Quarter labels
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

  // group data when Period/Quarter is selected
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

  // compute insights from mergedRows
  const insights = useMemo(
    () => computeInsightsBundle(mergedRows),
    [mergedRows]
  );

  // fetch rows for selected location / brand / group
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
          // "GroupOverview" or an individual site
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

  // compute ranking table for admin/ops
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

  // chart formatting helpers
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
      <div style={centerWrap}>
        <div style={mutedText}>Loading profile…</div>
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <div style={centerWrap}>
        <div style={denyBox}>You are not signed in.</div>
      </div>
    );
  }

  if (!canViewFinance) {
    return (
      <div style={centerWrap}>
        <div style={denyBox}>
          You don&apos;t have permission to view Financial Performance.
        </div>
      </div>
    );
  }

  if (!allowedLocations.length || !initialLocation) {
    return (
      <div style={centerWrap}>
        <div style={denyBox}>
          No location access configured for this account.
        </div>
      </div>
    );
  }

  // ─────────────────────────
  // PAGE RENDER
  // ─────────────────────────
  return (
    <div
      style={{
        backgroundColor: "#f9fafb",
        minHeight: "100vh",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#111827",
      }}
    >
      {/* HEADER BAR (matches portal look, inline styles so no globals) */}
      <header
        style={{
          width: "100%",
          borderBottom: "1px solid #e5e7eb",
          backgroundColor: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(4px)",
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
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1rem",
          }}
        >
          {/* left: logo + portal link */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <Link
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                textDecoration: "none",
              }}
            >
              <img
                src="/logo.png"
                alt="Company Logo"
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "4px",
                  objectFit: "contain",
                }}
              />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  lineHeight: 1.1,
                }}
              >
                <span
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "#111827",
                  }}
                >
                  La Mia Mamma Portal
                </span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    color: "#6b7280",
                    marginTop: "-2px",
                  }}
                >
                  Staff Access
                </span>
              </div>
            </Link>
          </div>

          {/* right: user / role / logout */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              fontSize: "0.8rem",
            }}
          >
            <div
              style={{
                lineHeight: 1.2,
                textAlign: "right",
                maxWidth: "140px",
              }}
            >
              <div
                style={{
                  color: "#111827",
                  fontWeight: 500,
                  fontSize: "0.8rem",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={profile?.full_name || "User"}
              >
                {profile?.full_name || "User"}
              </div>
              <div
                style={{
                  color: "#6b7280",
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {profile?.role}
              </div>
            </div>

            <button
              onClick={handleSignOut}
              style={{
                backgroundColor: "#111827",
                color: "white",
                fontWeight: 600,
                fontSize: "0.7rem",
                lineHeight: 1.2,
                borderRadius: "0.375rem",
                padding: "0.4rem 0.6rem",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 8px 16px rgba(0,0,0,0.25)",
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* CONTROLS ROW (location + period) */}
      <section
        style={{
          maxWidth: "1280px",
          margin: "1rem auto 0",
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "0 1rem",
        }}
      >
        {/* Title + current week */}
        <div style={{ flex: "1 1 auto", minWidth: "200px" }}>
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#6b7280",
              marginBottom: "0.25rem",
              lineHeight: 1.2,
            }}
          >
            Performance {new Date().getFullYear()}
          </div>
          <h1
            style={{
              fontSize: "1.125rem",
              lineHeight: 1.3,
              fontWeight: 600,
              color: "#111827",
              margin: 0,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              gap: "0.5rem",
            }}
          >
            <span>Financial Dashboard</span>
            <span
              style={{
                fontSize: "0.7rem",
                color: "#6b7280",
                fontWeight: 400,
              }}
            >
              Current Week: {currentWeekNow}
            </span>
          </h1>
        </div>

        {/* Location select */}
        <div
          style={{
            flex: "0 0 auto",
            minWidth: "200px",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
          }}
        >
          <label
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#374151",
              lineHeight: 1.2,
            }}
          >
            Select Location
          </label>

          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={{
              backgroundColor: "#fff",
              border: "1px solid #d1d5db",
              borderRadius: "9999px",
              fontSize: "0.8rem",
              lineHeight: 1.2,
              color: "#111827",
              padding: "0.5rem 0.75rem",
              boxShadow:
                "0 8px 16px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.03)",
            }}
          >
            {allowedLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>

        {/* Period select */}
        <div
          style={{
            flex: "0 0 auto",
            minWidth: "160px",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
          }}
        >
          <label
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#374151",
              lineHeight: 1.2,
            }}
          >
            Select Period
          </label>

          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            style={{
              backgroundColor: "#fff",
              border: "1px solid #d1d5db",
              borderRadius: "9999px",
              fontSize: "0.8rem",
              lineHeight: 1.2,
              color: "#111827",
              padding: "0.5rem 0.75rem",
              boxShadow:
                "0 8px 16px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.03)",
            }}
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* 🔥 ONLY ONE BAR NOW: ComplianceBar does the “last week snapshot + dot” */}
      <ComplianceBar
        insights={insights}
        payrollTarget={PAYROLL_TARGET}
        foodTarget={FOOD_TARGET}
        drinkTarget={DRINK_TARGET}
      />

      {/* Ranking (admin / ops only) */}
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

      {/* KPI row */}
      {!loadingData && !fetchError && (
        <KPIBlock
          data={filteredData}
          payrollTarget={PAYROLL_TARGET}
          foodTarget={FOOD_TARGET}
          drinkTarget={DRINK_TARGET}
        />
      )}

      {/* Tab buttons for chart */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          flexWrap: "wrap",
          marginTop: "1.5rem",
          marginBottom: "1rem",
          gap: "0.5rem",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              backgroundColor:
                activeTab === tab ? "#111827" : "#fff",
              color: activeTab === tab ? "#fff" : "#111827",
              border: "1px solid #d1d5db",
              borderRadius: "0.5rem",
              padding: "0.5rem 0.75rem",
              fontSize: "0.8rem",
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

      {/* Feedback when loading or error */}
      {loadingData && (
        <p
          style={{
            textAlign: "center",
            marginTop: "1rem",
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
            marginTop: "1rem",
            color: "#dc2626",
            fontWeight: 500,
          }}
        >
          Could not load data: {fetchError}
        </p>
      )}

      <FinancialFooter />
    </div>
  );
}

// tiny inline styles for loading/error layouts
const centerWrap: React.CSSProperties = {
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