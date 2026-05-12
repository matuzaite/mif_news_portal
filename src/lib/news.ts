import config from '@/config/portal.config.json';
import { parse } from 'node-html-parser';

// 1. Išmanus dublikatų atpažinimas (ignoruojant dydžių galūnes, pvz., _380, -150x150, arba tiesiog skaičius gale)
function isDuplicateImage(imgSrc: string, mainImgUrl: string): boolean {
    if (!imgSrc || !mainImgUrl) return false;
    
    const getCoreName = (url: string) => {
        // Pašaliname double slashes ir kitus URL nesutapimus
        const normalizedUrl = url.replace(/([^:])\/\//g, '$1/');
        const fileWithExt = normalizedUrl.split('/').pop()?.split('?')[0].toLowerCase() || '';
        const noExt = fileWithExt.substring(0, fileWithExt.lastIndexOf('.')) || fileWithExt;
        // Pašaliname galūnes: .380, _380, -380, arba tiesiog skaičius gale (pvz. pasauli380 -> pasauli)
        return noExt.replace(/[._-]?\d+x\d+$/, '').replace(/[._-]?\d+$/, '').replace(/[._-](large|small|thumb|medium)$/, '');
    };

    const coreSrc = getCoreName(imgSrc);
    const coreMain = getCoreName(mainImgUrl);

    return (coreSrc === coreMain || coreSrc.includes(coreMain) || coreMain.includes(coreSrc)) && coreSrc.length > 3;
}

// 2. Saugus HTML valymas: palieka galerijas, bet ištrina pagrindinę nuotrauką
function cleanSafeHtml(html: string, mainImageUrl: string): string {
    if (!html) return "";
    const root = parse(html);
    
    // Ištriname TIK kenkėjiškus tagus, bet PALIEKAME img
    root.querySelectorAll('script, style, iframe, canvas, svg').forEach(el => el.remove());
    
    // Filtruojame nuotraukas
    const allImages = root.querySelectorAll('img');
    allImages.forEach((img, index) => {
        const src = img.getAttribute('src') || '';
        const dataSrc = img.getAttribute('data-src') || '';
        const srcset = img.getAttribute('srcset') || '';
        const allSources = `${src} ${dataSrc} ${srcset}`.toLowerCase();
        
        // TAISYKLĖ: 
        // 1. Pirma nuotrauka straipsnyje beveik visada yra pagrindinė - triname ją besąlygiškai.
        // 2. Kitas nuotraukas tikriname pagal pavadinimą.
        if (index === 0 || !src || isDuplicateImage(allSources, mainImageUrl)) {
            img.remove();
        } else {
            // Jei tai galerijos nuotrauka - paliekame ir sutvarkome atributus
            const finalSrc = dataSrc || src;
            if (finalSrc) {
                try {
                    const absoluteUrl = new URL(finalSrc, 'https://mif.vu.lt').href;
                    img.setAttribute('src', absoluteUrl);
                } catch (e) {
                    img.setAttribute('src', finalSrc);
                }
            }
            
            const allowedAttr = ['src', 'alt'];
            Object.keys(img.attributes).forEach(attr => {
                if (!allowedAttr.includes(attr)) img.removeAttribute(attr);
            });
        }
    });

    // Išvalome atributus visiems kitiems elementams
    root.querySelectorAll('*').forEach(el => {
        if (el.tagName.toLowerCase() !== 'img') {
            const attributes = Object.keys(el.attributes);
            attributes.forEach(attr => {
                if (attr !== 'href') el.removeAttribute(attr);
            });
        }
    });
    
    return root.innerHTML.trim();
}

// 3. Teksto ir likusių nuotraukų blokų ištraukimas
function getText(html: string, mainImageUrl: string): string {
    if (!html) return "";
    
    // Išvalome HTML ir pašaliname dublikatą
    const cleanedHtml = cleanSafeHtml(html, mainImageUrl);
    const root = parse(cleanedHtml);
    
    // Ieškome blokų (pridėtas 'figure' ir '.gallery', kad galerijos nedingtų)
    const blocks = root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, ul, ol, figure, .gallery, table, blockquote');
    
    if (blocks.length > 0) {
        return blocks
            .map(el => el.outerHTML) 
            .filter(t => {
                const text = t.replace(/<[^>]*>?/gm, '').trim();
                return text.length > 0 || t.includes('<img');
            }) 
            .join('\n\n');
    }
    
    return cleanedHtml;
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
                title: getText(title, ""),
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
