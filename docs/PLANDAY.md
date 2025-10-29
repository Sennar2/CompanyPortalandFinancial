# Planday integration (read-only)

This folder overlays the repo with a Planday connection:

- `lib/planday.ts` — exchanges the Refresh Token for an Access Token and wraps `fetch` with required headers (`Authorization` + `X-ClientId`).
- `app/api/planday/shifts/route.ts` — Next.js API route proxy to Planday Scheduling API. Supports `departmentId`, `from`, `to`, `status`, and optional `sectionId`, `positionId`.
- `app/shifts/page.tsx` — Simple UI to browse shifts for a chosen Department (your "Location"), optional Section/Position filters.
- `data/locations.ts` — Map your internal "locations" to Planday Department IDs.

## Setup

1. In Planday, create/authorize an API app with **read scheduling** access and copy:
   - **App Id** → `PLANDAY_CLIENT_ID`
   - **Token** (long-lived) → `PLANDAY_REFRESH_TOKEN`

2. Create `.env.local` in the project root:

```
PLANDAY_CLIENT_ID=cb580c36-c060-420b-b317-c04d5a24cab9
PLANDAY_REFRESH_TOKEN=your_refresh_token_here
```

3. Update `data/locations.ts` with your real Department IDs.

4. Run your dev server and open `/shifts`.

## Notes

- The API route calls `GET /scheduling/v1.0/shifts` with your query params.
- Responses are not cached server-side; Planday rate-limit headers are preserved in errors to aid debugging.
