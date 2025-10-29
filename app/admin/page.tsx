'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

// Type definitions for the profile row in Supabase
type UserRole = 'user' | 'ops' | 'admin';

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: UserRole;
  home_location: string | null;
};

export default function AdminHomePage() {
  const router = useRouter();

  // Profile state
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      // 1. Check if there's an authenticated user
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      if (!user) {
        // not logged in -> go to /login
        router.push('/login');
        return;
      }

      // 2. Load their profile (role, name, etc.)
      const { data: profRows } = await supabase
        .from('profiles')
        .select('id, full_name, role, home_location')
        .eq('id', user.id)
        .limit(1);

      const prof = profRows?.[0] as ProfileRow | undefined;

      // 3. Only admins are allowed to see this page
      if (!prof || prof.role !== 'admin') {
        router.push('/');
        return;
      }

      setProfile(prof);
      setLoaded(true);
    })();
  }, [router]);

  // While we don't yet know if this is an admin, don't flash the content.
  if (!loaded || !profile) {
    return (
      <main className="p-6 max-w-4xl mx-auto bg-gray-50 text-center">
        <div className="animate-pulse text-gray-500 text-sm">
          Loading admin panel…
        </div>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-4xl mx-auto bg-gray-50 space-y-8">
      {/* Page header */}
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-800">
          Admin Control Panel
        </h1>

        <p className="text-sm text-gray-500 mt-1">
          Logged in as {profile.full_name || 'Unknown'} ·{' '}
          {profile.role.toUpperCase()}
        </p>

        <p className="text-[11px] text-gray-400 mt-2">
          Use this panel to manage people access and the documents that
          teams see in the portal.
        </p>
      </div>

      {/* Admin cards */}
      <section className="bg-white p-4 rounded-xl shadow border border-gray-200 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* User Management card */}
          <Link
            href="/admin/users"
            className="block rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 transition p-4 text-center"
          >
            <div className="text-red-800 font-semibold flex flex-col items-center">
              <div className="text-lg leading-none mb-1">
                👤 User Management
              </div>
              <div className="text-[11px] font-normal text-red-700">
                Create staff accounts, assign locations & roles
              </div>
            </div>
          </Link>

          {/* Resources Admin card */}
          <Link
            href="/admin/resources"
            className="block rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition p-4 text-center"
          >
            <div className="text-indigo-800 font-semibold flex flex-col items-center">
              <div className="text-lg leading-none mb-1">
                📄 Resources Admin
              </div>
              <div className="text-[11px] font-normal text-indigo-700">
                Upload SOP / guides / docs for teams
              </div>
            </div>
          </Link>
        </div>
      </section>

      <p className="text-[11px] text-center text-gray-400">
        Only admins can view this page.
      </p>

      <div className="text-center">
        <Link
          href="/"
          className="text-xs text-indigo-600 underline hover:text-indigo-800"
        >
          ← Back to Dashboard
        </Link>
      </div>
    </main>
  );
}
