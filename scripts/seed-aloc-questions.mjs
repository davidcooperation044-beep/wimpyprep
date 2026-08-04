import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile() {
  const envPath = resolve(process.cwd(), '.env.local');
  try {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex === -1) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value.replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {
    // Ignore missing local env file and rely on inherited environment variables.
  }
}

loadEnvFile();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
const delayMs = Number.parseInt(process.env.SEED_DELAY_MS || '400', 10);

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestSeed(subject, examType) {
  const url = new URL(`${siteUrl}/api/aloc`);
  url.searchParams.set('subject', subject || '');
  url.searchParams.set('exam_type', examType || 'jamb');

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url.toString());
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        return { response, payload };
      }

      if (attempt < 4) {
        console.warn(`Seed attempt ${attempt} failed for ${subject}; retrying in ${delayMs}ms`);
        await sleep(delayMs);
      } else {
        return { response, payload };
      }
    } catch (error) {
      if (attempt < 4) {
        console.warn(`Seed attempt ${attempt} errored for ${subject}; retrying in ${delayMs}ms`, error);
        await sleep(delayMs);
      } else {
        throw error;
      }
    }
  }
}

async function main() {
  const { data: subjects, error: subjectError } = await supabase.from('wp_subjects').select('id,name,exam_type');
  if (subjectError) {
    console.error('Failed to load subjects', subjectError);
    process.exit(1);
  }

  let seeded = 0;
  let skipped = 0;

  for (const subject of subjects ?? []) {
    const { count, error: countError } = await supabase
      .from('wp_questions')
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', subject.id);

    if (countError) {
      console.error(`Unable to count questions for ${subject.name}`, countError);
      continue;
    }

    if ((count ?? 0) > 0) {
      skipped += 1;
      continue;
    }

    console.log(`Seeding ${subject.name} (${subject.id})`);
    const { response, payload } = await requestSeed(subject.name, subject.exam_type);

    if (!response.ok) {
      console.error(`Seed failed for ${subject.name}`, payload);
    } else {
      seeded += 1;
      console.log(`Seeded ${subject.name}: ${JSON.stringify(payload)}`);
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const { count: totalCount, error: totalCountError } = await supabase
    .from('wp_questions')
    .select('*', { count: 'exact', head: true });

  if (totalCountError) {
    console.error('Unable to count total questions', totalCountError);
    process.exit(1);
  }

  console.log(`Seed complete. Inserted ${seeded} subjects; skipped ${skipped}; total wp_questions rows ${totalCount ?? 0}`);
}

main().catch((error) => {
  console.error('Seed script failed', error);
  process.exit(1);
});
