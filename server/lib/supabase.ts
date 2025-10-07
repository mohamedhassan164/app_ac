import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL as string;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE as string;

if (!url || !serviceKey) {
  // eslint-disable-next-line no-console
  console.warn('[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
}

export const supabaseAdmin = url && serviceKey
  ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;
