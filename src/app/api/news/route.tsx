import { NextResponse } from 'next/server';
import config from '@/config/portal.config.json';
export const dynamic = 'force-dynamic';
import { parse } from 'node-html-parser';

// Helper to decode HTML entities and clean text
function getText(html: string): string {
    if (!html) return "";
    const root = parse(html);
    return root.structuredText.trim();
}

// Helper to strip tags AND their contents for specific tags like style/script
function cleanBodyHtml(html: string): string {
    if (!html) return "";
    const root = parse(html);
    
    // Remove scripts and styles
    root.querySelectorAll('script, style').forEach(el => el.remove());
    
    return root.toString();
}

// Helper to check if a URL looks like a valid image
function isImage(url: string): boolean {
    if (!url || url.length < 5) return false;
    // Reject URLs that end in a slash (likely directories/pages)
    if (url.endsWith('/')) return false;
    
    const cleanUrl = url.split('?')[0].toLowerCase();
    return cleanUrl.endsWith('.jpg') || 
           cleanUrl.endsWith('.jpeg') || 
           cleanUrl.endsWith('.png') || 
           cleanUrl.endsWith('.gif') || 
           cleanUrl.endsWith('.webp') || 
           cleanUrl.endsWith('.svg') ||
           url.includes('images.unsplash.com') ||
           url.includes('data:image/');
}

export async function GET(request: Request) {
    // Load from config
    const rssUrl = config.feeds.naujienos;

    try {
        const response = await fetch(rssUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            cache: 'no-store'
        });
        const xmlText = await response.text();
        const root = parse(xmlText, { lowerCaseTagName: true });
        
        const items = root.querySelectorAll('item');
        const initialItems = [];

        for (let i = 0; i < Math.min(items.length, config.scraping.maxItems); i++) {
            const item = items[i];
            const title = item.querySelector('title')?.text || "";
            const link = item.querySelector('link')?.text || "";
            
            // Extract raw description and handle CDATA manually if the parser leaves it in
            let descriptionFull = item.querySelector('description')?.innerHTML || "";
            if (descriptionFull.includes('<![CDATA[')) {
                descriptionFull = descriptionFull.split('<![CDATA[').join('').split(']]>').join('');
            }

            // Find image
            const descRoot = parse(descriptionFull);
            const imgTag = descRoot.querySelector('img');
            let image = imgTag?.getAttribute('src') || "";

            if (image && !image.startsWith('http')) {
                const baseUrl = 'https://mif.vu.lt';
                image = image.startsWith('/') ? `${baseUrl}${image}` : `${baseUrl}/${image}`;
                image = image.replace('://', '@@@').split('//').join('/').replace('@@@', '://');
            }
            
            if (!isImage(image)) {
                console.log(`[API] Invalid image URL detected, using placeholder: "${image}"`);
                image = config.ui.placeholderImage;
            } else {
                console.log(`[API] Valid image URL: "${image}"`);
            }

            const pubDate = item.querySelector('pubDate')?.text || "";
            const date = new Date(pubDate && !isNaN(Date.parse(pubDate)) ? pubDate : Date.now()).toLocaleDateString('lt-LT');

            initialItems.push({
                id: Math.random().toString(),
                title: getText(title),
                link: link.trim(),
                image,
                date,
                category: 'Naujiena',
                description: descriptionFull
            });
        }

        // Fetch full content for the first 5 items
        const results = await Promise.all(initialItems.map(async (item, index) => {
            if (index >= 5 || !item.link) {
                return { ...item, description: getText(item.description) };
            }

            try {
                const articleRes = await fetch(item.link, { 
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    cache: 'no-store'
                });
                const html = await articleRes.text();
                const articleRoot = parse(html);

                // Advanced Article Body Selection from Config
                let bodyHtml = "";
                for (const selector of config.scraping.selectors) {
                    // Try class match
                    const target = articleRoot.querySelector(`.${selector.replace('.', '')}`) 
                                || articleRoot.querySelector(`[itemprop="articleBody"]`);
                    
                    if (target) {
                        bodyHtml = cleanBodyHtml(target.innerHTML);
                        break;
                    }
                }
                
                if (!bodyHtml) bodyHtml = item.description;

                const bodyRoot = parse(bodyHtml);
                const paragraphs: string[] = [];
                
                // Select common block elements that might contain text
                const elements = bodyRoot.querySelectorAll('p, div, li, section, h1, h2, h3, h4, h5, h6');
                
                for (const el of elements) {
                    const text = el.structuredText.trim();
                    // Skip containers if they have other block-level descendants that we'll catch anyway
                    const hasBlockChildren = el.querySelector('p, div, li, h1, h2, h3, h4, h5, h6') !== null;
                    
                    if (text.length > 20 && !hasBlockChildren && !paragraphs.some(p => p.includes(text))) {
                        paragraphs.push(text);
                    }
                }

                // If no paragraphs found, fallback to full text
                if (paragraphs.length === 0) {
                    const plain = getText(bodyHtml);
                    if (plain) paragraphs.push(plain);
                }

                // Split long single blocks if needed (minimal logic)
                if (paragraphs.length === 1 && paragraphs[0].length > 400) {
                    const fullText = paragraphs[0];
                    const mid = Math.floor(fullText.length / 2);
                    const splitPos = fullText.indexOf('. ', mid);
                    if (splitPos !== -1) {
                        paragraphs[0] = fullText.substring(0, splitPos + 1).trim();
                        paragraphs.push(fullText.substring(splitPos + 1).trim());
                    }
                }

                return {
                    ...item,
                    description: paragraphs.slice(0, 10).join('\n\n') // Limit to 10 paragraphs
                };
            } catch (e) {
                return { ...item, description: getText(item.description) };
            }
        }));

        return NextResponse.json(results);
    } catch (error) {
        return NextResponse.json([]);
    }
}