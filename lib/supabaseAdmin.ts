// lib/supabaseAdmin.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// IMPORTANT: do not create the client at import time.
// Vercel's build step tries to evaluate modules early, and if env vars
// aren't injected at build-time, it will crash.
// Instead we export a function that lazily creates the admin client
// at request time (runtime), where env vars are guaranteed.

let cachedAdminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedAdminClient) return cachedAdminClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    // We throw here ONLY if someone actually tries to use the admin client
    // without proper env. This will NOT run during static build.
    throw new Error('Missing Supabase service env vars');
  }

  cachedAdminClient = createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedAdminClient;
}
