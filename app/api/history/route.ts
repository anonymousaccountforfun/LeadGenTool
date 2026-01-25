import { NextResponse } from 'next/server';
import { getSearchHistory, initDb } from '@/lib/db';

export async function GET() {
  try {
    await initDb();
    const history = await getSearchHistory(20);
    return NextResponse.json({ history });
  } catch (error) {
    console.error('Failed to fetch search history:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
