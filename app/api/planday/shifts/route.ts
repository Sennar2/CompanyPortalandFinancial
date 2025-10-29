import { NextResponse } from "next/server";
import { plandayFetch } from "@/lib/planday";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const departmentId = searchParams.get("departmentId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const status = searchParams.get("status");
  const sectionId = searchParams.get("sectionId");
  const positionId = searchParams.get("positionId");

  if (!departmentId) {
    return NextResponse.json({ error: "Missing departmentId" }, { status: 400 });
  }

  const qs = new URLSearchParams();
  qs.set("departmentId", departmentId);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (status) qs.set("status", status);
  if (sectionId) qs.set("sectionId", sectionId);
  if (positionId) qs.set("positionId", positionId);

  try {
    const data = await plandayFetch<any>(`/scheduling/v1.0/shifts?${qs.toString()}`);
    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
