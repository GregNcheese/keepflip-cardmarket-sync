/**
 * Manual/CI probe of PUBLIC storefront searches only.
 * No secrets, no user token, no Gemini, no mutation, no inventory access.
 * This is an online smoke check, not a source of confirmed pack counts.
 */
import { discoverLiveProductPages } from '../src/live-product-search.js';

const env={ DIRECT_WEB_DISCOVERY:'true' };
const cases=[
  ['Pokemon Card 151 Japanese Booster Box','box','JP'],
  ['Pokemon TCG Simplified Chinese Gem Pack Vol 1 Booster Box','box','ZH-CN'],
  ['Scarlet & Violet Paldean Fates Booster Bundle','bundle','EN']
];
let successes=0;
for (const [name,type,language] of cases) {
  const result=await discoverLiveProductPages(env,name,type,language);
  if (result.retailUrls.length) successes++;
  console.log(JSON.stringify({
    name, status:result.status,
    providers:result.diagnostics,
    candidates:result.retailUrls
  }));
}
console.log('Public source search cases with at least one matching product:',successes+'/'+cases.length);
if (successes===0) process.exitCode=1;
