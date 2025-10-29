"use client";

import React, { useEffect, useState, useMemo } from "react";
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

// IMPORTANT: adjust this import path if your supabase client lives somewhere else.
// I’m assuming you already have `src/supabaseClient.js` in the portal.
import { supabase } from "../../supabaseClient";

import FinancialHeader from "../../components/financial/FinancialHeader";
import FinancialFooter from "../../components/financial/FinancialFooter";
import InsightsBar from "../../components/financial/InsightsBar";
import ComplianceBar from "../../components/financial/ComplianceBar";
import RankingTable from "../../components/financial/RankingTable";
import KPIBlock from "../../components/financial/KPIBlock";
import ChartSection from "../../components/financial/ChartSection";

// ---------------------
// CONFIG / CONSTANTS
// ---------------------

// use your env vars if you have them, fallback to current values
const API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_API_KEY ||
  "AIzaSyB_dkFpvk6w_d9dPD_mWVhfB8-lly-9FS8";

const SPREADSHEET_ID =
  process.env.NEXT_PUBLIC_SHEET_ID ||
  "1PPVSEcZ6qLOEK2Z0uRLgXCnS_maazWFO_yMY648Oq1g";

// virtual/brand rollups
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

// physical stores for ranking table
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

// Targets (your real ones)
const PAYROLL_TARGET = 35; // %
const FOOD_TARGET = 12.5; // %
const DRINK_TARGET = 5.5; // %

// ---------------------
// HELPER FUNCTIONS
// ---------------------

function formatCurrency(val) {
  if (val === undefined || val === null || isNaN(val)) return "-";
  return "£" + Number(val).toLocaleString();
}

function parseWeekNum(weekStr) {
  const num = parseInt(String(weekStr || "").replace(/[^\d]/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

// roll up multi-site rows by Week for brand views
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

// build insights for the most recent full week in the dataset
function computeLatestWeekInsights(mergedRows) {
  if (!mergedRows || mergedRows.length === 0) return null;

  const sorted = [...mergedRows].sort(
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

// ISO week number (Mon start), capped to 52
function getISOWeek(date = new Date()) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return weekNo > 52 ? 52 : weekNo;
}
function getCurrentWeekLabel() {
  return `W${getISOWeek(new Date())}`;
}

// compute which locations this user is allowed to see
function computeAllowedLocationsForProfile(profile) {
  if (!profile) return [];
  const roleLower = (profile.role || "").toLowerCase();
  const home = profile.home_location;

  // Admin / Operation -> full access to all
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

  // Manager -> just their site
  if (roleLower === "manager") {
    return [home];
  }

  // Team members / others -> nothing
  return [];
}

// ---------------------
// PAGE COMPONENT
// ---------------------

export default function FinancialDashboardPage() {
  // --- 1. AUTH / PROFILE ---
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // allowed location logic
  const [allowedLocations, setAllowedLocations] = useState([]);
  const [initialLocation, setInitialLocation] = useState("");

  // pull Supabase session + listen for changes
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

  // once we have a session, load the profile row from Supabase
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

      // set profile
      setProfile(data);

      // compute allowedLocations + default location
      const locs = computeAllowedLocationsForProfile(data);
      setAllowedLocations(locs);
      setInitialLocation(locs[0] || "");

      setAuthLoading(false);
    }

    loadProfile();
  }, [session]);

  // role checks
  const roleLower = (profile?.role || "").toLowerCase();
  const canViewFinance =
    roleLower === "admin" ||
    roleLower === "operation" ||
    roleLower === "manager";

  // sign out button
  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  // --- 2. DASHBOARD STATE ---
  const [location, setLocation] = useState("");
  const [rawRows, setRawRows] = useState([]);
  const [activeTab, setActiveTab] = useState("Sales");
  const [period, setPeriod] = useState("Week");
  const [loadingData, setLoadingData] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [rankingData, setRankingData] = useState([]);

  const [currentWeekNow] = useState(getCurrentWeekLabel());

  // when initialLocation is ready (after profile load), set default once
  useEffect(() => {
    if (!location && initialLocation) {
      setLocation(initialLocation);
    }
  }, [initialLocation, location]);

  // map Week -> Period / Quarter for 52 weeks
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

  // turn Google Sheets "values" -> array of row objects
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

  // fetch one sheet tab
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

  // load data for current dropdown location
  useEffect(() => {
    async function load() {
      if (!location) return;
      try {
        setLoadingData(true);
        setFetchError("");

        const isBrand = BRAND_GROUPS[location];
        let rows;
        if (isBrand) {
          // brand view: merge all its sites by Week
          const allData = await Promise.all(
            BRAND_GROUPS[location].map((site) => fetchTab(site))
          );
          rows = rollupBy(allData.flat(), "Week");
        } else {
          // single site or "GroupOverview"
          rows = await fetchTab(location);
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

  // decorate rows with Period + Quarter labels
  const mergedRows = useMemo(() => {
    return rawRows.map((item) => {
      const w = String(item.Week || "").trim(); // "W44"
      const match = WEEK_TO_PERIOD_QUARTER.find((x) => x.week === w);
      return {
        ...item,
        Period: match?.period || "P?",
        Quarter: match?.quarter || "Q?",
      };
    });
  }, [rawRows, WEEK_TO_PERIOD_QUARTER]);

  // aggregate by Period or Quarter if needed
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
        Week: label, // this will be "P3" or "Q2", shown on chart
        ...sums,
      };
    });
  }

  const filteredData = useMemo(() => {
    if (!mergedRows.length) return [];
    if (period === "Week") return mergedRows;
    if (period === "Period") return groupMergedRowsBy("Period");
    return groupMergedRowsBy("Quarter");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedRows, period]);

  // compute the "last week" metrics block
  const insights = useMemo(
    () => computeLatestWeekInsights(mergedRows),
    [mergedRows]
  );

  // build rankingData for admin/operation only
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

            const salesVar = salesActual - salesBudget; // £ above/below budget

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

        // sort worst -> best by payroll %
        cleaned.sort((a, b) => b.payrollPct - a.payrollPct);

        setRankingData(cleaned);
      } catch (err) {
        console.error("Ranking build failed:", err);
        setRankingData([]);
      }
    }

    buildRanking();
  }, [roleLower]);

  // chart line config
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

  // £ axis label
  const yTickFormatter = (val) => {
    if (val === 0) return "£0";
    if (!val) return "";
    return "£" + Number(val).toLocaleString();
  };

  // tooltip values
  const tooltipFormatter = (value, name) => {
    return [formatCurrency(value), name];
  };

  // ---- RENDER GUARDS ----

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
        <div style={denyBox}>
          You are not signed in.
        </div>
      </div>
    );
  }

  if (!canViewFinance) {
    // team members / disallowed roles
    return (
      <div style={centerBox}>
        <div style={denyBox}>
          You don&apos;t have permission to view Financial Performance.
        </div>
      </div>
    );
  }

  // allowedLocations might still be empty (should not happen for
  // admin/operation/manager if profile is set, but safety):
  if (!allowedLocations.length || !initialLocation) {
    return (
      <div style={centerBox}>
        <div style={denyBox}>
          No location access configured for this account.
        </div>
      </div>
    );
  }

  // ---- MAIN PAGE ----
  return (
    <div
      style={{
        backgroundColor: "#f9fafb",
        minHeight: "100vh",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#111827",
      }}
    >
      {/* Top header with logo, user, dropdowns */}
      <FinancialHeader
        profile={profile}
        onSignOut={handleSignOut}
        allowedLocations={allowedLocations}
        location={location}
        setLocation={setLocation}
        period={period}
        setPeriod={setPeriod}
        PERIODS={PERIODS}
      />

      {/* Insights: current week + last week summary for the selected location */}
      <InsightsBar
        insights={insights}
        currentWeekNow={currentWeekNow}
        payrollTarget={PAYROLL_TARGET}
      />

      {/* Compliance vs targets with ✅ / ❌ */}
      <ComplianceBar
        insights={insights}
        payrollTarget={PAYROLL_TARGET}
        foodTarget={FOOD_TARGET}
        drinkTarget={DRINK_TARGET}
      />

      {/* Admin / Operation only: ranking all stores last week */}
      {(roleLower === "admin" || roleLower === "operation") &&
        rankingData.length > 0 && (
          <RankingTable
            rankingData={rankingData}
            payrollTarget={PAYROLL_TARGET}
            foodTarget={FOOD_TARGET}
            drinkTarget={DRINK_TARGET}
          />
        )}

      {/* Loading / error state for selected location data */}
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

      {/* KPI cards */}
      {!loadingData && !fetchError && (
        <KPIBlock
          data={filteredData}
          payrollTarget={PAYROLL_TARGET}
          foodTarget={FOOD_TARGET}
          drinkTarget={DRINK_TARGET}
        />
      )}

      {/* Metric tabs */}
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
            className={`tab-button ${activeTab === tab ? "active" : ""}`}
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

      <FinancialFooter />
    </div>
  );
}

// little inline style helpers for fallback states
const centerBox = {
  minHeight: "80vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "Inter, system-ui, sans-serif",
};

const denyBox = {
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

const mutedText = {
  color: "#6b7280",
  fontSize: "0.9rem",
  lineHeight: 1.4,
  fontWeight: 500,
};
