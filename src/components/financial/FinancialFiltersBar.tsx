'use client';

import React from 'react';

type FinancialFiltersBarProps = {
  allowedLocations: string[];
  location: string;
  setLocation: React.Dispatch<React.SetStateAction<string>>;
  period: string;
  setPeriod: React.Dispatch<React.SetStateAction<string>>;
  PERIODS: string[];
};

export default function FinancialFiltersBar({
  allowedLocations,
  location,
  setLocation,
  period,
  setPeriod,
  PERIODS,
}: FinancialFiltersBarProps) {
  return (
    <section className="w-full bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-4 flex flex-col gap-4">
        {/* Title & helper line */}
        <div className="text-left">
          <h1 className="text-base font-semibold text-gray-900 leading-tight">
            Financial Performance
          </h1>
          <p className="text-[12px] text-gray-500 leading-tight">
            Select your location and view
          </p>
        </div>

        {/* Filter card */}
        <div className="bg-gray-50/60 border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row md:items-end md:justify-start gap-6 text-sm">
          {/* Location picker */}
          <div className="flex flex-col items-start">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Location
            </span>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-[220px] rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {allowedLocations.map((loc) => (
                <option key={loc}>{loc}</option>
              ))}
            </select>
          </div>

          {/* View picker */}
          <div className="flex flex-col items-start">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              View
            </span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-[140px] rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {PERIODS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </section>
  );
}