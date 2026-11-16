import { discoverLiveProductPages, matchesLiveProductTitle } from './live-product-search.js';
import { renderTestLab } from './testlab.js';
import { inferProductType, additionalCount, mergeCountEvidence, labelFieldConfidence, explicitCardLanguage } from './autofill.js';
import { matchingOfficialTitle, selectVerifiedProduct, scopedProductHtml, editionCompatible } from './product-identity.js';
import { discoverProductWithGemini } from './gemini-discovery.js';
import { extractNameHints } from './name-hints.js';

/**
 * Keep & Flip – Productbronnen Worker 2.1.8 GEMINI SEARCH TEST
 *
 * GET /health
 * POST /lookup
 * POST /image-lookup
 * GET /image?url=... (Bearer-authenticated image relay)
 *
 * Secret: KEEPFLIP_ACCESS_TOKEN
 * Optioneel: GEMINI_API_KEY
 *
 * Vars:
 * APP_ORIGIN
 * KEEPFLIP_REGISTRY_URL
 * GEMINI_MODEL
 * ENABLE_GOOGLE_SEARCH
 * SECONDARY_SOURCE_HOSTS
 *
 * Geen voorraadmutaties.
 * Geen onbewezen gegevens automatisch bevestigen.
 */
const VERSION = '2.1.8';
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const MAX_BODY = 3500;
const SET_LANGUAGES = ['en', 'ja', 'ko', 'zh-cn', 'zh-tw'];
const BOOSTER_GUIDE =
  'https://support.pokemon.com/hc/en-us/articles/360000981613-What-can-I-expect-in-a-Pok%C3%A9mon-Trading-Card-Game-booster-pack';
const BACKUP_GUIDE =
  'https://support.pokemoncenter.com/hc/en-us/articles/360028979571-What-can-I-expect-in-a-Pok%C3%A9mon-Trading-Card-Game-Booster-Pack';
// URL-hints, zonder vaste productwaarden.
const SECONDARY_SEEDS = [
  {
    name: 'scarlet violet paldean fates booster bundle',
    type: 'bundle',
    urls: [
      'https://www.gamestop.com/toys-games/trading-cards/products/pokemon-trading-card-game-paldean-fates-booster-bundle/20009334.html',
      'https://www.cardnation.nl/products/paldean-fates-booster-bundle'
    ]
  }
];
const RETAIL_DOMAINS = new Set([
  'gamestop.com',
  'www.gamestop.com',
  'cardnation.nl',
  'www.cardnation.nl',
  'target.com',
  'www.target.com',
  'bestbuy.com',
  'www.bestbuy.com',
  'pokemoncenter.com',
  'www.pokemoncenter.com',
  'bol.com',
  'www.bol.com',
  'pokeselect.nl',
  'www.pokeselect.nl',
  'cardmarket.com',
  'www.cardmarket.com',
  'rarecards.nl',
  'www.rarecards.nl',
  'tcgplayer.com',
  'www.tcgplayer.com'
]);
const CURATED = [
  {
    names: [
      'delta reign booster bundle',
      'mega evolution delta reign booster bundle'
    ],
    type: 'bundle',
    packs: 6,
    cards: 10,
    set: 'Mega Evolution—Delta Reign',
    url: 'https://www.pokemon.com/us/news/pokemon-tcg-mega-evolution-delta-reign-product-showcase'
  },
  {
    names: [
      'delta reign elite trainer box',
      'mega evolution delta reign elite trainer box'
    ],
    type: 'etb',
    packs: 9,
    cards: 10,
    set: 'Mega Evolution—Delta Reign',
    url: 'https://www.pokemon.com/us/news/pokemon-tcg-mega-evolution-delta-reign-product-showcase'
  },
  {
    names: [
      'delta reign pokemon center elite trainer box',
      'mega evolution delta reign pokemon center elite trainer box'
    ],
    type: 'etb',
    packs: 11,
    cards: 10,
    set: 'Mega Evolution—Delta Reign',
    url: 'https://www.pokemon.com/us/news/pokemon-tcg-mega-evolution-delta-reign-product-showcase'
  },
  {
    names: [
      'delta reign booster display box',
      'mega evolution delta reign booster display box'
    ],
    type: 'box',
    packs: 36,
    cards: 10,
    set: 'Mega Evolution—Delta Reign',
    url: 'https://www.pokemon.com/us/news/pokemon-tcg-mega-evolution-delta-reign-product-showcase'
  },
  {
    names: ['30th celebration booster bundle'],
    type: 'bundle',
    packs: 6,
    cards: 5,
    set: '30th Celebration',
    url: 'https://www.pokemon.com/us/pokemon-tcg/product-gallery/30th-celebration-booster-bundle'
  }
];
function reply(data, status = 200, origin = '') {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    Vary: 'Origin'
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return new Response(JSON.stringify(data), {
    status,
    headers
  });
}
function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const expected = String(env.APP_ORIGIN || '').trim();
  // Same-origin calls from the isolated Worker-hosted Testlab are allowed;
  // the existing Bearer token remains required on /lookup.
  const ownOrigin = new URL(request.url).origin;
  return origin && (origin === expected || origin === ownOrigin) ? origin : '';
}
async function tokenMatches(given, expected) {
  if (
    !given ||
    !expected ||
    given.length > 256 ||
    expected.length > 256
  ) return false;
  const encoder = new TextEncoder();
  const digests = await Promise.all(
    [given, expected].map(value =>
      crypto.subtle.digest(
        'SHA-256',
        encoder.encode(value)
      )
    )
  );
  const a = new Uint8Array(digests[0]);
  const b = new Uint8Array(digests[1]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
function norm(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(
      /\bpok[eé]mon(?:\s+(?:tcg|trading card game))?\b/g,
      ' '
    )
    .replace(/&/g, ' and ')
    .replace(/\band\b/g, ' ')
    .replace(
      /[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}
function valueNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 200
    ? n
    : null;
}
function languageCode(value) {
  const code = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/_/g, '-');
  const synonyms = {
    JA: 'JP',
    KO: 'KR',
    'ZH-HANS': 'ZH-CN',
    'ZH-HANT': 'ZH-TW',
    ENG: 'EN',
    JPN: 'JP',
    KOR: 'KR'
  };
  const normalized = synonyms[code] || code;
  return [
    'EN', 'JP', 'KR', 'ZH-CN', 'ZH-TW',
    'DE', 'FR', 'IT', 'ES', 'NL', 'OT'
  ].includes(normalized) ? normalized : null;
}
function officialUrl(value) {
  try {
    const url = new URL(String(value));
    const hosts = [
      'www.pokemon.com',
      'pokemon.com',
      'press.pokemon.com',
      'support.pokemon.com',
      'www.pokemon-card.com',
      'www.pokemon.co.jp',
      'www.pokemon.co.kr',
      'www.pokemon-card.com.tw',
      'www.pokemon-card.com.cn'
    ];
    if (
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password ||
      !hosts.includes(url.hostname)
    ) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}
function registryUrl(value) {
  try {
    const url = new URL(String(value));
    if (
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password
    ) return null;
    return (
      url.hostname === 'raw.githubusercontent.com' ||
      url.hostname.endsWith('.github.io')
    ) ? url.href : null;
  } catch {
    return null;
  }
}
function candidateUrls(name, supplied = []) {
  const urls = supplied.map(officialUrl).filter(Boolean);
  const slug = norm(name).replace(/\s+/g, '-');
  if (/^[a-z0-9-]{5,110}$/.test(slug)) {
    const root =
      'https://www.pokemon.com/us/pokemon-tcg/product-gallery/';
    urls.push(root + slug);
    if (!slug.startsWith('mega-evolution-')) {
      urls.push(root + 'mega-evolution-' + slug);
    }
    if (!slug.startsWith('scarlet-violet-')) {
      urls.push(root + 'scarlet-violet-' + slug);
    }
  }
  return [...new Set(
    urls.map(officialUrl).filter(Boolean)
  )].slice(0, 5);
}
function htmlText(html) {
  return String(html || '')
    .replace(/\<!--[\s\S]*?-->/g, ' ')
    .replace(/\<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/\<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);|&apos;/gi, "'")
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&ndash;|&#8211;/gi, '–')
    .replace(/\s+/g, ' ')
    .trim();
}
function titleMatches(html, name) {
  const title = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    || '';
  return matchingOfficialTitle(htmlText(title), name, norm, inferProductType);
}
const WORDS = {
  one: 1, two: 2, three: 3, four: 4,
  five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12,
  sixteen: 16, eighteen: 18, twenty: 20,
  'twenty-four': 24, 'thirty-six': 36
};
const NUMBER =
  '(?:\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|sixteen|eighteen|twenty|twenty-four|thirty-six)';
function readNumber(value) {
  return valueNumber(
    WORDS[String(value).toLowerCase()] ?? value
  );
}
function countFromText(text, type) {
  const patterns = type === 'packs'
    ? [
      new RegExp(
        `\\b(${NUMBER})\\s*(?:x|×)?\\s*(?:(?:pok[eé]mon\\s+)?(?:tcg\\s+)?)?booster\\s*packs?\\b`,
        'gi'
      ),
      new RegExp(
        `\\bbooster\\s*packs?\\s*(?:x|×|:|-)\\s*(${NUMBER})\\b`,
        'gi'
      ),
      /(?:booster|pack)[\s\u3040-\u30ff\u3400-\u9fff]*[×x]\s*(\d{1,3})\b/gi,
      /(?:拡張パック|強化拡張パック|팩|包|包裝)\s*[×x:]?\s*(\d{1,3})\s*(?:パック|팩|包)?/gi
    ]
    : [
      new RegExp(
        `\\b(${NUMBER})\\s+(?:additional\\s+|game\\s+|pokemon\\s+tcg\\s+)?cards?\\s+(?:per|in|inside|from)\\s+(?:each|a|every|one|the)?\\s*(?:booster|pack)\\b`,
        'gi'
      ),
      new RegExp(
        `\\b(?:each|every|one)\\s+(?:pok[eé]mon\\s+(?:trading\\s+card\\s+game\\s+|tcg\\s+))?booster\\s*pack\\s+(?:contains?|includes?|has)\\s+(${NUMBER})\\s+(?:additional\\s+|game\\s+)?cards?\\b`,
        'gi'
      ),
      new RegExp(
        `\\b(?:booster|pack)\\s*[:–-]?\\s*(${NUMBER})\\s+(?:additional\\s+|game\\s+)?cards?\\b`,
        'gi'
      ),
      new RegExp(
        `\\b(${NUMBER})\\s+(?:pok[eé]mon\\s+)?kaarten\\s+per\\s+(?:booster|pack)\\b`,
        'gi'
      ),
      new RegExp(
        `\\b(${NUMBER})\\s+(?:additional\\s+|game\\s+)?cards?\\s+(?:per|in)\\s+(?:a\\s+|each\\s+)?booster\\s*pack\\b`,
        'gi'
      ),
      /(?:1パック|1팩|每包|每包裝|每包内)\s*(?:に|당|含|包括)?\s*(\d{1,3})\s*(?:枚|장|张|張)/gi
    ];
  if (type === 'packs') {
    patterns.push(
      /\b(?:number of|aantal)\s+(?:booster\s*)?packs?\s+per\s+(?:box|doos)\s*[:：–-]?\s*(\d{1,3})\b/gi,
      /\b(?:number of|aantal)\s+boosters?\s+per\s+(?:box|doos)\s*[:：–-]?\s*(\d{1,3})\b/gi,
      /\b(?:inhoud|contents?)\s*[:：]\s*(\d{1,3})\s+booster\s*packs?\s+per\s+box\b/gi
    );
  } else {
    patterns.push(
      /\b(?:number of|aantal)\s+(?:kaarten|cards?)\s+per\s+(?:booster\s*)?pack\s*[:：–-]?\s*(\d{1,3})\b/gi,
      /\b(?:aantal|number of)\s+(?:kaarten|cards?)\s+per\s+booster\s*[:：–-]?\s*(\d{1,3})\b/gi
    );
  }
  const numbers = [];
  for (const pattern of patterns) {
    for (const match of String(text).matchAll(pattern)) {
      const n = readNumber(match[1]);
      if (n !== null) numbers.push(n);
    }
  }
  // A sealed retail box normally contains <=60 boosters; a booster card
  // count <=30. This protects against set identifiers ("151 booster"),
  // protective-sleeve quantities ("70 sleeves"), and unrelated accessories.
  // Larger unusual products stay unverified until explicit specialist logic.
  const maximum = type === 'packs' ? 60 : 30;
  const unique = [...new Set(numbers.filter(value => value <= maximum))];
  if (unique.length > 1) return null;
  const extra = additionalCount(text, type === 'packs' ? 'packs' : 'cards');
  return mergeCountEvidence(unique.length === 1 ? unique[0] : null,
    extra !== null && extra <= maximum ? extra : null);
}
function productLanguageFromText(text) {
  return explicitCardLanguage(text);
}

async function fetchOfficial(url, redirects = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    6500
  );
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual',
      headers: { Accept: 'text/html' }
    });
    if (
      [301, 302, 307, 308].includes(r.status) &&
      redirects < 2
    ) {
      const destination = officialUrl(
        new URL(
          r.headers.get('Location') || '/',
          url
        ).href
      );
      return destination
        ? await fetchOfficial(destination, redirects + 1)
        : { url, status: 'unsafe-redirect', html: null };
    }
    if (!r.ok) {
      return { url, status: r.status, html: null };
    }
    if (
      !(r.headers.get('Content-Type') || '')
        .includes('text/html')
    ) {
      return { url, status: 'not-html', html: null };
    }
    if (
      Number(
        r.headers.get('Content-Length') || 0
      ) > 450000
    ) {
      return { url, status: 'oversize', html: null };
    }
    const html = await r.text();
    return {
      url,
      status: r.status,
      html: html.length <= 450000 ? html : null
    };
  } catch {
    return {
      url,
      status: 'network-error',
      html: null
    };
  } finally {
    clearTimeout(timeout);
  }
}
function safeRetailUrl(value, env) {
  try {
    const u = new URL(String(value));
    const extra = String(
      env.SECONDARY_SOURCE_HOSTS || ''
    ).split(',')
      .map(x => x.trim().toLowerCase())
      .filter(Boolean);
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.port ||
      !(
        RETAIL_DOMAINS.has(u.hostname) ||
        extra.includes(u.hostname.toLowerCase())
      )
    ) return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}
function exactRetailTitleMatches(html, name, type) {
  const heads = [
    ...String(html).matchAll(
      /<(?:h1|title)\b[^>]*>([\s\S]*?)<\/(?:h1|title)>/gi
    )
  ]
    .map(x => htmlText(x[1]))
    .filter(Boolean);
  const required = norm(name)
    .split(' ')
    .filter(Boolean)
    .filter(x => ![
      'pokemon', 'trading', 'card', 'game',
      'tcg', 'scarlet', 'violet',
      'mega', 'evolution'
    ].includes(x));
  if (required.length < 2) return false;
  const qualifiers = [
    'pokemon center',
    'japanese',
    'korean',
    'simplified chinese',
    'traditional chinese'
  ];
  const requested = norm(name);
  return heads.some(heading => {
    const h = norm(heading);
    return required.every(word =>
      h.split(' ').includes(word)
    ) &&
    qualifiers.every(q =>
      !requested.includes(q) || h.includes(q)
    ) &&
    editionCompatible(name, heading) &&
    (type !== 'etb' || h.includes('trainer')) &&
    (type !== 'bundle' || h.includes('bundle'));
  });
}
// Product storefronts can redirect /en/products/x to /products/x.
// Compare only canonical paths on the SAME approved HTTPS origin.
function sameRetailProduct(left, right) {
  try {
    const a = new URL(left);
    const b = new URL(right);
    const canonical = u => u.pathname
      .replace(/^\/(?:en|nl|de|fr)\/products\//, '/products/')
      .replace(/\/$/, '');
    return a.protocol === 'https:' &&
      a.origin === b.origin && canonical(a) === canonical(b);
  } catch { return false; }
}
// Shopify's documented public Ajax Product API: /products/{handle}.js.
// Use it only after a storefront result AND the actual product page have
// passed exact identity checks. This is not a product list or scraper feed.
async function fetchLiveProductJson(sourceUrl, name, type, language) {
  let url;
  try {
    const source = new URL(sourceUrl);
    if (!['rarecards.nl', 'www.cardnation.nl'].includes(source.hostname) ||
      source.protocol !== 'https:' || source.port ||
      source.username || source.password) return { status:'invalid-host' };
    const match = source.pathname.match(/^\/(?:[a-z]{2}\/)?products\/([a-z0-9-]{2,150})\/?$/i);
    if (!match) return { status:'invalid-product-path' };
    url = source.origin + '/products/' + match[1] + '.js';
  } catch { return { status:'invalid-url' }; }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(url, {
      signal:controller.signal, redirect:'manual',
      headers:{ Accept:'application/json' },
      cf:{ cacheTtl:1800 }
    });
    if (!response.ok || Number(response.headers.get('content-length') || 0)>260000 ||
        !/^(?:application\/json|application\/javascript|text\/javascript)(?:\s*;|$)/i.test(String(response.headers.get('content-type') || '')))
      return { status:'http-' + response.status };
    const raw=await response.text();
    if (raw.length > 260000) return { status:'oversize' };
    const json=JSON.parse(raw);
    const title=String(json?.title || '').slice(0,240);
    if (!title || !matchesLiveProductTitle(name,title,type,language))
      return { status:'different-product' };
    const description=String(json?.description || '').slice(0,32000);
    return {
      status:'verified-title', text:htmlText(description),
      title, url:sourceUrl
    };
  } catch { return { status:'unreachable' }; }
  finally { clearTimeout(timer); }
}

async function fetchRetail(url, env, hops = 0) {
  const safe = safeRetailUrl(url, env);
  if (!safe) {
    return {
      url,
      status: 'host-not-allowed',
      html: null
    };
  }
  const c = new AbortController();
  const timer = setTimeout(
    () => c.abort(),
    7000
  );
  try {
    const r = await fetch(safe, {
      signal: c.signal,
      redirect: 'manual',
      headers: { Accept: 'text/html' }
    });
    if (
      [301, 302, 307, 308].includes(r.status) &&
      hops < 2
    ) {
      const dest = safeRetailUrl(
        new URL(
          r.headers.get('location') || '/',
          safe
        ).href,
        env
      );
      return dest
        ? await fetchRetail(dest, env, hops + 1)
        : {
            url: safe,
            status: 'unsafe-redirect',
            html: null
          };
    }
    if (
      !r.ok ||
      !(r.headers.get('content-type') || '')
        .includes('text/html')
    ) {
      return {
        url: safe,
        status: r.status,
        html: null
      };
    }
    if (
      Number(
        r.headers.get('content-length') || 0
      ) > 650000
    ) {
      return {
        url: safe,
        status: 'oversize',
        html: null
      };
    }
    const html = await r.text();
    return {
      url: safe,
      status: r.status,
      html: html.length <= 650000 ? html : null
    };
  } catch {
    return {
      url: safe,
      status: 'network-error',
      html: null
    };
  } finally {
    clearTimeout(timer);
  }
}

async function findSet(name, language) {
  const preferred = {
    EN: 'en',
    JP: 'ja',
    KR: 'ko',
    'ZH-CN': 'zh-cn',
    'ZH-TW': 'zh-tw'
  }[language] || 'en';
  const languages = [
    preferred,
    ...SET_LANGUAGES.filter(x => x !== preferred)
  ];
  const target = ' ' + norm(name) + ' ';
  const series = new Set([
    'scarlet violet',
    'sword shield',
    'sun moon',
    'mega evolution'
  ]);
  const lists = await Promise.all(
    languages.map(async lang => {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        5000
      );
      try {
        const res = await fetch(
          `https://api.tcgdex.net/v2/${lang}/sets`,
          {
            signal: controller.signal,
            cf: { cacheTtl: 86400 }
          }
        );
        if (!res.ok) return [];
        const sets = await res.json();
        if (!Array.isArray(sets)) return [];
        return sets
          .filter(set => {
            const label = norm(set.name);
            return (
              label.length >= 5 &&
              !series.has(label) &&
              target.includes(' ' + label + ' ')
            );
          })
          .map(set => ({
            name: set.name,
            id: set.id,
            lang,
            weight: norm(set.name).length
          }));
      } catch {
        return [];
      } finally {
        clearTimeout(timer);
      }
    })
  );
  const ranked = lists
    .flat()
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        languages.indexOf(a.lang) -
        languages.indexOf(b.lang)
    );
  if (!ranked.length) return null;
  const best = ranked[0];
  if (
    ranked.some(
      item =>
        item.weight === best.weight &&
        norm(item.name) !== norm(best.name)
    )
  ) return null;
  return {
    name: best.name,
    url:
      `https://api.tcgdex.net/v2/${best.lang}/sets/` +
      encodeURIComponent(best.id)
  };
}
async function fromRegistry(
  env,
  name,
  type,
  id,
  language,
  sourceUrl
) {
  const url = registryUrl(
    env.KEEPFLIP_REGISTRY_URL
  );
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    6500
  );
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual',
      cf: { cacheTtl: 3600 }
    });
    if (
      !r.ok ||
      Number(
        r.headers.get('Content-Length') || 0
      ) > 1200000
    ) return null;
    const body = await r.text();
    if (body.length > 1200000) return null;
    const parsed = JSON.parse(body);
    const products = Array.isArray(parsed)
      ? parsed
      : parsed.products;
    if (!Array.isArray(products)) return null;
    const selected = selectVerifiedProduct(products, {
      name, type, id, language, sourceUrl
    }, norm, officialUrl, languageCode);
    if (selected.status !== 'exact') {
      return { status: selected.status, candidates: selected.candidates, record: null };
    }
    const found = selected.record;
    return {
      status: 'exact',
      candidates: [],
      record: {
        packs: valueNumber(found.packCount),
        cards: valueNumber(found.cardsPerPack),
        set: typeof found.expansionSet === 'string' ? found.expansionSet : null,
        language: languageCode(found.language),
        url: officialUrl(found.sourceUrl),
        method: 'verified-registry'
      }
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
function initialResult(name, type) {
  return {
    suggestedCount: null,
    suggestedCardsPerPack: null,
    suggestedProductType: null,
    suggestedSet: null,
    suggestedLanguage: null,
    sources: [],
    groundingUsed: false,
    googleSearchEnabled: false,
    geminiResponded: false,
    urlContextUsed: false,
    requiresConfirmation: true,
    confidence: 'unknown',
    sourceVerified: false,
    evidence: {},
    verifiedFields: {
      boosters: false,
      cardsPerPack: false,
      set: false,
      language: false,
      productType: false
    },
    provisionalFields: {
      cardsPerPack: false,
      productType: false,
      boosters: false,
      language: false
    },
    searchSuggestionsHtml: '',
    productName: name,
    productType: type,
    version: VERSION,
    diagnostics: {},
    missingFields: [],
    fieldConfidence: {},
    status: 'needs-review'
  };
}
function addSource(
  out,
  title,
  url,
  kind
) {
  if (
    url &&
    !out.sources.some(x => x.url === url)
  ) {
    out.sources.push({
      title,
      url,
      kind
    });
  }
}
function applyField(
  out,
  key,
  value,
  method,
  sourceUrl,
  sourceTitle,
  sourceKind
) {
  if (key === 'boosters' && out.productType === 'pack') return;
  if ((out.diagnostics.conflicts || []).some(c => c.field === key)) return;
  const mapping = {
    boosters: 'suggestedCount',
    cardsPerPack: 'suggestedCardsPerPack',
    set: 'suggestedSet',
    language: 'suggestedLanguage'
  };
  const outputKey = mapping[key];
  if (
    key === 'cardsPerPack' &&
    out.provisionalFields.cardsPerPack &&
    value !== null &&
    value !== undefined
  ) {
    out[outputKey] = null;
    out.provisionalFields.cardsPerPack = false;
  }
  if (
    out[outputKey] !== null &&
    out[outputKey] !== ''
  ) {
    if (
      value !== null &&
      value !== undefined &&
      value !== out[outputKey]
    ) {
      (out.diagnostics.conflicts ||= []).push({
        field: key,
        kept: out[outputKey],
        rejected: value,
        source: method
      });
      out[outputKey] = null;
      out.verifiedFields[key] = false;
      if (out.provisionalFields) out.provisionalFields[key] = false;
      out.evidence[key === 'boosters' ? 'packCount' : key] = 'source-conflict';
    }
    return;
  }
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) return;
  out[outputKey] = value;
  out.verifiedFields[key] = true;
  out.evidence[
    key === 'boosters' ? 'packCount' : key
  ] = method;
  addSource(
    out,
    sourceTitle,
    sourceUrl,
    sourceKind
  );
}
function normalizedQuote(text) {
  return String(text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}
function quoteIsOnPage(quote, pageText) {
  const q = normalizedQuote(quote);
  return (
    q.length >= 14 &&
    normalizedQuote(pageText).includes(q)
  );
}
function parseModelJson(text) {
  try {
    return JSON.parse(
      String(text || '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
    );
  } catch {
    return null;
  }
}
async function geminiOfficialPages(
  env,
  name,
  type,
  pages
) {
  if (!env.GEMINI_API_KEY) {
    return { status: 'not-configured' };
  }
  if (!pages.length) {
    return { status: 'no-matching-page' };
  }
  const urls = pages.map(p => p.url);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    14000
  );
  try {
    const prompt = [
      'Read only the official Pokémon product URLs listed below.',
      'Requested product: ' + JSON.stringify(name),
      'Product type: ' + type,
      'URLs: ' + urls.join(' ; '),
      'Only report values explicitly stated for this exact retail product.',
      'Never assume card language from website language, domain, or set name.',
      'For cardsPerPack count game cards only; exclude separate energy/code cards.',
      'Return exactly one matching sourceUrl and its exact productTitle.',
      'Return packCount, cardsPerPack and cardLanguage when directly evidenced.',
      'For every non-null value provide a short EXACT VERBATIM quote from that source',
      'in packQuote, cardsQuote or languageQuote respectively.',
      'If not explicitly present, return null. No general knowledge. No guesses.',
      'Return JSON with keys: sourceUrl, productTitle, packCount, packQuote,',
      'cardsPerPack, cardsQuote, cardLanguage, languageQuote.'
    ].join('\n');
    const model = String(
      env.GEMINI_MODEL || DEFAULT_MODEL
    ).trim();
    if (
      !/^gemini-[a-z0-9.-]{1,60}$/.test(model)
    ) {
      return { status: 'invalid-model' };
    }
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          tools: [
            { urlContext: {} }
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 1600,
            responseMimeType: 'application/json'
          }
        })
      }
    );
    if (!r.ok) {
      return {
        status: 'gemini-http-' + r.status
      };
    }
    const json = await r.json();
    const candidate = json.candidates?.[0];
    const response = (
      candidate?.content?.parts || []
    )
      .map(p => p.text || '')
      .join('');
    const data = parseModelJson(response);
    if (!data) {
      return { status: 'bad-gemini-json' };
    }
    const metadata =
      candidate?.urlContextMetadata?.urlMetadata || [];
    const sourceUrl = officialUrl(data.sourceUrl);
    const page = pages.find(
      p => p.url === sourceUrl
    );
    const retrieved = metadata.some(
      m =>
        m.urlRetrievalStatus ===
          'URL_RETRIEVAL_STATUS_SUCCESS' &&
        officialUrl(m.retrievedUrl) === sourceUrl
    );
    if (!page || !retrieved) {
      return { status: 'url-not-retrieved' };
    }
    if (
      !titleMatches(page.html, name) ||
      !norm(data.productTitle).includes(norm(name))
    ) {
      return {
        status: 'product-title-mismatch'
      };
    }
    const pageText = htmlText(page.html);
    const packs = valueNumber(data.packCount);
    const cards = valueNumber(data.cardsPerPack);
    const language = languageCode(data.cardLanguage);
    const validPack =
      packs !== null &&
      quoteIsOnPage(data.packQuote, pageText) &&
      countFromText(data.packQuote, 'packs') === packs;
    const validCards =
      cards !== null &&
      quoteIsOnPage(data.cardsQuote, pageText) &&
      countFromText(data.cardsQuote, 'cards') === cards;
    const validLanguage =
      language &&
      quoteIsOnPage(data.languageQuote, pageText) &&
      productLanguageFromText(data.languageQuote) ===
        language;
    return {
      status: 'retrieved',
      url: sourceUrl,
      packs: validPack ? packs : null,
      cards: validCards ? cards : null,
      language: validLanguage ? language : null,
      quotes: {
        packQuote: validPack
          ? String(data.packQuote).slice(0, 160)
          : null,
        cardsQuote: validCards
          ? String(data.cardsQuote).slice(0, 160)
          : null,
        languageQuote: validLanguage
          ? String(data.languageQuote).slice(0, 160)
          : null
      }
    };
  } catch {
    return { status: 'request-failed' };
  } finally {
    clearTimeout(timer);
  }
}
async function applyBoosterGuide(
  out,
  page,
  requestedLanguage,
  type
) {
  if (
    out.suggestedCardsPerPack ||
    !['pack', 'etb', 'bundle', 'box', 'upc']
      .includes(type) ||
    (
      requestedLanguage &&
      requestedLanguage !== 'EN'
    ) ||
    (
      out.suggestedLanguage &&
      out.suggestedLanguage !== 'EN'
    )
  ) return;
  const url = new URL(page.url);
  const ordinaryUsProduct =
    url.hostname === 'www.pokemon.com' &&
    /^\/us\/pokemon-tcg\/product-gallery\/(?:scarlet-violet|mega-evolution)-/
      .test(url.pathname);
  if (!ordinaryUsProduct) return;
  const text = htmlText(page.html);
  if (
    !/(?:scarlet\s*(?:&|and)\s*violet|mega\s*evolution)/i
      .test(text)
  ) return;
  if (
    /\b(?:fun pack|sample pack|mini booster|trick or trade|promo pack|three.card booster)\b/i
      .test(text.slice(0, 4000))
  ) return;
  const attempts = [];
  for (const guideUrl of [
    BOOSTER_GUIDE,
    BACKUP_GUIDE
  ]) {
    const guide = await fetchOfficial(guideUrl);
    const exact = !!(
      guide.html &&
      /each booster pack contains 10 game cards\b/i
        .test(htmlText(guide.html))
    );
    attempts.push({
      url: guideUrl,
      status: guide.status,
      exact
    });
    if (exact) {
      applyField(
        out,
        'cardsPerPack',
        10,
        'official-us-standard-live',
        guideUrl,
        'Pokémon Support – boosterinhoud',
        'official-general'
      );
      out.diagnostics.boosterGuide = {
        attempts,
        applied: 'live-verified'
      };
      return;
    }
  }
  out.diagnostics.boosterGuide = {
    attempts,
    applied: 'provisional'
  };
  out.suggestedCardsPerPack = 10;
  out.provisionalFields.cardsPerPack = true;
  out.evidence.cardsPerPack =
    'official-us-standard-cached-provisional';
  addSource(
    out,
    'Pokémon Support – algemene boosterregel (controle vereist)',
    BOOSTER_GUIDE,
    'official-general-provisional'
  );
}
async function lookup(data, env) {
  const name =
    typeof data?.productName === 'string'
      ? data.productName.trim().slice(0, 150)
      : '';
  const requestedType =
    typeof data?.productType === 'string'
      ? data.productType.toLowerCase().trim()
      : 'other';
  const detectedType = inferProductType(name);
  const type = requestedType === 'other' && detectedType ? detectedType : requestedType;
  const id = data?.cardmarketProductId ?? null;
  const language = languageCode(data?.language);
  if (
    !name ||
    ![
      'pack', 'etb', 'bundle',
      'box', 'upc', 'other'
    ].includes(type) ||
    (
      id !== null &&
      !/^\d{1,12}$/.test(String(id))
    )
  ) {
    return {
      error: 'Ongeldige productgegevens',
      httpStatus: 400
    };
  }
  const out = initialResult(name, type);
  if (detectedType) {
    out.suggestedProductType = detectedType;
    out.provisionalFields.productType = true;
    out.evidence.productType = 'unverified-product-name-hint';
  }
  if (detectedType && requestedType !== 'other' && requestedType !== detectedType) {
    out.diagnostics.typeMismatch = { supplied: requestedType, detected: detectedType };
    out.warning = 'Producttype in de naam wijkt af van het opgegeven type; controleer dit eerst.';
    out.status = 'needs-review';
    out.missingFields = ['productType'];
    out.fieldConfidence = { productType: 'conflict' };
    return out;
  }
  const curated = CURATED.find(
    item =>
      item.type === type &&
      item.names.some(
        alias => norm(alias) === norm(name)
      )
  );
  const registry = curated
    ? null
    : await fromRegistry(
        env,
        name,
        type,
        id,
        language,
        data?.sourceUrl
      );
  if (registry?.status === 'ambiguous') {
    out.diagnostics.registryStatus = 'ambiguous';
    out.diagnostics.registryCandidates = registry.candidates;
  }
  const record = curated
    ? {
        packs: curated.packs,
        cards: curated.cards,
        set: curated.set,
        language: null,
        url: curated.url,
        method: 'curated-record'
      }
    : registry?.record;
  if (record) {
    out.verifiedFields.productType = true;
    out.provisionalFields.productType = false;
    out.suggestedProductType = type;
    out.evidence.productType = record.method;
    applyField(
      out, 'boosters', record.packs,
      record.method, record.url,
      'Gecontroleerd productrecord',
      'product-reference'
    );
    applyField(
      out, 'cardsPerPack', record.cards,
      record.method, record.url,
      'Gecontroleerd productrecord',
      'product-reference'
    );
    applyField(
      out, 'set', record.set,
      record.method, record.url,
      'Gecontroleerd productrecord',
      'product-reference'
    );
    applyField(
      out, 'language', record.language,
      record.method, record.url,
      'Gecontroleerd productrecord',
      'product-reference'
    );
  }
  // Search the public web and TCGdex concurrently where available.
  // This avoids making users wait for five set-catalog calls before Search.
  const livePromise = record ? null :
    discoverLiveProductPages(env, name, type, language);
  // Direct source lookup is the default in the preview. Paid Google-grounding
  // is NOT called when DIRECT_WEB_DISCOVERY is enabled.
  const discoveryPromise = record ||
    String(env.DIRECT_WEB_DISCOVERY || '').toLowerCase() === 'true'
    ? null : discoverProductWithGemini(
      env, name, type, language, officialUrl, u => safeRetailUrl(u, env)
    );
  if (!out.suggestedSet) {
    const set = await findSet(name, language);
    if (set) {
      applyField(
        out,
        'set',
        set.name,
        'tcgdex-exact-set-name',
        set.url,
        'TCGdex setcatalogus',
        'set-catalog'
      );
    }
  }
  const supplied = [
    ...(
      Array.isArray(data?.sourceUrls)
        ? data.sourceUrls.slice(0, 2)
        : []
    ),
    ...(
      data?.sourceUrl
        ? [data.sourceUrl]
        : []
    )
  ];
  // Source discovery for unknown sealed products: one grounded Search query
  // per request at most. AI numbers are ignored; fetched pages prove fields.
  const live = livePromise ? await livePromise : {
    status: record ? 'skipped-existing-product-record' : 'disabled',
    retailUrls: [], diagnostics: []
  };
  out.diagnostics.liveDiscovery = {
    status: live.status,
    matchedProducts: live.retailUrls.length,
    providers: live.diagnostics
  };
  const discovery = discoveryPromise ? await discoveryPromise : {
    status: record ? 'skipped-existing-product-record' : 'disabled-direct-search',
    groundingUsed: false, officialUrls: [], retailUrls: [],
    searchQueries: [], searchSuggestionsHtml: ''
  };
  out.googleSearchEnabled = String(env.ENABLE_GOOGLE_SEARCH || '').toLowerCase() === 'true';
  out.groundingUsed = discovery.groundingUsed;
  out.geminiResponded = discovery.groundingUsed;
  out.diagnostics.googleDiscovery = {
    status: discovery.status,
    officialCandidates: discovery.officialUrls.length,
    retailerCandidates: discovery.retailUrls.length,
    queryCount: discovery.searchQueries.length,
    // No raw Gemini error message or secret is sent to the browser.
    errorStatus: discovery.errorStatus || null,
    errorCategory: discovery.errorCategory || null,
    retryAfterSeconds: discovery.retryAfterSeconds ?? null
  };
  out.searchSuggestionsHtml = discovery.searchSuggestionsHtml;
  const urls = candidateUrls(
    name,
    [
      ...supplied,
      ...(record?.url ? [record.url] : []),
      ...discovery.officialUrls
    ]
  );
  if (
    !record ||
    !out.suggestedCount ||
    !out.suggestedCardsPerPack ||
    !out.suggestedLanguage ||
    !out.suggestedSet
  ) {
    const checked = await Promise.all(
      urls.map(url => fetchOfficial(url))
    );
    out.diagnostics.officialFetch = checked.map(
      p => ({
        url: p.url,
        status: p.status,
        titleMatch: !!(
          p.html &&
          titleMatches(p.html, name)
        )
      })
    );
    const matched = checked.filter(
      p => p.html && titleMatches(p.html, name)
    );
    const page = matched[0];
    for (const productPage of matched) {
      const title = productPage.html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '';
      if (inferProductType(htmlText(title)) === type) {
        out.verifiedFields.productType = true;
        out.provisionalFields.productType = false;
        out.suggestedProductType = type;
        out.evidence.productType = 'verified-official-product-title';
      }
      const text = htmlText(scopedProductHtml(productPage.html));
      applyField(
        out,
        'boosters',
        countFromText(text, 'packs'),
        'official-page-direct',
        productPage.url,
        'Officiële productpagina',
        'official-product'
      );
      applyField(
        out,
        'cardsPerPack',
        countFromText(text, 'cards'),
        'official-page-direct',
        productPage.url,
        'Officiële productpagina',
        'official-product'
      );
      applyField(
        out,
        'language',
        productLanguageFromText(text),
        'official-page-direct',
        productPage.url,
        'Officiële productpagina',
        'official-product'
      );
    }
    if (
      matched.length &&
      (
        !out.suggestedCount ||
        !out.suggestedCardsPerPack ||
        !out.suggestedLanguage
      )
    ) {
      const ai = await geminiOfficialPages(
        env,
        name,
        type,
        matched
      );
      out.diagnostics.urlContext = ai.status;
      out.urlContextUsed =
        ai.status !== 'not-configured' &&
        ai.status !== 'no-matching-page';
      if (ai.status === 'retrieved') {
        out.geminiResponded = true;
        applyField(
          out,
          'boosters',
          ai.packs,
          'gemini-verified-verbatim-quote',
          ai.url,
          'Officiële productpagina via Gemini',
          'official-product'
        );
        applyField(
          out,
          'cardsPerPack',
          ai.cards,
          'gemini-verified-verbatim-quote',
          ai.url,
          'Officiële productpagina via Gemini',
          'official-product'
        );
        applyField(
          out,
          'language',
          ai.language,
          'gemini-verified-verbatim-quote',
          ai.url,
          'Officiële productpagina via Gemini',
          'official-product'
        );
        Object.assign(
          out.evidence,
          Object.fromEntries(
            Object.entries(ai.quotes)
              .filter(([, value]) => !!value)
          )
        );
      }
    }
    // Tweede onafhankelijke productbron.
    if (
      !out.verifiedFields.cardsPerPack ||
      !out.verifiedFields.boosters ||
      !out.verifiedFields.language
    ) {
      const seed = SECONDARY_SEEDS.find(
        p =>
          p.type === type &&
          norm(p.name) === norm(name)
      );
      const providedSecondary =
        Array.isArray(data.secondarySourceUrls)
          ? data.secondarySourceUrls.slice(0, 3)
          : [];
      out.diagnostics.secondarySearch = discovery.status;
      const secondaryUrls = [
        ...new Set(
          [
            ...(seed?.urls || []),
            ...providedSecondary,
            ...live.retailUrls,
            ...discovery.retailUrls
          ]
            .map(u => safeRetailUrl(u, env))
            .filter(Boolean)
        )
      ].slice(0, 6);
      const checkedRetail = await Promise.all(
        secondaryUrls.map(
          u => fetchRetail(u, env)
        )
      );
      out.diagnostics.secondaryFetch =
        checkedRetail.map(x => ({
          url: x.url,
          status: x.status,
          titleMatch: !!(
            x.html && (
              live.retailUrls.some(source => sameRetailProduct(source, x.url))
                ? [...x.html.matchAll(/<(?:h1|title)\b[^>]*>([\s\S]*?)<\/(?:h1|title)>/gi)]
                    .some(m => matchesLiveProductTitle(
                      name, htmlText(m[1]), type, language
                    ))
                : exactRetailTitleMatches(x.html, name, type)
            )
          )
        }));
      for (const item of checkedRetail) {
        const isLiveCandidate = live.retailUrls.some(source => sameRetailProduct(source, item.url));
        const matchLive = isLiveCandidate &&
          [...String(item.html || '').matchAll(/<(?:h1|title)\b[^>]*>([\s\S]*?)<\/(?:h1|title)>/gi)]
            .some(x => matchesLiveProductTitle(
              name, htmlText(x[1]), type, language
            ));
        // Never downgrade strict live matching to a looser legacy matcher.
        const titleMatch = isLiveCandidate
          ? matchLive : exactRetailTitleMatches(item.html, name, type);
        if (!item.html || !titleMatch) continue;
        // The fetched product page has independently confirmed packaging type.
        if (isLiveCandidate && matchLive) {
          out.suggestedProductType = type;
          out.verifiedFields.productType = true;
          out.provisionalFields.productType = false;
          out.evidence.productType = 'verified-retailer-product-title';
        }
        const text = htmlText(scopedProductHtml(item.html));
        const json = isLiveCandidate
          ? await fetchLiveProductJson(item.url, name, type, language)
          : { status:'not-live' };
        if (isLiveCandidate) {
          if (!out.diagnostics.productJsonFetch) out.diagnostics.productJsonFetch = [];
          out.diagnostics.productJsonFetch.push({
            url:item.url, status:json.status
          });
        }
        // JSON description is the actual product body, unlike broad storefront
        // HTML which may include unrelated items, popups, and recommendations.
        const productText = json.status === 'verified-title' && json.text
          ? json.text : text;
        const packs = countFromText(productText, 'packs');
        const cards = countFromText(productText, 'cards');
        const lang = productLanguageFromText(productText);
        applyField(
          out,
          'boosters',
          packs,
          'independent-retailer-live',
          item.url,
          'Onafhankelijke productpagina',
          'retailer-product'
        );
        applyField(
          out,
          'cardsPerPack',
          cards,
          'independent-retailer-live',
          item.url,
          'Onafhankelijke productpagina',
          'retailer-product'
        );
        applyField(
          out,
          'language',
          lang,
          'independent-retailer-live',
          item.url,
          'Onafhankelijke productpagina',
          'retailer-product'
        );
        // When live sources disagree, applyField must see ALL matching pages.
        // An early break would conceal contradictory counts or language.
        if (
          !live.retailUrls.length &&
          out.verifiedFields.cardsPerPack &&
          out.verifiedFields.boosters &&
          out.verifiedFields.language
        ) break;
      }
    }
    if (
      page &&
      !out.suggestedCardsPerPack
    ) {
      await applyBoosterGuide(
        out,
        page,
        language,
        type
      );
    }
  }
  // Name counts help users enter missing fields but are NEVER source verified.
  const hints = extractNameHints(name);
  const sourceConflict = key => (out.diagnostics.conflicts || []).some(c => c.field === key);
  const hintConflicts = [];
  if (hints.boosters && type !== 'pack' && type !== 'other') {
    if (out.verifiedFields.boosters && hints.boosters !== out.suggestedCount)
      hintConflicts.push({field: 'boosters', fromName: hints.boosters, fromSource: out.suggestedCount});
    else if (!out.verifiedFields.boosters && !sourceConflict('boosters') && !out.suggestedCount) {
      out.suggestedCount = hints.boosters;
      out.provisionalFields.boosters = true;
      out.evidence.packCount = 'product-name-hint-unverified';
    }
  }
  if (hints.cardsPerPack) {
    if (out.verifiedFields.cardsPerPack && hints.cardsPerPack !== out.suggestedCardsPerPack)
      hintConflicts.push({field: 'cardsPerPack', fromName: hints.cardsPerPack, fromSource: out.suggestedCardsPerPack});
    else if (!out.verifiedFields.cardsPerPack && !sourceConflict('cardsPerPack')) {
      out.suggestedCardsPerPack = hints.cardsPerPack;
      out.provisionalFields.cardsPerPack = true;
      out.evidence.cardsPerPack = 'product-name-hint-unverified';
    }
  }
  if (hints.language) {
    if (language && hints.language !== language) {
      hintConflicts.push({field: 'language', fromName: hints.language, fromInput: language});
    } else if (out.verifiedFields.language && hints.language !== out.suggestedLanguage) {
      hintConflicts.push({field: 'language', fromName: hints.language, fromSource: out.suggestedLanguage});
    } else if (!out.verifiedFields.language && !sourceConflict('language') && !out.suggestedLanguage) {
      out.suggestedLanguage = hints.language;
      out.provisionalFields.language = true;
      out.evidence.language = 'product-name-hint-unverified';
    }
  }
  if (hintConflicts.length) out.diagnostics.nameHintConflicts = hintConflicts;
  if (out.provisionalFields.boosters || out.provisionalFields.language ||
      out.evidence.cardsPerPack === 'product-name-hint-unverified') {
    out.diagnostics.nameHints = {
      boosters: out.provisionalFields.boosters ? hints.boosters : null,
      cardsPerPack: out.evidence.cardsPerPack === 'product-name-hint-unverified' ? hints.cardsPerPack : null,
      language: out.provisionalFields.language ? hints.language : null
    };
  }

  // A loose booster is one purchased product: not a package with a booster-count field.
  const requiresBoosterCount = type !== 'pack';
  const hasConflicts = (out.diagnostics.conflicts || []).length > 0;
  const ambiguousRegistry = out.diagnostics.registryStatus === 'ambiguous';
  const hasNameHintConflicts = hintConflicts.length > 0;
  out.sourceVerified = !!(
    (requiresBoosterCount && out.verifiedFields.boosters) ||
    out.verifiedFields.cardsPerPack
  );
  out.fieldConfidence = Object.fromEntries(['boosters','cardsPerPack','set','language','productType'].map(field => [field, labelFieldConfidence(field, out)]));
  out.confidence = hasConflicts ? 'conflict' : ambiguousRegistry ? 'partial' : out.sourceVerified
    ? 'source-backed'
    : out.verifiedFields.set
      ? 'partial'
      : 'unknown';
  out.status =
    (!requiresBoosterCount || out.verifiedFields.boosters) &&
    out.verifiedFields.cardsPerPack &&
    out.verifiedFields.set &&
    out.verifiedFields.language &&
    out.verifiedFields.productType &&
    !hasConflicts &&
    !ambiguousRegistry &&
    !hasNameHintConflicts
      ? 'match'
      : (
          out.sourceVerified ||
          out.verifiedFields.set
        )
        ? 'partial'
        : 'needs-review';
  out.missingFields = [
    requiresBoosterCount && !out.verifiedFields.boosters && 'boosters',
    !out.verifiedFields.cardsPerPack &&
      'cardsPerPack',
    !out.verifiedFields.language && 'language',
    !out.suggestedSet && 'set'
  ].filter(Boolean);
  if (hasConflicts) {
    out.warning = 'Tegenstrijdige productbronnen: conflicterende velden zijn leeggemaakt. Handmatige controle vereist.';
    out.status = 'needs-review';
  } else if (ambiguousRegistry) {
    out.warning = 'Meerdere uitvoeringen komen overeen met de opgegeven naam. Kies de exacte uitvoering; autofill is niet bevestigd.';
    out.status = 'needs-review';
  } else if (hasNameHintConflicts) {
    out.warning = 'De productnaam wijkt af van de bevestigde bron of ingevoerde taal. Controleer de uitvoering.';
    out.status = 'needs-review';
  } else if (out.missingFields.length) {
    out.warning =
      out.provisionalFields.boosters || out.provisionalFields.language ||
      out.evidence.cardsPerPack === 'product-name-hint-unverified'
        ? 'Productnaam bevat voorlopige autofillvoorstellen. Controleer aantal, taal en uitvoering.'
        : out.provisionalFields.cardsPerPack
          ? '10 kaarten is een voorlopig voorstel op basis van de officiële Amerikaanse boosterregel; bevestiging vereist.'
          : 'Niet alle velden zijn exact bewezen; ontbrekende waarden blijven leeg.';
  }
  return out;
}
// --- IMAGE LOOKUP 2.1.4: exact Cardmarket page + verified TCGdex fallback ---
const IMAGE_LANGUAGES = { EN: 'en', JP: 'ja', KR: 'ko', 'ZH-CN': 'zh-cn', 'ZH-TW': 'zh-tw', FR: 'fr', DE: 'de', IT: 'it', ES: 'es' };
const IMAGE_HOSTS = new Set([
  'product-images.s3.cardmarket.com',
  'product-images.cardmarket.com',
  'assets.tcgdex.net'
]);
function readableUrl(value, allowedHosts) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowedHosts.has(url.hostname)) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}
function cardmarketSingleUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.port || url.username || url.password ||
        !['www.cardmarket.com', 'cardmarket.com'].includes(url.hostname)) return null;
    if (!/^\/(?:en|de|fr|it|es)\/Pokemon\/Products\/Singles\/[^/]+\/[^/]+\/?$/i.test(url.pathname)) return null;
    url.search = '';
    url.hash = '';
    return url.href;
  } catch { return null; }
}
function parseCardmarketSingle(url) {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  const set = decodeURIComponent(parts[4] || '').replace(/-/g, ' ');
  const slug = decodeURIComponent(parts[5] || '');
  const tokens = slug.split('-').filter(Boolean);
  const last = tokens[tokens.length - 1] || '';
  // Example SV3 -> 3; 30C066 -> 066; GG45/TG17 -> GG45/TG17.
  let number = '';
  if (/^(?:SV|30C|XY|SM|SWSH)0*\d{1,4}$/i.test(last)) {
    number = last.replace(/^[A-Z]+/i, '');
  } else if (/^(?:GG|TG|RC|SV|XY|SM)\d{1,4}$/i.test(last)) {
    number = last;
  } else if (/^\d{1,4}$/.test(last)) {
    number = last;
  }
  if (number) tokens.pop();
  const variantMarkers = tokens.filter(t => /^V\d+$/i.test(t));
  const name = tokens.filter(t => !/^V\d+$/i.test(t)).join(' ');
  return { set, name, number, variantMarker: variantMarkers.join(',') || null };
}
function normalizeCardName(value) {
  return norm(value).replace(/\blv\s+(\d+)\b/g, 'lv$1').replace(/\blevel\s+(\d+)\b/g, 'lv$1');
}
function sameCardName(expected, actual) {
  const a = normalizeCardName(expected);
  const b = normalizeCardName(actual);
  return !!a && !!b && a === b;
}
function normalizeCardNumber(value) {
  const v = String(value || '').trim().replace(/\s+/g, '').toUpperCase();
  return /^0*\d+$/.test(v) ? String(Number(v)) : v;
}
function decodeHtmlValue(s) {
  return String(s || '').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Number(n)));
}
function pageMeta(html) {
  const values = new Map();
  const metas = String(html || '').match(/\<meta\b[^>]*>/gi) || [];
  for (const tag of metas) {
    const attrs = {};
    for (const match of tag.matchAll(/([a-zA-Z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[match[1].toLowerCase()] = decodeHtmlValue(match[2] ?? match[3]);
    }
    const key = String(attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content && !values.has(key)) values.set(key, attrs.content);
  }
  return {
    image: values.get('og:image:secure_url') || values.get('og:image') || values.get('twitter:image') || null,
    title: values.get('og:title') || values.get('twitter:title') ||
      decodeHtmlValue(html.match(/\<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
  };
}
async function verifyImage(url) {
  const safe = readableUrl(url, IMAGE_HOSTS);
  if (!safe) return { ok: false, reason: 'image-host-not-allowed' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    // Range GET is more reliable than HEAD on image CDNs; the body is not downloaded.
    const response = await fetch(safe, {
      method: 'GET', redirect: 'manual', signal: controller.signal,
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8', Range: 'bytes=0-0' }
    });
    const type = (response.headers.get('Content-Type') || '').toLowerCase();
    const length = Number(response.headers.get('Content-Length') || 0);
    const ok = (response.status === 200 || response.status === 206) &&
      /^image\/(?:webp|jpeg|png|avif)(?:;|$)/.test(type) && length < 12000000;
    if (response.body) await response.body.cancel().catch(() => {});
    return { ok, reason: ok ? 'verified' : `image-http-${response.status}` };
  } catch { return { ok: false, reason: 'image-network-error' }; }
  finally { clearTimeout(timer); }
}
async function fetchJsonSafe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);
  try {
    const response = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/json' }, cf: { cacheTtl: 86400 } });
    if (!response.ok || response.status >= 300 ||
        Number(response.headers.get('Content-Length') || 0) > 1800000 ||
        !(response.headers.get('Content-Type') || '').includes('json')) return null;
    const raw = await response.text();
    if (raw.length > 1800000) return null;
    return JSON.parse(raw);
  } catch { return null; }
  finally { clearTimeout(timer); }
}
async function tcgdexImageCandidates(query, diagnostics) {
  if (!query.setName || !query.cardNumber || !query.cardName) {
    diagnostics.tcgdex = 'insufficient-identity';
    return [];
  }
  const lang = IMAGE_LANGUAGES[query.language];
  const locales = lang ? [lang] : SET_LANGUAGES;
  const perLanguage = await Promise.all(locales.map(async locale => {
    const allSets = await fetchJsonSafe(`https://api.tcgdex.net/v2/${locale}/sets`);
    if (!Array.isArray(allSets)) return [];
    const exact = allSets.filter(s => normalizeCardName(s.name) === normalizeCardName(query.setName));
    if (exact.length !== 1) return [];
    const s = exact[0];
    const set = await fetchJsonSafe(`https://api.tcgdex.net/v2/${locale}/sets/${encodeURIComponent(s.id)}`);
    if (!Array.isArray(set?.cards)) return [];
    const cards = set.cards.filter(c => normalizeCardNumber(c.localId) === normalizeCardNumber(query.cardNumber));
    const found = [];
    for (const c of cards) {
      if (!sameCardName(query.cardName, c.name) || !c.image) continue;
      const image = readableUrl(`${String(c.image).replace(/\/$/, '')}/high.webp`, IMAGE_HOSTS);
      if (!image) continue;
      const checked = await verifyImage(image);
      if (!checked.ok) continue;
      found.push({
        imageUrl: image,
        imageSource: 'TCGdex',
        cardName: c.name,
        cardNumber: c.localId,
        setName: s.name,
        language: locale.toUpperCase().replace('JA', 'JP').replace('KO', 'KR'),
        tcgdexId: c.id,
        sourceUrl: `https://api.tcgdex.net/v2/${locale}/cards/${encodeURIComponent(c.id)}`
      });
    }
    return found;
  }));
  const found = perLanguage.flat();
  diagnostics.tcgdex = found.length ? 'found-exact-candidates' : 'no-exact-image';
  return found.slice(0, 6);
}
async function serveVerifiedImage(imageUrl, request, origin) {
  const safe = readableUrl(imageUrl, IMAGE_HOSTS);
  if (!safe) return reply({ error: 'Afbeeldingsbron niet toegestaan' }, 400, origin);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7500);
  try {
    const upstream = await fetch(safe, {
      method: 'GET', redirect: 'manual', signal: controller.signal,
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg' },
      cf: { cacheTtl: 86400 }
    });
    const type = (upstream.headers.get('Content-Type') || '').toLowerCase().split(';')[0].trim();
    const length = Number(upstream.headers.get('Content-Length') || 0);
    if (!upstream.ok || !['image/webp', 'image/jpeg', 'image/png', 'image/avif'].includes(type)) {
      if (upstream.body) await upstream.body.cancel().catch(() => {});
      return reply({ error: 'Afbeelding niet bereikbaar', upstreamStatus: upstream.status }, 502, origin);
    }
    if (length > 8000000) {
      if (upstream.body) await upstream.body.cancel().catch(() => {});
      return reply({ error: 'Afbeelding te groot' }, 413, origin);
    }
    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > 8000000) return reply({ error: 'Afbeelding te groot' }, 413, origin);
    const headers = {
      'Content-Type': type, 'Cache-Control': 'private, max-age=600',
      'X-Content-Type-Options': 'nosniff', Vary: 'Origin'
    };
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    return new Response(buffer, { status: 200, headers });
  } catch {
    return reply({ error: 'Afbeelding kon niet opgehaald worden' }, 502, origin);
  } finally { clearTimeout(timer); }
}
async function imageLookup(data, env) {
  const rawUrl = data?.cardmarketUrl ?? data?.cardmarketLink ?? data?.productUrl ?? data?.sourceUrl ?? data?.url;
  const pageUrl = cardmarketSingleUrl(rawUrl);
  if (!pageUrl) return { error: 'Een geldige Cardmarket-link naar een losse kaart is vereist', httpStatus: 400 };
  const parsed = parseCardmarketSingle(pageUrl);
  const suppliedLanguage = data?.language ? languageCode(data.language) : null;
  const query = {
    cardName: String(data?.cardName || data?.name || data?.productName || parsed.name).trim().slice(0, 140),
    setName: String(data?.setName || data?.set || data?.expansionName || parsed.set).trim().slice(0, 120),
    cardNumber: String(data?.cardNumber || data?.collectorNumber || data?.number || parsed.number).trim().slice(0, 30),
    language: suppliedLanguage
  };
  const diagnostics = { cardmarket: 'not-checked', tcgdex: 'not-checked' };
  const result = {
    version: VERSION, status: 'needs-review', cardmarketUrl: pageUrl,
    cardName: query.cardName, cardNumber: query.cardNumber || null,
    setName: query.setName, language: query.language,
    imageUrl: null, imageSource: null, imageDelivery: null, sourceUrl: null,
    requiresConfirmation: true, candidates: [], diagnostics
  };
  const page = await fetchRetail(pageUrl, env);
  diagnostics.cardmarket = `http-${page.status}`;
  if (page.html) {
    const meta = pageMeta(page.html);
    // A meta image from the exact requested page, not a broad Google search image.
    const image = meta.image && readableUrl(new URL(meta.image, pageUrl).href, IMAGE_HOSTS);
    const nameMatches = !query.cardName || normalizeCardName(meta.title).includes(normalizeCardName(query.cardName));
    if (image && nameMatches) {
      const test = await verifyImage(image);
      diagnostics.cardmarketImage = test.reason;
      if (test.ok) {
        Object.assign(result, {
          status: 'match', imageUrl: image, imageSource: 'Cardmarket', imageDelivery: 'authenticated-worker-proxy', sourceUrl: pageUrl,
          requiresConfirmation: false
        });
        return result;
      }
    } else diagnostics.cardmarketImage = image ? 'title-mismatch' : 'no-product-image-metadata';
  }
  const candidates = await tcgdexImageCandidates(query, diagnostics);
  if (candidates.length) {
    result.candidates = candidates;
    const unique = candidates.filter((c, i, all) => all.findIndex(x => x.tcgdexId === c.tcgdexId && x.language === c.language) === i);
    // A Cardmarket "V1" / "V2" identifier is a version distinction that TCGdex may not encode.
    const hasVariantDetail = Boolean(parsed.variantMarker || data?.variant || data?.finish ||
      data?.edition || data?.firstEdition || data?.isReverse || data?.holoType);
    const exact = unique.length === 1 && !!query.language && !hasVariantDetail;
    const first = unique[0];
    Object.assign(result, {
      status: exact ? 'match' : 'suggestion',
      imageUrl: exact ? first.imageUrl : null,
      imageSource: exact ? first.imageSource : null,
      imageDelivery: exact ? 'direct' : null,
      sourceUrl: exact ? first.sourceUrl : null,
      requiresConfirmation: !exact
    });
    diagnostics.versionQualifier = String(data?.variant || data?.finish || data?.edition ||
      (data?.firstEdition ? 'firstEdition' : '') || (data?.isReverse ? 'reverse' : '') ||
      data?.holoType || parsed.variantMarker || '') || null;
  }
  return result;
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const origin = allowedOrigin(request, env);
    if (request.method === 'GET' && path === '/testlab') {
      return new Response(renderTestLab(), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'X-Frame-Options': 'DENY',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        }
      });
    }
    if (
      request.method === 'GET' &&
      (
        path === '/' ||
        path === '/health'
      )
    ) {
      return reply({
        status: 'online',
        version: VERSION,
        model:
          env.GEMINI_MODEL || DEFAULT_MODEL,
        geminiConfigured:
          !!env.GEMINI_API_KEY,
        accessConfigured:
          !!env.KEEPFLIP_ACCESS_TOKEN,
        registryConfigured:
          !!registryUrl(env.KEEPFLIP_REGISTRY_URL),
        liveSearchEnabled: String(env.DIRECT_WEB_DISCOVERY || '').toLowerCase() === 'true',
        googleSearchEnabled:
          String(env.ENABLE_GOOGLE_SEARCH || '')
            .toLowerCase() === 'true'
      }, 200, origin);
    }
    if (
      request.method === 'OPTIONS' &&
      (path === '/lookup' || path === '/image-lookup' || path === '/image')
    ) {
      if (!origin) {
        return reply({
          error: 'Origin niet toegestaan'
        }, 403);
      }
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers':
            'Authorization, Content-Type',
          'Access-Control-Allow-Methods':
            'GET, POST, OPTIONS',
          'Access-Control-Max-Age': '600',
          Vary: 'Origin'
        }
      });
    }
    if (
      !(request.method === 'POST' && (path === '/lookup' || path === '/image-lookup')) &&
      !(request.method === 'GET' && path === '/image')
    ) {
      return reply({
        error: 'Niet gevonden'
      }, 404, origin);
    }
    if (
      request.headers.has('Origin') &&
      !origin
    ) {
      return reply({
        error: 'Origin niet toegestaan'
      }, 403);
    }
    if (!env.KEEPFLIP_ACCESS_TOKEN) {
      return reply({
        error:
          'KEEPFLIP_ACCESS_TOKEN ontbreekt'
      }, 503, origin);
    }
    const authorization =
      request.headers.get('Authorization') || '';
    if (
      !authorization.startsWith('Bearer ') ||
      !(await tokenMatches(
        authorization.slice(7),
        env.KEEPFLIP_ACCESS_TOKEN
      ))
    ) {
      return reply({
        error: 'Niet ingelogd'
      }, 401, origin);
    }
    try {
      if (path === '/image') {
        return await serveVerifiedImage(new URL(request.url).searchParams.get('url'), request, origin);
      }
      if (
        Number(
          request.headers.get('Content-Length') || 0
        ) > MAX_BODY
      ) {
        return reply({
          error: 'Te groot'
        }, 413, origin);
      }
      const raw = await request.text();
      if (raw.length > MAX_BODY) {
        return reply({
          error: 'Te groot'
        }, 413, origin);
      }
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return reply({
          error: 'Ongeldige JSON'
        }, 400, origin);
      }
      const out = path === '/image-lookup'
        ? await imageLookup(data, env)
        : await lookup(data, env);
      if (out.httpStatus) {
        return reply({
          error: out.error
        }, out.httpStatus, origin);
      }
      return reply(out, 200, origin);
    } catch {
      return reply({
        error:
          'Verzoek mislukt; voorraad ongewijzigd'
      }, 502, origin);
    }
  }
};

// Pure helper exported for regression tests; no public HTTP exposure.
export { countFromText };
