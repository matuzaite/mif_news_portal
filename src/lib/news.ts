import config from '@/config/portal.config.json';
import { parse } from 'node-html-parser';

// Funkcija, kuri padeda atpažinti ar nuotraukos priklauso tam pačiam "šaltiniui"
// Joomla dažnai sukuria skirtingus failus tam pačiam vaizdui (pvz. img_abc123.jpg ir img_xyz789.jpg)
function isSameVisual(url1: string, url2: string): boolean {
    if (!url1 || !url2) return false;
    const getBase = (u: string) => {
        const parts = u.split('/').pop()?.split('?')[0].split('.')[0] || '';
        // Nulupame tipines galūnes, bet paliekame esmę
        return parts.toLowerCase().replace(/[-_](thumb|small|medium|large|150x150|380x\d+)$/, '').split('_')[0];
    };
    const b1 = getBase(url1);
    const b2 = getBase(url2);
    return b1 === b2 && b1.length > 3;
}

function processContent(html: string, fallbackImg: string) {
    if (!html) return { cleanedHtml: "", mainImage: fallbackImg };
    const root = parse(html);

    // 1. Išvalome šiukšles
    root.querySelectorAll('script, style, iframe, canvas, svg').forEach(el => el.remove());

    let mainImage = fallbackImg;
    const allImgs = root.querySelectorAll('img');

    if (allImgs.length > 0) {
        // Ieškome geriausios nuotraukos (ne thumbnailo) kairiajam ekranui
        let bestImgTag = allImgs[0];
        for (const img of allImgs) {
            const s = img.getAttribute('src') || '';
            if (!s.includes('thumb') && !s.includes('150x')) {
                bestImgTag = img;
                break;
            }
        }

        const rawSrc = bestImgTag.getAttribute('src') || bestImgTag.getAttribute('data-src') || '';
        if (rawSrc) {
            try { mainImage = new URL(rawSrc, 'https://mif.vu.lt').href; } 
            catch(e) { mainImage = rawSrc; }
        }

        // 2. DUBLIKATŲ NAIKINIMAS: Ištriname VISAS nuotraukas iš teksto, 
        // kurios vizualiai sutampa su pagrindine (išsprendžia "triple clones" problemą)
        root.querySelectorAll('img').forEach(img => {
            const s = img.getAttribute('src') || img.getAttribute('data-src') || '';
            if (isSameVisual(s, mainImage) || s === rawSrc) {
                // Sunaikiname visą rėmą (picture/figure/p), kad neliktų skylių
                let target = img as any;
                if (target.parentNode?.tagName?.toLowerCase() === 'picture') target = target.parentNode;
                if (target.parentNode?.tagName?.toLowerCase() === 'figure') target = target.parentNode;
                if (target.parentNode?.tagName?.toLowerCase() === 'a') target = target.parentNode;
                
                // Jei tėvinis elementas yra tuščias (tik ši foto), triname jį visą
                const parent = target.parentNode;
                if (parent && parent.textContent.trim().length === 0) {
                    parent.remove();
                } else {
                    target.remove();
                }
            }
        });
    }

    // Sutvarkome likusias galerijos nuotraukas
    root.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || img.getAttribute('data-src');
        if (src && !src.startsWith('http')) {
            try { img.setAttribute('src', new URL(src, 'https://mif.vu.lt').href); } catch(e) {}
        }
    });

    return { cleanedHtml: root.innerHTML.trim(), mainImage };
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
            const link = item.querySelector('link')?.text || "";
            const title = item.querySelector('title')?.text || "";
            const pubDate = item.querySelector('pubDate')?.text || "";
            const date = new Date(pubDate && !isNaN(Date.parse(pubDate)) ? pubDate : Date.now()).toLocaleDateString('lt-LT');

            initialItems.push({
                id: link.trim() || Math.random().toString(),
                title: title.replace(/<[^>]*>?/gm, '').trim(),
                link: link.trim(),
                date,
                category: 'Naujiena',
                description: item.querySelector('description')?.innerHTML || ""
            });
        }

        const resultsRaw = await Promise.allSettled(initialItems.map(async (item) => {
            try {
                const articleRes = await fetch(item.link, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
                const html = await articleRes.text();
                const articleRoot = parse(html);

                let bodyHtml = "";
                for (const selector of config.scraping.selectors) {
                    const target = articleRoot.querySelector(selector);
                    if (target) { bodyHtml = target.innerHTML; break; }
                }

                // Jei straipsnyje nėra turinio, naudojame RSS aprašymą
                const contentToProcess = bodyHtml || item.description;
                const processed = processContent(contentToProcess, config.ui.placeholderImage);

                return { ...item, image: processed.mainImage, description: processed.cleanedHtml };
            } catch (e) {
                const processed = processContent(item.description, config.ui.placeholderImage);
                return { ...item, image: processed.mainImage, description: processed.cleanedHtml };
            }
        }));

        return resultsRaw.map(res => res.status === 'fulfilled' ? res.value : null).filter(Boolean);
    } catch (error) {
        return [];
    }
}
