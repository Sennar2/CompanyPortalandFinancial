'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../src/lib/supabaseClient';

// ─────────────────────────────
// CONFIG / CONSTANTS
// ─────────────────────────────
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
];

const PERIODS = ['Week', 'Period', 'Quarter'];

const PAYROLL_TARGET = 35; // %
const FOOD_TARGET = 12.5; // %
const DRINK_TARGET = 5.5; // %

// ─────────────────────────────
// HELPERS
// ─────────────────────────────
function parseWeekNum(weekStr: string | undefined) {
  const num = parseInt(String(weekStr || '').replace(/[^\d]/g, ''), 10);
  return isNaN(num) ? 0 : num;
}

// ISO-ish current week number, clamped to 52
function getISOWeek(date = new Date()) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const raw = ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7;
  const weekNo = Math.ceil(raw);
  return weekNo > 52 ? 52 : weekNo;
}

function getCurrentWeekLabel() {
  return `W${getISOWeek(new Date())}`;
}

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
      totals[col] = (rows as any[]).reduce(
        (sum, r: any) => sum + (r[col] || 0),
        0
      );
    });
    return {
      Week: weekLabel,
      ...totals,
    };
  });

  merged.sort((a: any, b: any) => parseWeekNum(a.Week) - parseWeekNum(b.Week));
  return merged;
}

function computeInsightsBundle(rows: any[]) {
  if (!rows || rows.length === 0) return null;

  const decorated = rows.map((r: any) => ({
    ...r,
    __weekNum: parseWeekNum(r.Week),
  }));

  function rowHasData(r: any) {
    return (
      (r.Sales_Actual && r.Sales_Actual !== 0) ||
      (r.Payroll_Actual && r.Payroll_Actual !== 0) ||
      (r.Sales_Budget && r.Sales_Budget !== 0)
    );
  }

  const currentWeekNum = getISOWeek(new Date());
  const snapshotWeekNum =
    currentWeekNum - 1 <= 0 ? currentWeekNum : currentWeekNum - 1;

  let latestRow = decorated.find(
    (r) => r.__weekNum === snapshotWeekNum && rowHasData(r)
  );

  if (!latestRow) {
    const candidates = decorated
      .filter((r) => r.__weekNum <= snapshotWeekNum && rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = candidates[candidates.length - 1];
  }

  if (!latestRow) {
    const candidates = decorated
      .filter((r) => rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = candidates[candidates.length - 1];
  }

  if (!latestRow) return null;

  const weekNumWeUse = latestRow.__weekNum;
  const wkLabel = latestRow.Week || `W${weekNumWeUse}`;

  // average payroll variance 4w — we keep it around, even if not displayed right now
  const windowWeeks = [
    weekNumWeUse,
    weekNumWeUse - 1,
    weekNumWeUse - 2,
    weekNumWeUse - 3,
  ].filter((n) => n > 0);

  function parsePayrollVar(val: any): number {
    if (val === undefined || val === null) return 0;
    const cleaned = String(val).replace('%', '').trim();
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? 0 : num;
  }

  const last4Rows = decorated.filter((r) => windowWeeks.includes(r.__weekNum));
  const payrollTrendVals = last4Rows.map((row) =>
    parsePayrollVar(row['Payroll_v%'])
  );
  const avgPayrollVar4w =
    payrollTrendVals.length > 0
      ? payrollTrendVals.reduce((sum, n) => sum + n, 0) /
        payrollTrendVals.length
      : 0;

  const salesActual = latestRow.Sales_Actual || 0;
  const salesBudget = latestRow.Sales_Budget || 0;
  const salesLastYear = latestRow.Sales_LastYear || 0;

  const salesVar = salesActual - salesBudget;
  const salesVarPct = salesBudget !== 0 ? (salesVar / salesBudget) * 100 : 0;

  const payrollPct =
    salesActual !== 0
      ? (latestRow.Payroll_Actual / salesActual) * 100
      : 0;

  const foodPct =
    salesActual !== 0 ? (latestRow.Food_Actual / salesActual) * 100 : 0;

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
  };
}

function formatCurrency(val: number | undefined | null) {
  if (val === undefined || val === null || isNaN(val)) return '£0';
  return (
    '£' +
    Number(val).toLocaleString('en-GB', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

// ✓ / ✗ helper
function TargetStatus({ isGood }: { isGood: boolean }) {
  return (
    <span
      className={
        'ml-1 text-xs font-semibold ' +
        (isGood ? 'text-green-600' : 'text-red-600')
      }
    >
      {isGood ? '✓' : '✗'}
    </span>
  );
}

// Hero row cards (Current Week + Last Week Results)
function InsightsHero({
  currentWeekNow,
  insights,
  payrollTarget,
}: {
  currentWeekNow: string;
  insights: any;
  payrollTarget: number;
}) {
  if (!insights) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Current Week */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="text-xs text-gray-500 font-medium mb-4">
          Current Week
        </div>
        <div className="text-3xl font-semibold text-gray-900">
          {currentWeekNow}
        </div>
        <p className="text-xs text-gray-500 mt-4">
          Today&apos;s trading period
        </p>
      </div>

      {/* Last Week Results */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div className="text-xs text-gray-500 font-medium">
            Last Week Results
          </div>
          <div className="text-xs text-gray-400 font-medium">
            {insights.wkLabel}
          </div>
        </div>

        <div className="mt-3">
          <div className="text-sm font-semibold text-gray-800">
            Sales vs Budget
          </div>
          <div className="text-red-600 font-semibold text-lg leading-tight">
            {formatCurrency(insights.salesVar)}{' '}
            <span className="text-sm font-normal">
              ({insights.salesVarPct.toFixed(1)}%)
            </span>
          </div>
          <div className="text-[11px] text-gray-500">
            Actual {formatCurrency(insights.salesActual)} vs Budget{' '}
            {formatCurrency(insights.salesBudget)}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-sm font-semibold text-gray-800 flex items-center">
            Payroll %
          </div>
          <div className="text-red-600 font-semibold text-lg leading-tight">
            {insights.payrollPct.toFixed(1)}%
          </div>
          <div className="text-[11px] text-gray-500">
            Target ≤ {payrollTarget}%
          </div>
        </div>
      </div>
    </div>
  );
}

// KPI cards row
function MetricCard({
  label,
  weekLabel,
  targetText,
  valuePct,
  good,
}: {
  label: string;
  weekLabel: string;
  targetText: string;
  valuePct: number;
  good: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col">
      <div className="text-xs text-gray-500 font-medium flex flex-wrap items-center gap-1">
        <span className="text-gray-900 font-semibold">{label}</span>
        <span className="flex items-center gap-1 text-gray-500">
          <span className="text-xs text-gray-400">●</span>
          <span className="text-xs text-gray-600 font-semibold">
            {weekLabel}
          </span>
          <span className="text-[11px] text-gray-500">
            • {targetText}
          </span>
        </span>
      </div>

      <div
        className={
          'text-xl font-semibold mt-2 flex items-center ' +
          (good ? 'text-green-600' : 'text-red-600')
        }
      >
        {valuePct.toFixed(1)}% <TargetStatus isGood={good} />
      </div>
    </div>
  );
}

// Ranking table
function RankingTable({
  rankingData,
  payrollTarget,
  foodTarget,
  drinkTarget,
}: {
  rankingData: any[];
  payrollTarget: number;
  foodTarget: number;
  drinkTarget: number;
}) {
  if (!rankingData.length) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
      <div className="flex items-start justify-between flex-wrap gap-2 px-4 py-3 border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-800">
          Site Ranking (last week)
        </div>
        <div className="text-[11px] text-gray-500">
          Sorted by highest Payroll %
        </div>
      </div>

      <table className="min-w-full text-sm text-gray-800">
        <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
          <tr>
            <th className="text-left font-medium px-4 py-2">Location</th>
            <th className="text-left font-medium px-4 py-2">
              Payroll % (≤ {payrollTarget}%)
            </th>
            <th className="text-left font-medium px-4 py-2">
              Food % (≤ {foodTarget}%)
            </th>
            <th className="text-left font-medium px-4 py-2">
              Drink % (≤ {drinkTarget}%)
            </th>
            <th className="text-left font-medium px-4 py-2">
              Sales vs Budget
            </th>
          </tr>
        </thead>
        <tbody>
          {rankingData.map((row, idx) => {
            const pGood = row.payrollPct <= payrollTarget;
            const fGood = row.foodPct <= foodTarget;
            const dGood = row.drinkPct <= drinkTarget;

            const rowBg =
              idx === 0
                ? 'bg-red-50/60'
                : idx % 2 === 1
                ? 'bg-white'
                : 'bg-gray-50/30';

            return (
              <tr key={row.location} className={rowBg}>
                <td className="px-4 py-3 align-top text-sm text-gray-900">
                  <div className="font-medium">{row.location}</div>
                  <div className="text-[11px] text-gray-500">
                    {row.week}
                  </div>
                </td>

                <td
                  className={`px-4 py-3 align-top font-semibold ${
                    pGood ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {row.payrollPct.toFixed(1)}%
                </td>

                <td
                  className={`px-4 py-3 align-top font-semibold ${
                    fGood ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {row.foodPct.toFixed(1)}%
                </td>

                <td
                  className={`px-4 py-3 align-top font-semibold ${
                    dGood ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {row.drinkPct.toFixed(1)}%
                </td>

                <td
                  className={`px-4 py-3 align-top font-semibold ${
                    row.salesVar >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {formatCurrency(row.salesVar)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────
export default function FinancialPage() {
  // auth state
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // filters
  const [allowedLocations, setAllowedLocations] = useState<string[]>([]);
  const [initialLocation, setInitialLocation] = useState('');
  const [location, setLocation] = useState('');
  const [period, setPeriod] = useState('Week'); // still here for future charts

  // sheet rows
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // ranking
  const [rankingData, setRankingData] = useState<any[]>([]);

  const currentWeekNow = getCurrentWeekLabel();

  // watch auth session
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

  // load profile
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

      const roleLower = (data.role || '').toLowerCase();
      let locs: string[];

      if (roleLower === 'admin' || roleLower === 'operation') {
        locs = [
          'GroupOverview',
          'La Mia Mamma (Brand)',
          'Fish and Bubbles (Brand)',
          'Made in Italy (Brand)',
          ...STORE_LOCATIONS,
        ];
      } else if (roleLower === 'manager') {
        locs = [data.home_location];
      } else {
        locs = [];
      }

      setAllowedLocations(locs);
      setInitialLocation(locs[0] || '');
      setAuthLoading(false);
    }

    loadProfile();
  }, [session]);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  // sync location once we know allowed
  useEffect(() => {
    if (!location && initialLocation) {
      setLocation(initialLocation);
    }
  }, [initialLocation, location]);

  // build week→period→quarter lookup
  const WEEK_TO_PERIOD_QUARTER = useMemo(() => {
    return Array.from({ length: 52 }, (_, i) => {
      const w = i + 1;
      let periodVal;
      let quarter;
      if (w <= 13) {
        quarter = 'Q1';
        periodVal = w <= 4 ? 'P1' : w <= 8 ? 'P2' : 'P3';
      } else if (w <= 26) {
        quarter = 'Q2';
        periodVal = w <= 17 ? 'P4' : w <= 21 ? 'P5' : 'P6';
      } else if (w <= 39) {
        quarter = 'Q3';
        periodVal = w <= 30 ? 'P7' : w <= 34 ? 'P8' : 'P9';
      } else {
        quarter = 'Q4';
        periodVal = w <= 43 ? 'P10' : w <= 47 ? 'P11' : 'P12';
      }
      return { week: `W${w}`, period: periodVal, quarter };
    });
  }, []);

  // attach Period / Quarter to rawRows
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

  // load data for selected location / brand / group
  useEffect(() => {
    async function load() {
      if (!location) return;
      try {
        setLoadingData(true);
        setFetchError('');

        const isBrand = !!BRAND_GROUPS[location];
        let rows: any[] = [];
        if (isBrand) {
          const allData = await Promise.all(
            BRAND_GROUPS[location].map((site) => fetchTab(site))
          );
          rows = rollupByWeek(allData.flat());
        } else {
          rows = await fetchTab(location);
          rows.sort((a, b) => parseWeekNum(a.Week) - parseWeekNum(b.Week));
        }

        setRawRows(rows);
      } catch (err: any) {
        console.error(err);
        setFetchError(err.message || 'Unknown error loading data');
        setRawRows([]);
      } finally {
        setLoadingData(false);
      }
    }

    load();
  }, [location]);

  // compute insights (for hero + KPI cards)
  const insights = useMemo(
    () => computeInsightsBundle(mergedRows),
    [mergedRows]
  );

  // build ranking table from store tabs (admin/operation only)
  useEffect(() => {
    async function buildRanking() {
      const roleLower =
        profile && profile.role ? profile.role.toLowerCase() : '';
      if (roleLower !== 'admin' && roleLower !== 'operation') {
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

            const decorated = sorted.map((r: any) => ({
              ...r,
              __weekNum: parseWeekNum(r.Week),
            }));

            function rowHasData(r: any) {
              return (
                (r.Sales_Actual && r.Sales_Actual !== 0) ||
                (r.Payroll_Actual && r.Payroll_Actual !== 0) ||
                (r.Sales_Budget && r.Sales_Budget !== 0)
              );
            }

            const nowWeek = getISOWeek(new Date());
            const snapWeek = nowWeek - 1 <= 0 ? nowWeek : nowWeek - 1;

            let latest = decorated.find(
              (r) => r.__weekNum === snapWeek && rowHasData(r)
            );
            if (!latest) {
              const cands = decorated
                .filter((r) => r.__weekNum <= snapWeek && rowHasData(r))
                .sort((a, b) => a.__weekNum - b.__weekNum);
              latest = cands[cands.length - 1];
            }
            if (!latest) {
              const cands = decorated
                .filter((r) => rowHasData(r))
                .sort((a, b) => a.__weekNum - b.__weekNum);
              latest = cands[cands.length - 1];
            }
            if (!latest) return null;

            const salesActual = latest.Sales_Actual || 0;
            const salesBudget = latest.Sales_Budget || 0;
            const salesVar = salesActual - salesBudget;

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
        console.error('Ranking build failed:', err);
        setRankingData([]);
      }
    }

    if (profile) {
      buildRanking();
    }
  }, [profile]);

  // ─────────────────────────────
  // PAGE GUARDS
  // ─────────────────────────────
  if (authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Loading profile…
      </main>
    );
  }

  if (!session || !profile) {
    return (
      <main className="min-h-screen flex items-center justify-center text-red-600 text-sm font-medium">
        You are not signed in.
      </main>
    );
  }

  const roleLower = (profile.role || '').toLowerCase();
  const canViewFinance =
    roleLower === 'admin' ||
    roleLower === 'operation' ||
    roleLower === 'manager';

  if (!canViewFinance) {
    return (
      <main className="min-h-screen flex items-center justify-center text-red-600 text-sm font-medium text-center px-4">
        You don&apos;t have permission to view Financial Performance.
      </main>
    );
  }

  if (!allowedLocations.length || !initialLocation) {
    return (
      <main className="min-h-screen flex items-center justify-center text-red-600 text-sm font-medium text-center px-4">
        No location access configured for this account.
      </main>
    );
  }

  // ─────────────────────────────
  // PAGE VIEW
  // ─────────────────────────────
  return (
    <main className="bg-gray-50 min-h-screen text-gray-900 font-[system-ui]">
      {/* TOP BLOCK: title + filters (centered under company header) */}
      <section className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Title + subtitle */}
          <div className="text-center mb-6">
            <div className="text-base font-semibold text-gray-900">
              Financial Performance
            </div>
            <div className="text-xs text-gray-500">
              Select your location and view
            </div>
          </div>

          {/* Filters row */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-center gap-6">
            {/* Location */}
            <div className="flex flex-col text-left">
              <label className="text-[11px] font-semibold text-gray-600 tracking-wide uppercase mb-1">
                Location
              </label>
              <select
                className="w-64 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              >
                {allowedLocations.map((loc) => (
                  <option key={loc}>{loc}</option>
                ))}
              </select>
            </div>

            {/* View (period) */}
            <div className="flex flex-col text-left">
              <label className="text-[11px] font-semibold text-gray-600 tracking-wide uppercase mb-1">
                View
              </label>
              <select
                className="w-40 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                {PERIODS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* BODY CONTENT */}
      <section className="max-w-7xl mx-auto px-4 py-8 space-y-12">
        {/* HERO INSIGHTS (current week + last week results cards) */}
        <InsightsHero
          currentWeekNow={currentWeekNow}
          insights={insights}
          payrollTarget={PAYROLL_TARGET}
        />

        {/* KPI ROW */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Payroll % */}
          <MetricCard
            label="Payroll %"
            weekLabel={insights?.wkLabel || '–'}
            targetText={`Target ≤ ${PAYROLL_TARGET}%`}
            valuePct={insights?.payrollPct || 0}
            good={(insights?.payrollPct || 0) <= PAYROLL_TARGET}
          />

          {/* Food % */}
          <MetricCard
            label="Food %"
            weekLabel={insights?.wkLabel || '–'}
            targetText={`Target ≤ ${FOOD_TARGET}%`}
            valuePct={insights?.foodPct || 0}
            good={(insights?.foodPct || 0) <= FOOD_TARGET}
          />

          {/* Drink % */}
          <MetricCard
            label="Drink %"
            weekLabel={insights?.wkLabel || '–'}
            targetText={`Target ≤ ${DRINK_TARGET}%`}
            valuePct={insights?.drinkPct || 0}
            good={(insights?.drinkPct || 0) <= DRINK_TARGET}
          />

          {/* Sales vs LY */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col">
            <div className="text-xs text-gray-500 font-medium flex flex-wrap items-center gap-1">
              <span className="text-gray-900 font-semibold">
                Sales vs LY
              </span>
              <span className="flex items-center gap-1 text-gray-500">
                <span className="text-xs text-gray-400">●</span>
                <span className="text-xs text-gray-600 font-semibold">
                  {insights?.wkLabel || '–'}
                </span>
                <span className="text-[11px] text-gray-500">
                  • Target ≥ 0%
                </span>
              </span>
            </div>

            <div className="text-green-600 text-xl font-semibold mt-2 flex items-center">
              {(insights?.salesVsLastYearPct ?? 0).toFixed(1)}%
              <TargetStatus
                isGood={(insights?.salesVsLastYearPct ?? 0) >= 0}
              />
            </div>
          </div>
        </div>

        {/* GAP BETWEEN KPI ROW AND RANKING */}
        <div className="h-8" />

        {/* RANKING TABLE */}
        <div>
          {loadingData && (
            <p className="text-center text-gray-500 text-sm">
              Loading data…
            </p>
          )}

          {!loadingData && fetchError && (
            <p className="text-center text-red-600 text-sm font-medium">
              Could not load data: {fetchError}
            </p>
          )}

          {!loadingData && !fetchError && (
            <RankingTable
              rankingData={rankingData}
              payrollTarget={PAYROLL_TARGET}
              foodTarget={FOOD_TARGET}
              drinkTarget={DRINK_TARGET}
            />
          )}
        </div>

        {/* backup logout at bottom (esp. mobile) */}
        <div className="text-center pt-10 pb-16">
          <button
            onClick={handleSignOut}
            className="rounded-md bg-gray-900 text-white text-[12px] font-semibold px-4 py-2 hover:bg-black transition"
          >
            Log out
          </button>
          <div className="text-[11px] text-gray-400 mt-2 uppercase tracking-wide">
            {profile.full_name} • {profile.role}
          </div>
        </div>
      </section>
    </main>
  );
}