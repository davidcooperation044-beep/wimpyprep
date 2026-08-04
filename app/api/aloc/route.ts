import { NextResponse } from 'next/server';
import { ingestQuestionsForSubject } from '../../../lib/aloc-ingestion';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subject = searchParams.get('subject') || 'English';
  const examType = searchParams.get('exam_type') || 'jamb';
  const result = await ingestQuestionsForSubject(subject, examType);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ inserted: result.inserted, subject, examType, skipped: Boolean(result.skipped) });
}
