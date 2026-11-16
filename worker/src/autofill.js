/**
 * Conservative product-name and sealed-content helpers for Keep & Flip.
 * Never converts a name hint into independently verified product facts.
 */
export function inferProductType(productName) {
  const name = String(productName || '').toLowerCase()
    .replace(/[‐‑‒–—]/g, '-').replace(/\s+/g, ' ').trim();
  // Cases and blisters may contain multiple independently packaged products.
  // They must not be mistaken for a single booster box / booster pack.
  if (/\b(?:booster case|display case|case of boxes|3[- ]pack blister|three[- ]pack blister)\b/.test(name)) return null;
  if (/\b(?:ultra[- ]premium collection|ultra[- ]premium box|upc)\b/.test(name)) return 'upc';
  if (/\b(?:elite[- ]trainer[- ]box|elite trainer box|elite trainerbox|etb)\b/.test(name)) return 'etb';
  if (/\b(?:booster bundle|boosterbundel|booster\s*bundel)\b/.test(name)) return 'bundle';
  if (/\b(?:booster (?:display )?box|booster display|boosterdisplay|display box|expansion pack box|high class pack box)\b/.test(name)) return 'box';
  // Japanese / Korean / Chinese sealed packaging labels.
  if (/(?:拡張パック|強化拡張パック|ハイクラスパック)[\s\S]{0,40}(?:box|ボックス|箱)/i.test(name) ||
      /(?:확장팩|부스터팩)[\s\S]{0,40}(?:박스|box)/i.test(name) ||
      /(?:补充包|補充包)[\s\S]{0,40}(?:盒|box|整盒)/i.test(name)) return 'box';
  if (/\b(?:blister|collection box|premium collection|booster box|booster bundle|three[- ]pack|3[- ]pack)\b/.test(name)) return null;
  if (/\b(?:sleeved booster(?: pack)?|single booster(?: pack)?|loose booster(?: pack)?|booster pack|expansion pack)\b/.test(name)) return 'pack';
  if (/(?:拡張パック|強化拡張パック|ハイクラスパック|확장팩|부스터팩|补充包|補充包)/i.test(name)) return 'pack';
  return null;
}
const NUMBER_WORDS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, sixteen: 16, eighteen: 18, twenty: 20,
  'twenty-four': 24, 'thirty-six': 36
});
const toCount = value => {
  if (!value) return null;
  const n = NUMBER_WORDS[value.toLowerCase()] ?? Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 200 ? n : null;
};
const unique = items => {
  const distinct = [...new Set(items.filter(Number.isInteger))];
  return distinct.length === 1 ? distinct[0] : null;
};

export function additionalCount(text, field) {
  const input = String(text || '').slice(0, 180000);
  const patterns = field === 'packs'
    ? [
        /\b(?:contains?|includes?|with|features?|comes with|holds?)\s+(?:a total of\s+)?(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|sixteen|eighteen|twenty-four|thirty-six)\s+(?:pok[eé]mon\s+(?:tcg\s+)?)?booster\s*packs?\b/gi,
        /\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|sixteen|eighteen|twenty-four|thirty-six)\s+(?:pok[eé]mon\s+(?:tcg\s+)?)?booster\s*packs?\s+(?:inside|included|in the box|per box)\b/gi,
        /(?:1\s*BOX|1\s*ボックス|1\s*箱)\s*(?:=|:|に|contains?)\s*(\d{1,3})\s*(?:パック|팩|包)/gi,
        /(?:1\s*박스|1\s*盒)\s*(?:=|:|에|含)\s*(\d{1,3})\s*(?:팩|包)/gi
      ]
    : field === 'cards'
      ? [
          /\b(?:each|every|one)\s+(?:pok[eé]mon\s+(?:tcg\s+)?)?booster\s*pack\s+(?:contains?|includes?|has)\s+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:additional\s+|game\s+)?cards?\b/gi,
          /\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:additional\s+|game\s+)?cards?\s+(?:in|inside|per)\s+(?:each|every|one|a)\s+(?:booster\s+)?packs?\b/gi,
          /(?:1\s*パック|1\s*팩|每包)\s*(?:=|:|に|당|含)?\s*(\d{1,3})\s*(?:枚|장|张|張)/gi
        ]
      : [];
  const found = [];
  for (const pattern of patterns) {
    for (const m of input.matchAll(pattern)) found.push(toCount(m[1]));
  }
  return unique(found);
}

export function mergeCountEvidence(legacy, added) {
  if (legacy === null || legacy === undefined) return added ?? null;
  if (added === null || added === undefined) return legacy;
  return legacy === added ? legacy : null;
}

export function labelFieldConfidence(field, out) {
  if ((out.diagnostics?.conflicts || []).some(x => x.field === field)) return 'conflict';
  if (out.verifiedFields?.[field]) return 'verified';
  if (out.provisionalFields?.[field]) return 'provisional';
  return 'missing';
}

/**
 * Recognize ONLY explicitly described card language, never the language
 * of the website, shopper location, URL domain, or set's listing.
 * Conflicting language statements produce no auto-filled value.
 */
export function explicitCardLanguage(text) {
  const source = String(text || '').slice(0, 160000);
  const aliases = {
    english: 'EN', engels: 'EN', '英語': 'EN', '영어': 'EN', '英语': 'EN',
    japanese: 'JP', japans: 'JP', '日本語': 'JP', '일본어': 'JP', '日语': 'JP', '日語': 'JP',
    korean: 'KR', koreaans: 'KR', '韓国語': 'KR', '한국어': 'KR', '韩语': 'KR', '韓語': 'KR',
    'simplified chinese': 'ZH-CN', 'vereenvoudigd chinees': 'ZH-CN', '简体中文': 'ZH-CN', '簡體中文': 'ZH-CN',
    'traditional chinese': 'ZH-TW', 'traditioneel chinees': 'ZH-TW', '繁体中文': 'ZH-TW', '繁體中文': 'ZH-TW',
    german: 'DE', duits: 'DE', french: 'FR', frans: 'FR', italian: 'IT', italiaans: 'IT',
    spanish: 'ES', spaans: 'ES', dutch: 'NL', nederlands: 'NL'
  };
  const languages = Object.keys(aliases).sort((a,b) => b.length - a.length).join('|');
  const latin = new RegExp(
    '(?:card language|language of (?:the )?cards|product language|cards? (?:are|printed) in|kaarttaal|taal)' +
    '\\s*[:：–-]?\\s*(' + languages + ')(?=$|[\\s,.;:!\\)\\]]|<)',
    'gi'
  );
  const asian = /(?:カード言語|言語|언어|카드 언어|卡牌语言|卡牌語言|语言|語言)\s*[:：]\s*(日本語|英語|韓国語|한국어|일본어|영어|日语|日語|韩语|韓語|简体中文|簡體中文|繁体中文|繁體中文)/g;
  const codes = new Set();
  for (const m of source.matchAll(latin)) codes.add(aliases[m[1].toLowerCase()]);
  for (const m of source.matchAll(asian)) codes.add(aliases[m[1].toLowerCase()]);
  return codes.size === 1 ? [...codes][0] : null;
}
