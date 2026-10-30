import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AYARLAR } from '../lib/ayarlar.js';
import { aktarilirMi, dmGomusu, dmIcerigi } from '../lib/dm-log.js';
import { TEMEL_INTENTLER } from '../lib/intents.js';
import { GatewayIntentBits } from 'discord.js';
import { gerekliIntent } from '../events/dm-log.js';

const yazar = { id: '42', username: 'maymun', globalName: 'Maymun', bot: false, displayAvatarURL: () => 'https://cdn/a.png' };

describe('DM aktarımı', () => {
  it('yalnız insanların DM\'leri aktarılır', () => {
    assert.equal(aktarilirMi({ author: yazar, content: 'selam' }), true);
    assert.equal(aktarilirMi({ author: { ...yazar, bot: true }, content: 'x' }), false);
    assert.equal(aktarilirMi({ guildId: '1', author: yazar, content: 'x' }), false);
    assert.equal(aktarilirMi({ author: yazar, system: true }), false);
  });

  it('gömü: yazar, içerik, ekler, resim ve kimlik', () => {
    const ekler = new Map([['1', { name: 'foto.png', url: 'https://cdn/f.png', contentType: 'image/png' }]]);
    const j = dmGomusu({ author: yazar, content: 'merhaba', attachments: ekler, createdTimestamp: 0 }).toJSON();
    assert.match(j.author.name, /Maymun \(@maymun\)/);
    assert.match(j.description, /merhaba/);
    assert.match(j.description, /foto\.png/);
    assert.equal(j.image.url, 'https://cdn/f.png');
    assert.match(j.footer.text, /42/);
    assert.match(dmGomusu({ author: yazar, content: 'x' }, { gecmis: true }).toJSON().footer.text, /Geçmiş/);
    assert.equal(dmGomusu({ author: yazar, content: '' }).toJSON().description, '_(boş mesaj)_');
    assert.equal(dmGomusu({ author: yazar, content: 'a'.repeat(5000) }).toJSON().description.length, 4096);
    assert.match(dmIcerigi({ author: yazar }), /<@42>/);
  });

  it('DirectMessages intent\'i açık, ayar tanımlı', () => {
    assert.ok(TEMEL_INTENTLER.includes(GatewayIntentBits.DirectMessages));
    assert.deepEqual(gerekliIntent, ['DirectMessages']);
    assert.equal(AYARLAR['dm.logKanal'].tur, 'kanal');
  });
});

describe('DM yanıtı', async () => {
  const { NOT_ONEKI, yanitHedefi, yanitIletilirMi } = await import('../lib/dm-log.js');
  const BOT = 'bot1';

  it('aktarım gömüsünün altlığından kullanıcıyı bulur', () => {
    const mesaj = { author: { id: BOT }, embeds: [dmGomusu({ author: yazar, content: 'selam' }).toJSON()] };
    assert.equal(yanitHedefi(mesaj, BOT), '42');
  });

  it('gömü yoksa aktarım metninden bulur', () => {
    assert.equal(yanitHedefi({ author: { id: BOT }, content: dmIcerigi({ author: yazar }), embeds: [] }, BOT), '42');
  });

  it('başkasının mesajına ya da ilgisiz bot mesajına yanıtı iletmez', () => {
    const gomu = dmGomusu({ author: yazar, content: 'x' }).toJSON();
    assert.equal(yanitHedefi({ author: { id: 'insan' }, embeds: [gomu] }, BOT), null);
    assert.equal(yanitHedefi({ author: { id: BOT }, content: 'İletilemedi', embeds: [] }, BOT), null);
    assert.equal(yanitHedefi(null, BOT), null);
  });

  it('not önekli ve boş yanıtı iletmez; yalnız ekli yanıtı iletir', () => {
    assert.equal(yanitIletilirMi('yok'), true);
    assert.equal(yanitIletilirMi(`${NOT_ONEKI} bunu cevaplamayalım`), false);
    assert.equal(yanitIletilirMi('   '), false);
    assert.equal(yanitIletilirMi('', 1), true);
  });
});
