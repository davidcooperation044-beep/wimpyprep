import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    focusList: ['Algebra', 'Grammar', 'Physics'],
    message: 'WimpyAI weak-area targeting is wired to the shared service contract pattern.',
  });
}
