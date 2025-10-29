import React, { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/router";
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

import { supabase } from "../lib/supabaseClient";

import Header from "..components/financial/FinancialFooter";
import Footer from "./FinancialFooter";

// ENV fallbacks (you can still override via .env.local)
const API_KEY =
  process.env.REACT_APP_GOOGLE_API_KEY ||
  "AIzaSyB_dkFpvk6w_d9dPD_mWVhfB8-lly-9FS8";

const SPREADSHEET_ID =
  process.env.REACT_APP_SHEET_ID ||
  "1PPVSEcZ6qLOEK2Z0uRLgXCnS_maazWFO_yMY648Oq1g";

// Brand group rollups (virtual locations)
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

// Physical store locations (for ranking table)
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

const TABS = ["Sales", "Payroll", "Food", "Drink"];
const PERIODS = ["Week", "Period", "Quarter"];

// Targets you gave me
const PAYROLL_TARGET = 35; // %
const FOOD_TARGET = 12.5; // %
const DRINK_TARGET = 5.5; // %

/* -----------------
   Helper functions
------------------*/

// format £ nicely
function formatCurrency(val) {
  if (val === undefined || val === null || isNaN(val)) return "-";
  return "£" + Number(val).toLocaleString();
}

// "W44" → 44
function parseWeekNum(weekStr) {
  const num = parseInt(String(weekStr || "").replace(/[^\d]/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

// Roll up an array of rows by some key ("Week"). Used to aggregate brand sites together.
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

// Build the insight card from the latest completed week in the data
function computeLatestWeekInsights(mergedRows) {
  if (!mergedRows || mergedRows.length === 0) return null;

  // last (highest) week number
  const sorted = [...mergedRows].sort(
    (a, b) => parseWeekNum(a.Week) - parseWeekNum(b.Week)
  );
  const latest = sorted[sorted.length - 1];
  if (!latest) return null;

  const wkLabel = latest.Week;

  const salesActual = latest.Sales_Actual || 0;
  const salesBudget = latest.Sales_Budget || 0;
  const salesLastYear = latest.Sales_LastYear || 0;

  // Sales vs Budget (money + %)
  const salesVar = salesActual - salesBudget;
  const salesVarPct =
    salesBudget !== 0 ? (salesVar / salesBudget) * 100 : 0;

  // Payroll %, Food %, Drink % of sales
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

  // Sales vs Last Year %
  const salesVsLastYearPct =
    salesLastYear !== 0
      ? ((salesActual - salesLastYear) / salesLastYear) * 100
      : 0;

  return {
    wkLabel,

    // InsightsBar usage
    salesActual,
    salesBudget,
    salesVar,
    salesVarPct,
    payrollPct,

    // ComplianceBar usage
    foodPct,
    drinkPct,
    salesVsLastYearPct,
  };
}

// ISO week number (Mon start). We use this so "Current Week" auto-updates every Monday.
function getISOWeek(date = new Date()) {
  // clone date in UTC so time zones don't break week rollover
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );

  // ISO logic: week starts Monday, week 1 is the week containing Jan 4
  const dayNum = d.getUTCDay() || 7; // Sunday -> 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);

  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);

  return weekNo;
}

function getCurrentWeekLabel() {
  let wk = getISOWeek(new Date());
  if (wk > 52) wk = 52; // safety cap
  return `W${wk}`;
}

/* ---------------
   MAIN COMPONENT
----------------*/

function App({ allowedLocations, initialLocation, profile, onSignOut }) {
  // location currently selected in dropdown
  // NOTE: we do NOT resync back to initialLocation every time.
  // That was the bug that forced you back to GroupOverview.
  const [location, setLocation] = useState(initialLocation || "");

  // rows from sheet (for the selected view OR rollup brand)
  const [rawRows, setRawRows] = useState([]);

  // chart tab (Sales / Payroll / Food / Drink)
  const [activeTab, setActiveTab] = useState("Sales");

  // period granularity (Week / Period / Quarter)
  const [period, setPeriod] = useState("Week");

  // loading + error for selected view
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");

  // admin/ops ranking data across all sites
  const [rankingData, setRankingData] = useState([]);

  // current week label (auto, e.g. "W44")
  const [currentWeekNow] = useState(getCurrentWeekLabel());

  // Week -> Period / Quarter mapping (1..52 weeks)
  const WEEK_TO_PERIOD_QUARTER = useMemo(() => {
    return Array.from({ length: 52 }, (_, i) => {
      const w = i + 1; // week number 1..52
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

  // convert Google Sheets "values" into objects
  function parseSheetValues(values) {
    if (!values || values.length < 2) return [];
    const [headers, ...rows] = values;

    return rows.map((row) =>
      headers.reduce((obj, key, idx) => {
        let value = row[idx];

        // LocationBreakdown sometimes contains JSON
        if (key === "LocationBreakdown" && typeof value === "string") {
          try {
            value = JSON.parse(value);
          } catch {
            value = {};
          }
        } else if (!isNaN(value)) {
          // convert numeric string to number
          value = Number(value);
        }

        obj[key] = value;
        return obj;
      }, {})
    );
  }

  // fetch a single sheet tab by name
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

  // load data for the selected dropdown location
  useEffect(() => {
    async function load() {
      if (!location) return;
      try {
        setLoading(true);
        setFetchError("");

        const brandMembers = BRAND_GROUPS[location];
        let rows;
        if (brandMembers) {
          // brand view: sum all sites in that brand by Week
          const allData = await Promise.all(
            brandMembers.map((siteTab) => fetchTab(siteTab))
          );
          rows = rollupBy(allData.flat(), "Week");
        } else {
          // single site OR "GroupOverview"
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
        setLoading(false);
      }
    }

    load();
  }, [location]);

  // add Period + Quarter to each row
  const mergedRows = useMemo(() => {
    return rawRows.map((item) => {
      const w = String(item.Week || "").trim(); // e.g. "W44"
      const match = WEEK_TO_PERIOD_QUARTER.find((e) => e.week === w);

      return {
        ...item,
        Period: match?.period || "P?",
        Quarter: match?.quarter || "Q?",
      };
    });
  }, [rawRows, WEEK_TO_PERIOD_QUARTER]);

  // group if user selects Period or Quarter
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
        Week: label, // for chart x-axis (Period or Quarter label)
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

  // last-week metrics for current selection (Insights + Compliance)
  const insights = useMemo(
    () => computeLatestWeekInsights(mergedRows),
    [mergedRows]
  );

  // Ranking data: only for admin / operation
  useEffect(() => {
    async function buildRanking() {
      const roleLower = (profile?.role || "").toLowerCase();
      if (roleLower !== "admin" && roleLower !== "operation") {
        setRankingData([]);
        return;
      }

      try {
        const result = await Promise.all(
          STORE_LOCATIONS.map(async (loc) => {
            const rows = await fetchTab(loc);
            if (!rows || rows.length === 0) return null;

            // pick latest week row in that store
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

            const salesVar = salesActual - salesBudget; // £ over/under budget

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

        // sort worst first by payroll %, since payroll drift hurts fastest
        cleaned.sort((a, b) => b.payrollPct - a.payrollPct);

        setRankingData(cleaned);
      } catch (err) {
        console.error("Ranking build failed:", err);
        setRankingData([]);
      }
    }

    buildRanking();
  }, [profile]);

  // chart lines config
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

  // £ formatting on y-axis
  const yTickFormatter = (val) => {
    if (val === 0) return "£0";
    if (!val) return "";
    return "£" + Number(val).toLocaleString();
  };

  // tooltip styling for the chart
  const tooltipFormatter = (value, name) => {
    return [formatCurrency(value), name];
  };

  // role convenience
  const roleLower = (profile?.role || "").toLowerCase();
  const isOpsOrAdmin =
    roleLower === "admin" || roleLower === "operation";

  return (
    <div
      style={{
        backgroundColor: "#f9fafb",
        minHeight: "100vh",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#111827",
      }}
    >
      {/* Header / Filters / User */}
      <Header
        profile={profile}
        onSignOut={onSignOut}
        allowedLocations={allowedLocations}
        location={location}
        setLocation={setLocation}
        period={period}
        setPeriod={setPeriod}
        PERIODS={PERIODS}
      />

      {/* Insights: "what week are we in" + last week summary */}
      <InsightsBar insights={insights} currentWeekNow={currentWeekNow} />

      {/* Compliance targets strip with ✅ / ❌ using YOUR targets */}
      <ComplianceBar
        insights={insights}
        payrollTarget={PAYROLL_TARGET}
        foodTarget={FOOD_TARGET}
        drinkTarget={DRINK_TARGET}
      />

      {/* Ranking table (admins / ops only) */}
      {isOpsOrAdmin && rankingData.length > 0 && (
        <RankingTable
          rankingData={rankingData}
          payrollTarget={PAYROLL_TARGET}
          foodTarget={FOOD_TARGET}
          drinkTarget={DRINK_TARGET}
        />
      )}

      {/* Loading / errors for the currently selected location */}
      {loading && (
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

      {!loading && fetchError && (
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

      {/* KPI cards (rollup for whatever period=Week/Period/Quarter is selected) */}
      {!loading && !fetchError && (
        <KPIBlock
          data={filteredData}
          payrollTarget={PAYROLL_TARGET}
          foodTarget={FOOD_TARGET}
          drinkTarget={DRINK_TARGET}
        />
      )}

      {/* Tabs to switch chart metric */}
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
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Trend chart */}
      {!loading && !fetchError && (
        <ChartSection
          activeTab={activeTab}
          filteredData={filteredData}
          chartConfig={chartConfig}
          yTickFormatter={yTickFormatter}
          tooltipFormatter={tooltipFormatter}
        />
      )}

      <Footer />
    </div>
  );
}

/* ------------------------
   InsightsBar (top strip)
-------------------------*/

function InsightsBar({ insights, currentWeekNow }) {
  if (!insights) return null;

  const {
    wkLabel,
    salesActual,
    salesBudget,
    salesVar,
    salesVarPct,
    payrollPct,
  } = insights;

  const salesGood = salesVar >= 0;
  const payrollGood = payrollPct <= PAYROLL_TARGET;

  return (
    <div
      style={{
        maxWidth: "1400px",
        margin: "0 auto",
        padding: "0 1rem",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "1rem",
        marginBottom: "1.5rem",
      }}
    >
      {/* Current Week */}
      <div
        style={{
          flex: "1 1 220px",
          minWidth: "220px",
          backgroundColor: "#fff",
          borderRadius: "0.75rem",
          border: "1px solid rgba(0,0,0,0.05)",
          boxShadow:
            "0 24px 40px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
          padding: "1rem",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: 500,
            color: "#4b5563",
            marginBottom: "0.4rem",
          }}
        >
          Current Week
        </div>
        <div
          style={{
            fontSize: "1.4rem",
            fontWeight: 600,
            color: "#111827",
            lineHeight: 1.2,
          }}
        >
          {currentWeekNow || "—"}
        </div>
        <div
          style={{
            fontSize: "0.75rem",
            color: "#6b7280",
            lineHeight: 1.4,
            marginTop: "0.25rem",
          }}
        >
          Today's trading period
        </div>
      </div>

      {/* Last Week Summary */}
      <div
        style={{
          flex: "1 1 320px",
          minWidth: "280px",
          backgroundColor: "#fff",
          borderRadius: "0.75rem",
          border: "1px solid rgba(0,0,0,0.05)",
          boxShadow:
            "0 24px 40px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
          padding: "1rem",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: 500,
            color: "#4b5563",
            marginBottom: "0.4rem",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            rowGap: "0.25rem",
          }}
        >
          <span>Last Week Results</span>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 400,
              color: "#6b7280",
            }}
          >
            {wkLabel || "W-"}
          </span>
        </div>

        {/* Sales vs Budget */}
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: 500,
            color: "#4b5563",
            marginBottom: "0.25rem",
            lineHeight: 1.4,
          }}
        >
          Sales vs Budget
        </div>

        <div
          style={{
            fontSize: "1rem",
            fontWeight: 600,
            lineHeight: 1.2,
            color: salesGood ? "#059669" : "#dc2626",
          }}
        >
          {salesVar >= 0 ? "+" : ""}
          £{Math.round(salesVar).toLocaleString()}{" "}
          <span
            style={{
              fontSize: "0.8rem",
              fontWeight: 500,
              marginLeft: "0.4rem",
              color: salesGood ? "#059669" : "#dc2626",
            }}
          >
            ({salesVarPct >= 0 ? "+" : ""}
            {salesVarPct.toFixed(1)}%)
          </span>
        </div>

        <div
          style={{
            fontSize: "0.75rem",
            color: "#6b7280",
            lineHeight: 1.4,
            marginTop: "0.25rem",
            marginBottom: "0.75rem",
          }}
        >
          Actual £{Math.round(salesActual).toLocaleString()} vs Budget £
          {Math.round(salesBudget).toLocaleString()}
        </div>

        {/* Payroll % last week */}
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: 500,
            color: "#4b5563",
            marginBottom: "0.25rem",
            lineHeight: 1.4,
          }}
        >
          Payroll %
        </div>

        <div
          style={{
            fontSize: "1.25rem",
            fontWeight: 600,
            lineHeight: 1.2,
            color: payrollGood ? "#059669" : "#dc2626",
          }}
        >
          {payrollPct.toFixed(1)}%
        </div>
        <div
          style={{
            fontSize: "0.75rem",
            color: "#6b7280",
            lineHeight: 1.4,
            marginTop: "0.25rem",
          }}
        >
          Target ≤ {PAYROLL_TARGET}%
        </div>
      </div>
    </div>
  );
}

/* --------------------------
   ComplianceBar (targets)
---------------------------*/

function ComplianceBar({
  insights,
  payrollTarget,
  foodTarget,
  drinkTarget,
}) {
  if (!insights) return null;

  const {
    wkLabel,
    payrollPct,
    foodPct,
    drinkPct,
    salesVsLastYearPct,
  } = insights;

  // evaluate pass/fail using your new targets
  const payrollOk = payrollPct <= payrollTarget;
  const foodOk = foodPct <= foodTarget;
  const drinkOk = drinkPct <= drinkTarget;
  const lyOk = salesVsLastYearPct >= 0;

  function MetricChip({ label, sub, value, suffix, ok }) {
    return (
      <div
        style={{
          flex: "1 1 200px",
          minWidth: "200px",
          backgroundColor: "#fff",
          borderRadius: "0.75rem",
          border: "1px solid rgba(0,0,0,0.05)",
          boxShadow:
            "0 16px 32px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)",
          padding: "0.9rem 1rem",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: 500,
            color: "#4b5563",
            marginBottom: "0.4rem",
            lineHeight: 1.4,
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            rowGap: "0.25rem",
          }}
        >
          <span>{label}</span>
          {sub && (
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 400,
                color: "#6b7280",
              }}
            >
              {sub}
            </span>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            flexWrap: "wrap",
            gap: "0.5rem",
            lineHeight: 1.2,
          }}
        >
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              color: ok ? "#059669" : "#dc2626",
            }}
          >
            {value}
            {suffix}
          </div>
          <div
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              color: ok ? "#059669" : "#dc2626",
              display: "flex",
              alignItems: "center",
              lineHeight: 1.2,
            }}
          >
            {ok ? "✅" : "❌"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "1400px",
        margin: "0 auto",
        padding: "0 1rem",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "1rem",
        marginBottom: "1.5rem",
      }}
    >
      <MetricChip
        label="Payroll %"
        sub={`${wkLabel || ""} • Target ≤ ${payrollTarget}%`}
        value={payrollPct.toFixed(1)}
        suffix="%"
        ok={payrollOk}
      />

      <MetricChip
        label="Food %"
        sub={`${wkLabel || ""} • Target ≤ ${foodTarget}%`}
        value={foodPct.toFixed(1)}
        suffix="%"
        ok={foodOk}
      />

      <MetricChip
        label="Drink %"
        sub={`${wkLabel || ""} • Target ≤ ${drinkTarget}%`}
        value={drinkPct.toFixed(1)}
        suffix="%"
        ok={drinkOk}
      />

      <MetricChip
        label="Sales vs LY"
        sub={`${wkLabel || ""} • Target ≥ 0%`}
        value={
          salesVsLastYearPct >= 0
            ? "+" + salesVsLastYearPct.toFixed(1)
            : salesVsLastYearPct.toFixed(1)
        }
        suffix="%"
        ok={lyOk}
      />
    </div>
  );
}

/* --------------------------
   RankingTable (admin/ops)
---------------------------*/

function RankingTable({
  rankingData,
  payrollTarget,
  foodTarget,
  drinkTarget,
}) {
  if (!rankingData || rankingData.length === 0) return null;

  function colorFor(val, target, inverse = false) {
    // inverse=false => good if val <= target
    // inverse=true  => good if val >= target
    const ok = inverse ? val >= target : val <= target;
    return {
      color: ok ? "#059669" : "#dc2626",
      ok,
    };
  }

  return (
    <div
      style={{
        maxWidth: "1400px",
        margin: "0 auto 1.5rem auto",
        padding: "0 1rem",
      }}
    >
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "0.75rem",
            border: "1px solid rgba(0,0,0,0.05)",
            boxShadow:
              "0 24px 40px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
            padding: "1rem 1rem 1.25rem",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          <div
            style={{
              marginBottom: "0.75rem",
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              rowGap: "0.5rem",
              alignItems: "baseline",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "1rem",
                fontWeight: 600,
                color: "#111827",
                lineHeight: 1.3,
              }}
            >
              Site Ranking (last week)
            </h2>
            <div
              style={{
                fontSize: "0.7rem",
                color: "#6b7280",
                lineHeight: 1.3,
              }}
            >
              Sorted by highest Payroll %
            </div>
          </div>

          <div
            style={{
              width: "100%",
              overflowX: "auto",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.8rem",
                lineHeight: 1.4,
                minWidth: "600px",
              }}
            >
              <thead>
                <tr
                  style={{
                    textAlign: "left",
                    color: "#6b7280",
                    fontWeight: 500,
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  <th
                    style={{
                      padding: "0.5rem 0.75rem",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      color: "#6b7280",
                    }}
                  >
                    Location
                  </th>
                  <th
                    style={{
                      padding: "0.5rem 0.75rem",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      color: "#6b7280",
                    }}
                  >
                    Payroll %
                    <span style={{ fontWeight: 400, color: "#9ca3af" }}>
                      {" "}
                      (≤ {payrollTarget}%)
                    </span>
                  </th>
                  <th
                    style={{
                      padding: "0.5rem 0.75rem",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      color: "#6b7280",
                    }}
                  >
                    Food %
                    <span style={{ fontWeight: 400, color: "#9ca3af" }}>
                      {" "}
                      (≤ {foodTarget}%)
                    </span>
                  </th>
                  <th
                    style={{
                      padding: "0.5rem 0.75rem",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      color: "#6b7280",
                    }}
                  >
                    Drink %
                    <span style={{ fontWeight: 400, color: "#9ca3af" }}>
                      {" "}
                      (≤ {drinkTarget}%)
                    </span>
                  </th>
                  <th
                    style={{
                      padding: "0.5rem 0.75rem",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      color: "#6b7280",
                    }}
                  >
                    Sales vs Budget
                  </th>
                </tr>
              </thead>
              <tbody>
                {rankingData.map((row, idx) => {
                  const payrollStyle = colorFor(
                    row.payrollPct,
                    payrollTarget
                  );
                  const foodStyle = colorFor(row.foodPct, foodTarget);
                  const drinkStyle = colorFor(row.drinkPct, drinkTarget);
                  const salesStyle = colorFor(row.salesVar, 0, true); // >=0 is good

                  return (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: "1px solid #e5e7eb",
                        backgroundColor:
                          idx === 0
                            ? "rgba(220,38,38,0.03)" // highlight worst payroll
                            : "transparent",
                      }}
                    >
                      <td
                        style={{
                          padding: "0.75rem",
                          fontWeight: 500,
                          color: "#111827",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.location}
                        <div
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 400,
                            color: "#9ca3af",
                            lineHeight: 1.3,
                          }}
                        >
                          {row.week || "-"}
                        </div>
                      </td>

                      <td
                        style={{
                          padding: "0.75rem",
                          fontWeight: 600,
                          color: payrollStyle.color,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.payrollPct.toFixed(1)}%
                      </td>

                      <td
                        style={{
                          padding: "0.75rem",
                          fontWeight: 600,
                          color: foodStyle.color,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.foodPct.toFixed(1)}%
                      </td>

                      <td
                        style={{
                          padding: "0.75rem",
                          fontWeight: 600,
                          color: drinkStyle.color,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.drinkPct.toFixed(1)}%
                      </td>

                      <td
                        style={{
                          padding: "0.75rem",
                          fontWeight: 600,
                          color: salesStyle.color,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.salesVar >= 0 ? "+" : ""}
                        £{Math.round(row.salesVar).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            style={{
              fontSize: "0.7rem",
              color: "#6b7280",
              lineHeight: 1.4,
              marginTop: "0.75rem",
            }}
          >
            Worst payroll % shown first. Green = on target, Red = off target.
          </div>
        </div>
    </div>
  );
}

/* ----------------
   KPI Cards block
-----------------*/

function KPIBlock({ data, payrollTarget, foodTarget, drinkTarget }) {
  if (!data || data.length === 0) return null;

  const total = (key) =>
    data.reduce((sum, row) => sum + (row[key] || 0), 0);

  const totalSales = total("Sales_Actual");
  const salesVsBudget = total("Sales_Actual") - total("Sales_Budget");

  const payrollPct = totalSales
    ? (total("Payroll_Actual") / totalSales) * 100
    : 0;
  const foodPct = totalSales
    ? (total("Food_Actual") / totalSales) * 100
    : 0;
  const drinkPct = totalSales
    ? (total("Drink_Actual") / totalSales) * 100
    : 0;

  const kpis = [
    {
      label: "Total Sales",
      value: formatCurrency(totalSales),
      positive: true,
    },
    {
      label: "Sales vs Budget",
      value: formatCurrency(salesVsBudget),
      positive: salesVsBudget >= 0,
    },
    {
      label: "Payroll %",
      value: `${payrollPct.toFixed(1)}%`,
      positive: payrollPct <= payrollTarget,
    },
    {
      label: "Food Cost %",
      value: `${foodPct.toFixed(1)}%`,
      positive: foodPct <= foodTarget,
    },
    {
      label: "Drink Cost %",
      value: `${drinkPct.toFixed(1)}%`,
      positive: drinkPct <= drinkTarget,
    },
  ];

  return (
    <div
      style={{
        maxWidth: "1400px",
        marginLeft: "auto",
        marginRight: "auto",
        padding: "0 1rem",
        display: "flex",
        flexWrap: "wrap",
        gap: "1rem",
        justifyContent: "center",
      }}
    >
      {kpis.map((kpi, idx) => (
        <div
          key={idx}
          style={{
            flex: "1 1 200px",
            maxWidth: "240px",
            minWidth: "200px",
            backgroundColor: "#fff",
            borderRadius: "0.75rem",
            boxShadow:
              "0 24px 40px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
            border: "1px solid rgba(0,0,0,0.05)",
            padding: "1rem",
            textAlign: "center",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          <div
            style={{
              fontSize: "0.9rem",
              fontWeight: 500,
              color: "#4b5563",
              marginBottom: "0.5rem",
              lineHeight: 1.3,
            }}
          >
            {kpi.label}
          </div>
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              color: kpi.positive ? "#059669" : "#dc2626",
              lineHeight: 1.2,
            }}
          >
            {kpi.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/* -----------------
   Chart + Export
------------------*/

function ChartSection({
  activeTab,
  filteredData,
  chartConfig,
  yTickFormatter,
  tooltipFormatter,
}) {
  const lines = chartConfig[activeTab] || [];

  return (
    <div
      style={{
        maxWidth: "1400px",
        marginLeft: "auto",
        marginRight: "auto",
        backgroundColor: "#fff",
        borderRadius: "0.75rem",
        boxShadow:
          "0 24px 40px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
        border: "1px solid rgba(0,0,0,0.05)",
        padding: "1rem 1rem 1.5rem",
        marginBottom: "2rem",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
          rowGap: "0.75rem",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "1rem",
            fontWeight: 600,
            color: "#111827",
            lineHeight: 1.3,
          }}
        >
          {activeTab}: Actual vs Budget
        </h2>

        <CSVLink
          data={filteredData}
          filename={`${activeTab}.csv`}
          style={{
            fontSize: "0.8rem",
            backgroundColor: "#111827",
            color: "#fff",
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            textDecoration: "none",
            fontWeight: 500,
            lineHeight: 1.2,
            boxShadow: "0 12px 24px rgba(0,0,0,0.4)",
          }}
        >
          Export CSV
        </CSVLink>
      </div>

      <div style={{ width: "100%", height: "300px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filteredData}>
            <XAxis dataKey="Week" />
            <YAxis tickFormatter={yTickFormatter} />
            <Tooltip formatter={tooltipFormatter} />
            <Legend />
            {lines.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                stroke={line.color}
                name={line.name}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6, strokeWidth: 2, stroke: "#000" }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default App;
