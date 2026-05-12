import config from '@/config/portal.config.json';
import { parse } from 'node-html-parser';

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/** Low-quality / thumbnail URL patterns we always want to reject */
const THUMBNAIL_PATTERNS = /thumb|small|[-_]150x|\b380\b/i;

/**
 * Extracts the single best high-res URL from all URL-bearing attributes of
 * an <img> element.  Priority: data-src > first non-thumbnail srcset entry > src.
 * Returns null if every candidate looks like a thumbnail.
 */
function getBestSrc(img: any): string | null {
    const candidates: string[] = [];

    // 1. data-src (lazy-load placeholder – often the real high-res URL)
    const dataSrc = img.getAttribute('data-src');
    if (dataSrc) candidates.push(dataSrc.trim());

    // 2. srcset – split on commas, take just the URL portion of each descriptor
    const srcset = img.getAttribute('srcset') || '';
    for (const part of srcset.split(',')) {
        const url = part.trim().split(/\s+/)[0];
        if (url) candidates.push(url);
    }

    // 3. Plain src (often a tiny placeholder when lazy-loading is active)
    const src = img.getAttribute('src');
    if (src) candidates.push(src.trim());

    for (const url of candidates) {
        if (!THUMBNAIL_PATTERNS.test(url)) return url;
    }
    return null;
}

/**
 * Strips ONLY Joomla-generated sizing / hashing suffixes from a filename stem,
 * leaving the core name intact for reliable comparison.
 *
 * Handles:
 *  - Dimension suffixes:  -150x150  _380x285  (including bare numbers like 380)
 *  - Named size tags:     -large  _small  _medium  _thumb
 *  - Trailing hex hashes: _f01618  _abc123  (exactly 6 hex chars)
 *  - Bare trailing digits appended without separator (pasauli380 → pasauli)
 */
function joomlaCoreName(url: string): string {
    try {
        // decode percent-encoding so filenames compare cleanly
        let name = decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? '').toLowerCase();
        // strip extension
        const dotIdx = name.lastIndexOf('.');
        let stem = dotIdx >= 0 ? name.slice(0, dotIdx) : name;

        // strip trailing hex hash:  _f01618
        stem = stem.replace(/[_-][a-f0-9]{6}$/, '');
        // strip trailing WxH dimensions:  -150x150  _380x285
        stem = stem.replace(/[_-]\d+x\d+$/, '');
        // strip named size keywords:  -large  _small  _medium  _thumb
        stem = stem.replace(/[_-](large|small|medium|thumb|thumbnail)$/, '');
        // strip bare trailing digits appended WITHOUT a separator (image380 → image)
        stem = stem.replace(/([a-z])\d{2,4}$/, '$1');

        return stem;
    } catch {
        return url;
    }
}

/** Returns true when two image URLs share the same Joomla core filename */
function isSameImage(url1: string, url2: string): boolean {
    if (!url1 || !url2) return false;
    const c1 = joomlaCoreName(url1);
    const c2 = joomlaCoreName(url2);
    // require minimum length to avoid false positives on very short stems
    return c1.length > 3 && c1 === c2;
}

/**
 * Climbs from a node up to the highest ancestor that is STILL an empty shell
 * (no real text, no remaining images) and returns it as the element to remove.
 * Shell tags: picture, figure, a, p, div, span.
 */
function findRemovalTarget(node: any, root: any): any {
    const SHELL_TAGS = new Set(['picture', 'figure', 'a', 'p', 'div', 'span']);
    let target = node;

    let cursor = node.parentNode;
    while (cursor && cursor !== root) {
        const tag = cursor.tagName?.toLowerCase() ?? '';
        if (!SHELL_TAGS.has(tag)) break;

        // "Empty" means: no real text AND no remaining <img> children
        const text = (cursor.textContent ?? '').replace(/&nbsp;/g, '').replace(/\s+/g, '').trim();
        const hasImg = !!cursor.querySelector('img');
        if (text === '' && !hasImg) {
            target = cursor;
            cursor = cursor.parentNode;
        } else {
            break;
        }
    }
    return target;
}

// ---------------------------------------------------------------------------
// MAIN PROCESSING FUNCTION
// ---------------------------------------------------------------------------

function processArticleContent(html: string, fallbackImg: string) {
    if (!html) return { cleanedHtml: '', mainImage: fallbackImg };
    const root = parse(html);

    // Remove dangerous / irrelevant tags
    root.querySelectorAll('script, style, iframe, canvas, svg').forEach(el => el.remove());

    // Remove metadata elements whose text must NOT count toward the body-text
    // threshold (author name, date, category breadcrumb, tag lists, etc.)
    // These appear before the article body in many Joomla templates and were
    // the root cause of the 2nd / 6th slide duplication.
    root.querySelectorAll(
        'time, nav, .article-info, .article-header, .createdby, ' +
        '.author, .category, .tags, .breadcrumb, .article-date, ' +
        '.item-page .page-header, h1, h2'
    ).forEach(el => el.remove());

    // ------------------------------------------------------------------
    // STEP 1 – Find the main high-res image
    // We scan ALL images, prefer high-res over thumbnails, and take the
    // first qualifying candidate as the carousel image.
    // ------------------------------------------------------------------
    let mainImage: string = fallbackImg;
    let mainImageRawUrl: string = '';          // the raw URL before absolutification

    const allImgs = root.querySelectorAll('img');
    for (const img of allImgs) {
        const best = getBestSrc(img);
        if (best) {
            mainImageRawUrl = best;
            try { mainImage = new URL(best, 'https://mif.vu.lt').href; }
            catch { mainImage = best; }
            break;
        }
    }

    // ------------------------------------------------------------------
    // STEP 2 – Remove duplicate / intro images from the body
    //
    // Strategy: walk the DOM top-to-bottom tracking accumulated REAL text
    // (non-whitespace characters).  Any <img> encountered before 60 chars
    // of real text have been seen is considered "intro zone" and deleted,
    // up to a max of 3 (safety cap so we never eat gallery images).
    //
    // After the intro zone, we also delete any image whose core filename
    // matches the main image (catches Joomla body duplicates that sit after
    // a paragraph or two of text).
    // ------------------------------------------------------------------
    let accText = 0;
    let introDeleted = 0;
    const MAX_INTRO = 3;        // never delete more than this many intro images
    // 200 chars ≈ 2-3 short sentences; large enough to survive any remaining
    // metadata snippets, small enough to still catch body duplicates.
    const TEXT_THRESHOLD = 200;

    const toRemove: any[] = [];

    // Tags whose text content we deliberately ignore when measuring how much
    // body text has been seen.  Even after the querySelectorAll removal above,
    // inline metadata (e.g. <span class="author">) may remain.
    const META_TAGS = new Set(['figcaption', 'caption', 'label', 'button', 'a']);

    function walk(node: any) {
        if (node.nodeType === 3) {   // text node
            accText += (node.text ?? '').replace(/\s+/g, '').length;
            return;
        }

        const tag = node.tagName?.toLowerCase() ?? '';

        // Skip recursion into metadata-like inline elements so their text
        // doesn't push accText past the threshold before the real body.
        if (META_TAGS.has(tag)) return;

        if (tag === 'img') {
            const rawSrc = node.getAttribute('src') || node.getAttribute('data-src') || '';

            if (accText < TEXT_THRESHOLD && introDeleted < MAX_INTRO) {
                // Intro zone – remove regardless of filename
                toRemove.push(node);
                introDeleted++;
            } else if (mainImageRawUrl && isSameImage(rawSrc, mainImageRawUrl)) {
                // Body duplicate of the main image – remove
                toRemove.push(node);
            }
            return; // don't recurse into <img> (it has no children)
        }

        if (node.childNodes) {
            for (const child of node.childNodes) walk(child);
        }
    }

    walk(root);

    // Physical removal – find highest empty shell to avoid leaving gaps
    for (const img of toRemove) {
        const target = findRemovalTarget(img, root);
        try { target.remove(); } catch { /* already removed by parent */ }
    }

    // ------------------------------------------------------------------
    // STEP 3 – Fix URLs and clean attributes of REMAINING gallery images
    // ------------------------------------------------------------------
    root.querySelectorAll('img').forEach(img => {
        // Resolve the best available src to an absolute URL
        const resolvedSrc = getBestSrc(img);
        if (resolvedSrc) {
            try {
                img.setAttribute('src', new URL(resolvedSrc, 'https://mif.vu.lt').href);
            } catch {
                img.setAttribute('src', resolvedSrc);
            }
        }

        // Strip Joomla-specific attributes that can break TV rendering
        const KEEP = new Set(['src', 'alt', 'width', 'height']);
        for (const attr of Object.keys(img.attributes)) {
            if (!KEEP.has(attr)) img.removeAttribute(attr);
        }
    });

    // ------------------------------------------------------------------
    // STEP 4 – Final cosmetic cleanup: remove now-empty paragraphs/divs
    // ------------------------------------------------------------------
    root.querySelectorAll('p, div').forEach(el => {
        const text = (el.textContent ?? '').replace(/&nbsp;/g, '').replace(/\s+/g, '').trim();
        if (text === '' && !el.querySelector('img')) el.remove();
    });

    return { cleanedHtml: root.innerHTML.trim(), mainImage };
}

// ---------------------------------------------------------------------------
// FETCH
// ---------------------------------------------------------------------------

export async function fetchNews() {
    const rssUrl = config.feeds.naujienos;

    try {
        const response = await fetch(rssUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            cache: 'no-store',
            next: { revalidate: 0 },
        });
        const xmlText = await response.text();
        const rssRoot = parse(xmlText, { lowerCaseTagName: true });

        const items = rssRoot.querySelectorAll('item');
        const initialItems: any[] = [];

        for (let i = 0; i < Math.min(items.length, config.scraping.maxItems); i++) {
            const item = items[i];
            const title = item.querySelector('title')?.text ?? '';
            const link = (item.querySelector('link')?.text ?? '').trim();

            let descriptionFull = item.querySelector('description')?.innerHTML ?? '';
            if (descriptionFull.includes('<![CDATA[')) {
                descriptionFull = descriptionFull.replaceAll('<![CDATA[', '').replaceAll(']]>', '');
            }

            // Best-effort RSS fallback image (used only when the full article has no images at all)
            let rssFallback = config.ui.placeholderImage;
            const descRoot = parse(descriptionFull);
            for (const img of descRoot.querySelectorAll('img')) {
                const best = getBestSrc(img);
                if (best) {
                    try { rssFallback = new URL(best, 'https://mif.vu.lt').href; break; } catch { /* ignore */ }
                }
            }

            const pubDate = item.querySelector('pubDate')?.text ?? '';
            const date = new Date(
                pubDate && !isNaN(Date.parse(pubDate)) ? pubDate : Date.now()
            ).toLocaleDateString('lt-LT');

            initialItems.push({
                id: link || Math.random().toString(),
                title: title.replace(/<[^>]*>?/gm, '').trim(),
                link,
                image: rssFallback,
                date,
                category: 'Naujiena',
                description: descriptionFull,
            });
        }

        const settled = await Promise.allSettled(
            initialItems.map(async (item) => {
                // No link – fall back to RSS description
                if (!item.link) {
                    const p = processArticleContent(item.description, item.image);
                    return { ...item, image: p.mainImage, description: p.cleanedHtml };
                }

                try {
                    const articleRes = await fetch(item.link, {
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                        cache: 'no-store',
                        next: { revalidate: 0 },
                    });
                    const html = await articleRes.text();
                    const articleRoot = parse(html);

                    let bodyHtml = '';
                    for (const selector of config.scraping.selectors) {
                        const target = articleRoot.querySelector(selector);
                        if (target) { bodyHtml = target.innerHTML; break; }
                    }

                    const contentToProcess = bodyHtml || item.description;
                    const p = processArticleContent(contentToProcess, item.image);
                    return { ...item, image: p.mainImage, description: p.cleanedHtml };
                } catch {
                    const p = processArticleContent(item.description, item.image);
                    return { ...item, image: p.mainImage, description: p.cleanedHtml };
                }
            })
        );

        return settled
            .map(r => (r.status === 'fulfilled' ? r.value : null))
            .filter(Boolean);
    } catch (error) {
        console.error('News fetch error:', error);
        return [];
    }
}
