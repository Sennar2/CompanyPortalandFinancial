"use client";

import { useEffect, useState } from "react";

type WeatherData = {
  tempC: number;
  feelsLikeC: number;
  condition: string;
  description: string;
  icon: string;
  city: string;
};

export default function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/weather");
        if (!res.ok) {
          const problem = await res.json().catch(() => null);
          setError(
            problem?.error || `Request failed with ${res.status}`
          );
          return;
        }
        const data = await res.json();
        setWeather(data);
      } catch (err: any) {
        setError(err?.message || "Failed to load weather");
      }
    }
    load();
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        Weather unavailable: {error}
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
        Loading weather…
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xl font-semibold leading-none">
            {Math.round(weather.tempC)}°C
          </div>
          <div className="text-sm text-muted-foreground">
            {weather.condition} • feels {Math.round(weather.feelsLikeC)}°C
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {weather.city}
          </div>
        </div>

        {/* basic icon from OpenWeatherMap's icon codes */}
        {weather.icon ? (
          <img
            src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
            alt={weather.description}
            className="h-12 w-12"
          />
        ) : null}
      </div>

      <div className="text-xs text-muted-foreground mt-2">
        {weather.description}
      </div>
    </div>
  );
}
