// app/api/admin/create-user/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { LOCATIONS as PLANDAY_LOCATIONS } from '@/data/locations';

// helper to read current caller and profile using their cookies
async function getCallerProfile() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // In Next.js 15 route handlers, cookies() is async.
  const cookieStore = await cookies();

  // We forward the access token from the browser session to impersonate caller.
  // NOTE: Supabase JS stores session in client storage, but we’re passing this
  // token manually to identify the caller.
  const accessToken =
    cookieStore.get('sb-access-token')?.value || '';

  const supabase = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return null;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, role, home_location, full_name')
    .eq('id', user.id)
    .limit(1);

  if (!profiles || profiles.length === 0) return null;

  return { user, profile: profiles[0] };
}

export async function POST(req: Request) {
  try {
    // 1. Confirm the caller is logged in AND an admin
    const caller = await getCallerProfile();
    if (!caller || caller.profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. Read body from request
    const body = await req.json();
    const {
      email,
      password,
      full_name,
      role,
      home_location,
    } = body || {};

    // 3. Validate input
    if (!email || !password || !role) {
      return NextResponse.json(
        { error: 'Missing email/password/role' },
        { status: 400 }
      );
    }

    if (!['user', 'ops', 'admin'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }

    if (
      home_location &&
      !PLANDAY_LOCATIONS.find((l) => l.name === home_location)
    ) {
      return NextResponse.json(
        { error: 'Invalid home_location' },
        { status: 400 }
      );
    }

    // 4. Get admin client *lazily at runtime*
    const supabaseAdmin = getSupabaseAdmin();

    // 5. Create the auth user in Supabase
    const { data: newUser, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // they can log in right away
      });

    if (createErr || !newUser?.user) {
      return NextResponse.json(
        { error: createErr?.message || 'Failed to create user' },
        { status: 500 }
      );
    }

    const newUserId = newUser.user.id;

    // 6. Add them to profiles table
    const { error: profErr } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: newUserId,
        full_name: full_name || '',
        role,
        home_location: home_location || null,
      });

    if (profErr) {
      return NextResponse.json(
        { error: profErr.message },
        { status: 500 }
      );
    }

    // 7. Return success
    return NextResponse.json(
      { ok: true, user_id: newUserId },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
