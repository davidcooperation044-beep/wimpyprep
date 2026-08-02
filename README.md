# WimpyPrep

A mobile-first Next.js app for JAMB and WAEC exam prep with practice mode, mock exams, AI weak-area targeting hooks, and Supabase-backed data models.

## Getting started

1. Install dependencies with `npm install`.
2. Create a `.env.local` file and provide:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `ALOC_ACCESS_TOKEN`
3. Run `npm run dev`.

## Included pieces

- Design-system-inspired landing experience with a signature progress ring concept
- Practice mode and mock exam flow
- API routes for ALOC ingestion and WimpyAI weak-area targeting
- Supabase migrations for the wp_ schema with RLS
