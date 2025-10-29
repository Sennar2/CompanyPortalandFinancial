'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { LOCATIONS as PLANDAY_LOCATIONS } from '@/data/locations';

type UserRole = 'user' | 'ops' | 'admin';
type ProfileRow = {
  id: string;
  full_name: string | null;
  role: UserRole;
  home_location: string | null;
};

export default function ResourcesAdminPage() {
  const router = useRouter();

  // auth / role
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loaded, setLoaded] = useState(false);

  // upload form state
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('');
  const [location, setLocation] = useState('');
  const [link, setLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // 1. check auth + role = admin
  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: profRows } = await supabase
        .from('profiles')
        .select('id, full_name, role, home_location')
        .eq('id', user.id)
        .limit(1);

      const prof = profRows?.[0] as ProfileRow | undefined;

      if (!prof || prof.role !== 'admin') {
        // not admin? back to main dashboard
        router.push('/');
        return;
      }

      setProfile(prof);
      setLoaded(true);
    })();
  }, [router]);

  // 2. handle save
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !link) {
        setMessage('Please include at least a Title + Link');
        return;
    }

    setSaving(true);
    setMessage('');

    try {
      const { error } = await supabase
        .from('resources')
        .insert({
          title,
          brand,
          location,
          link,
        });

      if (error) {
        setMessage(`Error: ${error.message}`);
      } else {
        setMessage('✅ Saved!');
        // clear form
        setTitle('');
        setBrand('');
        setLocation('');
        setLink('');
      }
    } catch (err: any) {
      setMessage(`Error: ${String(err?.message || err)}`);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded || !profile) {
    return (
      <main className="p-6 max-w-3xl mx-auto bg-gray-50 text-center">
        <div className="animate-pulse text-gray-500 text-sm">
          Loading Resources Admin…
        </div>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-3xl mx-auto bg-gray-50 space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-800">
          Resources Admin
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Logged in as {profile.full_name || 'Unknown'} · {profile.role.toUpperCase()}
        </p>

        <p className="text-[11px] text-gray-400 mt-2">
          Upload SOP / guides / docs links for teams.
        </p>
      </div>

      {/* Upload form */}
      <section className="bg-white p-4 rounded-xl shadow border border-gray-200">
        <form
          onSubmit={handleSubmit}
          className="space-y-4 text-sm text-gray-700"
        >
          <div>
            <label className="block font-semibold mb-1">
              Title *
            </label>
            <input
              className="w-full border rounded px-3 py-2 text-gray-800"
              placeholder="e.g. FOH Opening Checklist"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">
                Brand / Concept
              </label>
              <input
                className="w-full border rounded px-3 py-2 text-gray-800"
                placeholder="La Mia Mamma / Fish & Bubbles / etc."
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">
                Location (optional)
              </label>
              <select
                className="w-full border rounded px-3 py-2 text-gray-800"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              >
                <option value="">All locations</option>
                {PLANDAY_LOCATIONS.map((loc) => (
                  <option key={loc.name} value={loc.name}>
                    {loc.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Pick one site if this doc is site-specific
              </p>
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">
              Link / URL to the doc *
            </label>
            <input
              className="w-full border rounded px-3 py-2 text-gray-800"
              placeholder="https://drive.google.com/..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
              required
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Paste Google Drive / Notion / PDF link etc.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className={`w-full md:w-auto inline-block rounded bg-indigo-600 text-white font-semibold px-4 py-2 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed`}
          >
            {saving ? 'Saving…' : 'Save Resource'}
          </button>

          {message && (
            <div className="text-xs mt-2 text-center md:text-left text-gray-700">
              {message}
            </div>
          )}
        </form>
      </section>

      <div className="text-center">
        <a
          className="text-xs text-indigo-600 underline hover:text-indigo-800"
          href="/admin"
        >
          ← Back to Admin panel
        </a>
      </div>
    </main>
  );
}
