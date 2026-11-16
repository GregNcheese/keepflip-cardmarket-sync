import test from 'node:test';
import assert from 'node:assert/strict';
import { countFromText } from '../src/index.js';

test('151 in Pokémon set name never turns into 151 booster packs', () => {
  assert.equal(countFromText('Pokémon 151 Booster Bundle includes 6 booster packs.', 'packs'), 6);
  assert.equal(countFromText('Pokémon 151 booster packs are now available.', 'packs'), null);
  assert.equal(countFromText('Scarlet Violet 151 comes with six Pokémon TCG booster packs.', 'packs'), 6);
});

test('accessories and long word gaps do not become booster counts', () => {
  assert.equal(countFromText('Crown Zenith: 70 card sleeves and 10 Pokémon TCG booster packs.', 'packs'), 10);
  assert.equal(countFromText('Contains 9 booster packs and 65 card sleeves.', 'packs'), 9);
  assert.equal(countFromText('The 70 sleeves are bundled with a small collector book and code card. There are 10 booster packs.', 'packs'), 10);
});

test('JP and simplified Chinese actual count formats remain supported', () => {
  assert.equal(countFromText('Aantal booster packs per box: 20 packs', 'packs'), 20);
  assert.equal(countFromText('Aantal kaarten per pack: 7 kaarten', 'cards'), 7);
  assert.equal(countFromText('Aantal booster packs per box: 15 packs', 'packs'), 15);
  assert.equal(countFromText('Aantal kaarten per pack: 4 kaarten', 'cards'), 4);
});

test('modern English 36-box and 10-card packs stay readable', () => {
  assert.equal(countFromText('Includes 36 Pokémon TCG booster packs.', 'packs'), 36);
  assert.equal(countFromText('Each booster pack contains 10 game cards.', 'cards'), 10);
});

test('conflicting explicit pack counts cannot be confirmed', () => {
  assert.equal(countFromText('Includes 9 booster packs. Also includes 11 booster packs.', 'packs'), null);
});

test('large or unrelated quantities remain unconfirmed', () => {
  assert.equal(countFromText('151 booster packs', 'packs'), null);
  assert.equal(countFromText('80 booster packs', 'packs'), null);
  assert.equal(countFromText('65 cards per booster pack', 'cards'), null);
});
