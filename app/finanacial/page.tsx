"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { CSVLink } from "react-csv";

// Components we already have
import InsightsBar from "@/components/financial/InsightsBar";
import ComplianceBar from "@/components/financial/ComplianceBar";
import RankingTable from "@/components/financial/RankingTable";
import KPIBlock from "@/components/financial/KPIBlock";
import ChartSection from "@/components/financial/ChartSection";
import FinancialFooter from "@/components/financial/FinancialFooter";

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

function parseWeekNum(weekStr: any) {
  const num = parseInt(String(weekStr || "").replace(/[^\d]/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

function getCurrentWeekNumber() {
  const now = new Date();
  const tmp = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  );
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const diffDays = (tmp.getTime() - yearStart.getTime()) / 86400000 + 1;
  let w = Math.ceil(diffDays / 7);
  if (w > 52) w = 52;
  return w;
}

function computeInsightsBundle(rows: any[]) {
  if (!rows || rows.length === 0) return null;

  const decorated = rows.map((r) => ({
    ...r,
    __weekNum: parseWeekNum(r.Week),
  }));

  const currentWeekNum = getCurrentWeekNumber();
  const snapshotWeekNum =
    currentWeekNum - 1 <= 0 ? currentWeekNum : currentWeekNum - 1;

  function rowHasData(r: any) {
    return (
      (r.Sales_Actual && r.Sales_Actual !== 0) ||
      (r.Payroll_Actual && r.Payroll_Actual !== 0) ||
      (r.Sales_Budget && r.Sales_Budget !== 0)
    );
  }

  let latestRow = decorated.find(
    (r) => r.__weekNum === snapshotWeekNum && rowHasData(r)
  );

  if (!latestRow) {
    const cands = decorated
      .filter((r) => r.__weekNum <= snapshotWeekNum && rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = cands[cands.length - 1];
  }

  if (!latestRow) {
    const cands = decorated
      .filter((r) => rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = cands[cands.length - 1];
  }

  if (!latestRow) return null;

  const usedWeekNum = latestRow.__weekNum;
  const wkLabel = latestRow.Week || `W${usedWeekNum}`;

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
    currentWeekLabel: `W${getCurrentWeekNumber()}`,
  };
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

  const values = json.values;
  if (!values || values.length < 2) return [];

  const [headers, ...rows] = values;
  return rows.map((row: any[]) =>
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

function FinancialHeaderInline({
  profile,
  onSignOut,
}: {
  profile: any;
  onSignOut: () => void;
}) {
  return (
    <header className="w-full border-b bg-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-start md:justify-between px-4 py-4 gap-4">
        {/* LEFT: logo + portal label */}
        <div className="flex items-start gap-3">
          <Link href="/" className="flex items-start gap-2">
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

        {/* RIGHT: role, name, admin link, logout */}
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

export default function FinancialPage() {
  // auth state
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // access control
  const [allowedLocations, setAllowedLocations] = useState<string[]>([]);
  const [initialLocation, setInitialLocation] = useState("");

  // dashboard state
  const [location, setLocation] = useState("");
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("Sales");
  const [period, setPeriod] = useState("Week");
  const [loadingData, setLoadingData] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [rankingData, setRankingData] = useState<any[]>([]);

  const [currentWeekNow] = useState(`W${getCurrentWeekNumber()}`);

  useEffect(() => {
    let sub: any;
    (async () => {
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
    })();

    return () => {
      if (sub) sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    (async () => {
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

      // derive what this user can see
      const roleLower = (data.role || "").toLowerCase();
      if (roleLower === "admin" || roleLower === "operation") {
        const locs = [
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
        setAllowedLocations(locs);
        setInitialLocation(locs[0] || "");
      } else if (roleLower === "manager") {
        const only = data.home_location;
        setAllowedLocations([only]);
        setInitialLocation(only);
      } else {
        setAllowedLocations([]);
        setInitialLocation("");
      }

      setAuthLoading(false);
    })();
  }, [session]);

  const roleLower = (profile?.role || "").toLowerCase();
  const canViewFinance =
    roleLower === "admin" ||
    roleLower === "operation" ||
    roleLower === "manager";

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  // default first location once loaded
  useEffect(() => {
    if (!location && initialLocation) {
      setLocation(initialLocation);
    }
  }, [initialLocation, location]);

  // build W->Period/Quarter mapping
  const WEEK_TO_PERIOD_QUARTER = useMemo(() => {
    return Array.from({ length: 52 }, (_, i) => {
      const w = i + 1;
      let per;
      let q;
      if (w <= 13) {
        q = "Q1";
        per = w <= 4 ? "P1" : w <= 8 ? "P2" : "P3";
      } else if (w <= 26) {
        q = "Q2";
        per = w <= 17 ? "P4" : w <= 21 ? "P5" : "P6";
      } else if (w <= 39) {
        q = "Q3";
        per = w <= 30 ? "P7" : w <= 34 ? "P8" : "P9";
      } else {
        q = "Q4";
        per = w <= 43 ? "P10" : w <= 47 ? "P11" : "P12";
      }
      return { week: `W${w}`, period: per, quarter: q };
    });
  }, []);

  // load sheet data for current location/brand
  useEffect(() => {
    (async () => {
      if (!location) return;
      try {
        setLoadingData(true);
        setFetchError("");

        const isBrand = BRAND_GROUPS[location];
        let rows: any[] = [];

        if (isBrand) {
          const allData = await Promise.all(
            BRAND_GROUPS[location].map((site) =>
              fetchTabFromSheet(site)
            )
          );
          rows = rollupByWeek(allData.flat());
        } else {
          rows = await fetchTabFromSheet(location);
          rows.sort(
            (a, b) => parseWeekNum(a.Week) - parseWeekNum(b.Week)
          );
        }

        setRawRows(rows);
      } catch (err: any) {
        setFetchError(err.message || "Error loading data");
        setRawRows([]);
      } finally {
        setLoadingData(false);
      }
    })();
  }, [location]);

  // decorate rows with Period/Quarter
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

  // group rows for Period/Quarter
  function groupMergedRowsBy(bucketKey: "Period" | "Quarter") {
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
  }

  const filteredData = useMemo(() => {
    if (!mergedRows.length) return [];
    if (period === "Week") return mergedRows;
    if (period === "Period") return groupMergedRowsBy("Period");
    return groupMergedRowsBy("Quarter");
  }, [mergedRows, period]);

  const insights = useMemo(
    () => computeInsightsBundle(mergedRows),
    [mergedRows]
  );

  // build the ranking table (ops/admin only)
  useEffect(() => {
    (async () => {
      if (roleLower !== "admin" && roleLower !== "operation") {
        setRankingData([]);
        return;
      }

      try {
        const all = await Promise.all(
          STORE_LOCATIONS.map(async (site) => {
            const siteRows = await fetchTabFromSheet(site);
            if (!siteRows || siteRows.length === 0) return null;

            const snap = computeInsightsBundle(siteRows);
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
    })();
  }, [roleLower]);

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
    const v =
      value === undefined || value === null || isNaN(value)
        ? "-"
        : "£" + Number(value).toLocaleString();
    return [v, name];
  };

  /* GUARDS */
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

  /* RENDER */
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header (portal style) */}
      <FinancialHeaderInline
        profile={profile}
        onSignOut={handleSignOut}
      />

      {/* Body */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Title */}
        <h1 className="text-center text-xl font-semibold text-gray-900">
          Performance 2025
        </h1>

        {/* Controls */}
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

        {/* Insights */}
        <InsightsBar
          insights={insights}
          currentWeekNow={`W${getCurrentWeekNumber()}`}
          payrollTarget={PAYROLL_TARGET}
        />

        {/* Compliance */}
        <ComplianceBar
          insights={insights}
          payrollTarget={PAYROLL_TARGET}
          foodTarget={FOOD_TARGET}
          drinkTarget={DRINK_TARGET}
        />

        {/* Ranking (only ops/admin) */}
        {(roleLower === "admin" || roleLower === "operation") &&
          rankingData.length > 0 && (
            <RankingTable
              rankingData={rankingData}
              payrollTarget={PAYROLL_TARGET}
              foodTarget={FOOD_TARGET}
              drinkTarget={DRINK_TARGET}
            />
          )}

        {/* Loading state / error state */}
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

        {/* KPI cards */}
        {!loadingData && !fetchError && (
          <KPIBlock
            data={filteredData}
            payrollTarget={PAYROLL_TARGET}
            foodTarget={FOOD_TARGET}
            drinkTarget={DRINK_TARGET}
          />
        )}

        {/* Tab buttons */}
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

        {/* Chart */}
        {!loadingData && !fetchError && (
          <ChartSection
            activeTab={activeTab}
            filteredData={filteredData}
            chartConfig={chartConfig}
            CSVLink={CSVLink}
            yTickFormatter={val =>
              val === 0
                ? "£0"
                : val
                ? "£" + Number(val).toLocaleString()
                : ""
            }
            tooltipFormatter={(value, name) => {
              const v =
                value === undefined ||
                value === null ||
                isNaN(value)
                  ? "-"
                  : "£" + Number(value).toLocaleString();
              return [v, name];
            }}
          />
        )}

        {/* Footer */}
        <FinancialFooter />
      </main>
    </div>
  );
}