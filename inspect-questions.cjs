const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

(async () => {
  const { data: subjects, error: subjErr } = await supabase.from('wp_subjects').select('id,name,exam_type').order('name');
  console.log('subject error', subjErr);
  console.log('subjects', subjects ? subjects.slice(0, 20) : null);

  const { data: userSubjects, error: usErr } = await supabase.from('wp_user_subjects').select('subject_id,exam_type,user_id').limit(5);
  console.log('user subject error', usErr);
  console.log('user subjects', userSubjects);

  const { data: questions, error: qErr } = await supabase.from('wp_questions').select('id,subject_id,question_text,year').limit(10);
  console.log('question error', qErr);
  console.log('questions count', questions ? questions.length : null);
  console.log('sample', questions ? questions.slice(0, 5) : null);
})();
