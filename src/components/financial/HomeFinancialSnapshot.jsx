"use client";

import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";
import InsightsBar from "./InsightsBar";

// SAME constants we use in /financial
const API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_API_KEY ||
  "AIzaSyB_dkFpvk6w_d9dPD_mWVhfB8-lly-9FS8";

const SPREADSHEET_ID =
  process.env.NEXT_PUBLIC_SHEET_ID ||
  "1PPVSEcZ6qLOEK2Z0uRLgXCnS_maazWFO_yMY648Oq1g";

// BRAND ROLLUPS (if later you want to show brand summaries on homepage)
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

// payroll target used in InsightsBar
const PAYROLL_TARGET = 35;

// ---------- helpers we reuse ----------

// get current week label e.g. "W44"
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

// parse Google Sheets rows into objects
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

// W -> number so we can sort newest
function parseWeekNum(weekStr) {
  const num = parseInt(String(weekStr || "").replace(/[^\d]/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

// If we pass multiple sites (brand rollup), we need to combine by Week
function rollupByWeek(rowsArray) {
  if (!rowsArray.length) return [];

  // group by Week
  const grouped = rowsArray.reduce((acc, row) => {
    const w = String(row.Week || "").trim();
    if (!acc[w]) acc[w] = [];
    acc[w].push(row);
    return acc;
  }, {});

  // sum numeric fields per week
  const numericKeys = Object.keys(rowsArray[0]).filter(
    (k) => typeof rowsArray[0][k] === "number"
  );

  // build merged
  const merged = Object.entries(grouped).map(([weekLabel, rows]) => {
    const totals = {};
    numericKeys.forEach((col) => {
      totals[col] = rows.reduce((sum, r) => sum + (r[col] || 0), 0);
    });
    return {
      Week: weekLabel,
      ...totals,
    };
  });

  // sort ascending by week number
  merged.sort((a, b) => parseWeekNum(a.Week) - parseWeekNum(b.Week));
  return merged;
}

// pick the latest full week from dataset and compute KPIs (same logic we use in /financial page)
function computeLatestWeekInsights(rows) {
  if (!rows || rows.length === 0) return null;

  const sorted = [...rows].sort(
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

// pick which site/brand we should show on the portal home
// - admin / operation: "GroupOverview"
// - manager: their home_location
function pickHomeLocationFor(profile) {
  if (!profile) return null;
  const role = (profile.role || "").toLowerCase();

  if (role === "admin" || role === "operation") {
    return "GroupOverview";
  }
  if (role === "manager") {
    return profile.home_location;
  }
  // team members etc: we actually don't want to show finance at all
  return null;
}

// ---------- main component ----------

export default function HomeFinancialSnapshot() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [insights, setInsights] = useState(null);
  const [loadingFinance, setLoadingFinance] = useState(false);
  const [financeError, setFinanceError] = useState("");

  const currentWeekNow = getCurrentWeekLabel();

  // 1. Load session + profile (same pattern as /financial)
  useEffect(() => {
    let authSub;
    async function init() {
      // get current session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session);

      // subscribe to auth changes
      const { data: listener } = supabase.auth.onAuthStateChange(
        (_evt, newSession) => {
          setSession(newSession);
          if (!newSession) {
            setProfile(null);
          }
        }
      );
      authSub = listener;
    }
    init();

    return () => {
      if (authSub) authSub.subscription.unsubscribe();
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
        setAuthLoading(false);
        return;
      }

      setProfile(data);
      setAuthLoading(false);
    }

    loadProfile();
  }, [session]);

  // 2. When we have profile, figure out which site to show and load that tab
  useEffect(() => {
    async function loadFinance() {
      if (!profile) return;

      const loc = pickHomeLocationFor(profile);
      if (!loc) {
        // not allowed (crew-level user etc): don't show anything
        setInsights(null);
        return;
      }

      setLoadingFinance(true);
      setFinanceError("");

      try {
        const isBrand = !!BRAND_GROUPS[loc];
        let rows;

        if (isBrand) {
          // roll up all sites in the brand
          const allData = await Promise.all(
            BRAND_GROUPS[loc].map((site) => fetchTab(site))
          );
          rows = rollupByWeek(allData.flat());
        } else {
          // single site or GroupOverview
          rows = await fetchTab(loc);
          // ensure it's sorted oldest->newest by week
          rows.sort(
            (a, b) => parseWeekNum(a.Week) - parseWeekNum(b.Week)
          );
        }

        const lastWeekInsights = computeLatestWeekInsights(rows);
        setInsights(lastWeekInsights);
      } catch (err) {
        console.error("loadFinance failed:", err);
        setFinanceError(
          err instanceof Error ? err.message : "Unknown error loading finance"
        );
        setInsights(null);
      } finally {
        setLoadingFinance(false);
      }
    }

    loadFinance();
  }, [profile]);

  // 3. Role guard: only show snapshot to admin / operation / manager
  const roleLower = (profile?.role || "").toLowerCase();
  const canSeeFinanceCard =
    roleLower === "admin" ||
    roleLower === "operation" ||
    roleLower === "manager";

  if (authLoading) {
    return (
      <div
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: "0.8rem",
          color: "#6b7280",
          lineHeight: 1.4,
        }}
      >
        Loading performance snapshot…
      </div>
    );
  }

  if (!session || !profile || !canSeeFinanceCard) {
    // Do not render anything at all for regular staff
    return null;
  }

  if (loadingFinance) {
    return (
      <div
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: "0.8rem",
          color: "#6b7280",
          lineHeight: 1.4,
        }}
      >
        Loading performance snapshot…
      </div>
    );
  }

  if (financeError) {
    // We fail silently-ish in homepage context so it doesn't break the whole portal.
    return (
      <div
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: "0.8rem",
          color: "#dc2626",
          lineHeight: 1.4,
          backgroundColor: "#fff",
          borderRadius: "0.75rem",
          border: "1px solid rgba(0,0,0,0.05)",
          boxShadow:
            "0 24px 40px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
          padding: "1rem",
          maxWidth: "400px",
        }}
      >
        Could not load latest performance data.
      </div>
    );
  }

  if (!insights) {
    return null;
  }

  // Render the same InsightsBar we use on /financial
  // We pass currentWeekNow + payrollTarget so it formats correctly.
  return (
    <div
      style={{
        maxWidth: "1400px",
        margin: "0 auto",
        padding: "0 1rem",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <h2
        style={{
          margin: "0 0 0.75rem 0",
          fontSize: "1rem",
          fontWeight: 600,
          color: "#111827",
          lineHeight: 1.3,
        }}
      >
        Last Week Performance
      </h2>

      <InsightsBar
        insights={insights}
        currentWeekNow={currentWeekNow}
        payrollTarget={PAYROLL_TARGET}
      />
    </div>
  );
}
