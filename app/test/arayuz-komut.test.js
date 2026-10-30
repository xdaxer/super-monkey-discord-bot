import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  acilisAl, acilisYaz, ARAYUZ_KOMUTLARI, arayuzKomutu, KAPALI_KOMUTLAR,
} from '../lib/arayuz-komut.js';
import { loadCommands } from '../lib/commands.js';

describe('ekonomi komutları arayüze yönlenir', () => {
  it('başlatıcılar seçeneksiz kaydedilir, yönetici komutları hiç kaydedilmez', async () => {
    const komutlar = await loadCommands();
    for (const ad of Object.keys(ARAYUZ_KOMUTLARI)) {
      const json = komutlar.get(ad)?.data.toJSON();
      assert.ok(json, `/${ad} kayıtlı olmalı`);
      assert.deepEqual(json.options ?? [], [], `/${ad} seçeneksiz olmalı`);
      assert.equal(komutlar.get(ad).sistem, 'ekonomi', `/${ad} ekonomi sistemine bağlı kalmalı`);
    }
    for (const ad of KAPALI_KOMUTLAR) assert.equal(komutlar.has(ad), false, `/${ad} kaydedilmemeli`);
  });

  it('komut arayüzü başlatır ve gidilecek ekranı bırakır', async () => {
    const asil = { data: { name: 'kasa', description: 'Kasa açar.' } };
    let basladi = false;
    await arayuzKomutu(asil).execute({ user: { id: 'u1' }, launchActivity: async () => { basladi = true; } });
    assert.equal(basladi, true);
    assert.deepEqual(acilisAl('u1'), { ekran: 'envanter', secenek: { sekme: 'kasalar' } });
    assert.equal(acilisAl('u1'), null, 'istek bir kez okunur');
  });

  it('başlatılamazsa üyeye gizli yanıt verir', async () => {
    let yanit;
    await arayuzKomutu({ data: { name: 'kumar', description: 'x' } }).execute({
      user: { id: 'u2' },
      launchActivity: async () => { throw new Error('desteklenmiyor'); },
      reply: async (y) => { yanit = y; },
    });
    assert.match(yanit.content, /arayüz/);
  });

  it('eski açılış isteği süresi geçince yok sayılır', () => {
    acilisYaz('u3', 'kumar', {}, 0);
    assert.equal(acilisAl('u3', 3 * 60_000), null);
  });
});
