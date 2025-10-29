// src/components/financial/FinancialHeader.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type UserRole = "user" | "ops" | "admin" | "operation" | "manager";
type ProfileRow = {
  id: string;
  full_name: string | null;
  role: UserRole;
  home_location: string | null;
};

export default function FinancialHeader() {
  const router = useRouter();
  const pathname = usePathname();

  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  // grab auth + profile (same idea as portal header)
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

        const prof: ProfileRow =
          profRows?.[0] ??
          ({
            id: user.id,
            full_name: (user as any).email ?? null,
            role: "user",
            home_location: null,
          } as ProfileRow);

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

  return (
    <header className="w-full border-b bg-white/90 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3 md:py-4">
        {/* Left side: logo + text */}
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

        {/* Right: admin pill, name/role, logout */}
        <div className="flex items-center gap-3 text-sm">
          {profileLoaded && profile ? (
            <>
              {profile.role === "admin" && pathname !== "/admin" && (
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
    </header>
  );
}
