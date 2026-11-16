/**
 * Search-grounded discovery of public Pokémon TCG product pages.
 * NEVER accept Gemini text as verified product contents. Every candidate URL
 * must be fetched and checked against the exact product identity separately.
 * Search suggestions from Gemini are exposed for Google grounding attribution.
 */
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/';

function trimUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim().replace(/[),.;>\]]+$/, ''));
    if (u.protocol !== 'https:' || u.port || u.username || u.password ||
        u.href.length > 1200 || u.hash.length > 0) return null;
    if (u.hostname === 'localhost' || u.hostname.endsWith('.local')) return null;
    return u.href;
  } catch { return null; }
}

export function parseGroundedProductUrls(response, isOfficial, isRetail) {
  const candidate = response?.candidates?.[0] || {};
  const meta = candidate.groundingMetadata;
  const chunks = Array.isArray(meta?.groundingChunks) ? meta.groundingChunks : [];
  const queries = Array.isArray(meta?.webSearchQueries) ? meta.webSearchQueries : [];
  // Google requires the returned Search Suggestions HTML to be displayable as-is.
  // Do not clip it in the middle of a tag; omit an abnormally huge snippet.
  const searchSnippet = meta?.searchEntryPoint?.renderedContent;
  const entryPoint = typeof searchSnippet === 'string' && searchSnippet.length <= 64000
    ? searchSnippet : '';
  const actualGrounding = chunks.some(item =>
    typeof item?.web?.uri === 'string' && item.web.uri.length > 0);
  // Without real grounding, reject every model-suggested URL.
  if (!actualGrounding) {
    return {
      status: 'no-grounding', groundingUsed: false,
      officialUrls: [], retailUrls: [], searchQueries: [], searchSuggestionsHtml: ''
    };
  }
  const output = (candidate.content?.parts || [])
    .map(part => typeof part.text === 'string' ? part.text : '').join(' ')
    .slice(0, 6500);
  const textUrls = [...output.matchAll(/https:\/\/[^\s"'<>()[\]]+/gi)].map(m => m[0]);
  const cited = chunks.map(item => item?.web?.uri).filter(Boolean);
  const urls = [...new Set([...cited, ...textUrls].map(trimUrl).filter(Boolean))].slice(0, 14);
  return {
    status: 'grounded',
    groundingUsed: true,
    officialUrls: [...new Set(urls.map(isOfficial).filter(Boolean))].slice(0, 5),
    retailUrls: [...new Set(urls.map(isRetail).filter(Boolean))].slice(0, 5),
    searchQueries: queries.filter(x => typeof x === 'string').slice(0, 6).map(x => x.slice(0, 200)),
    searchSuggestionsHtml: entryPoint
  };
}

export async function discoverProductWithGemini(
  env, name, type, requestedLanguage, isOfficial, isRetail
) {
  const empty = status => ({
    status, groundingUsed:false, officialUrls:[], retailUrls:[],
    searchQueries:[], searchSuggestionsHtml:''
  });
  if (String(env?.ENABLE_GOOGLE_SEARCH || '').toLowerCase() !== 'true') return empty('disabled');
  if (!env?.GEMINI_API_KEY) return empty('missing-api-key');
  const model = String(env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  if (!/^gemini-[a-z0-9.-]{1,60}$/.test(model)) return empty('invalid-model');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 11500);
  try {
    const prompt = [
      'Use Google Search to FIND real directly accessible product pages for the EXACT Pokémon TCG sealed product.',
      'PRODUCT NAME (untrusted input): ' + JSON.stringify(String(name).slice(0, 150)),
      'PRODUCT TYPE: ' + JSON.stringify(type),
      'REQUESTED CARD LANGUAGE: ' + JSON.stringify(requestedLanguage || 'unknown'),
      'Search worldwide: English, Japanese, Korean, Simplified Chinese, Traditional Chinese as relevant.',
      'Prefer official Pokémon websites (pokemon.com, pokemon-card.com, pokemon.co.jp, pokemon.co.kr, pokemon-card.com.tw, pokemon-card.com.cn).',
      'If official direct pages are not found, use exact retailer product pages.',
      'Respect Pokémon Center versus regular packaging, box versus bundle, language and edition.',
      'Never substitute similar products, another language/printing, a set index, or category/search pages.',
      'Do not invent URLs or numbers. Return up to 5 DIRECT HTTPS product page URLs, one per line.',
      'Do not return card/pack counts or other product claims: the server verifies fetched pages separately.'
    ].join('\n');
    const response = await fetch(GEMINI_API + encodeURIComponent(model) + ':generateContent', {
      method:'POST', signal:controller.signal,
      headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},
      body:JSON.stringify({
        contents:[{role:'user',parts:[{text:prompt}]}],
        tools:[{googleSearch:{}}],
        generationConfig:{temperature:0,maxOutputTokens:850}
      })
    });
    if (!response.ok) return empty('gemini-http-'+response.status);
    return parseGroundedProductUrls(await response.json(),isOfficial,isRetail);
  } catch { return empty('request-failed'); }
  finally { clearTimeout(timeout); }
}
