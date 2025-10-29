// scripts/generate-locations.mjs
// Usage: node scripts/generate-locations.mjs
// Reads Departments from Planday and writes data/locations.ts

import fs from "node:fs";
import path from "node:path";

// ---- config/env
const CLIENT_ID = process.env.PLANDAY_CLIENT_ID;
const REFRESH_TOKEN = process.env.PLANDAY_REFRESH_TOKEN;
if (!CLIENT_ID || !REFRESH_TOKEN) {
  console.error("Missing PLANDAY_CLIENT_ID or PLANDAY_REFRESH_TOKEN in .env.local");
  process.exit(1);
}

const TOKEN_URL = "https://id.planday.com/connect/token";
const API_BASE  = "https://openapi.planday.com";

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")     // drop punctuation
    .trim()
    .replace(/\s+/g, "-")         // spaces -> dashes
    .replace(/-+/g, "-");         // collapse dashes
}

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: REFRESH_TOKEN,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${txt}`);
  }
  const json = await res.json();
  return json.access_token;
}

async function planday(pathname) {
  const access = await getAccessToken();
  const res = await fetch(`${API_BASE}${pathname}`, {
    headers: {
      Authorization: `Bearer ${access}`,
      "X-ClientId": CLIENT_ID,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Planday ${res.status} for ${pathname}: ${txt}`);
  }
  return res.json();
}

async function fetchAllDepartments() {
  const out = [];
  let offset = 0;
  const limit = 200;

  while (true) {
    const qs = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    const data = await planday(`/hr/v1/Departments?${qs.toString()}`);

    const items = Array.isArray(data) ? data : (data.items ?? data.data ?? []);
    if (!Array.isArray(items)) {
      throw new Error("Unexpected Departments response shape");
    }

    out.push(...items.map(d => ({ id: String(d.id), name: d.name })));

    // stop if fewer than limit items (or zero) were returned
    if (items.length < limit) break;
    offset += limit;
  }

  // de-dup by id (defensive)
  const seen = new Set();
  return out.filter(d => (seen.has(d.id) ? false : (seen.add(d.id), true)));
}

function emitLocationsTs(departments) {
  departments.sort((a, b) => a.name.localeCompare(b.name));

  // ensure unique slugs
  const slugCount = new Map();
  const rows = departments.map(d => {
    let slug = slugify(d.name);
    const n = (slugCount.get(slug) ?? 0) + 1;
    slugCount.set(slug, n);
    if (n > 1) slug = `${slug}-${n}`;
    return `  { id: "${slug}", name: "${d.name.replace(/"/g, '\\"')}", plandayDepartmentId: "${d.id}" }`;
  });

  return `export type LocationOption = {
  id: string;
  name: string;
  plandayDepartmentId: string;
};

export const LOCATIONS: LocationOption[] = [
${rows.join(",\n")}
];
`;
}

async function main() {
  console.log("Fetching departments from Planday…");
  const departments = await fetchAllDepartments();
  console.log(`Found ${departments.length} departments.`);

  const content = emitLocationsTs(departments);

  const outPath = path.join(process.cwd(), "data", "locations.ts");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, "utf8");

  console.log(`Wrote ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
