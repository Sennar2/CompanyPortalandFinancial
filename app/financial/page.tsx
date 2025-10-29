'use client';

import React, { useEffect, useMemo, useState } from 'react';

import FinancialFiltersBar from '../../src/components/financial/FinancialFiltersBar';
import InsightsBar from '../../src/components/financial/InsightsBar';
import ComplianceBar from '../../src/components/financial/ComplianceBar';
import RankingTable from '../../src/components/financial/RankingTable';
import KPIBlock from '../../src/components/financial/KPIBlock';
import ChartSection from '../../src/components/financial/ChartSection';
import FinancialFooter from '../../src/components/financial/FinancialFooter';

import { supabase } from '../../src/lib/supabaseClient';
import { CSVLink } from 'react-csv';

// ─────────────────────────────────────────
// CONSTANTS / CONFIG
// ─────────────────────────────────────────

const API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_API_KEY ||
  'AIzaSyB_dkFpvk6w_d9dPD_mWVhfB8-lly-9FS8';

const SPREADSHEET_ID =
  process.env.NEXT_PUBLIC_SHEET_ID ||
  '1PPVSEcZ6qLOEK2Z0uRLgXCnS_maazWFO_yMY648Oq1g';

const BRAND_GROUPS: Record<string, string[]> = {
  'La Mia Mamma (Brand)': [
    'La Mia Mamma - Chelsea',
    'La Mia Mamma - Hollywood Road',
    'La Mia Mamma - Notting Hill',
    'La Mia Mamma - Battersea',
  ],
  'Fish and Bubbles (Brand)': [
    'Fish and Bubbles - Fulham',
    'Fish and Bubbles - Notting Hill',
  ],
  'Made in Italy (Brand)': [
    'Made in Italy - Chelsea',
    'Made in Italy - Battersea',
  ],
};

const STORE_LOCATIONS = [
  'La Mia Mamma - Chelsea',
  'La Mia Mamma - Hollywood Road',
  'La Mia Mamma - Notting Hill',
  'La Mia Mamma - Battersea',
  'Fish and Bubbles - Fulham',
  'Fish and Bubbles - Notting Hill',
  'Made in Italy - Chelsea',
  'Made in Italy - Battersea',
  'GroupOverview',
];

const PAYROLL_TARGET = 35; // %
const FOOD_TARGET = 12.5; // %
const DRINK_TARGET = 5.5; // %

const PERIODS = ['Week', 'Period', 'Quarter'];

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function formatCurrency(val: any) {
  if (val === undefined || val === null || isNaN(val)) return '£0';
  return '£' + Number(val).toLocaleString();
}

// "W43" -> 43
function parseWeekNum(weekStr: string | undefined) {
  const num = parseInt(String(weekStr || '').replace(/[^\d]/g, ''), 10);
  return isNaN(num) ? 0 : num;
}

function getCurrentWeekNumber() {
  // ISO-ish, clamp to 52
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return weekNo > 52 ? 52 : weekNo;
}

function getCurrentWeekLabel() {
  return `W${getCurrentWeekNumber()}`;
}

// roll up multiple site tabs into one weekly dataset
function rollupByWeek(rowsArray: any[]) {
  if (!rowsArray.length) return [];
  const grouped: Record<string, any[]> = {};

  for (const row of rowsArray) {
    const w = String(row.Week || '').trim();
    if (!grouped[w]) grouped[w] = [];
    grouped[w].push(row);
  }

  const numericKeys = Object.keys(rowsArray[0]).filter(
    (k) => typeof rowsArray[0][k] === 'number'
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

// parse Google Sheets
function parseSheetValues(values: any[][] | undefined) {
  if (!values || values.length < 2) return [];
  const [headers, ...rows] = values;
  return rows.map((row) =>
    headers.reduce((obj: any, key: string, idx: number) => {
      let value = row[idx];
      if (key === 'LocationBreakdown' && typeof value === 'string') {
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

// fetch any tab
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

// chooses the most recent "real" completed week for KPIs
function computeInsightsBundle(rows: any[]) {
  if (!rows || rows.length === 0) return null;

  const decorated = rows.map((r: any) => ({
    ...r,
    __weekNum: parseWeekNum(r.Week),
  }));

  const thisWeekNum = getCurrentWeekNumber();
  const targetWeekNum = thisWeekNum - 1 <= 0 ? thisWeekNum : thisWeekNum - 1;

  function rowHasData(r: any) {
    return (
      (r.Sales_Actual && r.Sales_Actual !== 0) ||
      (r.Payroll_Actual && r.Payroll_Actual !== 0) ||
      (r.Sales_Budget && r.Sales_Budget !== 0)
    );
  }

  // exact match for last full week first
  let latestRow = decorated.find(
    (r) => r.__weekNum === targetWeekNum && rowHasData(r)
  );

  // fallback: latest <= targetWeekNum
  if (!latestRow) {
    const candidates = decorated
      .filter((r) => r.__weekNum <= targetWeekNum && rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = candidates[candidates.length - 1];
  }

  // fallback: any row with data
  if (!latestRow) {
    const candidates = decorated
      .filter((r) => rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = candidates[candidates.length - 1];
  }

  if (!latestRow) return null;

  const usedWeekNum = latestRow.__weekNum;
  const wkLabel = latestRow.Week || `W${usedWeekNum}`;

  // average Payroll_v% over last 4 weeks
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
    const cleaned = String(val).replace('%', '').trim();
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? 0 : num;
  }

  const payrollTrendVals = last4Rows.map((row) =>
    parsePayrollVar(row['Payroll_v%'])
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
    currentWeekLabel: getCurrentWeekLabel(),
  };
}

// used for ranking table rows (per site)
async function computeRankingSnapshotForLocation(tabName: string) {
  const rows = await fetchTab(tabName);
  if (!rows || rows.length === 0) return null;

  // sort ascending by week num
  rows.sort((a: any, b: any) => parseWeekNum(a.Week) - parseWeekNum(b.Week));

  const insights = computeInsightsBundle(rows);
  if (!insights) return null;

  return {
    location: tabName,
    week: insights.wkLabel,
    payrollPct: insights.payrollPct,
    foodPct: insights.foodPct,
    drinkPct: insights.drinkPct,
    salesVar: insights.salesVar,
  };
}

// map Week → Period / Quarter for grouping
function buildWeekToPeriodQuarter() {
  const arr: { week: string; period: string; quarter: string }[] = [];
  for (let i = 1; i <= 52; i++) {
    let periodVal = 'P?';
    let quarter = 'Q?';

    if (i <= 13) {
      quarter = 'Q1';
      periodVal = i <= 4 ? 'P1' : i <= 8 ? 'P2' : 'P3';
    } else if (i <= 26) {
      quarter = 'Q2';
      periodVal = i <= 17 ? 'P4' : i <= 21 ? 'P5' : 'P6';
    } else if (i <= 39) {
      quarter = 'Q3';
      periodVal = i <= 30 ? 'P7' : i <= 34 ? 'P8' : 'P9';
    } else {
      quarter = 'Q4';
      periodVal = i <= 43 ? 'P10' : i <= 47 ? 'P11' : 'P12';
    }

    arr.push({
      week: `W${i}`,
      period: periodVal,
      quarter,
    });
  }
  return arr;
}

// decide which locations user can see
function computeAllowedLocationsForProfile(profile: any) {
  if (!profile) return [];
  const roleLower = (profile.role || '').toLowerCase();
  const home = profile.home_location;

  if (roleLower === 'admin' || roleLower === 'operation') {
    return [
      'GroupOverview',
      'La Mia Mamma (Brand)',
      'Fish and Bubbles (Brand)',
      'Made in Italy (Brand)',
      'La Mia Mamma - Chelsea',
      'La Mia Mamma - Hollywood Road',
      'La Mia Mamma - Notting Hill',
      'La Mia Mamma - Battersea',
      'Fish and Bubbles - Fulham',
      'Fish and Bubbles - Notting Hill',
      'Made in Italy - Chelsea',
      'Made in Italy - Battersea',
    ];
  }

  if (roleLower === 'manager') {
    return [home];
  }

  return [home].filter(Boolean);
}

// ─────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────

export default function FinancialPage() {
  // auth
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [allowedLocations, setAllowedLocations] = useState<string[]>([]);
  const [initialLocation, setInitialLocation] = useState('');

  useEffect(() => {
    let sub: any;
    async function init() {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);

      const { data: listener } = supabase.auth.onAuthStateChange(
        (_event, newSession) => {
          setSession(newSession);
          if (!newSession) {
            setProfile(null);
            setAllowedLocations([]);
            setInitialLocation('');
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
        .from('profiles')
        .select('full_name, role, home_location')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.error('profile load error', error);
        setProfile(null);
        setAllowedLocations([]);
        setInitialLocation('');
        setAuthLoading(false);
        return;
      }

      setProfile(data);

      const locs = computeAllowedLocationsForProfile(data);
      setAllowedLocations(locs);
      setInitialLocation(locs[0] || '');

      setAuthLoading(false);
    }

    loadProfile();
  }, [session]);

  const roleLower = (profile?.role || '').toLowerCase();
  const canViewFinance =
    roleLower === 'admin' ||
    roleLower === 'operation' ||
    roleLower === 'manager';

  // dashboard state
  const [location, setLocation] = useState('');
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('Sales');
  const [period, setPeriod] = useState('Week');
  const [loadingData, setLoadingData] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [rankingData, setRankingData] = useState<any[]>([]);

  const [currentWeekNow] = useState(getCurrentWeekLabel());

  // once allowedLocations is known, pick initial
  useEffect(() => {
    if (!location && initialLocation) {
      setLocation(initialLocation);
    }
  }, [initialLocation, location]);

  const WEEK_TO_PERIOD_QUARTER = useMemo(() => {
    return buildWeekToPeriodQuarter();
  }, []);

  // fetch sheet data for selected location
  useEffect(() => {
    async function load() {
      if (!location) return;
      try {
        setLoadingData(true);
        setFetchError('');

        const isBrand = BRAND_GROUPS[location];
        let rows: any[] = [];
        if (isBrand) {
          const multi = await Promise.all(
            BRAND_GROUPS[location].map((site) => fetchTab(site))
          );
          rows = rollupByWeek(multi.flat());
        } else {
          rows = await fetchTab(location);
          rows.sort(
            (a, b) => parseWeekNum(a.Week) - parseWeekNum(b.Week)
          );
        }

        setRawRows(rows);
      } catch (err: any) {
        console.error(err);
        setFetchError(err?.message || 'Unknown error loading data');
        setRawRows([]);
      } finally {
        setLoadingData(false);
      }
    }

    load();
  }, [location]);

  // decorate each row with Period / Quarter
  const mergedRows = useMemo(() => {
    return rawRows.map((item) => {
      const w = String(item.Week || '').trim();
      const match = WEEK_TO_PERIOD_QUARTER.find((x) => x.week === w);
      return {
        ...item,
        Period: match?.period || 'P?',
        Quarter: match?.quarter || 'Q?',
      };
    });
  }, [rawRows, WEEK_TO_PERIOD_QUARTER]);

  // regroup for Period / Quarter view
  function groupMergedRowsBy(bucketKey: 'Period' | 'Quarter') {
    if (!mergedRows.length) return [];

    const grouped = mergedRows.reduce((acc: any, row: any) => {
      const key = row[bucketKey];
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    const numericKeys = Object.keys(mergedRows[0]).filter(
      (k) => typeof mergedRows[0][k] === 'number'
    );

    return Object.entries(grouped).map(([label, rows]: any) => {
      const sums: Record<string, number> = {};
      numericKeys.forEach((col) => {
        sums[col] = rows.reduce(
          (total: number, r: any) => total + (r[col] || 0),
          0
        );
      });
      return {
        Week: label, // KPIBlock / charts still key off .Week
        ...sums,
      };
    });
  }

  const filteredData = useMemo(() => {
    if (!mergedRows.length) return [];
    if (period === 'Week') return mergedRows;
    if (period === 'Period') return groupMergedRowsBy('Period');
    return groupMergedRowsBy('Quarter');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedRows, period]);

  // insights for hero + compliance
  const insights = useMemo(
    () => computeInsightsBundle(mergedRows),
    [mergedRows]
  );

  // ranking table (admin/operation only)
  useEffect(() => {
    async function buildRanking() {
      if (roleLower !== 'admin' && roleLower !== 'operation') {
        setRankingData([]);
        return;
      }

      try {
        const result = await Promise.all(
          STORE_LOCATIONS.map(async (loc) => {
            try {
              const snap = await computeRankingSnapshotForLocation(loc);
              return snap;
            } catch {
              return null;
            }
          })
        );

        const cleaned = result.filter(Boolean) as any[];
        // sort desc by payroll %
        cleaned.sort((a, b) => b.payrollPct - a.payrollPct);
        setRankingData(cleaned);
      } catch (err) {
        console.error('Ranking build failed:', err);
        setRankingData([]);
      }
    }

    buildRanking();
  }, [roleLower]);

  const chartConfig = {
    Sales: [
      { key: 'Sales_Actual', color: '#4ade80', name: 'Actual' },
      { key: 'Sales_Budget', color: '#60a5fa', name: 'Budget' },
      { key: 'Sales_LastYear', color: '#fbbf24', name: 'Last Year' },
    ],
    Payroll: [
      { key: 'Payroll_Actual', color: '#4ade80', name: 'Actual' },
      { key: 'Payroll_Budget', color: '#60a5fa', name: 'Budget' },
      { key: 'Payroll_Theo', color: '#a78bfa', name: 'Theo' },
    ],
    Food: [
      { key: 'Food_Actual', color: '#4ade80', name: 'Actual' },
      { key: 'Food_Budget', color: '#60a5fa', name: 'Budget' },
      { key: 'Food_Theo', color: '#a78bfa', name: 'Theo' },
    ],
    Drink: [
      { key: 'Drink_Actual', color: '#4ade80', name: 'Actual' },
      { key: 'Drink_Budget', color: '#60a5fa', name: 'Budget' },
      { key: 'Drink_Theo', color: '#a78bfa', name: 'Theo' },
    ],
  };

  const yTickFormatter = (val: any) => {
    if (val === 0) return '£0';
    if (!val) return '';
    return '£' + Number(val).toLocaleString();
  };

  const tooltipFormatter = (value: any, name: any) => {
    return [formatCurrency(value), name];
  };

  // ───────────── RENDER GUARDS ─────────────

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500 font-sans">
        Loading profile…
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-red-600 font-medium font-sans">
        You are not signed in.
      </div>
    );
  }

  if (!canViewFinance) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-red-600 font-medium font-sans text-center px-6">
        You don&apos;t have permission to view Financial Performance.
      </div>
    );
  }

  if (!allowedLocations.length || !initialLocation) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-red-600 font-medium font-sans text-center px-6">
        No location access configured for this account.
      </div>
    );
  }

  // ───────────── PAGE UI ─────────────

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* 1) GLOBAL HEADER comes from your main layout automatically.
          2) Our light finance bar with filters: */}
      <FinancialFiltersBar
        allowedLocations={allowedLocations}
        location={location}
        setLocation={setLocation}
        period={period}
        setPeriod={setPeriod}
        PERIODS={PERIODS}
      />

      {/* MAIN DASHBOARD CONTENT */}
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-10">
        {/* HERO: Current Week / Last Week Results cards */}
        <InsightsBar
          insights={insights}
          payrollTarget={PAYROLL_TARGET}
          currentWeekNow={currentWeekNow}
        />

        {/* COMPLIANCE mini-cards row (Payroll%, Food%, Drink%, Sales vs LY)
            Add bottom margin so ranking table isn't crushed */}
        <div className="mb-8">
          <ComplianceBar
            insights={insights}
            payrollTarget={PAYROLL_TARGET}
            foodTarget={FOOD_TARGET}
            drinkTarget={DRINK_TARGET}
          />
        </div>

        {/* RANKING TABLE (last real week, not W52) */}
        {(roleLower === 'admin' || roleLower === 'operation') &&
          rankingData.length > 0 && (
            <RankingTable
              rankingData={rankingData}
              payrollTarget={PAYROLL_TARGET}
              foodTarget={FOOD_TARGET}
              drinkTarget={DRINK_TARGET}
            />
          )}

        {/* DATA LOAD STATES */}
        {loadingData && (
          <p className="text-center mt-4 text-gray-500 text-sm">
            Loading data…
          </p>
        )}

        {!loadingData && fetchError && (
          <p className="text-center mt-4 text-red-600 font-medium text-sm">
            Could not load data: {fetchError}
          </p>
        )}

        {/* KPI SUMMARY BLOCK */}
        {!loadingData && !fetchError && (
          <KPIBlock
            data={filteredData}
            payrollTarget={PAYROLL_TARGET}
            foodTarget={FOOD_TARGET}
            drinkTarget={DRINK_TARGET}
          />
        )}

        {/* TAB PICKER FOR CHARTS */}
        <div className="flex justify-center flex-wrap gap-2 mt-6">
          {['Sales', 'Payroll', 'Food', 'Drink'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium shadow-sm transition
                ${
                  activeTab === tab
                    ? 'bg-gray-900 text-white border-gray-900 shadow-xl'
                    : 'bg-white text-gray-900 border-gray-300 hover:bg-gray-50'
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* CHARTS */}
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
      </main>

      <FinancialFooter />
    </div>
  );
}