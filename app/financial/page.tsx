'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CSVLink } from 'react-csv';
import { supabase } from '../../src/lib/supabaseClient';

// Financial UI components (already in your repo)
import InsightsBar from '../../src/components/financial/InsightsBar';
import ComplianceBar from '../../src/components/financial/ComplianceBar';
import KPIBlock from '../../src/components/financial/KPIBlock';
import RankingTable from '../../src/components/financial/RankingTable';
import ChartSection from '../../src/components/financial/ChartSection';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

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
const TABS = ['Sales', 'Payroll', 'Food', 'Drink'] as const;

// Targets
const PAYROLL_TARGET = 35; // %
const FOOD_TARGET = 12.5;  // %
const DRINK_TARGET = 5.5;   // %

// ─────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────
function parseWeekNum(weekStr: string | number | undefined) {
  const num = parseInt(String(weekStr ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isNaN(num) ? 0 : num;
}

function formatCurrency(val: number | undefined | null) {
  if (val == null || Number.isNaN(val)) return '£0';
  return '£' + Number(val).toLocaleString();
}

function getISOWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return Math.min(52, weekNo);
}

function getCurrentWeekLabel() {
  return `W${getISOWeek()}`;
}

function rowHasData(r: any) {
  return Boolean(
    (r?.Sales_Actual && r.Sales_Actual !== 0) ||
      (r?.Payroll_Actual && r.Payroll_Actual !== 0) ||
      (r?.Sales_Budget && r.Sales_Budget !== 0)
  );
}

// Google Sheets: parse values
function parseSheetValues(values: any[][] | undefined): any[] {
  if (!values || values.length < 2) return [];
  const [headers, ...rows] = values;
  return rows.map((row) =>
    headers.reduce((obj: Record<string, any>, key: string, idx: number) => {
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
  if (!res.ok) throw new Error(`HTTP ${res.status} loading "${tabName}"`);
  const json = await res.json();
  return parseSheetValues(json.values);
}

// Merge multiple site rows by Week, summing numeric columns
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
    return { Week: weekLabel, ...totals };
  });

  merged.sort((a: any, b: any) => parseWeekNum(a.Week) - parseWeekNum(b.Week));
  return merged;
}

/**
 * computeInsightsBundle
 * - Uses "last completed week" snapshot: current ISO week - 1
 * - If exact row missing, falls back to latest <= snapshot with data
 * - 4-week avg for Payroll_v% includes +/- correctly
 */
function computeInsightsBundle(rows: any[]) {
  if (!rows || rows.length === 0) return null;

  const decorated = rows.map((r: any) => ({
    ...r,
    __weekNum: parseWeekNum(r.Week),
  }));

  const currentWeekNum = getISOWeek(); // e.g. 44
  const snapshotWeekNum = currentWeekNum - 1 <= 0 ? currentWeekNum : currentWeekNum - 1;

  let latest = decorated.find((r) => r.__weekNum === snapshotWeekNum && rowHasData(r));
  if (!latest) {
    const candidates = decorated
      .filter((r) => r.__weekNum <= snapshotWeekNum && rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latest = candidates[candidates.length - 1];
  }
  if (!latest) {
    const cands = decorated.filter(rowHasData).sort((a, b) => a.__weekNum - b.__weekNum);
    latest = cands[cands.length - 1];
  }
  if (!latest) return null;

  const wkNum = latest.__weekNum;
  const wkLabel = latest.Week || `W${wkNum}`;

  // last-4-weeks window
  const windowWeeks = [wkNum, wkNum - 1, wkNum - 2, wkNum - 3].filter((n) => n > 0);
  const last4Rows = decorated.filter((r) => windowWeeks.includes(r.__weekNum));

  const parsePayrollVar = (val: any): number => {
    if (val === undefined || val === null) return 0;
    const cleaned = String(val).replace('%', '').trim();
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? 0 : num;
  };
  const payrollTrendVals = last4Rows.map((row) => parsePayrollVar(row['Payroll_v%']));
  const avgPayrollVar4w =
    payrollTrendVals.length > 0
      ? payrollTrendVals.reduce((s, n) => s + n, 0) / payrollTrendVals.length
      : 0;

  const salesActual = latest.Sales_Actual || 0;
  const salesBudget = latest.Sales_Budget || 0;
  const salesLastYear = latest.Sales_LastYear || 0;

  const salesVar = salesActual - salesBudget;
  const salesVarPct = salesBudget !== 0 ? (salesVar / salesBudget) * 100 : 0;

  const payrollPct = salesActual !== 0 ? (latest.Payroll_Actual / salesActual) * 100 : 0;
  const foodPct = salesActual !== 0 ? (latest.Food_Actual / salesActual) * 100 : 0;
  const drinkPct = salesActual !== 0 ? (latest.Drink_Actual / salesActual) * 100 : 0;

  const salesVsLastYearPct =
    salesLastYear !== 0 ? ((salesActual - salesLastYear) / salesLastYear) * 100 : 0;

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

// Week → Period/Quarter map (W1..W52)
const WEEK_TO_PERIOD_QUARTER = Array.from({ length: 52 }, (_, i) => {
  const w = i + 1;
  let period: string, quarter: string;
  if (w <= 13) {
    quarter = 'Q1';
    period = w <= 4 ? 'P1' : w <= 8 ? 'P2' : 'P3';
  } else if (w <= 26) {
    quarter = 'Q2';
    period = w <= 17 ? 'P4' : w <= 21 ? 'P5' : 'P6';
  } else if (w <= 39) {
    quarter = 'Q3';
    period = w <= 30 ? 'P7' : w <= 34 ? 'P8' : 'P9';
  } else {
    quarter = 'Q4';
    period = w <= 43 ? 'P10' : w <= 47 ? 'P11' : 'P12';
  }
  return { week: `W${w}`, period, quarter };
});

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function FinancialPage() {
  // 1) Auth / profile
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let sub: any;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session);

      const { data: listener } = supabase.auth.onAuthStateChange((_ev, newSession) => {
        setSession(newSession);
      });
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
        .from('profiles')
        .select('full_name, role, home_location')
        .eq('id', session.user.id)
        .single();

      if (error) {
        setProfile(null);
      } else {
        setProfile(data);
      }
      setAuthLoading(false);
    })();
  }, [session]);

  // 2) Permission
  const role = (profile?.role || '').toLowerCase();
  const canView = ['admin', 'operation', 'ops', 'manager'].includes(role);

  // 3) Locations the user can view
  const [allowedLocations, setAllowedLocations] = useState<string[]>([]);
  useEffect(() => {
    if (!profile) return;
    if (['admin', 'operation', 'ops'].includes(role)) {
      setAllowedLocations([
        'GroupOverview',
        'La Mia Mamma (Brand)',
        'Fish and Bubbles (Brand)',
        'Made in Italy (Brand)',
        ...STORE_LOCATIONS,
      ]);
    } else if (role === 'manager' && profile.home_location) {
      setAllowedLocations([profile.home_location]);
    } else {
      setAllowedLocations([]);
    }
  }, [profile, role]);

  // 4) UI state
  const [location, setLocation] = useState<string>('');
  const [period, setPeriod] = useState<string>('Week');
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Sales');

  useEffect(() => {
    if (!location && allowedLocations.length) {
      setLocation(allowedLocations[0]);
    }
  }, [allowedLocations, location]);

  // 5) Load data
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    (async () => {
      if (!location) return;
      try {
        setLoadingData(true);
        setFetchError('');

        const isBrand = Boolean(BRAND_GROUPS[location]);
        let rows: any[] = [];

        if (isBrand) {
          const all = await Promise.all(BRAND_GROUPS[location].map((site) => fetchTab(site)));
          rows = rollupByWeek(all.flat());
        } else {
          rows = await fetchTab(location);
          rows.sort((a, b) => parseWeekNum(a.Week) - parseWeekNum(b.Week));
        }

        setRawRows(rows);
      } catch (err: any) {
        setRawRows([]);
        setFetchError(err?.message || 'Failed to load data');
      } finally {
        setLoadingData(false);
      }
    })();
  }, [location]);

  // 6) Merge Week → Period/Quarter
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
  }, [rawRows]);

  // 7) Group by Period/Quarter if needed
  function groupMergedRowsBy(bucketKey: 'Period' | 'Quarter'): any[] {
    if (!mergedRows.length) return [];
    const grouped = mergedRows.reduce<Record<string, any[]>>((acc, row) => {
      const key = row[bucketKey];
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    const numericKeys = Object.keys(mergedRows[0]).filter(
      (k) => typeof mergedRows[0][k] === 'number'
    );

    return Object.entries(grouped).map(([label, rows]) => {
      const sums: Record<string, number> = {};
      numericKeys.forEach((col) => {
        sums[col] = (rows as any[]).reduce((total, r) => total + (r[col] || 0), 0);
      });
      return {
        Week: label, // keep consistent shape for charts/XAxis
        ...sums,
      };
    });
  }

  const filteredData = useMemo(() => {
    if (!mergedRows.length) return [];
    if (period === 'Week') return mergedRows;
    if (period === 'Period') return groupMergedRowsBy('Period');
    return groupMergedRowsBy('Quarter');
  }, [mergedRows, period]);

  // 8) Insights + Compliance snapshot (based on last completed week)
  const insights = useMemo(() => computeInsightsBundle(mergedRows), [mergedRows]);
  const currentWeekNow = getCurrentWeekLabel();

  // 9) Ranking (admins / ops only) — pick each location’s last completed week with data
  const [rankingData, setRankingData] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      if (!['admin', 'operation', 'ops'].includes(role)) {
        setRankingData([]);
        return;
      }
      try {
        const result = await Promise.all(
          STORE_LOCATIONS.map(async (loc) => {
            const rows = await fetchTab(loc);
            if (!rows?.length) return null;

            const decorated = rows
              .map((r: any) => ({ ...r, __weekNum: parseWeekNum(r.Week) }))
              .sort((a: any, b: any) => a.__weekNum - b.__weekNum);

            const currentWeekNum = getISOWeek();
            const snapshotWeekNum =
              currentWeekNum - 1 <= 0 ? currentWeekNum : currentWeekNum - 1;

            let latest = decorated.find(
              (r: any) => r.__weekNum === snapshotWeekNum && rowHasData(r)
            );
            if (!latest) {
              const candidates = decorated
                .filter((r: any) => r.__weekNum <= snapshotWeekNum && rowHasData(r))
                .sort((a: any, b: any) => a.__weekNum - b.__weekNum);
              latest = candidates[candidates.length - 1];
            }
            if (!latest) {
              const cands = decorated.filter(rowHasData).sort((a: any, b: any) => a.__weekNum - b.__weekNum);
              latest = cands[cands.length - 1];
            }
            if (!latest) return null;

            const salesActual = latest.Sales_Actual || 0;
            const salesBudget = latest.Sales_Budget || 0;

            const payrollPct = salesActual ? (latest.Payroll_Actual / salesActual) * 100 : 0;
            const foodPct = salesActual ? (latest.Food_Actual / salesActual) * 100 : 0;
            const drinkPct = salesActual ? (latest.Drink_Actual / salesActual) * 100 : 0;

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
      } catch {
        setRankingData([]);
      }
    })();
  }, [role]);

  // 10) Chart config (preserves Theo lines)
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

  const yTickFormatter = (val: number) => (val === 0 ? '£0' : '£' + Number(val).toLocaleString());
  const tooltipFormatter = (value: number, name: string) => [formatCurrency(value), name];

  // ─────────────────────────────────────────────────────────────
  // Guards
  // ─────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-10 text-center text-sm text-gray-500">
        Loading profile…
      </main>
    );
  }
  if (!session || !profile) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-10 text-center">
        <div className="inline-block rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          You are not signed in.
        </div>
      </main>
    );
  }
  if (!canView) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-10 text-center">
        <div className="inline-block rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
          You don&apos;t have permission to view Financial Performance.
        </div>
      </main>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────────────────────
  return (
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Title */}
      <div className="text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Financial Performance 2025</h1>
      </div>

      {/* Controls Row (centered, own line) */}
      <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-4">
        {/* Location */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Location</label>
          <select
            className="border rounded-md px-3 py-2 text-sm bg-white"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            {allowedLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>

        {/* Period */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Period</label>
          <select
            className="border rounded-md px-3 py-2 text-sm bg-white"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
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
      <InsightsBar insights={insights} payrollTarget={PAYROLL_TARGET} currentWeekNow={currentWeekNow} />

      {/* Compliance */}
      <ComplianceBar
        insights={insights}
        payrollTarget={PAYROLL_TARGET}
        foodTarget={FOOD_TARGET}
        drinkTarget={DRINK_TARGET}
      />

      {/* KPI cards */}
      {loadingData ? (
        <p className="text-center text-sm text-gray-500">Loading data…</p>
      ) : fetchError ? (
        <p className="text-center text-sm text-red-600">Could not load data: {fetchError}</p>
      ) : (
        <KPIBlock
          data={filteredData}
          payrollTarget={PAYROLL_TARGET}
          foodTarget={FOOD_TARGET}
          drinkTarget={DRINK_TARGET}
        />
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-center gap-2 -mt-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 rounded-md text-sm border ${
              activeTab === tab
                ? 'bg-gray-900 text-white shadow'
                : 'bg-white text-gray-900 hover:bg-gray-50'
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

      {/* Space before ranking */}
      <div className="h-4 md:h-6" />

      {/* RANKING */}
      {['admin', 'operation', 'ops'].includes(role) && rankingData.length > 0 && (
        <RankingTable
          rankingData={rankingData}
          payrollTarget={PAYROLL_TARGET}
          foodTarget={FOOD_TARGET}
          drinkTarget={DRINK_TARGET}
        />
      )}

      {/* extra bottom space so it doesn't crush the global footer */}
      <div className="h-10" />
    </main>
  );
}