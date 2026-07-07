// One-time migration script — inserts the 20 prompts from src/lib/seed-prompts.ts
// into the `resources` table as type='prompt', source='featured'.
//
// Prereqs (must run first, see migration SQL):
//   ALTER TABLE resources ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user';
//
// Usage: node --env-file=.env.local --experimental-strip-types scripts/seed-featured-prompts.mjs
//
// Safe to re-run: skips any seed prompt whose title already exists as a
// source='featured' row for this user.

import { createClient } from '@supabase/supabase-js'

const OWNER_EMAIL = process.env.OWNER_EMAIL
if (!OWNER_EMAIL) {
  console.error('OWNER_EMAIL not set in .env.local')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const { default: SEED_PROMPTS } = await import('../src/lib/seed-prompts.ts')

const { data: profile, error: profileErr } = await supabase
  .from('profiles')
  .select('id')
  .eq('email', OWNER_EMAIL)
  .single()

if (profileErr || !profile) {
  console.error('Could not find profile for', OWNER_EMAIL, profileErr)
  process.exit(1)
}

const { data: existing } = await supabase
  .from('resources')
  .select('title')
  .eq('user_id', profile.id)
  .eq('type', 'prompt')
  .eq('source', 'featured')

const existingTitles = new Set((existing ?? []).map((r) => r.title))

let inserted = 0
let skipped = 0

for (const p of SEED_PROMPTS) {
  if (existingTitles.has(p.title)) {
    skipped++
    continue
  }

  const { error } = await supabase.from('resources').insert({
    user_id: profile.id,
    type: 'prompt',
    source: 'featured',
    title: p.title.slice(0, 200),
    payload: {
      body: p.body,
      category: p.category,
      tags: p.tags,
      notes: p.notes || undefined,
    },
  })

  if (error) {
    console.error('Failed to insert', p.title, error)
    continue
  }
  inserted++
}

console.log(`Done. Inserted ${inserted}, skipped ${skipped} (already present).`)
