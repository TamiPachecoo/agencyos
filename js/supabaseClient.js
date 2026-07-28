// Publishable key is safe to expose client-side — access is governed by RLS policies.
const SUPABASE_URL = "https://kndpvdixtlirwgsqvgjh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_IQylTt1QHL3TPk5FJe5UPw_sEGHWMMs";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
