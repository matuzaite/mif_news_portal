import config from '@/config/portal.config.json';
import { parse } from 'node-html-parser';

// Helper to remove unsafe tags and attributes while keeping formatting
function cleanSafeHtml(html: string): string {
    if (!html) return "";
    const root = parse(html);
    
    // Remove scripts, styles and other unsafe objects
    root.querySelectorAll('script, style, iframe, canvas, svg').forEach(el => el.remove());
    
    // Cleanup all attributes except safe ones
    root.querySelectorAll('*').forEach(el => {
        if (el.tagName.toLowerCase() === 'img') {
            const src = el.getAttribute('src');
            if (src) {
                try {
                    const absoluteUrl = new URL(src, 'https://mif.vu.lt').href;
                    el.setAttribute('src', absoluteUrl);
                } catch (e) {
                    el.remove();
                    return;
                }
            } else {
                el.remove();
                return;
            }
        }

        const attributes = Object.keys(el.attributes);
        attributes.forEach(attr => {
            // Keep href for links, src/alt/width/height for images
            const safeAttrs = ['href', 'src', 'alt', 'width', 'height'];
            if (!safeAttrs.includes(attr)) el.removeAttribute(attr);
        });
    });
    
    return root.innerHTML.trim();
}

// Helper to decode HTML entities and preserve paragraph breaks + safe formatting
function getText(html: string, mainImageUrl?: string): string {
    if (!html) return "";

    const root = parse(html);

    // 2. Jei turime pagrindinės nuotraukos URL, papildomai pašaliname visas kitas, kurios sutampa pagal pavadinimą
    if (mainImageUrl) {
        try {
            const fileName = mainImageUrl.split('/').pop()?.split('.')[0].split('_')[0];
            if (fileName && fileName.length > 3) {
                root.querySelectorAll('img').forEach(img => {
                    const src = img.getAttribute('src');
                    if (src && src.includes(fileName)) {
                        img.remove();
                    }
                });
            }
        } catch (e) {}
    }
    
    // 3. Imame tik tiesioginius vaikus, kurie yra teksto blokai
    // Tai patikimiausias būdas išvengti dubliavimosi ir užtikrinti, kad matome visą turinį
    const blocks = root.childNodes.filter(node => {
        if (node.nodeType !== 1) return false;
        const tag = (node as any).tagName?.toUpperCase();
        return ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'DIV', 'BLOCKQUOTE', 'TABLE', 'IMG', 'FIGURE'].includes(tag);
    });

    if (blocks.length > 0) {
        return blocks
            .map(node => cleanSafeHtml((node as any).outerHTML))
            .filter(t => t.trim().length > 5) 
            .join('\n\n');
    }
    
    return cleanSafeHtml(root.innerHTML);
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
        const resultsRaw = await Promise.allSettled(initialItems.map(async (item) => {
            if (!item.link) {
                return { ...item, description: getText(item.description, item.image) };
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
                        bodyHtml = target.innerHTML;
                        break;
                    }
                }
                
                if (!bodyHtml) return { ...item, description: getText(item.description, item.image) };

                return {
                    ...item,
                    description: getText(bodyHtml, item.image) 
                };
            } catch (e) {
                return { ...item, description: getText(item.description, item.image) };
            }
        }));

        return resultsRaw.map(res => 
            res.status === 'fulfilled' ? res.value : null
        ).filter(Boolean);
    } catch (error) {
        return [];
    }
}
