import config from '@/config/portal.config.json';
import { parse } from 'node-html-parser';

// 1. Išmanus dublikatų atpažinimas (Labai tikslus pavadinimų ištraukėjas)
function isDuplicateImage(imgSrc: string, mainImgUrl: string): boolean {
    if (!imgSrc || !mainImgUrl) return false;
    
    const getCoreName = (url: string) => {
        try { url = decodeURIComponent(url); } catch(e) {}
        const normalizedUrl = url.replace(/([^:])\/\//g, '$1/');
        const fileWithExt = normalizedUrl.split('/').pop()?.split('?')[0].toLowerCase() || '';
        const noExt = fileWithExt.substring(0, fileWithExt.lastIndexOf('.')) || fileWithExt;
        // Tiksliai pašaliname tik TVS pridedamas galūnes, o ne bet kokius skaičius
        return noExt.replace(/([._-]?\d+x\d+|[._-]?\d+|[._-](large|small|thumb|medium))$/, '');
    };

    const coreSrc = getCoreName(imgSrc);
    const coreMain = getCoreName(mainImgUrl);

    // Reikalaujame tikslaus pavadinimo (be galūnių) atitikimo
    return coreSrc === coreMain && coreSrc.length > 3;
}

// 2. Saugus HTML valymas: palieka galerijas ir trina TIK tikrus dublikatus
function cleanSafeHtml(html: string, mainImageUrl: string): string {
    if (!html) return "";
    const root = parse(html);
    
    // Ištriname kenkėjiškus tagus
    root.querySelectorAll('script, style, iframe, canvas, svg').forEach(el => el.remove());
    
    // Filtruojame nuotraukas
    const allImages = root.querySelectorAll('img');
    allImages.forEach((img) => {
        const src = img.getAttribute('src') || '';
        const dataSrc = img.getAttribute('data-src') || '';
        const srcset = img.getAttribute('srcset') || '';
        
        let isDup = false;
        
        // Tikriname KIEKVIENĄ atributą atskirai (tai ištaiso tų dviejų paskutinių straipsnių klaidą)
        if (src && isDuplicateImage(src, mainImageUrl)) isDup = true;
        if (dataSrc && isDuplicateImage(dataSrc, mainImageUrl)) isDup = true;
        
        // Jei yra srcset, jis gali telkti kelis url atskirtus kableliais
        if (srcset) {
            const srcsetUrls = srcset.split(',').map(s => s.trim().split(' ')[0]);
            if (srcsetUrls.some(u => isDuplicateImage(u, mainImageUrl))) {
                isDup = true;
            }
        }
        
        if (isDup) {
            // Tai tikras dublikatas – naikiname jį ir jo rėmelius
            let parent = img.parentNode;
            if (parent && ['picture', 'figure'].includes(parent.tagName.toLowerCase())) {
                parent.remove();
            } else {
                img.remove();
            }
        } else {
            // TAI YRA GALERIJOS NUOTRAUKA! Paliekame ją ramybėje ir suformatuojame, kad veiktų TV.
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

// 3. Teksto ištraukimas
function getText(html: string, mainImageUrl: string): string {
    if (!html) return "";
    
    const cleanedHtml = cleanSafeHtml(html, mainImageUrl);
    const root = parse(cleanedHtml);
    
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
            
            let descriptionFull = item.querySelector('description')?.innerHTML || "";
            if (descriptionFull.includes('<![CDATA[')) {
                descriptionFull = descriptionFull.split('<![CDATA[').join('').split(']]>').join('');
            }

            const descRoot = parse(descriptionFull);
            const imgTags = descRoot.querySelectorAll('img');
            let image = "";

            for (const img of imgTags) {
                const src = img.getAttribute('src');
                if (!src) continue;
                
                // Atmetame thumbnail'us renkantis pagrindinę nuotrauką iš RSS
                if (src.toLowerCase().includes('thumb') || src.match(/[._-]?150x\d+/)) {
                    continue;
                }

                try {
                    const absoluteUrl = new URL(src, 'https://mif.vu.lt').href;
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

                let bodyHtml = "";
                for (const selector of config.scraping.selectors) {
                    const target = articleRoot.querySelector(selector);
                    if (target) {
                        bodyHtml = target.innerHTML;
                        break;
                    }
                }

                // Jei RSS buvo tik placeholderis, pasiimame pirmą gerą nuotrauką iš straipsnio vidaus
                let finalImage = item.image;
                if (finalImage === config.ui.placeholderImage) {
                    const bodyImages = articleRoot.querySelectorAll('img');
                    for(const img of bodyImages) {
                        const src = img.getAttribute('src') || img.getAttribute('data-src');
                        if(src && !src.toLowerCase().includes('thumb') && !src.match(/[._-]?150x\d+/)) {
                            finalImage = new URL(src, 'https://mif.vu.lt').href;
                            break;
                        }
                    }
                }
                
                if (!bodyHtml) return { ...item, image: finalImage, description: getText(item.description, finalImage) };

                return {
                    ...item,
                    image: finalImage,
                    description: getText(bodyHtml, finalImage) 
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
