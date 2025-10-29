import { NextResponse } from "next/server";
import { plandayFetch } from "@/lib/planday";

type ReqBody = {
  departmentIds: string[];
  date: string;                 // "YYYY-MM-DD"
  status?: string | string[];   // optional; default => ["Published","Open"]
};

const pad = (n: number) => String(n).padStart(2, "0");

// add 1 day to YYYY-MM-DD → returns YYYY-MM-DD
const ymdPlusOne = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

// Generate full-day time ranges to try (different formats Planday accepts)
function buildCandidates(date: string) {
  const next = ymdPlusOne(date);
  return [
    { from: `${date}T00:00:00`, to: `${next}T00:00:00` }, // seconds
    { from: date,               to: next },               // date-only
    { from: `${date}T00:00`,    to: `${next}T00:00` },    // minutes
  ];
}

// Fallback: split the day into 2 half ranges (handles DST weirdness)
function buildHalfDayCandidates(date: string) {
  const next = ymdPlusOne(date);
  return [
    { from: `${date}T00:00:00`, to: `${date}T12:00:00` },
    { from: `${date}T12:00:00`, to: `${next}T00:00:00` },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Paging helpers
// ─────────────────────────────────────────────────────────────────────────────
async function fetchShiftsPage(depId: string, qp: Record<string, string>) {
  const qs = new URLSearchParams({ departmentId: depId, ...qp });
  const data = await plandayFetch<any>(`/scheduling/v1.0/shifts?${qs.toString()}`);

  // Planday sometimes returns { items: [...] } or { data: [...] } or just [...]
  const list = Array.isArray(data) ? data : (data.items ?? data.data ?? []);
  return list.map((s: any) => ({ ...s, _deptId: depId }));
}

async function fetchShiftsAllPages(depId: string, base: Record<string, string>) {
  const patterns = [
    { kind: "limit/offset",  make: (i: number) => ({ ...base, limit: "200", offset: String(i * 200) }) },
    { kind: "page/pageSize", make: (i: number) => ({ ...base, pageSize: "200", page: String(i + 1) }) },
    { kind: "top/skip",      make: (i: number) => ({ ...base, top: "200",  skip: String(i * 200) }) },
    { kind: "take/skip",     make: (i: number) => ({ ...base, take: "200", skip: String(i * 200) }) },
  ];

  for (const p of patterns) {
    const out: any[] = [];
    try {
      for (let i = 0; i < 200; i++) {
        const page = await fetchShiftsPage(depId, p.make(i));
        out.push(...page);
        if (page.length < 200) break;
      }
      return out;
    } catch (e: any) {
      if (!/Planday API 400/i.test(String(e?.message || e))) throw e;
    }
  }

  // fallback: single request
  return fetchShiftsPage(depId, base);
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee name resolution
// returns { [employeeId]: "First Last", ... }
// ─────────────────────────────────────────────────────────────────────────────
async function resolveEmployeeNames(ids: string[]) {
  const out: Record<string, string> = {};
  if (!ids.length) return out;

  // batch first
  try {
    const batch = await plandayFetch<any>(`/hr/v1/Employees?ids=${ids.join(",")}`);
    const arr = Array.isArray(batch) ? batch : (batch.items ?? batch.data ?? []);
    if (Array.isArray(arr)) {
      for (const e of arr) {
        const id = String(e.id);
        const name = [e.firstName, e.lastName].filter(Boolean).join(" ").trim();
        if (id && name) out[id] = name;
      }
    }
  } catch {
    // ignore batch failure, fallback to per-id
  }

  // per-id fallback for anything missing
  const missing = ids.filter((id) => !out[id]);
  if (!missing.length) return out;

  const limit = 6; // mild concurrency
  let i = 0;

  await Promise.all(
    Array.from({ length: limit }).map(async () => {
      while (i < missing.length) {
        const idx = i++;
        const id = missing[idx];
        try {
          const e = await plandayFetch<any>(`/hr/v1/Employees/${id}`);
          const name = [e.firstName, e.lastName].filter(Boolean).join(" ").trim();
          if (name) {
            out[id] = name;
          } else {
            out[id] = `Employee #${id}`;
          }
        } catch {
          out[id] = `Employee #${id}`;
        }
      }
    })
  );

  console.log("[EMPLOYEE_NAME_MAP]", out);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// normalize() → final shape sent to frontend
// Priority for finalName:
// 1. hrResolvedName
// 2. s.employeeName (if it's not just "Employee #12345")
// 3. fallback "Employee #<id>"
// 4. "Open shift"
// ─────────────────────────────────────────────────────────────────────────────
function normalize(shifts: any[], empNames: Record<string, string>) {
  const seen = new Set<string>();
  const out: any[] = [];

  for (const s of shifts) {
    const id = String(s.id ?? "");
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);

    const startISO =
      s.startDateTime ?? s.startUtc ?? s.start ?? s.startTime ?? null;
    const endISO =
      s.endDateTime ?? s.endUtc ?? s.end ?? s.endTime ?? null;

    const empIdStr =
      s.employeeId != null ? String(s.employeeId) : null;

    const plandayGivenName: string | undefined = s.employeeName;
    const hrResolvedName: string | undefined =
      empIdStr ? empNames[empIdStr] : undefined;

    let finalName = "Open shift";

    if (hrResolvedName && hrResolvedName.trim().length > 0) {
      finalName = hrResolvedName.trim();
    } else if (
      plandayGivenName &&
      plandayGivenName.trim().length > 0 &&
      !/^Employee\s*#\d+$/i.test(plandayGivenName.trim())
    ) {
      finalName = plandayGivenName.trim();
    } else if (empIdStr) {
      finalName = `Employee #${empIdStr}`;
    }

    out.push({
      id,
      name: finalName,
      startISO,
      endISO,
      departmentId: s._deptId,
    });
  }

  const missing = out
    .filter(s => /^Employee\s*#\d+$/i.test(s.name) || s.name === 'Open shift')
    .map(s => s);
  console.log("[MISSING_NAMES_DEBUG]", missing);

  return out.sort((a, b) =>
    String(a.startISO ?? "").localeCompare(String(b.startISO ?? ""))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────
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

  const statusIn = body?.status;
  const statuses = Array.isArray(statusIn)
    ? statusIn
    : statusIn
    ? [statusIn]
    : ["Published", "Open"]; // include real + open shifts

  if (!departmentIds?.length || !date) {
    return NextResponse.json(
      { error: "departmentIds[] and date are required" },
      { status: 400 }
    );
  }

  try {
    // 1. First attempt: whole-day ranges
    for (const c of buildCandidates(date)) {
      try {
        const all: any[] = [];

        for (const depId of departmentIds) {
          for (const st of statuses) {
            const base: Record<string, string> = {
              from: c.from,
              to: c.to,
              status: st,
            };
            const items = await fetchShiftsAllPages(String(depId), base);
            all.push(...items);
          }
        }

        const empIds = Array.from(
          new Set(
            all.map((s: any) => s.employeeId).filter(Boolean)
          )
        ).map(String);

        const names = await resolveEmployeeNames(empIds);

        return NextResponse.json(
          { items: normalize(all, names) },
          { status: 200 }
        );
      } catch (e: any) {
        if (!/Planday API 400/i.test(String(e?.message || e))) {
          return NextResponse.json(
            { error: String(e?.message || e) },
            { status: 502 }
          );
        }
        // if 400, try next candidate format
      }
    }

    // 2. Fallback: split-day windows (DST safety)
    const halves = buildHalfDayCandidates(date);
    const all: any[] = [];

    for (const h of halves) {
      for (const depId of departmentIds) {
        for (const st of statuses) {
          const base: Record<string, string> = {
            from: h.from,
            to: h.to,
            status: st,
          };
          const items = await fetchShiftsAllPages(String(depId), base);
          all.push(...items);
        }
      }
    }

    const empIds = Array.from(
      new Set(
        all.map((s: any) => s.employeeId).filter(Boolean)
      )
    ).map(String);
    const names = await resolveEmployeeNames(empIds);

    return NextResponse.json(
      { items: normalize(all, names) },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message || err) },
      { status: 502 }
    );
  }
}
