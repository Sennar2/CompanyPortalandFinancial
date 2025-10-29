"use client";

import { useEffect, useMemo, useState } from "react";
import { LOCATIONS } from "../../data/locations";

type Shift = {
  id: number | string;
  startDateTime?: string;
  endDateTime?: string;
  employeeId?: number | string | null;
  sectionId?: number | string | null;
  positionId?: number | string | null;
  note?: string | null;
};

export default function ShiftsPage() {
  const [loc, setLoc] = useState(LOCATIONS[0]?.id ?? "");
  const [days, setDays] = useState<number>(14);
  const [status, setStatus] = useState<string>("Published");
  const [sectionId, setSectionId] = useState<string>("");
  const [positionId, setPositionId] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);

  const selectedDeptId = useMemo(
    () => LOCATIONS.find(l => l.id === loc)?.plandayDepartmentId ?? "",
    [loc]
  );

  useEffect(() => {
    if (!selectedDeptId) return;
    const controller = new AbortController();

    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + days);

    const params: Record<string, string> = {
      departmentId: selectedDeptId,
      from: from.toISOString(),
      to: to.toISOString(),
    };
    if (status) params.status = status;
    if (sectionId) params.sectionId = sectionId;
    if (positionId) params.positionId = positionId;

    const qs = new URLSearchParams(params);

    setLoading(true);
    setError(null);
    fetch(`/api/planday/shifts?${qs.toString()}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((data) => {
        const list: Shift[] = Array.isArray(data) ? data : (data.items ?? data.data ?? []);
        setShifts(list);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [selectedDeptId, days, status, sectionId, positionId]);

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Shifts</h1>

      <div className="grid md:grid-cols-2 gap-4">
        <label className="flex flex-col">
          <span className="text-sm mb-1">Location</span>
          <select className="border rounded-md p-2" value={loc} onChange={(e) => setLoc(e.target.value)}>
            {LOCATIONS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>

        <label className="flex flex-col">
          <span className="text-sm mb-1">Days ahead</span>
          <input
            className="border rounded-md p-2 w-24"
            type="number"
            min={1}
            max={60}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </label>

        <label className="flex flex-col">
          <span className="text-sm mb-1">Status</span>
          <select className="border rounded-md p-2" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any</option>
            <option value="Published">Published</option>
            <option value="Open">Open</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col">
            <span className="text-sm mb-1">Section ID (optional)</span>
            <input
              className="border rounded-md p-2"
              placeholder="e.g. 1001"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
            />
          </label>
          <label className="flex flex-col">
            <span className="text-sm mb-1">Position ID (optional)</span>
            <input
              className="border rounded-md p-2"
              placeholder="e.g. 2002"
              value={positionId}
              onChange={(e) => setPositionId(e.target.value)}
            />
          </label>
        </div>
      </div>

      {loading && <p>Loading shifts…</p>}
      {error && <p className="text-red-600">Error: {error}</p>}

      <ul className="grid md:grid-cols-2 gap-4">
        {shifts.map((s) => (
          <li key={String(s.id)} className="rounded-2xl shadow p-4">
            <div className="font-medium">
              {s.startDateTime ? new Date(s.startDateTime).toLocaleString() : "Start —"}
              {" → "}
              {s.endDateTime ? new Date(s.endDateTime).toLocaleString() : "— End"}
            </div>
            <div className="text-sm opacity-80">
              Employee: {s.employeeId ?? "Open"} • Section: {s.sectionId ?? "—"} • Position: {s.positionId ?? "—"}
            </div>
            {s.note ? <div className="mt-2 text-sm">{s.note}</div> : null}
          </li>
        ))}
      </ul>

      {!loading && shifts.length === 0 && !error && (
        <p className="opacity-70">No shifts in this window.</p>
      )}
    </main>
  );
}
