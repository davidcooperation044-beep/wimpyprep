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

const subjects = ['English', 'Mathematics', 'Physics', 'Biology'];
const examTypes = ['jamb', 'waec'];

async function main() {
  for (const subject of subjects) {
    for (const examType of examTypes) {
      const response = await fetch(`${baseUrl}/api/aloc?subject=${encodeURIComponent(subject)}&exam_type=${encodeURIComponent(examType)}`);
      const payload = await response.json().catch(() => ({}));
      console.log(`[seed] ${subject} / ${examType}: ${response.status} ${payload.inserted ?? 0} inserted`);
      if (!response.ok) {
        console.error(payload.error || 'Unknown error');
      }
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
