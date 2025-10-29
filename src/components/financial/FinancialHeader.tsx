'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

// We'll keep this local. We don't rely on the page for user info,
// but the page *does* pass down filters + logout handler.
type ProfileRowForHeader = {
  full_name: string | null;
  role: string | null;
};

type FinancialHeaderProps = {
  allowedLocations: string[];
  location: string;
  setLocation: React.Dispatch<React.SetStateAction<string>>;
  period: string;
  setPeriod: React.Dispatch<React.SetStateAction<string>>;
  PERIODS: string[];
  handleSignOut: () => Promise<void>;
};

export default function FinancialHeader({
  allowedLocations,
  location,
  setLocation,
  period,
  setPeriod,
  PERIODS,
  handleSignOut,
}: FinancialHeaderProps) {
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profile, setProfile] = useState<ProfileRowForHeader | null>(null);

  // grab minimal profile for header (name/role)
  useEffect(() => {
    (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        if (!user) {
          setProfileLoaded(true);
          setProfile(null);
          return;
        }

        const { data: profRows } = await supabase
          .from('profiles')
          .select('full_name, role')
          .eq('id', user.id)
          .limit(1);

        const prof: ProfileRowForHeader = profRows?.[0]
          ? {
              full_name: profRows[0].full_name ?? user.email ?? null,
              role: profRows[0].role ?? 'user',
            }
          : {
              full_name: (user as any).email ?? null,
              role: 'user',
            };

        setProfile(prof);
      } catch {
        setProfile(null);
      } finally {
        setProfileLoaded(true);
      }
    })();
  }, []);

  const roleLower = (profile?.role || '').toLowerCase();
  const isAdmin = roleLower === 'admin';

  return (
    <header className="w-full bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-6">
        {/* ROW 1: Brand / title on the left, user box on the right */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          {/* Left side: logo + portal titles */}
          <div className="flex items-start gap-3">
            <Link href="/" className="flex-shrink-0 flex items-start">
              <Image
                src="/logo.png"
                alt="La Mia Mamma"
                width={40}
                height={40}
                className="rounded-sm object-contain"
              />
            </Link>

            <div className="leading-tight">
              <Link href="/" className="text-sm font-semibold text-gray-900 hover:underline">
                La Mia Mamma Portal
              </Link>
              <div className="text-[11px] text-gray-500 -mt-0.5">
                Financial Performance
              </div>
            </div>
          </div>

          {/* Right side: profile + admin panel + logout */}
          <div className="flex items-center gap-3 text-sm flex-shrink-0 flex-wrap md:flex-nowrap">
            {profileLoaded && profile ? (
              <>
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[12px] font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                  >
                    Admin Panel
                  </Link>
                )}

                <div className="text-right leading-tight">
                  <div className="text-gray-900 font-medium text-[13px] truncate max-w-[140px]">
                    {profile.full_name || 'User'}
                  </div>
                  <div className="text-[11px] text-gray-500 uppercase tracking-wide">
                    {profile.role || 'USER'}
                  </div>
                </div>

                <button
                  onClick={handleSignOut}
                  className="rounded-md bg-gray-900 text-white text-[12px] font-semibold px-3 py-1.5 hover:bg-black transition"
                >
                  Log out
                </button>
              </>
            ) : profileLoaded && !profile ? (
              <Link
                href="/login"
                className="rounded-md bg-blue-600 text-white text-[12px] font-semibold px-3 py-1.5 hover:bg-blue-700 transition"
              >
                Sign in
              </Link>
            ) : (
              <div className="h-[30px] w-[80px] bg-gray-200 rounded animate-pulse" />
            )}
          </div>
        </div>

        {/* ROW 2: Filters block */}
        <div className="bg-gray-50/60 border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row md:items-end md:justify-center gap-6 text-sm">
          {/* Location */}
          <div className="flex flex-col items-start md:items-start">
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

          {/* Period / View */}
          <div className="flex flex-col items-start md:items-start">
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
    </header>
  );
}
