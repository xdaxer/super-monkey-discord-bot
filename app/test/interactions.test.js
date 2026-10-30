import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MessageFlags } from 'discord.js';

import { ayarYaz } from '../lib/ayarlar.js';
import { acVeritabani } from '../lib/db.js';
import { createInteractionHandler } from '../lib/interactions.js';
import { kanalSiniriMesaji } from '../lib/kanal-siniri.js';

function fakeInteraction(overrides = {}) {
  const calls = { reply: [], followUp: [] };
  return {
    commandName: 'ping',
    replied: false,
    deferred: false,
    isChatInputCommand: () => true,
    reply: async (payload) => void calls.reply.push(payload),
    followUp: async (payload) => void calls.followUp.push(payload),
    calls,
    ...overrides,
  };
}

function fakeLogger() {
  const errors = [];
  return { error: (...args) => errors.push(args), errors };
}

describe('createInteractionHandler', () => {
  it('slash komutu olmayan etkileşimi görmezden gelir', async () => {
    const logger = fakeLogger();
    const interaction = fakeInteraction({ isChatInputCommand: () => false });

    await createInteractionHandler(new Map(), logger)(interaction);

    assert.equal(interaction.calls.reply.length, 0);
    assert.equal(logger.errors.length, 0);
  });

  it('bilinen komutu çalıştırır', async () => {
    const logger = fakeLogger();
    let ran = false;
    const commands = new Map([['ping', { execute: async () => void (ran = true) }]]);

    await createInteractionHandler(commands, logger)(fakeInteraction());

    assert.equal(ran, true);
    assert.equal(logger.errors.length, 0);
  });

  it('bilinmeyen komutu yutmaz: loglar ve ephemeral yanıt döner', async () => {
    const logger = fakeLogger();
    const interaction = fakeInteraction({ commandName: 'yokboyle' });

    await createInteractionHandler(new Map(), logger)(interaction);

    assert.equal(logger.errors.length, 1);
    assert.match(logger.errors[0][0], /Bilinmeyen komut/);
    assert.equal(interaction.calls.reply.length, 1);
    assert.equal(interaction.calls.reply[0].flags, MessageFlags.Ephemeral);
  });

  it('execute hatasını yutmaz: loglar ve ephemeral yanıt döner', async () => {
    const logger = fakeLogger();
    const commands = new Map([
      ['ping', { execute: async () => { throw new Error('patladi'); } }],
    ]);
    const interaction = fakeInteraction();

    await createInteractionHandler(commands, logger)(interaction);

    assert.equal(logger.errors.length, 1);
    assert.equal(logger.errors[0][1].message, 'patladi');
    assert.equal(interaction.calls.reply.length, 1);
    assert.equal(interaction.calls.reply[0].flags, MessageFlags.Ephemeral);
  });

  it('zaten yanıtlanmış etkileşimde followUp kullanır', async () => {
    const logger = fakeLogger();
    const commands = new Map([
      ['ping', { execute: async () => { throw new Error('patladi'); } }],
    ]);
    const interaction = fakeInteraction({ replied: true });

    await createInteractionHandler(commands, logger)(interaction);

    assert.equal(interaction.calls.reply.length, 0);
    assert.equal(interaction.calls.followUp.length, 1);
  });

  it('hata yanıtı da gönderilemezse süreci düşürmez', async () => {
    const logger = fakeLogger();
    const interaction = fakeInteraction({
      commandName: 'yokboyle',
      reply: async () => { throw new Error('Unknown interaction'); },
    });

    await createInteractionHandler(new Map(), logger)(interaction);

    assert.equal(logger.errors.length, 2);
    assert.match(logger.errors[1][0], /Hata yanıtı gönderilemedi/);
  });
});

describe('kanal kontrolü (kanalKontrol)', () => {
  const ekonomiKomutu = () => {
    const durum = { calisti: 0 };
    return { durum, komut: { sistem: 'ekonomi', execute: async () => void (durum.calisti += 1) } };
  };

  it('reddedilirse komut çalışmaz, gizli uyarı döner', async () => {
    const { durum, komut } = ekonomiKomutu();
    const interaction = fakeInteraction({ guildId: 'g1' });

    await createInteractionHandler(new Map([['ping', komut]]), fakeLogger(), {
      kanalKontrol: () => 'Ekonomi komutları yalnız <#5> kanallarında kullanılabilir.',
    })(interaction);

    assert.equal(durum.calisti, 0);
    assert.equal(interaction.calls.reply.length, 1);
    assert.equal(interaction.calls.reply[0].flags, MessageFlags.Ephemeral);
    assert.match(interaction.calls.reply[0].content, /yalnız <#5>/);
  });

  it('null dönerse komut çalışır; kanalKontrol komutu da alır', async () => {
    const { durum, komut } = ekonomiKomutu();
    const gorulen = [];

    await createInteractionHandler(new Map([['ping', komut]]), fakeLogger(), {
      kanalKontrol: (interaction, command) => { gorulen.push(command); return null; },
    })(fakeInteraction({ guildId: 'g1' }));

    assert.equal(durum.calisti, 1);
    assert.equal(gorulen[0], komut);
  });

  it('sistem kapalıysa kanal denetimine hiç gelinmez', async () => {
    const { komut } = ekonomiKomutu();
    let soruldu = false;

    await createInteractionHandler(new Map([['ping', komut]]), fakeLogger(), {
      sistemKontrol: () => false,
      kanalKontrol: () => { soruldu = true; return null; },
    })(fakeInteraction({ guildId: 'g1' }));

    assert.equal(soruldu, false);
  });

  it('butonlar kanal denetiminden geçmez', async () => {
    let calisti = false;
    let soruldu = false;
    const interaction = fakeInteraction({
      isChatInputCommand: () => false,
      isAutocomplete: () => false,
      isButton: () => true,
      customId: 'kasa:ac',
    });

    await createInteractionHandler(new Map(), fakeLogger(), {
      kanalKontrol: () => { soruldu = true; return 'red'; },
      bilesenler: [{ eslesir: () => true, calistir: async () => { calisti = true; } }],
    })(interaction);

    assert.equal(calisti, true);
    assert.equal(soruldu, false);
  });
});

describe('kanalSiniriMesaji (ekonomi.kanallar)', () => {
  const G = 'g1';
  const komut = { sistem: 'ekonomi', execute() {} };
  const etkilesim = (kanalId, kanal = null) => ({ guildId: G, channelId: kanalId, channel: kanal });
  const thread = (parentId) => ({ isThread: () => true, parentId });

  it('liste boşsa her kanalda çalışır', () => {
    const db = acVeritabani(':memory:');
    assert.equal(kanalSiniriMesaji(db, etkilesim('1'), komut), null);
  });

  it('doluyken listedeki kanalda çalışır, başka kanalda uyarı verir', () => {
    const db = acVeritabani(':memory:');
    ayarYaz(db, G, 'ekonomi.kanallar', ['10', '20']);
    assert.equal(kanalSiniriMesaji(db, etkilesim('10'), komut), null);
    assert.equal(kanalSiniriMesaji(db, etkilesim('20'), komut), null);
    assert.equal(
      kanalSiniriMesaji(db, etkilesim('30'), komut),
      'Ekonomi komutları yalnız <#10>, <#20> kanallarında kullanılabilir.',
    );
  });

  it('izinli kanalın thread\'inde çalışır, başka kanalın thread\'inde çalışmaz', () => {
    const db = acVeritabani(':memory:');
    ayarYaz(db, G, 'ekonomi.kanallar', ['10']);
    assert.equal(kanalSiniriMesaji(db, etkilesim('99', thread('10')), komut), null);
    assert.match(kanalSiniriMesaji(db, etkilesim('99', thread('30')), komut), /yalnız <#10>/);
  });

  it('muaf komut, ekonomi dışı komut ve DM sınırlanmaz', () => {
    const db = acVeritabani(':memory:');
    ayarYaz(db, G, 'ekonomi.kanallar', ['10']);
    assert.equal(kanalSiniriMesaji(db, etkilesim('30'), { ...komut, kanalMuaf: true }), null);
    assert.equal(kanalSiniriMesaji(db, etkilesim('30'), { sistem: 'eglence' }), null);
    assert.equal(kanalSiniriMesaji(db, etkilesim('30'), { execute() {} }), null);
    assert.equal(kanalSiniriMesaji(db, { guildId: null, channelId: '30' }, komut), null);
  });

  it('sınır sunucuya özeldir', () => {
    const db = acVeritabani(':memory:');
    ayarYaz(db, G, 'ekonomi.kanallar', ['10']);
    assert.equal(kanalSiniriMesaji(db, { guildId: 'g2', channelId: '30' }, komut), null);
  });
});
