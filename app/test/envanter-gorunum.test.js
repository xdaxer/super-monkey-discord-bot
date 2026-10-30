import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BOS, kartIzgarasi, kucukSayi, puanSatiri, SATIR_BASINA,
} from '../lib/envanter-gorunum.js';
import { KARTLAR } from '../lib/kasalar.js';

const emoji = (k) => `<${k.kimlik}>`;

describe('envanter görünümü (zoo düzeni)', () => {
  it('küçük sayılar basamağa göre dolduruluyor', () => {
    assert.equal(kucukSayi(0, 2), '⁰⁰');
    assert.equal(kucukSayi(7, 2), '⁰⁷');
    assert.equal(kucukSayi(123), '¹²³');
  });

  it('her nadirlik bir grup, sahip olunmayan ❔⁰⁰, satır başına 7 kart', () => {
    const izgara = kartIzgarasi({ 'kart-quincy': 2, 'kart-lych': 12 }, emoji);
    const satirlar = izgara.split('\n');
    assert.equal(satirlar.filter((s) => /^[⚪🔵🟣🟡🔴]/u.test(s)).length, 5);
    assert.match(izgara, /<kart-quincy>⁰²/);
    assert.match(izgara, /<kart-lych>¹²/);
    assert.equal((izgara.match(new RegExp(BOS, 'g')) ?? []).length, KARTLAR.length - 2);
    for (const s of satirlar) assert.ok(s.split(' ').filter((h) => /[⁰-⁹]/u.test(h)).length <= SATIR_BASINA);
  });

  it('puan satış değerlerinin toplamı, sayım M→S sırasında', () => {
    const { puan, metin } = puanSatiri({ 'kart-quincy': 2, 'kart-lych_elite': 1, 'kart-ace': 3 });
    assert.equal(puan, 2 * 6_000 + 100_000 + 3 * 400);
    assert.equal(metin, 'M-1, E-0, D-2, N-0, S-3');
  });
});
