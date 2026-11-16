/**
 * Source identity and evidence boundaries for Keep & Flip sealed autofill.
 *
 * A set match is NOT a product match; a name match is NOT proof of a printing,
 * packaging variant or cards-per-pack quantity.
 */

export function editionTags(input) {
  const normalized = String(input || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[‐‑‒–—]/g, '-').replace(/\s+/g, ' ');
  const tags = new Set();
  if (/\bpok[eé]mon\s+cent(?:er|re)\b|\bpokemoncenter\b/.test(normalized)) tags.add('pokemon-center');
  if (/\b(?:first|1st)[- ]edition\b|\b1e\s+editie\b/.test(normalized)) tags.add('first-edition');
  if (/\b(?:second|2nd)[- ]edition\b/.test(normalized)) tags.add('second-edition');
  if (/\b(?:japanese|japanse|jpn|jp)\b|日本語/.test(normalized)) tags.add('japanese');
  if (/\b(?:korean|koreaans|kor)\b|한국어/.test(normalized)) tags.add('korean');
  if (/\b(?:simplified chinese|vereenvoudigd chinees|zh-cn)\b|简体中文/.test(normalized)) tags.add('zh-cn');
  if (/\b(?:traditional chinese|traditioneel chinees|zh-tw)\b|繁體中文/.test(normalized)) tags.add('zh-tw');
  if (/\b(?:english|engels|eng)\b/.test(normalized)) tags.add('english');
  if (/\b(?:special edition)\b/.test(normalized)) tags.add('special-edition');
  return [...tags].sort();
}

export function editionCompatible(requested, candidate) {
  const a = editionTags(requested);
  const b = editionTags(candidate);
  // Different high-impact packaging variants or explicitly named card languages
  // may never be treated as interchangeable.
  return a.length === b.length && a.every((tag, i) => tag === b[i]);
}

export function matchingOfficialTitle(pageTitle, name, normalize, inferType) {
  const requested = normalize(name).split(' ').filter(Boolean);
  const actual = normalize(pageTitle).split(' ').filter(Boolean);
  if (requested.length < 2 || !requested.every(x => actual.includes(x))) return false;
  if (!editionCompatible(name, pageTitle)) return false;
  const wantedType = inferType(name);
  const actualType = inferType(pageTitle);
  return !wantedType || !actualType || wantedType === actualType;
}

/**
 * Only accept verified records whose canonical name or alias matches exactly.
 * If two different records share the same alias, return ambiguity rather than
 * silently choosing the first (especially normal vs Pokémon Center ETBs).
 */
export function selectVerifiedProduct(records, query, normalize, officialUrl, languageCode) {
  const target = normalize(query.name);
  const wantedSource = officialUrl(query.sourceUrl);
  const matches = (Array.isArray(records) ? records : []).slice(0, 8000).filter(p => {
    if (!p || p.verified !== true || !officialUrl(p.sourceUrl) ||
        p.productType !== query.type || typeof p.productName !== 'string') return false;
    if (query.id !== null && query.id !== undefined &&
        String(p.cardmarketProductId || '') !== String(query.id)) return false;
    if (query.language && p.language && languageCode(p.language) !== query.language) return false;
    if (wantedSource && officialUrl(p.sourceUrl) !== wantedSource) return false;
    const names = [p.productName, ...(Array.isArray(p.aliases) ? p.aliases.slice(0, 30) : [])]
      .filter(s => typeof s === 'string');
    if (!names.some(s => normalize(s) === target)) return false;
    // A weak alias must not bypass explicit packaging/printing qualifiers.
    return editionCompatible(query.name, p.productName);
  });
  if (matches.length !== 1) {
    return {
      status: matches.length > 1 ? 'ambiguous' : 'not-found',
      record: null,
      candidates: matches.slice(0, 5).map(p => ({
        name: p.productName,
        productType: p.productType,
        cardmarketProductId: p.cardmarketProductId ? String(p.cardmarketProductId) : null,
        language: languageCode(p.language)
      }))
    };
  }
  return {status: 'exact', record: matches[0], candidates: []};
}

/**
 * Extract the main product section instead of an entire HTML document, because
 * footers, menus and "related products" often contain other booster counts.
 *
 * This is a conservative heuristic, not proof that every page can be parsed.
 * The caller still validates the exact h1/title identity.
 */
export function scopedProductHtml(html) {
  const source = String(html || '');
  const start = source.search(/<h1\b/i);
  if (start < 0) return source.slice(0, 16000);
  const fromTitle = source.slice(start);
  const related = fromTitle.search(/<h[2-6]\b[^>]*>[^<]{0,90}(?:related products|you may also like|recommended products|more products|similar items)[^<]*<\/h[2-6]>/i);
  const relevant = related > 0 ? fromTitle.slice(0, related) : fromTitle;
  return relevant.slice(0, 16000);
}
