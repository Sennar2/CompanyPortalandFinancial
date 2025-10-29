// app/api/weather/route.ts
import { NextResponse } from "next/server";

// You can parameterize this with ?city=... if needed.
// For now we'll hardcode a location (e.g. London) to keep it stable.
// Later we can accept query params.
const LAT = "51.5074";
const LON = "-0.1278";

export async function GET() {
  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing WEATHER_API_KEY" },
      { status: 500 }
    );
  }

  try {
    // Example using OpenWeatherMap-style API
    // (Feel free to swap with whatever you're actually using)
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${LAT}&lon=${LON}&units=metric&appid=${apiKey}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Upstream weather error", status: res.status },
        { status: 500 }
      );
    }

    const data = await res.json();

    // Normalize what the client sees
    const cleaned = {
      tempC: data.main?.temp,
      feelsLikeC: data.main?.feels_like,
      condition: data.weather?.[0]?.main,
      description: data.weather?.[0]?.description,
      icon: data.weather?.[0]?.icon, // "10d", etc.
      city: data.name,
    };

    return NextResponse.json(cleaned, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Weather fetch failed", detail: err?.message },
      { status: 500 }
    );
  }
}
