# Deployment

One-year is configured as a Next.js static export. A hosted deployment needs a Supabase project for the current Google sign-in flow and optional entry synchronization.

## 1. Configure Supabase

1. Create or select a Supabase project.
2. Review `supabase/schema.sql` and confirm that its table definition matches the project before applying it.
3. Apply the schema and Row Level Security (RLS) policies in the Supabase SQL Editor.
4. Enable Google in Authentication → Providers and complete the provider's OAuth setup.
5. In Authentication → URL Configuration, add the local development URL and your final production URL to the allowed redirect URLs.

Do not disable RLS on the `entries` table. Do not use a `service_role` key in this browser application.

## 2. Deploy with Vercel

1. Import the GitHub repository into Vercel.
2. Select the Next.js framework preset.
3. Add these environment variables in the Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or the public/publishable client key supported by your Supabase project)
4. Deploy the project.
5. Add the resulting production URL to the Supabase allowed redirect URLs, then redeploy if you changed build-time environment variables.

The Next.js build writes the static site to `out/`. The `postbuild` script updates the service worker's precache list.

## 3. Install on a device

On supported browsers, open the deployed site and use the browser's install or add-to-home-screen option. On iOS, open the site in Safari, tap Share, and choose Add to Home Screen.

## Data and backups

Entry text, mood, date, and plant shape are synced to the configured Supabase project for signed-in users. Photo files remain in the browser's IndexedDB and are not part of cloud sync. The app's ZIP backup includes journal entries and locally stored photos.

Users should export backups regularly. A browser reset, a different browser profile, or a lost device can remove local photos and any data that has not successfully synchronized.
