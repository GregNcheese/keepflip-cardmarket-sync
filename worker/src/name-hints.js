import { editionTags } from './product-identity.js';

/**
 * Tentative product-name hints only. No name content is a verified fact.
 * Parse explicit counts and explicit language only; never infer normal
 * booster contents from country, set, product type or website language.
 */
export function extractNameHints(productName) {
  const text = String(productName || '').slice(0, 200);
  const extract = patterns => {
    const candidates = new Set();
    for (const re of patterns) {
      for (const match of text.matchAll(re)) {
        const n = Number(match[1]);
        if (Number.isInteger(n) && n >= 1 && n <= 200) candidates.add(n);
      }
    }
    return candidates.size === 1 ? [...candidates][0] : null;
  };
  const boosters = extract([
    /\b(\d{1,3})\s*(?:x\s*)?(?:pok[eé]mon\s+)?(?:tcg\s+)?(?:booster\s*)?packs?\b/gi,
    /\b(?:booster\s*)?packs?\s*(?:x|×|:)\s*(\d{1,3})\b/gi,
    /(\d{1,3})\s*(?:パック|팩|包)(?![\p{L}])/gu,
    /(?:パック|팩|包)\s*(?:x|×|:)\s*(\d{1,3})(?!\d)/giu
  ]);
  const cardsPerPack = extract([
    /\b(\d{1,3})\s*(?:game\s+)?cards?\s*(?:per|in each|\/)\s*(?:booster\s*)?packs?\b/gi,
    /\b(\d{1,3})\s*kaarten\s*per\s*(?:booster|pack)\b/gi,
    /\b(?:cards? per (?:booster\s*)?pack|kaarten per booster)\s*(?:[:=]\s*|\s+)(\d{1,3})\b/gi,
    /\b(\d{1,3})[- ]card\s+booster\s*pack\b/gi,
    /(?:1パック|1팩|每包)\s*(?:=|:|に|含|당)?\s*(\d{1,3})\s*(?:枚|장|张|張)/gu
  ]);
  const langs = new Set(editionTags(text)
    .map(tag => ({
      japanese: 'JP', korean: 'KR', english: 'EN',
      'zh-cn': 'ZH-CN', 'zh-tw': 'ZH-TW'
    })[tag]).filter(Boolean));
  return {
    boosters,
    cardsPerPack,
    language: langs.size === 1 ? [...langs][0] : null,
    origin: 'product-name-unverified'
  };
}
