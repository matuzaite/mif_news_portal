import { NextResponse } from 'next/server';
import { fetchNews } from '@/lib/news';

export const dynamic = 'force-dynamic'; // Ensures the API always gets fresh data

export async function GET() {
    try {
        const news = await fetchNews();
        return NextResponse.json(news);
    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json([]);
    }
}