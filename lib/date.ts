// lib/date.ts

// Build a Date object shifted into a specific IANA timezone (without using external libs).
// We do this by: take the UTC timestamp, then get the parts in that timezone using Intl.
function getPartsInZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date).reduce<Record<string,string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});

  // parts looks like { year: "2025", month: "10", day: "25", hour: "09", minute: "30", second: "00" }
  return {
    year: Number(parts.year),
    month: Number(parts.month), // 1-12
    day: Number(parts.day),     // 1-31
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

// Returns YYYY-MM-DD for a given ISO date string, interpreted in Europe/London time.
export function toLondonDateKey(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  const { year, month, day } = getPartsInZone(d, "Europe/London");
  // pad month/day
  const mm = month < 10 ? `0${month}` : String(month);
  const dd = day < 10 ? `0${day}` : String(day);
  return `${year}-${mm}-${dd}`; // e.g. "2025-10-25"
}

// Get today's key in London
export function todayLondonKey(): string {
  return toLondonDateKey(new Date());
}

// Get tomorrow's key in London
export function tomorrowLondonKey(): string {
  const now = new Date();
  // create a real "tomorrow at 00:00 London time" by taking today's London Y-M-D and adding 1 day
  const { year, month, day } = getPartsInZone(now, "Europe/London");
  // JS Date uses monthIndex 0-11
  const tomorrowDate = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return toLondonDateKey(tomorrowDate);
}
