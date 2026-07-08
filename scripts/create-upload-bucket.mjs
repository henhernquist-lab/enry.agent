// One-off setup script — creates the 'user-uploads' Supabase Storage bucket.
// Run once: node scripts/create-upload-bucket.mjs
// Safe to re-run — no-ops if the bucket already exists.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Load .env.local manually — this script runs outside Next.js's env loading.
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const BUCKET = 'user-uploads'

const { data: existing } = await supabase.storage.getBucket(BUCKET)
if (existing) {
  console.log(`Bucket "${BUCKET}" already exists — nothing to do.`)
  process.exit(0)
}

const { error } = await supabase.storage.createBucket(BUCKET, {
  public: false,
  fileSizeLimit: '10MB',
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'text/markdown'],
})

if (error) {
  console.error('Failed to create bucket:', error)
  process.exit(1)
}

console.log(`Created private bucket "${BUCKET}" (10MB limit, image/pdf/text MIME types).`)
