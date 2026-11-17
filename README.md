# UI Issue Tracker

A small task board shared between a developer and a designer. Each task has an assignee, a status, a priority, links (Figma and Jira links get labelled chips) and pasted screenshots.

- **Hosting:** GitHub Pages (static files only, no build step)
- **Data, login and screenshots:** Supabase free tier
- **Access:** email magic link. Only addresses in the `members` table can see or change anything (enforced by row level security).

## One-time setup

1. **Create a Supabase project:** go to [supabase.com](https://supabase.com), create a new project on the free plan, and pick any region and database password.
2. **Create the tables:** open **SQL Editor → New query** and paste in [`supabase/schema.sql`](supabase/schema.sql). Change the two emails and names at the bottom to yours and the designer's, then **Run**.
3. **Allow sign-in from the site:** in **Authentication → URL Configuration**:
   - Set **Site URL** to the GitHub Pages URL, e.g. `https://<user>.github.io/ui-issue-tracker/`.
   - Add the same URL with `**` on the end under **Redirect URLs**, e.g. `https://<user>.github.io/ui-issue-tracker/**`. The wildcard lets a task link such as `…/?task=UI-12` survive sign-in.
   - Add `http://localhost:8000/**` too if you want to test locally.
4. **Connect the site:** in **Project Settings → API**, copy the **Project URL** and the **anon public** key into [`config.js`](config.js), then commit and push.

The anon key is safe to publish. It only allows what the database rules allow, and those rules only let in the emails in `members`.

## Updates that need a database change

If your board was set up before these existed, run each file in [`supabase/migrations/`](supabase/migrations) once in **SQL Editor**:

- `001_resolution.sql`: lets you add a resolution note and screenshots when marking a task done. Until it's run, ticking a task marks it done straight away as before.

## Adding or removing people

In Supabase, open **Table Editor → members** and add or delete a row. Write the email in lowercase.

## Run locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000/.

## Free-tier limits worth knowing

- **Database:** 500 MB. **File storage:** 1 GB. **Uploads:** 10 MB per screenshot, set in `schema.sql`.
- Supabase **pauses a free project after about a week with no activity**. Your data is kept. Open the project in the Supabase dashboard and click **Restore** to bring it back.
- The built-in email sender has a low hourly limit. That's fine for two people. If the links stop arriving, wait a bit or add your own SMTP under **Authentication → Emails**.

## Backup

In Supabase, go to **Table Editor → issues → Export → CSV**. Screenshots are in **Storage → screenshots**.
