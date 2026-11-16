// Fill these in from Supabase → Project Settings → API.
// The anon key is meant to be public; the database rules in supabase/schema.sql
// make sure only the emails in the members table can see or change anything.
window.TRACKER_CONFIG = {
  supabaseUrl: "https://lpdntsktgwpbinwtjeyc.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwZG50c2t0Z3dwYmlud3RqZXljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4MzE0NjYsImV4cCI6MjExMDQwNzQ2Nn0.tA4w5s10-Lbse-r2KPJK5OCZ-LKrw4Qnwak5Iv49LOo",
  keyPrefix: "UI", // task IDs look like UI-12
};
