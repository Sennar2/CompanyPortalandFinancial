'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../src/lib/supabaseClient';

// Charts
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

/* ──────────────────────────────────────────────────────────────
   CONFIG
   ────────────────────────────────────────────────────────────── */
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

/* ──────────────────────────────────────────────────────────────
   HELPERS
   ────────────────────────────────────────────────────────────── */
function parseWeekNum(weekStr: string | undefined) {
  const num = parseInt(String(weekStr || '').replace(/[^\d]/g, ''), 10);
  return isNaN(num) ? 0 : num;
}

// ISO week (clamped 1..52)
function getISOWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return Math.max(1, Math.min(52, weekNo));
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
  if (!res.ok) throw new Error(`HTTP ${res.status} loading "${tabName}"`);
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
  const first = rowsArray.find((r) => r && typeof r === 'object');
  if (!first) return [];

  const numericKeys = Object.keys(first).filter((k) => typeof first[k] === 'number');

  const merged = Object.entries(grouped).map(([label, rows]) => {
    const sums: Record<string, number> = {};
    numericKeys.forEach((col) => {
      sums[col] = (rows as any[]).reduce((acc, r: any) => acc + (r[col] || 0), 0);
    });
    return { Week: label, ...sums };
  });

  merged.sort((a: any, b: any) => parseWeekNum(a.Week) - parseWeekNum(b.Week));
  return merged;
}

function computeInsightsBundle(rows: any[]) {
  if (!rows || rows.length === 0) return null;

  const decorated = rows.map((r: any) => ({ ...r, __weekNum: parseWeekNum(r.Week) }));

  function rowHasData(r: any) {
    return (
      (r.Sales_Actual && r.Sales_Actual !== 0) ||
      (r.Payroll_Actual && r.Payroll_Actual !== 0) ||
      (r.Sales_Budget && r.Sales_Budget !== 0)
    );
  }

  const now = getISOWeek(new Date());
  const snap = now - 1 <= 0 ? now : now - 1;

  let latest = decorated.find((r) => r.__weekNum === snap && rowHasData(r));
  if (!latest) {
    const cands = decorated
      .filter((r) => r.__weekNum <= snap && rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latest = cands[cands.length - 1];
  }
  if (!latest) {
    const cands = decorated.filter(rowHasData).sort((a, b) => a.__weekNum - b.__weekNum);
    latest = cands[candidates.length - 1];
  }
  if (!latest) return null;

  const salesActual = latest.Sales_Actual || 0;
  const salesBudget = latest.Sales_Budget || 0;
  const salesLastYear = latest.Sales_LastYear || 0;

  const salesVar = salesActual - salesBudget;
  const salesVarPct = salesBudget ? (salesVar / salesBudget) * 100 : 0;

  const payrollPct = salesActual ? (latest.Payroll_Actual / salesActual) * 100 : 0;
  const foodPct = salesActual ? (latest.Food_Actual / salesActual) * 100 : 0;
  const drinkPct = salesActual ? (latest.Drink_Actual / salesActual) * 100 : 0;

  const salesVsLastYearPct = salesLastYear
    ? ((salesActual - salesLastYear) / salesLastYear) * 100
    : 0;

  return {
    wkLabel: latest.Week,
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

function formatCurrency(n: number) {
  return (
    '£' +
    Number(n || 0).toLocaleString('en-GB', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

/* ──────────────────────────────────────────────────────────────
   SMALL UI BITS
   ────────────────────────────────────────────────────────────── */
function TargetBadge({ ok }: { ok: boolean }) {
  return (
    <span className={'ml-1 text-xs font-semibold ' + (ok ? 'text-green-600' : 'text-red-600')}>
      {ok ? '✓' : '✗'}
    </span>
  );
}

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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="text-xs text-gray-500 font-medium flex flex-wrap items-center gap-1">
        <span className="text-gray-900 font-semibold">{label}</span>
        <span className="flex items-center gap-1 text-gray-500">
          <span className="text-xs text-gray-400">●</span>
          <span className="text-xs text-gray-600 font-semibold">{weekLabel}</span>
          <span className="text-[11px] text-gray-500">• {targetText}</span>
        </span>
      </div>
      <div className={'text-xl font-semibold mt-2 ' + (good ? 'text-green-600' : 'text-red-600')}>
        {valuePct.toFixed(1)}% <TargetBadge ok={good} />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   CHARTS (inline — no dependency on old ChartSection props)
   ────────────────────────────────────────────────────────────── */
function buildAggregates(rows: any[], mode: 'Week' | 'Period' | 'Quarter') {
  // rows already have Week; we’ll add Period/Quarter mapping below
  const key = mode === 'Week' ? 'Week' : mode;

  // sums by label
  const groups: Record<
    string,
    { Sales_Actual: number; Sales_Budget: number; Payroll_Actual: number; Food_Actual: number; Drink_Actual: number }
  > = {};

  for (const r of rows) {
    const label = String(r[key] || '').trim();
    if (!label) continue;
    if (!groups[label]) {
      groups[label] = {
        Sales_Actual: 0,
        Sales_Budget: 0,
        Payroll_Actual: 0,
        Food_Actual: 0,
        Drink_Actual: 0,
      };
    }
    groups[label].Sales_Actual += Number(r.Sales_Actual || 0);
    groups[label].Sales_Budget += Number(r.Sales_Budget || 0);
    groups[label].Payroll_Actual += Number(r.Payroll_Actual || 0);
    groups[label].Food_Actual += Number(r.Food_Actual || 0);
    groups[label].Drink_Actual += Number(r.Drink_Actual || 0);
  }

  const out = Object.entries(groups)
    .map(([label, s]) => {
      const payrollPct = s.Sales_Actual ? (s.Payroll_Actual / s.Sales_Actual) * 100 : 0;
      const foodPct = s.Sales_Actual ? (s.Food_Actual / s.Sales_Actual) * 100 : 0;
      const drinkPct = s.Sales_Actual ? (s.Drink_Actual / s.Sales_Actual) * 100 : 0;
      return {
        label,
        Sales_Actual: s.Sales_Actual,
        Sales_Budget: s.Sales_Budget,
        payrollPct,
        foodPct,
        drinkPct,
      };
    })
    .sort((a, b) => {
      // numerical compare for Wxx / Pxx / Qx
      const na = parseInt(a.label.replace(/[^\d]/g, ''), 10) || 0;
      const nb = parseInt(b.label.replace(/[^\d]/g, ''), 10) || 0;
      return na - nb;
    });

  return out;
}

function ChartsBlock({ rows, view }: { rows: any[]; view: 'Week' | 'Period' | 'Quarter' }) {
  if (!rows || rows.length === 0) return null;

  const data = useMemo(() => buildAggregates(rows, view), [rows, view]);

  // keep charts readable: last 12 points
  const last12 = data.slice(Math.max(0, data.length - 12));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Sales vs Budget */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="text-sm font-semibold text-gray-800 mb-2">Sales vs Budget</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last12}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(v) => '£' + Number(v).toLocaleString('en-GB')} />
              <Tooltip
                formatter={(v: any) => formatCurrency(v as number)}
                labelFormatter={(l) => `${view} ${l}`}
              />
              <Legend />
              <Bar dataKey="Sales_Actual" name="Actual" />
              <Bar dataKey="Sales_Budget" name="Budget" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Payroll % */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="text-sm font-semibold text-gray-800 mb-2">Payroll %</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={last12}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(v) => `${v}%`} />
              <Tooltip
                formatter={(v: any) => `${(v as number).toFixed(1)}%`}
                labelFormatter={(l) => `${view} ${l}`}
              />
              <Legend />
              <Line type="monotone" dataKey="payrollPct" name="Payroll %" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Food % */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="text-sm font-semibold text-gray-800 mb-2">Food %</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={last12}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(v) => `${v}%`} />
              <Tooltip
                formatter={(v: any) => `${(v as number).toFixed(1)}%`}
                labelFormatter={(l) => `${view} ${l}`}
              />
              <Legend />
              <Line type="monotone" dataKey="foodPct" name="Food %" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Drink % */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="text-sm font-semibold text-gray-800 mb-2">Drink %</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={last12}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(v) => `${v}%`} />
              <Tooltip
                formatter={(v: any) => `${(v as number).toFixed(1)}%`}
                labelFormatter={(l) => `${view} ${l}`}
              />
              <Legend />
              <Line type="monotone" dataKey="drinkPct" name="Drink %" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   RANKING TABLE
   ────────────────────────────────────────────────────────────── */
function RankingTable({
  rows,
  payrollTarget,
  foodTarget,
  drinkTarget,
}: {
  rows: any[];
  payrollTarget: number;
  foodTarget: number;
  drinkTarget: number;
}) {
  if (!rows.length) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
      <div className="flex items-start justify-between flex-wrap gap-2 px-4 py-3 border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-800">Site Ranking (last week)</div>
        <div className="text-[11px] text-gray-500">Sorted by highest Payroll %</div>
      </div>
      <table className="min-w-full text-sm text-gray-800">
        <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
          <tr>
            <th className="text-left font-medium px-4 py-2">Location</th>
            <th className="text-left font-medium px-4 py-2">Payroll % (≤ {payrollTarget}%)</th>
            <th className="text-left font-medium px-4 py-2">Food % (≤ {foodTarget}%)</th>
            <th className="text-left font-medium px-4 py-2">Drink % (≤ {drinkTarget}%)</th>
            <th className="text-left font-medium px-4 py-2">Sales vs Budget</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const pGood = r.payrollPct <= payrollTarget;
            const fGood = r.foodPct <= foodTarget;
            const dGood = r.drinkPct <= drinkTarget;
            const rowBg =
              i === 0 ? 'bg-red-50/60' : i % 2 ? 'bg-white' : 'bg-gray-50/30';
            return (
              <tr key={r.location} className={rowBg}>
                <td className="px-4 py-3 align-top text-sm text-gray-900">
                  <div className="font-medium">{r.location}</div>
                  <div className="text-[11px] text-gray-500">{r.week}</div>
                </td>
                <td className={'px-4 py-3 font-semibold ' + (pGood ? 'text-green-600' : 'text-red-600')}>
                  {r.payrollPct.toFixed(1)}%
                </td>
                <td className={'px-4 py-3 font-semibold ' + (fGood ? 'text-green-600' : 'text-red-600')}>
                  {r.foodPct.toFixed(1)}%
                </td>
                <td className={'px-4 py-3 font-semibold ' + (dGood ? 'text-green-600' : 'text-red-600')}>
                  {r.drinkPct.toFixed(1)}%
                </td>
                <td className={'px-4 py-3 font-semibold ' + (r.salesVar >= 0 ? 'text-green-600' : 'text-red-600')}>
                  {formatCurrency(r.salesVar)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   PAGE
   ────────────────────────────────────────────────────────────── */
export default function FinancialPage() {
  // auth
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // filters
  const [allowedLocations, setAllowedLocations] = useState<string[]>([]);
  const [initialLocation, setInitialLocation] = useState('');
  const [location, setLocation] = useState('');
  const [view, setView] = useState<'Week' | 'Period' | 'Quarter'>('Week');

  // data
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [fetchError, setFetchError] = useState('');
  const [loadingData, setLoadingData] = useState(false);

  // ranking
  const [rankingRows, setRankingRows] = useState<any[]>([]);

  const currentWeekNow = getCurrentWeekLabel();

  // session watcher
  useEffect(() => {
    let sub: any;
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session ?? null);
      const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
      sub = listener;
    })();
    return () => {
      if (sub) sub.subscription.unsubscribe();
    };
  }, []);

  // profile + allowed locations
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
        setAllowedLocations([]);
        setInitialLocation('');
        setAuthLoading(false);
        return;
      }

      setProfile(data);
      const role = (data.role || '').toLowerCase();

      let locs: string[] = [];
      if (role === 'admin' || role === 'operation') {
        locs = [
          'GroupOverview',
          'La Mia Mamma (Brand)',
          'Fish and Bubbles (Brand)',
          'Made in Italy (Brand)',
          ...STORE_LOCATIONS,
        ];
      } else if (role === 'manager') {
        if (data.home_location) locs = [data.home_location];
      }

      setAllowedLocations(locs);
      setInitialLocation(locs[0] || '');
      setAuthLoading(false);
    })();
  }, [session]);

  // sync default location once allowed
  useEffect(() => {
    if (!location && initialLocation) setLocation(initialLocation);
  }, [initialLocation, location]);

  // map weeks -> period/quarter for charts aggregation
  const WEEK_TO_PERIOD_QUARTER = useMemo(() => {
    return Array.from({ length: 52 }, (_, i) => {
      const w = i + 1;
      let periodVal: string;
      let quarter: string;
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
  const rowsWithPQ = useMemo(() => {
    return rawRows.map((r) => {
      const wk = String(r.Week || '').trim();
      const m = WEEK_TO_PERIOD_QUARTER.find((x) => x.week === wk);
      return { ...r, Period: m?.period || 'P?', Quarter: m?.quarter || 'Q?' };
    });
  }, [rawRows, WEEK_TO_PERIOD_QUARTER]);

  // load rows for selected location/brand/group
  useEffect(() => {
    (async () => {
      if (!location) return;
      setLoadingData(true);
      setFetchError('');
      try {
        const isBrand = !!BRAND_GROUPS[location];
        let rows: any[] = [];
        if (isBrand) {
          const all = await Promise.all(BRAND_GROUPS[location].map((site) => fetchTab(site)));
          rows = rollupByWeek(all.flat());
        } else {
          rows = await fetchTab(location);
          rows.sort((a, b) => parseWeekNum(a.Week) - parseWeekNum(b.Week));
        }
        setRawRows(rows);
      } catch (e: any) {
        setRawRows([]);
        setFetchError(e?.message || 'Failed to load data');
      } finally {
        setLoadingData(false);
      }
    })();
  }, [location]);

  // insights (hero + KPI)
  const insights = useMemo(() => computeInsightsBundle(rowsWithPQ), [rowsWithPQ]);

  // ranking (last completed week per site)
  useEffect(() => {
    (async () => {
      const role = (profile?.role || '').toLowerCase();
      if (role !== 'admin' && role !== 'operation') {
        setRankingRows([]);
        return;
      }
      try {
        const now = getISOWeek(new Date());
        const snap = now - 1 <= 0 ? now : now - 1;
        function hasData(r: any) {
          return (
            (r.Sales_Actual && r.Sales_Actual !== 0) ||
            (r.Payroll_Actual && r.Payroll_Actual !== 0) ||
            (r.Sales_Budget && r.Sales_Budget !== 0)
          );
        }
        const results = await Promise.all(
          STORE_LOCATIONS.map(async (loc) => {
            const rows = await fetchTab(loc);
            if (!rows?.length) return null;
            const dec = rows
              .map((r: any) => ({ ...r, __weekNum: parseWeekNum(r.Week) }))
              .sort((a, b) => a.__weekNum - b.__weekNum);

            let latest = dec.find((r) => r.__weekNum === snap && hasData(r));
            if (!latest) {
              const c = dec.filter((r) => r.__weekNum <= snap && hasData(r));
              latest = c[c.length - 1];
            }
            if (!latest) {
              const c = dec.filter(hasData);
              latest = c[c.length - 1];
            }
            if (!latest) return null;

            const salesActual = latest.Sales_Actual || 0;
            const salesBudget = latest.Sales_Budget || 0;
            const salesVar = salesActual - salesBudget;
            const payrollPct = salesActual ? (latest.Payroll_Actual / salesActual) * 100 : 0;
            const foodPct = salesActual ? (latest.Food_Actual / salesActual) * 100 : 0;
            const drinkPct = salesActual ? (latest.Drink_Actual / salesActual) * 100 : 0;

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

        const clean = (results.filter(Boolean) as any[]).sort((a, b) => b.payrollPct - a.payrollPct);
        setRankingRows(clean);
      } catch (err) {
        setRankingRows([]);
      }
    })();
  }, [profile]);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  /* ─────────────────────────────
     GUARDS
     ───────────────────────────── */
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
  const role = (profile.role || '').toLowerCase();
  const canView =
    role === 'admin' || role === 'operation' || role === 'manager';
  if (!canView) {
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

  /* ─────────────────────────────
     VIEW
     ───────────────────────────── */
  return (
    <main className="bg-gray-50 min-h-screen text-gray-900">
      {/* Header area (under the company portal header) */}
      <section className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="text-center mb-6">
            <div className="text-base font-semibold text-gray-900">Financial Performance</div>
            <div className="text-xs text-gray-500">Select your location and view</div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-center gap-6">
            <div className="flex flex-col">
              <label className="text-[11px] font-semibold text-gray-600 uppercase mb-1">
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

            <div className="flex flex-col">
              <label className="text-[11px] font-semibold text-gray-600 uppercase mb-1">View</label>
              <select
                className="w-40 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={view}
                onChange={(e) => setView(e.target.value as any)}
              >
                {PERIODS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-8 space-y-12">
        {/* HERO */}
        {insights && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Current week */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="text-xs text-gray-500 font-medium mb-4">Current Week</div>
              <div className="text-3xl font-semibold text-gray-900">{currentWeekNow}</div>
              <p className="text-xs text-gray-500 mt-4">Today&apos;s trading period</p>
            </div>

            {/* Last week results */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-start justify-between">
                <div className="text-xs text-gray-500 font-medium">Last Week Results</div>
                <div className="text-xs text-gray-400 font-medium">{insights.wkLabel}</div>
              </div>
              <div className="mt-3">
                <div className="text-sm font-semibold text-gray-800">Sales vs Budget</div>
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
                <div className="text-sm font-semibold text-gray-800">Payroll %</div>
                <div className="text-red-600 font-semibold text-lg leading-tight">
                  {insights.payrollPct.toFixed(1)}%
                </div>
                <div className="text-[11px] text-gray-500">Target ≤ {PAYROLL_TARGET}%</div>
              </div>
            </div>
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard
            label="Payroll %"
            weekLabel={insights?.wkLabel || '–'}
            targetText={`Target ≤ ${PAYROLL_TARGET}%`}
            valuePct={insights?.payrollPct || 0}
            good={(insights?.payrollPct || 0) <= PAYROLL_TARGET}
          />
          <MetricCard
            label="Food %"
            weekLabel={insights?.wkLabel || '–'}
            targetText={`Target ≤ ${FOOD_TARGET}%`}
            valuePct={insights?.foodPct || 0}
            good={(insights?.foodPct || 0) <= FOOD_TARGET}
          />
          <MetricCard
            label="Drink %"
            weekLabel={insights?.wkLabel || '–'}
            targetText={`Target ≤ ${DRINK_TARGET}%`}
            valuePct={insights?.drinkPct || 0}
            good={(insights?.drinkPct || 0) <= DRINK_TARGET}
          />
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="text-xs text-gray-500 font-medium flex flex-wrap items-center gap-1">
              <span className="text-gray-900 font-semibold">Sales vs LY</span>
              <span className="flex items-center gap-1 text-gray-500">
                <span className="text-xs text-gray-400">●</span>
                <span className="text-xs text-gray-600 font-semibold">
                  {insights?.wkLabel || '–'}
                </span>
                <span className="text-[11px] text-gray-500">• Target ≥ 0%</span>
              </span>
            </div>
            <div className="text-green-600 text-xl font-semibold mt-2">
              {(insights?.salesVsLastYearPct ?? 0).toFixed(1)}%{' '}
              <TargetBadge ok={(insights?.salesVsLastYearPct ?? 0) >= 0} />
            </div>
          </div>
        </div>

        {/* CHARTS */}
        {!loadingData && !fetchError && rowsWithPQ.length > 0 && (
          <ChartsBlock rows={rowsWithPQ} view={view} />
        )}

        {/* Spacer before ranking */}
        <div className="h-8" />

        {/* RANKING */}
        <div>
          {loadingData && (
            <p className="text-center text-gray-500 text-sm">Loading data…</p>
          )}
          {!loadingData && fetchError && (
            <p className="text-center text-red-600 text-sm font-medium">
              Could not load data: {fetchError}
            </p>
          )}
          {!loadingData && !fetchError && (
            <RankingTable
              rows={rankingRows}
              payrollTarget={PAYROLL_TARGET}
              foodTarget={FOOD_TARGET}
              drinkTarget={DRINK_TARGET}
            />
          )}
        </div>

        {/* Sign out (bottom helper on mobile) */}
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