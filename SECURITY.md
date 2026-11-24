# Security Policy

## Reporting a vulnerability

Please do not disclose security vulnerabilities in a public issue.

Use GitHub's private vulnerability reporting feature for this repository when it is enabled. Otherwise, contact the repository owner privately through GitHub.

## Important security notes for self-hosting

- Never commit `.env.local`, `.env.production`, or other files containing real environment values.
- Never expose a Supabase `service_role` key in a browser application. The client must use only the public anon/publishable key.
- Enable Row Level Security (RLS) on the Supabase `entries` table and restrict every operation to rows where `user_id = auth.uid()`.
- Configure OAuth redirect URLs for the exact development and production origins you use.
- Do not use real journal entries or personal photos in bug reports or automated tests.
