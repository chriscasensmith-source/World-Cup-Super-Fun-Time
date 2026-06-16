/*
 * World Cup Super Fun Time — runtime config
 * --------------------------------------------------------------------------
 * Paste your Supabase project credentials here to enable a SHARED draft room
 * (each owner drafts from their own phone; picks save to the cloud and sync
 * live across devices). Both values are safe to expose in client code — the
 * anon key is a public key and access is governed by your table's Row Level
 * Security policies (see supabase/schema.sql).
 *
 * Leave these blank to run in LOCAL mode (single device, saved in the browser
 * via localStorage) — everything still works, just without cross-device sync.
 *
 *   Find these in Supabase: Project Settings → API
 *     supabaseUrl     → "Project URL"      e.g. https://abcdwxyz.supabase.co
 *     supabaseAnonKey → "anon public" key
 */
window.WCSFT_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: ""
};
