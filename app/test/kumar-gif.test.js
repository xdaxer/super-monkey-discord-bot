import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AT_KOSU_KARESI, CARK_SIRASI, RULET_EN_AZ_HEDEF, RULET_GENISLIK, RULET_HUCRE, SLOT_HUCRE, atGifiUret,
  eslesenMakaralar, makaraKaymasi, makaraSeridi, ruletGifiUret, ruletKaymasi, ruletSeridi, slotGifiUret, yarisKonumlari, duelloAtGifiUret,
} from '../lib/kumar-gif.js';

function tohumlu(tohum = 1) {
  let x = tohum;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}

test('çark sırası 0–36 sayılarını birer kez içerir', () => {
  assert.equal(CARK_SIRASI.length, 37);
  assert.deepEqual([...CARK_SIRASI].sort((a, b) => a - b), Array.from({ length: 37 }, (_, i) => i));
});

test('rulet şeridi: hedef hücrede çıkan sayı, sıra çarkla aynı', () => {
  const rastgele = tohumlu(7);
  for (let sayi = 0; sayi <= 36; sayi += 1) {
    const { serit, hedef } = ruletSeridi(sayi, rastgele);
    assert.equal(serit[hedef], sayi);
    assert.ok(hedef >= RULET_EN_AZ_HEDEF);
    assert.ok(serit.length > hedef + 5, 'hedefin sağında görünen hücreler olmalı');
    const i = CARK_SIRASI.indexOf(serit[0]);
    assert.equal(serit[1], CARK_SIRASI[(i + 1) % 37]);
  }
});

test('rulet kayması sonda hedefi tam ortaya getirir', () => {
  const hedef = 70;
  const k = ruletKaymasi(hedef, 1);
  assert.equal(Math.floor((k + RULET_GENISLIK / 2) / RULET_HUCRE), hedef);
  assert.equal(ruletKaymasi(hedef, 0), 0);
});

test('makara şeridi: sonuç sondan bir önceki hücrede ve kayma onu ortaya getirir', () => {
  const serit = makaraSeridi('🍌', 30, tohumlu(3));
  assert.equal(serit[28], '🍌');
  // Pencerenin üstü 27. hücre → orta satır 28.
  assert.equal(makaraKaymasi(30, 1) / SLOT_HUCRE, 27);
});

test('eşleşen makaralar slot çarpanıyla uyumlu', () => {
  assert.deepEqual(eslesenMakaralar(['🍒', '🍒', '🍒']), [0, 1, 2]);
  assert.deepEqual(eslesenMakaralar(['🍒', '🍒', '🍋']), [0, 1]);
  assert.deepEqual(eslesenMakaralar(['🍒', '🍋', '🍒']), [0, 2]);
  assert.deepEqual(eslesenMakaralar(['🍋', '🍒', '🍒']), [1, 2]);
  assert.deepEqual(eslesenMakaralar(['🍋', '🍒', '🍇']), []);
});

test('yarış konumları: geri gitmez, kazanan bitişe yalnız sonda ve tek başına varır', () => {
  for (let tohum = 1; tohum <= 30; tohum += 1) {
    const atSayisi = tohum % 2 === 0 ? 5 : 2;
    const kazanan = tohum % atSayisi;
    const konumlar = yarisKonumlari(kazanan, { atSayisi, rastgele: tohumlu(tohum) });
    assert.equal(konumlar.length, AT_KOSU_KARESI);
    for (let k = 1; k < konumlar.length; k += 1) {
      konumlar[k].forEach((x, i) => assert.ok(x >= konumlar[k - 1][i]));
    }
    konumlar.slice(0, -1).forEach((kare) => kare.forEach((x) => assert.ok(x < 1)));
    const son = konumlar.at(-1);
    assert.equal(son.length, atSayisi);
    son.forEach((x, i) => assert.ok(i === kazanan ? x === 1 : x < 1));
  }
});

test('slot ve rulet GIF\'i üretilir (canvas varsa)', async (t) => {
  const slot = await slotGifiUret({ makaralar: ['🍌', '💎', '🍌'], carpan: 10, rastgele: tohumlu(5) });
  if (slot === null) {
    t.skip('canvas yok');
    return;
  }
  assert.equal(slot.gif.subarray(0, 6).toString(), 'GIF89a');
  assert.equal(slot.png.subarray(1, 4).toString(), 'PNG');
  assert.ok(slot.sureMs > 1000 && slot.sureMs < 6000);

  const rulet = await ruletGifiUret({ sayi: 0, carpan: 0, secimMetni: 'Seçim: Kırmızı', rastgele: tohumlu(5) });
  assert.equal(rulet.gif.subarray(0, 6).toString(), 'GIF89a');
  assert.ok(rulet.sureMs > 1000 && rulet.sureMs < 6000);

  const at = await atGifiUret({ secim: 2, kazanan: 4, carpan: 0, rastgele: tohumlu(5) });
  assert.equal(at.gif.subarray(0, 6).toString(), 'GIF89a');
  assert.ok(at.sureMs > 1000 && at.sureMs < 6000);

  const duello = await duelloAtGifiUret({ adlar: ['Çok uzun bir görünen ad 🍌🍌🍌🍌', 'b'], kazanan: 'rakip', rastgele: tohumlu(5) });
  assert.equal(duello.gif.subarray(0, 6).toString(), 'GIF89a');
});
