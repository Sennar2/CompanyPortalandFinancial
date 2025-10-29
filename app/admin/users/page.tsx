'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { LOCATIONS as PLANDAY_LOCATIONS } from '@/data/locations';

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: 'user' | 'ops' | 'admin';
  home_location: string | null;
  created_at: string;
};

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [errList, setErrList] = useState<string | null>(null);

  // form state
  const [newEmail, setNewEmail] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'ops' | 'admin'>('user');
  const [newHomeLoc, setNewHomeLoc] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  // load profiles
  useEffect(() => {
    (async () => {
      setLoadingList(true);
      setErrList(null);

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, role, home_location, created_at')
          .order('created_at', { ascending: false });

        if (error) {
          setErrList(error.message);
        } else {
          setProfiles(data || []);
        }
      } catch (err: any) {
        setErrList(String(err?.message || err));
      }

      setLoadingList(false);
    })();
  }, []);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateMsg(null);

    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail,
          password: newPass,
          full_name: newName,
          role: newRole,
          home_location: newHomeLoc || null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        console.error('Create user error:', json);
        setCreateMsg('Error: ' + (json.error || 'Unable to create'));
      } else {
        setCreateMsg('✅ User created!');

        // optimistic append? we could refetch; let's just refetch quickly:
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, role, home_location, created_at')
          .order('created_at', { ascending: false });

        setProfiles(data || []);

        // clear form
        setNewEmail('');
        setNewPass('');
        setNewName('');
        setNewRole('user');
        setNewHomeLoc('');
      }
    } catch (err: any) {
      setCreateMsg('Error: ' + String(err?.message || err));
    }

    setCreating(false);
  }

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">
            Admin &mdash; User Management
          </h1>
          <p className="text-sm text-gray-500">
            Create staff accounts, assign locations, control access
          </p>
        </div>

        <a
          href="/"
          className="text-sm text-blue-600 underline hover:text-blue-800"
        >
          ⬅ Back to Dashboard
        </a>
      </header>

      {/* Create User Form */}
      <section className="bg-white border border-gray-200 rounded-xl shadow p-4">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">
          Add New User
        </h2>

        <form
          onSubmit={handleCreateUser}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm"
        >
          <div className="flex flex-col">
            <label className="font-medium text-gray-700 mb-1">Full Name</label>
            <input
              className="border rounded-lg px-3 py-2"
              placeholder="Mario Rossi"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col">
            <label className="font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="border rounded-lg px-3 py-2"
              placeholder="mario@lamiamamma.co.uk"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col">
            <label className="font-medium text-gray-700 mb-1">Temp Password</label>
            <input
              type="text"
              className="border rounded-lg px-3 py-2"
              placeholder="Set temporary password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              required
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Tell the user to change it after first login.
            </p>
          </div>

          <div className="flex flex-col">
            <label className="font-medium text-gray-700 mb-1">
              Role / Access Level
            </label>
            <select
              className="border rounded-lg px-3 py-2"
              value={newRole}
              onChange={(e) =>
                setNewRole(e.target.value as 'user' | 'ops' | 'admin')
              }
            >
              <option value="user">General User (only home location)</option>
              <option value="ops">Operations (all locations)</option>
              <option value="admin">Admin (all + admin panel)</option>
            </select>
          </div>

          <div className="flex flex-col md:col-span-2">
            <label className="font-medium text-gray-700 mb-1">Home Location</label>
            <select
              className="border rounded-lg px-3 py-2"
              value={newHomeLoc}
              onChange={(e) => setNewHomeLoc(e.target.value)}
              required={newRole === 'user'}
            >
              <option value="">
                {newRole === 'user'
                  ? 'Select location (required for General User)'
                  : 'Select location (optional for Ops/Admin)'}
              </option>
              {PLANDAY_LOCATIONS.map((loc) => (
                <option key={loc.id} value={loc.name}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={creating}
              className={`px-4 py-2 rounded-lg text-white text-sm font-semibold transition
                ${creating ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}
              `}
            >
              {creating ? 'Creating…' : 'Create User'}
            </button>

            {createMsg && <p className="text-sm">{createMsg}</p>}
          </div>
        </form>
      </section>

      {/* User list */}
      <section className="bg-white border border-gray-200 rounded-xl shadow p-4">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">
          Existing Users
        </h2>

        {loadingList ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : errList ? (
          <p className="text-sm text-red-600">{errList}</p>
        ) : profiles.length === 0 ? (
          <p className="text-sm text-gray-500">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left bg-gray-100 text-gray-700">
                  <th className="py-2 px-3 font-medium">Name</th>
                  <th className="py-2 px-3 font-medium">Role</th>
                  <th className="py-2 px-3 font-medium">Home Location</th>
                  <th className="py-2 px-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {profiles.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 px-3">
                      <div className="font-semibold text-gray-800">
                        {p.full_name || '(no name)'}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {p.id}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-block px-2 py-1 rounded text-[11px] font-medium ${
                          p.role === 'admin'
                            ? 'bg-red-100 text-red-700'
                            : p.role === 'ops'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {p.role}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-700">
                      {p.home_location || '—'}
                    </td>
                    <td className="py-2 px-3 text-gray-500">
                      {new Date(p.created_at).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-gray-400 mt-4 leading-snug">
          Coming soon: edit role, move location, deactivate user.
        </p>
      </section>
    </main>
  );
}
