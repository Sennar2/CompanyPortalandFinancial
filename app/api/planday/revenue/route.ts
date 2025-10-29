import { NextResponse } from "next/server";
import { plandayFetch } from "@/lib/planday";

type ReqBody = {
  departmentIds: string[];
  date: string; // "YYYY-MM-DD" (today)
};

const pad = (n:number)=>String(n).padStart(2,"0");

// Monday of the same week (UK style: Monday = week start)
function startOfWeekYmd(dateYmd: string) {
  const [y,m,d] = dateYmd.split("-").map(Number);
  const dt = new Date(Date.UTC(y,(m??1)-1,d??1));

  // getUTCDay(): 0=Sun ... 6=Sat
  const dow = dt.getUTCDay();
  const offset = (dow === 0) ? -6 : (1 - dow); // move back to Monday
  dt.setUTCDate(dt.getUTCDate() + offset);

  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth()+1)}-${pad(dt.getUTCDate())}`;
}

// add N days to YYYY-MM-DD
function addDaysYmd(dateYmd: string, delta: number) {
  const [y,m,d] = dateYmd.split("-").map(Number);
  const dt = new Date(Date.UTC(y,(m??1)-1,d??1));
  dt.setUTCDate(dt.getUTCDate()+delta);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth()+1)}-${pad(dt.getUTCDate())}`;
}

// We don't know your tenant's exact revenue endpoint, so try a few common shapes
// and console.log what Planday gives us.
async function tryFetchDailyRevenue(departmentId: string, fromYmd: string, toYmd: string) {
  const candidates = [
    {
      label: "reports.v1.0",
      url: (dep: string) =>
        `/reports/v1.0/revenue?departmentId=${dep}&from=${fromYmd}&to=${toYmd}`,
      pick: (data: any) =>
        Array.isArray(data?.items)
          ? data.items
          : (Array.isArray(data) ? data : data?.data),
    },
    {
      label: "reports.v1",
      url: (dep: string) =>
        `/reports/v1/revenue?departmentId=${dep}&from=${fromYmd}&to=${toYmd}`,
      pick: (data: any) =>
        Array.isArray(data?.items)
          ? data.items
          : (Array.isArray(data) ? data : data?.data),
    },
    {
      label: "dashboard.v1",
      url: (dep: string) =>
        `/dashboard/v1/revenue?departmentId=${dep}&fromDate=${fromYmd}&toDate=${toYmd}`,
      pick: (data: any) =>
        Array.isArray(data?.days)
          ? data.days
          : (Array.isArray(data) ? data : data?.data),
    },
  ];

  for (const cand of candidates) {
    try {
      const endpoint = cand.url(departmentId);
      console.log("[REVENUE FETCH TRY]", {
        dept: departmentId,
        fromYmd,
        toYmd,
        endpoint,
        label: cand.label,
      });

      const raw = await plandayFetch<any>(endpoint);

      console.log("[REVENUE RAW RESPONSE]", {
        label: cand.label,
        endpoint,
        raw,
      });

      const arr = cand.pick(raw);

      console.log("[REVENUE PICKED ARR]", {
        label: cand.label,
        endpoint,
        isArray: Array.isArray(arr),
        length: Array.isArray(arr) ? arr.length : undefined,
        sample: Array.isArray(arr) ? arr[0] : arr,
      });

      if (Array.isArray(arr) && arr.length) {
        return arr;
      }
      if (Array.isArray(arr)) {
        // empty array could still mean "valid call, but 0 revenue"
        return arr;
      }
    } catch (err: any) {
      console.log("[REVENUE FETCH ERROR]", {
        dept: departmentId,
        fromYmd,
        toYmd,
        label: cand.label,
        message: String(err?.message || err),
      });

      // if it's 400 we try next pattern, if it's 403/404/whatever we ALSO keep trying
      continue;
    }
  }

  // If literally nothing matched
  return [];
}

// Reduce the result rows into { date, actual, forecast }
function normaliseRevenueRows(rows: any[]) {
  return rows.map(r => {
    // Try common possible keys
    const date =
      r.date ??
      r.day ??
      r.businessDate ??
      r.business_date ??
      r.BusinessDate ??
      null;

    const actual =
      r.actualRevenue ??
      r.actualSales ??
      r.actual ??
      r.revenue ??
      r.sales ??
      r.dailyRevenue ??
      null;

    const forecast =
      r.forecastRevenue ??
      r.revenueForecast ??
      r.forecast ??
      r.expectedRevenue ??
      r.budget ??
      null;

    return {
      date,
      actual: typeof actual === "number" ? actual : (actual ? parseFloat(actual) : null),
      forecast: typeof forecast === "number" ? forecast : (forecast ? parseFloat(forecast) : null),
    };
  });
}

function moneySum(nums: any[]) {
  return nums.reduce((acc, v) => {
    const n = typeof v === "number" ? v : parseFloat(v ?? "0");
    return acc + (isNaN(n) ? 0 : n);
  }, 0);
}

export async function POST(req: Request) {
  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const { departmentIds, date } = body || {};
  if (!departmentIds?.length || !date) {
    return NextResponse.json(
      { error: "departmentIds[] and date are required" },
      { status: 400 }
    );
  }

  const startOfWeek = startOfWeekYmd(date); // Monday this week
  const tomorrow = addDaysYmd(date, 1);

  try {
    let todayRowsAll: any[] = [];
    let weekRowsAll: any[] = [];

    for (const depId of departmentIds) {
      // today's slice for this department
      const todayRows = await tryFetchDailyRevenue(
        String(depId),
        date,
        tomorrow
      );
      // this week's slice for this department
      const weekRows = await tryFetchDailyRevenue(
        String(depId),
        startOfWeek,
        tomorrow
      );

      todayRowsAll.push(...todayRows);
      weekRowsAll.push(...weekRows);
    }

    // normalise shape
    const todayNorm = normaliseRevenueRows(todayRowsAll);
    const weekNorm = normaliseRevenueRows(weekRowsAll);

    // pick today's entries
    const todays = todayNorm.filter(r => r.date?.startsWith?.(date));
    const todayActualVals = todays.map(r => r.actual).filter(v => v != null);
    const todayForecastVals = todays.map(r => r.forecast).filter(v => v != null);

    // sum the full WTD
    const weekActualVals = weekNorm.map(r => r.actual).filter(v => v != null);
    const weekForecastVals = weekNorm.map(r => r.forecast).filter(v => v != null);

    const payload = {
      todayActual: moneySum(todayActualVals),         // actual £ today
      todayForecast: moneySum(todayForecastVals),     // forecast £ today
      weekActual: moneySum(weekActualVals),           // sum actuals across week
      weekForecast: moneySum(weekForecastVals),       // sum forecasts across week
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message || err) },
      { status: 502 }
    );
  }
}
