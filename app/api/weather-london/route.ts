import { NextResponse } from 'next/server';

export async function GET() {
  // Prefer server-only secret if available
  const apiKey =
    process.env.OPENWEATHER_API_KEY ||
    process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing OPENWEATHER_API_KEY' },
      { status: 500 }
    );
  }

  // Central London coords
  const lat = 51.5074;
  const lon = -0.1278;

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;

    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Upstream weather error', status: res.status },
        { status: 502 }
      );
    }

    const data = await res.json();

    const cleaned = {
      temp: data?.main?.temp ?? 0,
      description: data?.weather?.[0]?.description ?? '',
      icon: data?.weather?.[0]?.icon
        ? `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`
        : '',
    };

    return NextResponse.json(cleaned, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Weather fetch failed', detail: err?.message || '' },
      { status: 500 }
    );
  }
}
