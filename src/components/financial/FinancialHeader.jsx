"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import "../app/globals.css";

export default function FinancialHeader() {
  const router = useRouter();
  const pathname = usePathname();

  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profile, setProfile] = useState(null);

  // This mirrors the portal header logic
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
          .from("profiles")
          .select("id, full_name, role, home_location")
          .eq("id", user.id)
          .limit(1);

        // fallback profile if not found
        const prof =
          profRows?.[0] ?? {
            id: user.id,
            full_name: user.email ?? null,
            role: "user",
            home_location: null,
          };

        setProfile(prof);
      } catch {
        setProfile(null);
      } finally {
        setProfileLoaded(true);
      }
    })();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const showAdminPill =
    profile?.role === "admin" && pathname !== "/admin";

  return (
    <header className="w-full border-b bg-white/90 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3 md:py-4">
        {/* LEFT: Logo + portal name */}
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

        {/* RIGHT: Admin Panel pill / user block / logout */}
        <div className="flex items-center gap-3 text-sm">
          {profileLoaded && profile ? (
            <>
              {/* Admin Panel pill (only if admin and not on /admin) */}
              {showAdminPill && (
                <Link
                  href="/admin"
                  className="hidden sm:inline-block rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[12px] font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                >
                  Admin Panel
                </Link>
              )}

              {/* Name + role */}
              <div className="text-right leading-tight hidden sm:block">
                <div className="text-gray-900 font-medium text-[13px] truncate max-w-[140px]">
                  {profile.full_name || "User"}
                </div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wide">
                  {profile.role}
                </div>
              </div>

              {/* Logout button */}
              <button
                onClick={handleLogout}
                className="rounded-md bg-gray-900 text-white text-[12px] font-semibold px-3 py-1.5 hover:bg-black transition"
              >
                Log out
              </button>
            </>
          ) : profileLoaded && !profile ? (
            // not logged in
            <Link
              href="/login"
              className="rounded-md bg-blue-600 text-white text-[12px] font-semibold px-3 py-1.5 hover:bg-blue-700 transition"
            >
              Sign in
            </Link>
          ) : (
            // loading shimmer
            <div className="h-[30px] w-[80px] bg-gray-200 rounded animate-pulse" />
          )}
        </div>
      </div>
    </header>
  );
}