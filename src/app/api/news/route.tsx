import { NextResponse } from 'next/server';

// Helper to decode HTML entities like &nbsp;
function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&nbsp;/g, ' ')
        .replace(/&#160;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&bdquo;/g, '"')
        .replace(/&ldquo;/g, '"')
        .replace(/&rdquo;/g, '"')
        .replace(/&ndash;/g, '–')
        .replace(/&hellip;/g, '...');
}

// Helper to strip tags AND their contents for specific tags like style/script
function cleanHtml(html: string): string {
    if (!html) return "";
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tag AND its content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tag AND its content
        .replace(/<[^>]*>/g, '') // Remove all other tags
        .trim();
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'naujienos';
    const rssUrl = type === 'renginiai'
        ? 'https://mif.vu.lt/lt3/kas-vyksta-fakultete/naujienos/renginiai?format=feed&type=rss'
        : 'https://mif.vu.lt/lt3/kas-vyksta-fakultete/naujienos?format=feed&type=rss';

    try {
        const response = await fetch(rssUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            next: { revalidate: 60 }
        });
        const xml = await response.text();
        const initialItems = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;

        while ((match = itemRegex.exec(xml)) !== null && initialItems.length < 10) {
            const content = match[1];
            const title = content.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || "";
            const link = content.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1] || "";
            const descriptionFull = content.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] || "";

            // SVARBU: Ištraukiam nuotrauką
            const imgMatch = descriptionFull.match(/src="([^"]+\.(?:jpg|png|jpeg|webp))"/i);
            let image = imgMatch ? imgMatch[1] : "";
            if (image && !image.startsWith('http')) {
                image = `https://mif.vu.lt${image}`;
            }
            if (!image) {
                image = "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=1600";
            }

            const pubDate = content.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";
            const date = pubDate ? new Date(pubDate).toLocaleDateString('lt-LT') : "Šiandien";

            initialItems.push({
                id: Math.random().toString(),
                title: decodeHtmlEntities(title.trim()),
                link: link.trim(),
                image,
                date,
                category: type === 'renginiai' ? 'Renginys' : 'Naujiena',
                description: descriptionFull // Temporary
            });
        }

        // Fetch full content for the first 8 items
        const items = await Promise.all(initialItems.map(async (item, index) => {
            if (index >= 8 || !item.link) return { ...item, description: decodeHtmlEntities(cleanHtml(item.description)) };

            try {
                const articleRes = await fetch(item.link, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                const html = await articleRes.text();

                // Advanced Article Body Selection
                const bodyMatch = html.match(/<div itemprop="articleBody">([\s\S]*?)<\/div>/i) 
                               || html.match(/<section[^>]*itemprop="articleBody">([\s\S]*?)<\/section>/i)
                               || html.match(/<div class="item-page">([\s\S]*?)<\/div>/i);
                
                const bodyHtml = bodyMatch ? bodyMatch[1] : item.description;

                // Ultra-Robust Paragraph Extraction
                let normalized = bodyHtml.replace(/<(?:div|section|li|h[1-6]|br)[^>]*>/gi, '<p>');
                const rawChunks = normalized.split(/<p[^>]*>/i);
                const paragraphs: string[] = [];
                
                for (const chunk of rawChunks) {
                    const cleanText = decodeHtmlEntities(cleanHtml(chunk));
                    if (cleanText.length > 20) {
                        paragraphs.push(cleanText);
                    }
                }

                if (paragraphs.length === 1 && paragraphs[0].length > 400) {
                    const singleBlock = paragraphs[0];
                    const sentences = singleBlock.match(/[^.!?]+[.!?]+(?=\s|$)/g);
                    if (sentences && sentences.length > 3) {
                        paragraphs.length = 0;
                        paragraphs.push(sentences.slice(0, 2).join(' '));
                        paragraphs.push(sentences.slice(2).join(' '));
                    }
                }

                if (paragraphs.length === 0) {
                    const plain = decodeHtmlEntities(cleanHtml(bodyHtml));
                    if (plain) paragraphs.push(plain);
                }

                return {
                    ...item,
                    description: paragraphs.join('\n\n')
                };
            } catch (e) {
                return { ...item, description: decodeHtmlEntities(cleanHtml(item.description)) };
            }
        }));

        return NextResponse.json(items);
    } catch (error) {
        return NextResponse.json([]);
    }
}