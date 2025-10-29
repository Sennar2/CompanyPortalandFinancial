"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import brands from "@/data/brands.json";
import { supabase } from "@/lib/supabaseClient";
import { LOCATIONS as PLANDAY_LOCATIONS } from "@/data/locations";

import ComplianceBar from "@/components/financial/ComplianceBar";

// ─────────────────────────────
// Types
// ─────────────────────────────

type UserRole = "user" | "ops" | "admin";

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: UserRole;
  home_location: string | null;
};

type ShiftCard = {
  name: string;
  start: string;
  end: string;
  location: string;
  _sort: string;
};

type RevenueData = {
  today: number;
  weekActual: number;
  weekForecast: number;
} | null;

type WeatherData = {
  temp: number;
  description: string;
  icon: string;
} | null;

type FinanceInsights = {
  wkLabel: string; // e.g. "W43"
  salesActual: number;
  salesBudget: number;
  salesVar: number;
  salesVarPct: number;
  payrollPct: number;
  foodPct: number;
  drinkPct: number;
  salesVsLastYearPct: number;
  avgPayrollVar4w: number; // 4-week avg of Payroll_v%
} | null;

// ─────────────────────────────
// Small helpers
// ─────────────────────────────

// Convert "27/10/2025" -> "2025-10-27"
function gbToYmd(gbDateStr: string) {
  const [d, m, y] = gbDateStr.split("/");
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

// Today's YYYY-MM-DD
function todayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Take any ISO string/Date, return "yyyy-mm-dd" (Europe/London)
function toLondonDateKey(isoOrDate: string | Date) {
  const dateObj =
    typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const partsArray = formatter.formatToParts(dateObj);
  const parts: Record<string, string> = {};
  for (const p of partsArray) {
    if (p.type !== "literal") {
      parts[p.type] = p.value;
    }
  }

  const y = parts.year;
  const m = parts.month;
  const d = parts.day;

  return `${y}-${m}-${d}`; // yyyy-mm-dd
}

// Google Sheets fallback by location (for daily revenue)
const GID_MAP: Record<string, string> = {
  "La Mia Mamma - Chelsea": "0",
  "La Mia Mamma - Hollywood Road": "316470508",
  "La Mia Mamma - Notting Hill": "1672409552",
  "La Mia Mamma - Battersea": "1782941826",
  "Made in Italy - Chelsea": "1215081080",
  "Fish and Bubbles - Notting Hill": "1516384729",
  "Fish and Bubbles - Fulham": "1757100724",
};

// ─────────────────────────────
// Finance helpers
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

// Let's get the ISO week number (Mon-Sun weeks) for *today*
function getCurrentWeekNumber() {
  // ISO week logic
  const now = new Date();
  // copy in UTC so DST doesn't break math
  const tmp = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  );
  // Thursday in current week decides the week-year
  const day = tmp.getUTCDay() || 7; // Sun -> 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const diffDays =
    (tmp.getTime() - yearStart.getTime()) / 86400000 + 1;
  return Math.ceil(diffDays / 7);
}

// pull values from a sheet tab and parse into objects
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

// "W43" -> 43
function parseWeekNum(weekStr: string | undefined) {
  const num = parseInt(String(weekStr || "").replace(/[^\d]/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

// merge multiple sites (brand rollup) by Week label, summing numeric columns
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

/**
 * computeInsightsBundle
 *
 * We now respect "last completed week", not "W52 with 0 data".
 * Logic:
 *  - figure out current ISO week (e.g. 44)
 *  - snapshotWeek = currentWeek - 1 (e.g. 43)
 *  - find row where Week == "W43"
 *    - if missing, fallback to the most recent row <= 43 where some data is non-zero
 *  - for avgPayrollVar4w, we average Payroll_v% for snapshotWeek, snapshotWeek-1, -2, -3
 */
function computeInsightsBundle(rows: any[]): FinanceInsights {
  if (!rows || rows.length === 0) return null;

  // decorate rows with numeric week
  const decorated = rows.map((r: any) => ({
    ...r,
    __weekNum: parseWeekNum(r.Week),
  }));

  // figure out which week we consider "last complete"
  const currentWeekNum = getCurrentWeekNumber(); // e.g. 44
  const snapshotWeekNum = currentWeekNum - 1 <= 0 ? currentWeekNum : currentWeekNum - 1; // e.g. 43

  // helper: does this row have any "real" data?
  function rowHasData(r: any) {
    // you can tweak this rule, but Sales_Actual is usually enough
    return (
      (r.Sales_Actual && r.Sales_Actual !== 0) ||
      (r.Payroll_Actual && r.Payroll_Actual !== 0) ||
      (r.Sales_Budget && r.Sales_Budget !== 0)
    );
  }

  // try to get EXACT snapshotWeekNum first
  let latestRow = decorated.find(
    (r) => r.__weekNum === snapshotWeekNum && rowHasData(r)
  );

  // fallback: get the most recent <= snapshotWeekNum that has data
  if (!latestRow) {
    const candidates = decorated
      .filter((r) => r.__weekNum <= snapshotWeekNum && rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = candidates[candidates.length - 1];
  }

  // final fallback: just pick the latest non-zero row at all
  if (!latestRow) {
    const candidates = decorated
      .filter((r) => rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latestRow = candidates[candidates.length - 1];
  }

  if (!latestRow) return null; // nothing with data

  const weekNumWeUse = latestRow.__weekNum; // e.g. 43
  const wkLabel = latestRow.Week || `W${weekNumWeUse}`;

  // compute last-4-weeks window [weekNumWeUse, -1, -2, -3]
  const windowWeeks = [
    weekNumWeUse,
    weekNumWeUse - 1,
    weekNumWeUse - 2,
    weekNumWeUse - 3,
  ].filter((n) => n > 0);

    const last4Rows = decorated.filter((r) =>
    windowWeeks.includes(r.__weekNum)
  );

  // helper: turn "1.2%" or "0.8" or "" into a number like 1.2
  function parsePayrollVar(val: any): number {
    if (val === undefined || val === null) return 0;
    // convert to string, strip %, trim spaces
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


  // build metrics from that snapshot row
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
    wkLabel: wkLabel, // e.g. "W43"
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

// fetch a single tab from the sheet
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

// ─────────────────────────────
// Page Component
// ─────────────────────────────

export default function HomePage() {
  const router = useRouter();

  // auth / profile
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // which locations user can access
  const [allowedLocations, setAllowedLocations] = useState<string[]>([]);

  // selections
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [selectedShiftDate, setSelectedShiftDate] = useState(
    new Date().toLocaleDateString("en-GB") // dd/mm/yyyy
  );

  // data states
  const [searchTerm, setSearchTerm] = useState("");
  const [resources, setResources] = useState<any[]>([]);

  const [weather, setWeather] = useState<WeatherData>(null);
  const [revenue, setRevenue] = useState<RevenueData>(null);

  const [events, setEvents] = useState<
    Array<{ date: Date; event: string; location: string }>
  >([]);
  const [tip, setTip] = useState<string>("Have a great day!");
  const [news, setNews] = useState<
    Array<{ date: string; title: string; content: string }>
  >([]);

  const [shifts, setShifts] = useState<ShiftCard[]>([]);

  // finance snapshot states
  const [financeInsights, setFinanceInsights] =
    useState<FinanceInsights>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeError, setFinanceError] = useState("");

  // ─────────────────────────────
  // Department lookup for Planday
  // ─────────────────────────────

  // locationName -> [deptId]
  const DEPTS_BY_NAME = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const loc of PLANDAY_LOCATIONS) {
      const id = (loc as any).plandayDepartmentId;
      out[loc.name.toLowerCase()] = id != null ? [String(id)] : [];
    }
    return out;
  }, []);

  // deptId -> location name
  const NAME_BY_DEPT = useMemo(() => {
    const pairs: Array<[string, string]> = [];
    for (const loc of PLANDAY_LOCATIONS) {
      if ((loc as any).plandayDepartmentId != null) {
        pairs.push([String((loc as any).plandayDepartmentId), loc.name]);
      }
    }
    return Object.fromEntries(pairs);
  }, []);

  // ─────────────────────────────
  // 1. Load auth profile
  // ─────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        if (!user) {
          router.push("/login");
          return;
        }

        const { data: profRows } = await supabase
          .from("profiles")
          .select("id, full_name, role, home_location")
          .eq("id", user.id)
          .limit(1);

        if (!profRows || profRows.length === 0) {
          // fallback if no row in profiles
          setProfile({
            id: user.id,
            full_name: (user as any).email ?? null,
            role: "user",
            home_location:
              PLANDAY_LOCATIONS[0]?.name || "La Mia Mamma - Chelsea",
          });
        } else {
          setProfile(profRows[0] as ProfileRow);
        }
      } catch (err) {
        router.push("/login");
      } finally {
        setProfileLoaded(true);
      }
    })();
  }, [router]);

  // ─────────────────────────────
  // 2. Allowed locations based on role
  // ─────────────────────────────
  useEffect(() => {
    if (!profile) return;

    let locs: string[] = [];

    if (profile.role === "user") {
      const only = profile.home_location
        ? profile.home_location
        : PLANDAY_LOCATIONS[0]?.name || "";
      locs = [only];
    } else {
      // ops / admin
      locs = ["All", ...PLANDAY_LOCATIONS.map((l) => l.name)];
    }

    setAllowedLocations(locs);

    if (!selectedLocation && locs.length > 0) {
      setSelectedLocation(locs[0]);
    }
  }, [profile, selectedLocation]);

  // ─────────────────────────────
  // 3. Search resources (SOPs/links)
  // ─────────────────────────────
  useEffect(() => {
    if (searchTerm.length < 3) {
      setResources([]);
      return;
    }

    (async () => {
      try {
        const { data } = await supabase
          .from("resources")
          .select("*")
          .or(
            `title.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%,location.ilike.%${searchTerm}%`
          );
        setResources(data || []);
      } catch {
        setResources([]);
      }
    })();
  }, [searchTerm]);

  // ─────────────────────────────
  // 4. Weather (London)
  // ─────────────────────────────
  useEffect(() => {
    if (!selectedLocation) return;

    fetch("/api/weather-london")
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) {
          setWeather(null);
          return;
        }
        setWeather({
          temp: data.temp ?? 0,
          description: data.description ?? "",
          icon: data.icon ?? "",
        });
      })
      .catch(() => setWeather(null));
  }, [selectedLocation]);

  // ─────────────────────────────
  // 5. Revenue (today / this week)
  // ─────────────────────────────
  useEffect(() => {
    if (!selectedLocation) return;

    const ymd = todayYmd();

    // build deptIds list
    const departmentIds =
      selectedLocation === "All"
        ? PLANDAY_LOCATIONS.map((l: any) =>
            l.plandayDepartmentId != null
              ? String(l.plandayDepartmentId)
              : null
          ).filter((x: string | null): x is string => !!x)
        : DEPTS_BY_NAME[selectedLocation.toLowerCase()] || [];

    async function loadRevenue() {
      let usedPlanday = false;
      let finalRevenue: RevenueData = null;

      // (a) Try Planday API
      if (departmentIds.length > 0) {
        try {
          const resp = await fetch("/api/planday/revenue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              departmentIds,
              date: ymd,
            }),
          });

          const data = await resp.json().catch(() => null);

          if (data && !data.error) {
            if (
              (data.todayActual && data.todayActual !== 0) ||
              (data.weekActual && data.weekActual !== 0) ||
              (data.weekForecast && data.weekForecast !== 0)
            ) {
              finalRevenue = {
                today: Number(data.todayActual ?? 0),
                weekActual: Number(data.weekActual ?? 0),
                weekForecast: Number(data.weekForecast ?? 0),
              };
              usedPlanday = true;
            }
          }
        } catch {
          // swallow
        }
      }

      // (b) fallback Google Sheet if Planday is blank
      if (!usedPlanday) {
        const gid = GID_MAP[selectedLocation];
        if (gid) {
          try {
            const csv = await fetch(
              `https://docs.google.com/spreadsheets/d/e/2PACX-1vRlgEXH1CQ0cw2hrqiyG0QlSyhx4BQls2fW6lJ2zIACjiglS812ztvaR9v9J0m7fEXYJclOpd9peWqT/pub?output=csv&gid=${gid}`
            ).then((r) => r.text());

            const rows = csv.split("\n").slice(1);
            const parsed = rows.map((line) => {
              const [d, yday, todayVal, wa, wf] = line.split(",");
              return {
                date: (d || "").trim(),
                yesterday: (yday || "").trim(),
                today: (todayVal || "").trim(),
                weekActual: (wa || "").trim(),
                weekForecast: (wf || "").trim(),
              };
            });

            const todayGb = new Date().toLocaleDateString("en-GB");
            const hit =
              parsed.find((r) => r.date === todayGb) ||
              parsed[0] ||
              null;

            if (hit) {
              finalRevenue = {
                today: Number(hit.today || 0),
                weekActual: Number(hit.weekActual || 0),
                weekForecast: Number(hit.weekForecast || 0),
              };
            }
          } catch {
            // swallow
          }
        }
      }

      setRevenue(finalRevenue);
    }

    loadRevenue();
  }, [selectedLocation, DEPTS_BY_NAME]);

  // ─────────────────────────────
  // 6. Events (next 3 days)
  // ─────────────────────────────
  useEffect(() => {
    if (!selectedLocation) return;

    fetch(
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vReggGOO7oZiPZe32eMqa7HyivJPs1SNMOKQ5jPARCy1f5333Ya9Ua9xYOzT_ohoXKEohNX6kTlCP3n/pub?output=csv"
    )
      .then((r) => r.text())
      .then((text) => {
        const rows = text.split("\n").slice(1);
        const parsed = rows
          .map((row) => {
            const [dateStr, event, location] = row.split(",");
            const [day, month, year] = (dateStr || "")
              .trim()
              .split("/");
            const dt = new Date(`${year}-${month}-${day}`);
            return {
              date: dt,
              event: (event || "").trim(),
              location: (location || "").trim(),
            };
          })
          .filter((e) => !isNaN(e.date.getTime()));

        setEvents(parsed);
      })
      .catch(() => {
        setEvents([]);
      });
  }, [selectedLocation]);

  // ─────────────────────────────
  // 7. Tip of the Day
  // ─────────────────────────────
  useEffect(() => {
    if (!selectedLocation) return;

    const todayStr = new Date().toLocaleDateString("en-GB");

    fetch(
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vTmoIBQeHC1OBjbEGx5RVZMQp-byLLmGqOFto5oWl2fBuF5buiRpr43hLF71IMVm9IUL_I62ot_v0t7/pub?output=csv"
    )
      .then((r) => r.text())
      .then((text) => {
        const rows = text.split("\n").slice(1);
        const match = rows
          .map((row) => {
            const [date, message] = row.split(",");
            return {
              date: (date || "").trim(),
              message: (message || "").trim(),
            };
          })
          .find((r) => r.date === todayStr);

        setTip(match?.message || "Have a great day!");
      })
      .catch(() => {
        setTip("Have a great day!");
      });
  }, [selectedLocation]);

  // ─────────────────────────────
  // 8. News
  // ─────────────────────────────
  useEffect(() => {
    if (!selectedLocation) return;

    fetch(
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vRvqUmJirw5LPNq3SR-86VbyYxITHzwBqEX8hIfj_3zkzOC9vUesfykZ2PpGW8rQBLxybroOpdarR3a/pub?output=csv"
    )
      .then((r) => r.text())
      .then((text) => {
        const rows = text.split("\n").slice(1);
        const parsed = rows
          .map((row) => {
            const [date, title, content] = row.split(",");
            return {
              date: (date || "").trim(),
              title: (title || "").trim(),
              content: (content || "").trim(),
            };
          })
          .filter((n) => n.title && n.content)
          .slice(0, 3);

        setNews(parsed);
      })
      .catch(() => {
        setNews([]);
      });
  }, [selectedLocation]);

  // ─────────────────────────────
  // 9. Shifts from Planday
  // ─────────────────────────────
  useEffect(() => {
    if (!selectedLocation) return;

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const ymd = gbToYmd(selectedShiftDate);

        const departmentIds =
          selectedLocation === "All"
            ? PLANDAY_LOCATIONS.map((l: any) =>
                l.plandayDepartmentId != null
                  ? String(l.plandayDepartmentId)
                  : null
              ).filter((x: string | null): x is string => !!x)
            : DEPTS_BY_NAME[selectedLocation.toLowerCase()] || [];

        if (!departmentIds.length) {
          setShifts([]);
          return;
        }

        const resp = await fetch("/api/planday/day", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            departmentIds,
            date: ymd,
          }),
        });

        if (!resp.ok) {
          throw new Error(await resp.text());
        }

        const json = await resp.json();
        const items = Array.isArray(json.items) ? json.items : [];

        const londonKeySelected = ymd;

        const filtered = items.filter((s: any) => {
          if (!s.startISO) return false;
          const key = toLondonDateKey(s.startISO);
          return key === londonKeySelected;
        });

        const mapped: ShiftCard[] = filtered
          .map((s: any) => {
            const start = s.startISO
              ? new Date(s.startISO).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—";
            const end = s.endISO
              ? new Date(s.endISO).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—";

            return {
              name: s.name,
              start,
              end,
              location:
                NAME_BY_DEPT[String(s.departmentId)] || "Unknown",
              _sort: s.startISO || "",
            };
          })
          .sort((a, b) => a._sort.localeCompare(b._sort));

        if (!cancelled) {
          setShifts(mapped);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Shifts load failed:", err);
          setShifts([]);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    selectedShiftDate,
    selectedLocation,
    DEPTS_BY_NAME,
    NAME_BY_DEPT,
  ]);

  // ─────────────────────────────
  // 10. Finance snapshot for ComplianceBar
  // "All" -> GroupOverview
  // site  -> that tab
  // brand -> BRAND_GROUPS rollup
  // ─────────────────────────────
  useEffect(() => {
    if (!selectedLocation) return;

    let financeLoc =
        selectedLocation === "All" ? "GroupOverview" : selectedLocation;

    async function loadFinance() {
      setFinanceLoading(true);
      setFinanceError("");

      try {
        const isBrand = !!BRAND_GROUPS[financeLoc];
        let weeklyRows: any[] = [];

        if (isBrand) {
          // brand rollup across multiple tabs
          const allData = await Promise.all(
            BRAND_GROUPS[financeLoc].map((site) => fetchTab(site))
          );
          weeklyRows = rollupByWeek(allData.flat());
        } else {
          // single site or GroupOverview
          weeklyRows = await fetchTab(financeLoc);
          weeklyRows.sort(
            (a, b) => parseWeekNum(a.Week) - parseWeekNum(b.Week)
          );
        }

        const snapshot = computeInsightsBundle(weeklyRows);
        setFinanceInsights(snapshot);
      } catch (err: any) {
        console.error("Finance snapshot failed:", err);
        setFinanceError(
          err?.message || "Could not load finance data"
        );
        setFinanceInsights(null);
      } finally {
        setFinanceLoading(false);
      }
    }

    loadFinance();
  }, [selectedLocation]);

  // ─────────────────────────────
  // Derived events list (next 3 days for that site)
  // ─────────────────────────────
  const filteredEvents = useMemo(() => {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + 3);

    return events.filter((e) => {
      const locationMatch =
        selectedLocation === "All" || e.location === selectedLocation;
      return e.date >= today && e.date <= end && locationMatch;
    });
  }, [events, selectedLocation]);

  // ops/admin see finance
  const canSeeFinanceBar =
    profile?.role === "ops" || profile?.role === "admin";

  // ─────────────────────────────
  // Loading gate
  // ─────────────────────────────
  if (!profileLoaded || !profile || !selectedLocation) {
    return (
      <main className="p-6 max-w-7xl mx-auto bg-gray-50 text-center">
        <div className="animate-pulse text-gray-500 text-sm">
          Loading your dashboard…
        </div>
      </main>
    );
  }

  // ─────────────────────────────
  // UI
  // ─────────────────────────────
  return (
    <main className="p-6 max-w-7xl mx-auto bg-gray-50 space-y-8">
      {/* Welcome / hero */}
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-900 mt-4">
          Ciao belli di Mamma 👋
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Everything you need today — shifts, sales, weather, SOPs.
        </p>

        {profile.role === "admin" && (
          <div className="mt-2">
            <Link
              href="/admin"
              className="inline-block rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[12px] font-semibold text-indigo-700 hover:bg-indigo-100 transition"
            >
              Admin Panel
            </Link>
          </div>
        )}
      </div>

      {/* Search + Location selector */}
      <div className="max-w-xl mx-auto space-y-6">
        {/* Search box */}
        <div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="How can I help today?"
            className="w-full px-4 py-3 border rounded-full shadow-sm text-center text-gray-700 bg-white"
          />

          {searchTerm.length >= 3 && resources.length > 0 && (
            <ul className="mt-2 border rounded-lg bg-white shadow text-sm max-h-60 overflow-y-auto divide-y">
              {resources.map((res) => (
                <li key={res.id} className="p-3">
                  <strong>{res.title}</strong>
                  <br />
                  <span className="text-xs text-gray-500">
                    {res.brand} · {res.location}
                  </span>
                  <br />
                  <a
                    href={res.link}
                    target="_blank"
                    className="text-blue-600 underline text-xs"
                  >
                    Open
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Location picker */}
        <div className="text-center">
          <label className="block font-bold text-gray-700 mb-1">
            Select your location
          </label>

          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="w-64 px-4 py-2 border rounded-full shadow text-sm mx-auto bg-white text-gray-700"
          >
            {allowedLocations.map((loc) => (
              <option key={loc}>{loc}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Finance compliance snapshot (only ops/admin) */}
      {canSeeFinanceBar ? (
        financeLoading ? (
          <div className="text-center text-xs text-gray-500">
            Loading finance snapshot…
          </div>
        ) : financeError ? (
          <div className="text-center text-xs text-red-500">
            {financeError}
          </div>
        ) : (
          <ComplianceBar insights={financeInsights} />
        )
      ) : null}

      {/* KPI cards: Today / Week / Weather */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Today's Sales */}
        <div className="bg-white p-4 rounded-xl shadow text-center hover:shadow-lg">
          <h3 className="text-sm font-semibold text-gray-700">
            Today&apos;s Sales
          </h3>
          <p className="text-xl font-bold text-blue-600 mt-2">
            £{revenue?.today ?? 0}
          </p>
        </div>

        {/* Week So Far */}
        <div className="bg-white p-4 rounded-xl shadow text-center hover:shadow-lg">
          <h3 className="text-sm font-semibold text-gray-700">
            Week So Far
          </h3>
          <p className="text-sm text-gray-700">
            Actual:{" "}
            <strong>£{revenue?.weekActual ?? 0}</strong>
          </p>
          <p className="text-sm text-gray-700">
            Forecast:{" "}
            <strong>£{revenue?.weekForecast ?? 0}</strong>
          </p>
        </div>

        {/* Weather */}
        <div className="bg-white p-4 rounded-xl shadow text-center hover:shadow-lg">
          <h3 className="text-sm font-semibold text-gray-700">
            Weather
          </h3>
          {weather ? (
            <div className="flex justify-center items-center gap-2 mt-2">
              {weather.icon ? (
                <img
                  src={weather.icon}
                  alt="Weather"
                  className="w-8 h-8"
                />
              ) : null}
              <div>
                <p className="font-bold text-gray-900">
                  {weather.temp}°C
                </p>
                <p className="text-xs capitalize text-gray-500">
                  {weather.description}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400 mt-2">
              Weather unavailable
            </div>
          )}
        </div>
      </div>

      {/* Tip + News */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tip of the Day */}
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl text-blue-800 text-sm">
          💡 <strong>Tip of the Day:</strong> {tip}
        </div>

        {/* Company News */}
        <div className="bg-white p-4 rounded-xl shadow">
          <h3 className="text-md font-semibold text-gray-800 mb-2">
            📢 Company News
          </h3>
          {news.length === 0 ? (
            <p className="text-sm text-gray-500">
              No news available.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {news.map((item, i) => (
                <li
                  key={i}
                  className="border-l-4 border-indigo-500 pl-3"
                >
                  <p className="font-bold text-gray-800">
                    {item.title}
                  </p>
                  <p className="text-gray-600">{item.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Shifts */}
      <div className="bg-white p-4 rounded-xl shadow">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-md font-semibold text-gray-800">
            Shifts
          </h3>
        </div>

        {/* Day selector */}
        <div className="flex gap-2 overflow-x-auto mb-3">
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() + i);

            const label = d.toLocaleDateString("en-GB", {
              weekday: "short",
              day: "numeric",
            });

            const value = d.toLocaleDateString("en-GB"); // dd/mm/yyyy

            return (
              <button
                key={value}
                onClick={() => setSelectedShiftDate(value)}
                className={`text-xs px-3 py-1 rounded-full whitespace-nowrap border ${
                  selectedShiftDate === value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {shifts.length === 0 ? (
          <p className="text-sm text-gray-500">
            No shifts found.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {shifts.map((s, i) => (
              <div
                key={`${s.name}-${s.start}-${s.location}-${i}`}
                className="border-l-4 border-blue-500 bg-blue-50 hover:bg-blue-100 transition p-3 rounded shadow-sm"
              >
                <h4 className="font-bold text-sm mb-1 text-gray-900">
                  {s.name}
                </h4>
                <p className="text-sm text-gray-800">
                  <span className="font-medium">
                    Start:
                  </span>{" "}
                  {s.start}
                  <br />
                  <span className="font-medium">
                    End:
                  </span>{" "}
                  {s.end}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {s.location}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Events */}
      <div className="bg-white p-4 rounded-xl shadow">
        <h3 className="text-md font-semibold text-gray-800 mb-3">
          Upcoming Events
        </h3>
        <ul className="text-sm text-gray-700 space-y-1">
          {filteredEvents.length === 0 ? (
            <li>No events for this location</li>
          ) : (
            filteredEvents.map((e, i) => (
              <li key={`${e.event}-${i}`}>
                <strong>
                  {e.date.toLocaleDateString("en-GB")}
                </strong>{" "}
                – {e.event} ({e.location})
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Apps */}
      <div className="bg-white p-4 rounded-xl shadow">
        <h3 className="text-md font-semibold text-center mb-4 text-gray-800">
          Important Apps
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <a
            href="/financial"
            className="bg-green-500 hover:bg-green-600 text-white py-2 rounded text-center"
          >
            Finance
          </a>
          <a
            href="https://lamiamamma.app.allerly.co.uk/"
            target="_blank"
            className="bg-yellow-500 hover:bg-yellow-600 text-white py-2 rounded text-center"
          >
            Allergens
          </a>
          <a
            href="https://one.mapal-os.com/"
            target="_blank"
            className="bg-pink-500 hover:bg-pink-600 text-white py-2 rounded text-center"
          >
            Flow
          </a>
          <a
            href="https://madeinitalygroup2.planday.com/"
            target="_blank"
            className="bg-blue-500 hover:bg-blue-600 text-white py-2 rounded text-center"
          >
            PlanDay
          </a>
          <a
            href="https://la-mia-mamma-closing.vercel.app/"
            target="_blank"
            className="bg-purple-500 hover:bg-purple-600 text-white py-2 rounded text-center"
          >
            Closing App
          </a>
        </div>
      </div>

      {/* Brands & Locations */}
      <section className="space-y-4 mt-10">
        <h2 className="text-lg font-semibold text-gray-700 text-center">
          Brands & Locations
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {brands.map((brand: any) => (
            <div
              key={brand.slug}
              className="bg-white p-4 rounded-xl shadow text-center hover:shadow-md transition"
            >
              <Image
                src={`/brands/${brand.slug}.png`}
                alt={brand.name}
                width={100}
                height={100}
                className="mx-auto mb-2"
              />
              <h3 className="font-semibold mb-2 text-gray-900">
                {brand.name}
              </h3>

              <div className="flex flex-wrap justify-center gap-2">
                {brand.locations.map((location: any) => (
                  <Link
                    key={location.slug}
                    href={`/locations/${brand.slug}/${location.slug}`}
                    className="bg-blue-100 px-3 py-1 text-sm rounded-full hover:bg-blue-200 transition text-blue-800 font-medium"
                  >
                    {location.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
