# One-year — Сад дней

**A privacy-conscious daily journal that turns a year of entries into a growing visual garden.**

One-year is a Progressive Web App (PWA) built around a simple idea: write one entry for each day, record how you felt, and watch a small illustrated plant become part of your personal garden.

The interface currently supports **Russian, English, and Spanish**.

> **Project status:** Early-stage, maintained primarily by its creator. Features and documentation are still evolving.

## Features

- **One entry per day** — write a short reflection, add a mood rating, or attach photos.
- **A visual year garden** — each saved day is represented by a plant illustration; the selected mood influences its color.
- **Daily timeline and memory feed** — revisit previous entries and browse a chronological feed.
- **Photo attachments** — add up to five photos to an entry. Images are resized and compressed in the browser before being stored locally.
- **Local data storage** — journal text and settings are stored in the browser; photo files are stored in IndexedDB.
- **Optional account-backed sync** — when signed in, entry text, date, mood, and plant shape are synchronized with Supabase. Photos remain on the device and are included in local backup files, not cloud sync.
- **Backup and restore** — export entries and photos together as a ZIP archive and import a backup later.
- **Progressive Web App** — installable on supported devices, with a service worker that caches application assets for offline access.
- **Accessibility and preferences** — mood color palette options, multiple plant palettes, responsive layouts, and reduced-motion support.

## Screenshots

Product screenshots will be added here once a public demo is available. The repository currently includes application icons, but not representative in-app screenshots.

## Technology

- [Next.js](https://nextjs.org/) and [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Supabase](https://supabase.com/) for authentication, optional entry sync, and realtime updates
- Browser Local Storage and IndexedDB for local data
- Node.js test runner and `fake-indexeddb` for automated tests

## Getting started

### Requirements

- Node.js **20.9 or newer**
- npm
- A Supabase project if you want to use Google sign-in and cloud synchronization

### 1. Clone and install

```bash
git clone https://github.com/kozimbek-narziqulo/One-year.git
cd One-year
npm install
```

### 2. Configure environment variables

Copy the example file and add the public client settings from your Supabase project:

```bash
cp .env.example .env.local
```

Set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or the public/publishable client key supported by your Supabase project)

These values are exposed to the browser by design. **Never put a Supabase `service_role` key, database password, or other privileged secret in a `NEXT_PUBLIC_*` variable or in this repository.**

### 3. Configure Supabase

The current app uses Google OAuth and an `entries` table. Review [`supabase/schema.sql`](supabase/schema.sql) and apply the schema and Row Level Security (RLS) policies to your own Supabase project.

In Supabase, configure Google as an authentication provider and add your local and production URLs to the allowed redirect URLs. Do not disable RLS on user data.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Quality checks

```bash
npm run typecheck
npm test
npm run build
```

The build uses Next.js static export. The `postbuild` script prepares the service worker's precache list in the generated `out/` directory.

## Data and privacy

- Entry text, mood, date, and plant shape are stored in browser storage and, for signed-in users, synchronized to the configured Supabase project.
- Photo files are stored in the browser's IndexedDB. They are not uploaded by the current cloud-sync implementation.
- ZIP backups can contain journal text and personal photos. Store backup files carefully and do not attach real personal entries or photos to public issues.
- Clearing browser data, using a different browser profile, or switching devices can remove or separate local data. Export a backup regularly.
- The Supabase project owner is responsible for access control, OAuth configuration, backups, and data-retention settings.

## Contributing

Bug reports, usability feedback, documentation improvements, and focused pull requests are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before contributing and never include personal journal entries, photos, or credentials in issues or pull requests.

## Security

Please see [`SECURITY.md`](SECURITY.md) for security guidance and responsible vulnerability reporting.

## License

This project is licensed under the [MIT License](LICENSE).
