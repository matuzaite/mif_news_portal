import config from '@/config/portal.config.json';
import { parse } from 'node-html-parser';

// Helper to decode HTML entities and clean text
// Helper to remove unsafe tags and attributes while keeping formatting
function cleanSafeHtml(html: string): string {
    if (!html) return "";
    const root = parse(html);
    
    // Remove scripts, styles and other unsafe objects
    root.querySelectorAll('script, style, iframe, canvas, svg, img').forEach(el => el.remove());
    
    // Cleanup all attributes except safe ones
    root.querySelectorAll('*').forEach(el => {
        const attributes = Object.keys(el.attributes);
        attributes.forEach(attr => {
            // Keep href for links and nothing else for now
            if (attr !== 'href') el.removeAttribute(attr);
        });
    });
    
    return root.innerHTML.trim();
}

// Helper to decode HTML entities and preserve paragraph breaks + safe formatting
function getText(html: string): string {
    if (!html) return "";
    const root = parse(html);
    
    // Hard breaks: between P tags, headers, or separate lists
    const blocks = root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, ul, ol');
    if (blocks.length > 0) {
        return blocks
            .map(el => cleanSafeHtml(el.innerHTML))
            .filter(t => t.length > 5) // Ignore very short fragments
            .join('\n\n');
    }
    
    return cleanSafeHtml(html);
}

// Helper to strip tags AND their contents for specific tags like style/script
function cleanBodyHtml(html: string): string {
    if (!html) return "";
    const root = parse(html);
    
    // Remove scripts and styles
    root.querySelectorAll('script, style').forEach(el => el.remove());
    
    return root.toString();
}

export async function fetchNews() {
    const rssUrl = config.feeds.naujienos;

    try {
        const response = await fetch(rssUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            cache: 'no-store',
            next: { revalidate: 0 }
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
            const imgTags = descRoot.querySelectorAll('img');
            let image = "";

            for (const img of imgTags) {
                const src = img.getAttribute('src');
                if (!src) continue;

                try {
                    // Resolve relative paths correctly
                    const absoluteUrl = new URL(src, 'https://mif.vu.lt').href;

                    // Ensure it's a valid image file
                    if (/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(absoluteUrl)) {
                        image = absoluteUrl;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!image) {
                image = config.ui.placeholderImage;
            }

            const pubDate = item.querySelector('pubDate')?.text || "";
            const date = new Date(pubDate && !isNaN(Date.parse(pubDate)) ? pubDate : Date.now()).toLocaleDateString('lt-LT');

            initialItems.push({
                id: link.trim() || Math.random().toString(),
                title: getText(title),
                link: link.trim(),
                image,
                date,
                category: 'Naujiena',
                description: descriptionFull
            });
        }

        // Fetch full content for all items using allSettled for reliability
        const resultsRaw = await Promise.allSettled(initialItems.map(async (item, index) => {
            if (!item.link) {
                return { ...item, description: getText(item.description) };
            }

            try {
                const articleRes = await fetch(item.link, { 
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    cache: 'no-store',
                    next: { revalidate: 0 }
                });
                const html = await articleRes.text();
                const articleRoot = parse(html);

                // Advanced Article Body Selection from Config
                let bodyHtml = "";
                for (const selector of config.scraping.selectors) {
                    const target = articleRoot.querySelector(selector);
                    if (target) {
                        bodyHtml = cleanBodyHtml(target.innerHTML);
                        break;
                    }
                }
                
                if (!bodyHtml) return { ...item, description: getText(item.description) };

                return {
                    ...item,
                    description: getText(bodyHtml) // Use our improved getText which now handles blocks
                };
            } catch (e) {
                return { ...item, description: getText(item.description) };
            }
        }));

        return resultsRaw.map(res => 
            res.status === 'fulfilled' ? res.value : null
        ).filter(Boolean);
    } catch (error) {
        return [];
    }
}
