"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// we keep the props you were already passing from financial.js
// so financial.js does NOT need to change.
export default function FinancialHeader({
  profile: profileFromPage,
  onSignOut,
  allowedLocations,
  location,
  setLocation,
  period,
  setPeriod,
  PERIODS,
}) {
  const router = useRouter();
  const pathname = usePathname();

  // We’re going to align with the portal header behavior:
  // it fetches a lightweight profile itself for display in the bar.
  // BUT we also accept profileFromPage from financial.js and prefer that if present,
  // so we don't flicker.
  const [profileLoaded, setProfileLoaded] = useState(
    !!profileFromPage
  );
  const [profile, setProfile] = useState(profileFromPage || null);

  // Load profile if not provided yet
  useEffect(() => {
    if (profileFromPage) {
      setProfile(profileFromPage);
      setProfileLoaded(true);
      return;
    }

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
          .from("profiles")
          .select("id, full_name, role, home_location")
          .eq("id", user.id)
          .limit(1);

        const prof =
          profRows?.[0] ??
          ({
            id: user.id,
            full_name: user.email ?? null,
            role: "user",
            home_location: null,
          });

        setProfile(prof);
      } catch {
        setProfile(null);
      } finally {
        setProfileLoaded(true);
      }
    })();
  }, [profileFromPage]);

  async function handleLogout() {
    // use the passed onSignOut if available (financial.js signs out & pushes /login)
    if (onSignOut) {
      await onSignOut();
      return;
    }
    // fallback: behave like portal header
    await supabase.auth.signOut();
    router.push("/login");
  }

  // role to decide Admin Panel pill
  const roleForUi = profile?.role || "";
  const showAdminPill =
    roleForUi === "admin" && pathname !== "/admin";

  return (
    <header className="w-full bg-white/90 backdrop-blur-sm border-b sticky top-0 z-50">
      {/* ROW 1: matches the company portal header bar */}
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3 md:py-4">
        {/* Left: Logo + portal name -> link to "/" */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="La Mia Mamma"
              width={40}
              height={40}
              className="rounded-sm object-contain"
            />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-gray-900">
                La Mia Mamma Portal
              </span>
              <span className="text-[11px] text-gray-500 -mt-0.5">
                Staff Access
              </span>
            </div>
          </Link>
        </div>

        {/* Right: user info / admin pill / logout */}
        <div className="flex items-center gap-3 text-sm">
          {profileLoaded && profile ? (
            <>
              {showAdminPill && (
                <Link
                  href="/admin"
                  className="hidden sm:inline-block rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[12px] font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                >
                  Admin Panel
                </Link>
              )}

              <div className="text-right leading-tight hidden sm:block">
                <div className="text-gray-900 font-medium text-[13px] truncate max-w-[140px]">
                  {profile.full_name || "User"}
                </div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wide">
                  {profile.role}
                </div>
              </div>

              <button
                onClick={handleLogout}
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

      {/* ROW 2: Financial controls (location/brand + period) */}
      <div className="max-w-7xl mx-auto px-4 pb-4 flex flex-col md:flex-row md:items-end gap-4 md:gap-8">
        {/* Location / Brand selector */}
        <div className="flex flex-col">
          <label className="text-[12px] font-semibold text-gray-700 mb-1">
            Select Location / Brand
          </label>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 shadow-sm min-w-[220px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {allowedLocations?.map((loc) => (
              <option key={loc} value={loc}>
                {loc === "GroupOverview" ? "Group Overview" : loc}
              </option>
            ))}
          </select>
        </div>

        {/* Period selector */}
        <div className="flex flex-col">
          <label className="text-[12px] font-semibold text-gray-700 mb-1">
            Select Period
          </label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 shadow-sm min-w-[140px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {PERIODS?.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}