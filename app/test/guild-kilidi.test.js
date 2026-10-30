import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  izinliMi, sunucudanAyril, yetkisizSunucular, yetkisizSunuculariTemizle,
} from '../lib/guild-kilidi.js';

const IZINLI = '444000000000000001';

/** leave() davranışı denetlenebilir sahte sunucu. */
function sahteGuild(id, { hata = null } = {}) {
  const guild = {
    id,
    name: `sunucu-${id}`,
    ayrildi: false,
    async leave() {
      if (hata) throw new Error(hata);
      guild.ayrildi = true;
      return guild;
    },
  };
  return guild;
}

function sahteClient(guildler) {
  return { guilds: { cache: new Map(guildler.map((g) => [g.id, g])) } };
}

/** Sessiz logger; çağrılar incelenebilir. */
function sahteLogger() {
  const kayit = { warn: [], error: [] };
  return {
    kayit,
    warn: (...a) => kayit.warn.push(a.join(' ')),
    error: (...a) => kayit.error.push(a.join(' ')),
  };
}

describe('sunucu kilidi', () => {
  it('yalnız izinli kimlik kabul edilir', () => {
    assert.equal(izinliMi(IZINLI, IZINLI), true);
    assert.equal(izinliMi('999', IZINLI), false);
  });

  it('sayı ve metin kimlik aynı sayılır', () => {
    // Discord kimlikleri snowflake; kaynağa göre sayı olarak gelebilir.
    assert.equal(izinliMi(123, '123'), true);
  });

  it('boş veya tanımsız kimlik izinli değildir', () => {
    assert.equal(izinliMi(undefined, IZINLI), false);
    assert.equal(izinliMi('', IZINLI), false);
  });

  it('yetkisiz sunucular ayıklanır, izinli olan listede kalmaz', () => {
    const hedef = yetkisizSunucular([IZINLI, '111', '222'], IZINLI);
    assert.deepEqual(hedef, ['111', '222']);
  });

  it('yalnız izinli sunucu varken ayrılacak sunucu yoktur', () => {
    assert.deepEqual(yetkisizSunucular([IZINLI], IZINLI), []);
  });

  it('hiç sunucu yokken boş liste döner', () => {
    assert.deepEqual(yetkisizSunucular([], IZINLI), []);
  });

  it('ayrılma başarılıysa true döner ve uyarı loglanır', async () => {
    const guild = sahteGuild('111');
    const logger = sahteLogger();

    assert.equal(await sunucudanAyril(guild, logger), true);
    assert.equal(guild.ayrildi, true);
    assert.equal(logger.kayit.warn.length, 1);
    assert.match(logger.kayit.warn[0], /111/);
  });

  it('ayrılma hata verirse bot düşmez, false döner ve hata loglanır', async () => {
    const guild = sahteGuild('111', { hata: 'Missing Access' });
    const logger = sahteLogger();

    assert.equal(await sunucudanAyril(guild, logger), false);
    assert.equal(logger.kayit.error.length, 1);
    assert.match(logger.kayit.error[0], /Missing Access/);
  });

  it('açılış taraması izinsiz sunuculardan ayrılır, izinliye dokunmaz', async () => {
    const izinli = sahteGuild(IZINLI);
    const yabanci = sahteGuild('111');
    const client = sahteClient([izinli, yabanci]);

    const ayrilinan = await yetkisizSunuculariTemizle(client, IZINLI, sahteLogger());

    assert.deepEqual(ayrilinan, ['111']);
    assert.equal(yabanci.ayrildi, true);
    assert.equal(izinli.ayrildi, false);
  });

  it('bir sunucudan ayrılamamak diğerlerini engellemez', async () => {
    const kotu = sahteGuild('111', { hata: 'Unknown Guild' });
    const iyi = sahteGuild('222');
    const client = sahteClient([kotu, iyi]);

    const ayrilinan = await yetkisizSunuculariTemizle(client, IZINLI, sahteLogger());

    assert.deepEqual(ayrilinan, ['111', '222']);
    assert.equal(iyi.ayrildi, true);
  });

  it('yalnız izinli sunucudayken hiçbir ayrılma denenmez', async () => {
    const izinli = sahteGuild(IZINLI);
    const client = sahteClient([izinli]);

    assert.deepEqual(await yetkisizSunuculariTemizle(client, IZINLI, sahteLogger()), []);
    assert.equal(izinli.ayrildi, false);
  });
});
