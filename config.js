// Fill these in from Supabase → Project Settings → API.
// The anon key is meant to be public; the database rules in supabase/schema.sql
// make sure only the emails in the members table can see or change anything.
window.TRACKER_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  keyPrefix: "UI", // task IDs look like UI-12
};
