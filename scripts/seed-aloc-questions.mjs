import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.SITE_URL || 'http://localhost:3000';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function main() {
  const { data: subjectRows, error: subjectsError } = await supabase
    .from('wp_subjects')
    .select('name, exam_type');

  if (subjectsError) {
    console.error(subjectsError.message);
    process.exit(1);
  }

  for (const { name, exam_type } of subjectRows ?? []) {
    const response = await fetch(`${baseUrl}/api/aloc?subject=${encodeURIComponent(name)}&exam_type=${encodeURIComponent(exam_type)}`);
    const payload = await response.json().catch(() => ({}));
    console.log(`[seed] ${name} / ${exam_type}: ${response.status} ${payload.inserted ?? 0} inserted`);
    if (!response.ok) {
      console.error(payload.error || 'Unknown error');
    }
  }

  const { data, error } = await supabase.from('wp_questions').select('id', { count: 'exact', head: true });
  if (error) {
    console.error(error.message);
  } else {
    console.log(`[seed] wp_questions contains ${data?.length ?? 0} rows`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
