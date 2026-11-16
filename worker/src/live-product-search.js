/**
 * Live, on-demand storefront discovery. No accounts, API keys, periodic imports,
 * product lists, or assumptions about pack contents.
 *
 * Shopify storefront predictive search is a documented public storefront API.
 * Treat every search result only as a CANDIDATE: index.js must fetch/validate
 * the exact product page before any fields are marked verified.
 */
const STORES = Object.freeze([
  { name: 'RareCards', origin: 'https://rarecards.nl', locale: 'en' },
  { name: 'CardNation', origin: 'https://www.cardnation.nl', locale: '' }
]);

function normal(value) {
  return String(value || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, ' ')
    .replace(/\b(jpn|japans|japanese|jp)\b/g, ' japanese ')
    .replace(/\b(kor|koreaans|korean|kr)\b/g, ' korean ')
    .replace(/\b(chn|chinese|chinees|cn|zh cn)\b/g, ' chinese ')
    .replace(/\b(eng|engels|english)\b/g, ' english ')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
const COMMON = new Set([
  'pokemon','card','cards','tcg','trading','game','scarlet','violet',
  'sword','shield','sun','moon','mega','evolution','sealed',
  'booster','boosters','pack','packs','display','box','bundle',
  'elite','trainer','etb','ultra','premium','collection','vol','volume',
  'set','english','japanese','korean','chinese','simplified','traditional',
  'the','and','with','sv'
]);
function coreTerms(value) {
  return normal(value).split(' ').filter(x => x && !COMMON.has(x));
}
function typeMatches(title, type) {
  const t = normal(title);
  if (/(?:case of|booster box case|display case|booster case|case of boxes|3 pack blister|three pack blister)/.test(t)) return false;
  switch (type) {
    case 'box': return /(?:booster\s*(?:display\s*)?box|booster display|expansion pack box|high class pack box)/.test(t);
    case 'etb': return /(?:elite trainer box|elite trainerbox|\betb\b)/.test(t);
    case 'bundle': return /(?:booster bundle|boosterbundel|booster bundel)/.test(t);
    case 'pack': return /(?:booster pack|expansion pack|single booster)/.test(t) &&
      !/(?:box|bundle|display|blister|elite trainer|etb|case)/.test(t);
    case 'upc': return /(?:ultra premium collection|\bupc\b)/.test(t);
    case 'other': return true;
    default: return false;
  }
}
function languageMention(title) {
  const t=normal(title);
  if (/\b(?:jp|japanese)\b/.test(t)) return 'JP';
  if (/\bkorean\b/.test(t)) return 'KR';
  if (/\bchinese\b/.test(t)) return 'ZH';
  if (/\benglish\b/.test(t)) return 'EN';
  return null;
}
export function matchesLiveProductTitle(name, title, type, language) {
  if (!typeMatches(title, type)) return false;
  const requested = normal(name);
  const actual = normal(title);
  // Never confuse the Pokémon Center version with a normal box, or no-shrink
  // with factory-sealed boxes.
  if (requested.includes('pokemon center') !== actual.includes('pokemon center')) return false;
  // A display of multiple bundles is not one Booster Bundle.
  if (type === 'bundle' && (actual.includes('display') !== requested.includes('display'))) return false;
  if (requested.includes('sleeved') !== actual.includes('sleeved')) return false;
  if (requested.includes('no shrink') !== actual.includes('no shrink')) return false;
  if (requested.includes('deluxe') !== actual.includes('deluxe')) return false;
  const required = [...new Set(coreTerms(name))];
  const actualTerms = new Set(coreTerms(title));
  if (!required.length) return false;
  if (!required.every(term => actualTerms.has(term))) return false;
  const requestedLanguage = language || (
    /\bjapanese\b/.test(requested) ? 'JP' :
    /\bkorean\b/.test(requested) ? 'KR' :
    /\bchinese\b/.test(requested) ? 'ZH-CN' :
    /\benglish\b/.test(requested) ? 'EN' : ''
  );
  const onTitle = languageMention(title);
  if (requestedLanguage === 'JP' || requestedLanguage === 'KR' ||
      requestedLanguage === 'ZH-CN' || requestedLanguage === 'ZH-TW') {
    // Candidate title must itself establish the appropriate market.
    if (!onTitle) return false;
    if (requestedLanguage === 'JP' && onTitle !== 'JP') return false;
    if (requestedLanguage === 'KR' && onTitle !== 'KR') return false;
    if (requestedLanguage.startsWith('ZH') && onTitle !== 'ZH') return false;
    if (requestedLanguage === 'ZH-TW' && !actual.includes('traditional')) return false;
    if (requestedLanguage === 'ZH-CN' && actual.includes('traditional')) return false;
  } else if (requestedLanguage === 'EN' && onTitle && onTitle !== 'EN') return false;
  return true;
}

function safeShopProductUrl(candidate, shop) {
  try {
    const u = new URL(String(candidate || ''), shop.origin);
    if (u.origin !== shop.origin || u.username || u.password || u.port) return null;
    if (!/^\/(?:[a-z]{2}\/)?products\/[a-z0-9][a-z0-9-]{1,150}\/?$/i.test(u.pathname)) return null;
    // No tracking parameters or untrusted query strings are necessary.
    return u.origin + u.pathname;
  } catch { return null; }
}
export function searchQueries(name, type) {
  const important = coreTerms(name).slice(0, 7).join(' ');
  if (!important) return [];
  const term = type === 'etb' ? 'elite trainer box' :
    type === 'bundle' ? 'booster bundle' :
    type === 'pack' ? 'booster pack' :
    type === 'upc' ? 'ultra premium collection' : 'booster box';
  // One targeted query, and one broad query only if needed.
  return [important + ' ' + term, important].filter((x,i,a)=>a.indexOf(x)===i);
}

async function fetchSuggestions(shop, query) {
  const url = new URL((shop.locale ? '/' + shop.locale : '') + '/search/suggest.json', shop.origin);
  url.searchParams.set('q', query);
  url.searchParams.set('resources[type]', 'product');
  url.searchParams.set('resources[limit]', '10');
  url.searchParams.set('resources[options][unavailable_products]', 'show');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(url.href, {
      headers: { Accept: 'application/json' },
      redirect: 'manual', signal: controller.signal,
      cf: { cacheTtl: 1800 }
    });
    if (!response.ok) return { status: 'http-' + response.status, items: [] };
    if (!String(response.headers.get('content-type') || '').includes('json') ||
        Number(response.headers.get('content-length') || 0) > 200000)
      return { status: 'not-json', items: [] };
    const raw = await response.text();
    if (raw.length > 200000) return { status: 'oversize', items: [] };
    const obj = JSON.parse(raw);
    const list = obj?.resources?.results?.products;
    if (!Array.isArray(list)) return { status: 'no-products-array', items: [] };
    return { status: 'ok', items: list.slice(0, 10).map(x => ({
      title: String(x?.title || '').slice(0, 220),
      url: safeShopProductUrl(x?.url, shop)
    })).filter(x => !!x.url && !!x.title) };
  } catch { return { status: 'unreachable', items: [] }; }
  finally { clearTimeout(timer); }
}

/** Search online at request time; do not create an inventory/database. */
export async function discoverLiveProductPages(env, name, type, language) {
  const empty = { status: 'disabled', retailUrls: [], diagnostics: [] };
  if (String(env?.DIRECT_WEB_DISCOVERY || '').toLowerCase() !== 'true') return empty;
  const queries = searchQueries(name, type);
  if (!queries.length) return { ...empty, status:'insufficient-name' };
  const first = await Promise.all(STORES.map(s => fetchSuggestions(s, queries[0])));
  const matched = [];
  const diagnostic = [];
  first.forEach((r,i) => {
    const shop=STORES[i];
    diagnostic.push({ source:shop.name, status:r.status, candidates:r.items.length });
    for (const item of r.items) {
      if (matchesLiveProductTitle(name,item.title,type,language))
        matched.push({ ...item, store:shop.name });
    }
  });
  // One broad search per store only when the precise query found no matches.
  if (!matched.length && queries[1] && queries[1] !== queries[0]) {
    const fallback = await Promise.all(STORES.map(s => fetchSuggestions(s, queries[1])));
    fallback.forEach((r,i) => {
      diagnostic.push({ source:STORES[i].name, status:'broad-'+r.status, candidates:r.items.length });
      for (const item of r.items) {
        if (matchesLiveProductTitle(name,item.title,type,language))
          matched.push({ ...item, store:STORES[i].name });
      }
    });
  }
  const unique = [...new Map(matched.map(x => [x.url,x])).values()].slice(0, 6);
  return {
    status: unique.length ? 'candidates-found' : 'no-exact-online-match',
    retailUrls: unique.map(x => x.url),
    diagnostics: diagnostic
  };
}
