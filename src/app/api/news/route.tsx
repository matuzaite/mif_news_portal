import { NextResponse } from 'next/server';
import { fetchNews } from '@/lib/news';

export const dynamic = 'force-dynamic';

export async function GET() {
    const news = await fetchNews();
    return NextResponse.json(news);
}