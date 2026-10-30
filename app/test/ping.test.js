import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadCommands } from '../lib/commands.js';
import * as ping from '../commands/cekirdek/ping.js';

/**
 * @param {object} opts
 * @param {number} opts.gateway        client.ws.ping değeri
 * @param {number} opts.interactionAt  Discord'un etkileşim zaman damgası
 * @param {number|null} opts.messageAt Discord'un yanıt mesajı zaman damgası
 */
function fakeInteraction({ gateway = 42, interactionAt = 1_700_000_000_000, messageAt = interactionAt + 118 } = {}) {
  const calls = { reply: [], editReply: [] };
  return {
    calls,
    client: { ws: { ping: gateway } },
    createdTimestamp: interactionAt,
    reply: async (payload) => {
      calls.reply.push(payload);
      return {
        resource: messageAt === null ? null : { message: { createdTimestamp: messageAt } },
      };
    },
    editReply: async (payload) => void calls.editReply.push(payload),
  };
}

describe('/ping komutu', () => {
  it('data ve execute dışa aktarıyor', () => {
    assert.equal(typeof ping.execute, 'function');
    assert.equal(ping.data.name, 'ping');
    assert.ok(ping.data.description.length > 0);
  });

  it("Discord'a gönderilebilir JSON üretiyor", () => {
    const json = ping.data.toJSON();
    assert.equal(json.name, 'ping');
    assert.equal(typeof json.description, 'string');
  });

  it('önce Pong! ile yanıtlıyor, sonra ölçümü ekliyor', async () => {
    const interaction = fakeInteraction();

    await ping.execute(interaction);

    assert.equal(interaction.calls.reply.length, 1);
    assert.equal(interaction.calls.reply[0].content, 'Pong! 🏓');
    assert.equal(interaction.calls.reply[0].withResponse, true);

    assert.equal(interaction.calls.editReply.length, 1);
    const son = interaction.calls.editReply[0];
    assert.match(son, /^Pong!/);
    assert.match(son, /Gateway: 42 ms/);
    assert.match(son, /Yanıt süresi: 118 ms/);
  });

  it('yerel saat kaymış olsa bile doğru yanıt süresi veriyor (regresyon)', async () => {
    // Yerel saat Discord'dan 6 saniye geride: Date.now() kullanan eski sürüm
    // burada negatif değer üretiyordu.
    const simdi = Date.now();
    const interaction = fakeInteraction({
      interactionAt: simdi + 6000,
      messageAt: simdi + 6000 + 118,
    });

    await ping.execute(interaction);

    const son = interaction.calls.editReply[0];
    assert.match(son, /Yanıt süresi: 118 ms/);
    assert.doesNotMatch(son, /-\d/, 'yanıt süresi negatif olmamalı');
  });

  it('gateway gecikmesi henüz ölçülmediyse sayı uydurmuyor', async () => {
    const interaction = fakeInteraction({ gateway: -1 });

    await ping.execute(interaction);

    const son = interaction.calls.editReply[0];
    assert.match(son, /Gateway: henüz ölçülmedi/);
    assert.doesNotMatch(son, /-1 ms/);
  });

  it('Discord yanıt kaynağını vermezse çökmüyor, ölçümü atlıyor', async () => {
    const interaction = fakeInteraction({ messageAt: null });

    await ping.execute(interaction);

    const son = interaction.calls.editReply[0];
    assert.match(son, /^Pong!/);
    assert.match(son, /Gateway:/);
    assert.doesNotMatch(son, /Yanıt süresi/);
  });

  it('komut ağacından yükleniyor ve cekirdek modülüne ait', async () => {
    const commands = await loadCommands();
    const yuklenen = commands.get('ping');

    assert.ok(yuklenen, 'loadCommands ping komutunu bulmalı');
    assert.equal(yuklenen.modul, 'cekirdek');
    assert.equal(yuklenen.yol, 'commands/cekirdek/ping.js');
  });
});
