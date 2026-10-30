import { ChannelType, Events, PermissionFlagsBits } from 'discord.js';

import { ayarGetir, sistemAcikMi } from '../lib/ayarlar.js';
import { veritabani } from '../lib/db.js';
import { izinliGuild } from '../lib/guild-kilidi.js';
import { kanalYetkisiKontrol } from '../lib/izin.js';
import { odaIzinleriniYenile, panelMesaji } from '../lib/ozelses-bilesen.js';
import {
  izinListesi, odaAdi, odaBosMu, odaGetir, odaKaydet, odaSil, sahibinOdalari, sesGecisi,
  tumOdalar,
} from '../lib/ozelses.js';

/** Discord "Unknown Channel": kanal zaten silinmiş. */
const BILINMEYEN_KANAL = 10003;

/**
 * Oda açılışı sürerken aynı üye oda oluştur kanalına tekrar girerse (hızlı
 * çık-gir) ikinci oda açılmasın. Anahtar: guild:kullanıcı.
 */
const olusturuluyor = new Set();

/** Kayıtlı bir oda boşaldıysa siler; kayıtlı değilse (elle açılmış kanal) dokunmaz. */
export async function bosOdayiSil(guild, db, kanalId) {
  if (!odaGetir(db, kanalId)) return;

  const kanal = guild.channels.cache.get(kanalId)
    ?? await guild.channels.fetch(kanalId).catch(() => null);
  if (!kanal) {
    odaSil(db, kanalId);
    return;
  }

  if (!odaBosMu(kanal.members?.values?.())) return;

  try {
    await kanal.delete('Özel ses odası boşaldı');
    odaSil(db, kanalId);
  } catch (error) {
    if (error?.code === BILINMEYEN_KANAL) odaSil(db, kanalId);
    else console.warn(`Özel ses odası silinemedi (${kanalId}): ${error.message}`);
  }
}

/** Üyeye oda açar (ya da var olan odasına götürür) ve taşır. */
async function odaAc(uye, hub, db) {
  const { guild } = uye;
  const anahtar = `${guild.id}:${uye.id}`;
  if (olusturuluyor.has(anahtar)) return;
  olusturuluyor.add(anahtar);

  try {
    // Hâlâ duran bir odası varsa ikinci oda açmak yerine oraya götür.
    for (const kayit of sahibinOdalari(db, guild.id, uye.id)) {
      const mevcut = guild.channels.cache.get(kayit.kanal_id);
      if (mevcut) {
        await uye.voice.setChannel(mevcut, 'Özel ses odası').catch(() => null);
        return;
      }
      odaSil(db, kayit.kanal_id);
    }

    const ust = hub.parent ?? null;
    const botUye = guild.members.me;
    const yetki = kanalYetkisiKontrol(
      ust ?? hub, botUye, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers,
    );
    if (!yetki.ok) {
      console.warn(`Özel ses odası açılamadı: ${yetki.sebep}`);
      return;
    }

    const limit = Number(ayarGetir(db, guild.id, 'ozelses.limit')) || 0;
    const izinler = izinListesi({
      ustIzinler: [...(ust?.permissionOverwrites.cache.values() ?? [])].map((iz) => ({
        id: iz.id, type: iz.type, allow: iz.allow.bitfield, deny: iz.deny.bitfield,
      })),
      sahipId: uye.id,
      botId: botUye.id,
      everyoneId: guild.id,
      botYetkileri: (ust ?? hub).permissionsFor(botUye)?.bitfield ?? null,
    });

    const kanal = await guild.channels.create({
      name: odaAdi(ayarGetir(db, guild.id, 'ozelses.ad'), uye.displayName),
      type: ChannelType.GuildVoice,
      parent: ust?.id ?? null,
      ...(limit > 0 ? { userLimit: limit } : {}),
      permissionOverwrites: izinler,
      reason: `Özel ses odası: ${uye.user.tag ?? uye.id}`,
    });

    // Taşımadan önce kaydediyoruz: taşıma başarısız olursa temizlik kayda bakar.
    odaKaydet(db, { kanalId: kanal.id, guildId: guild.id, sahipId: uye.id });

    try {
      await uye.voice.setChannel(kanal, 'Özel ses odası');
    } catch {
      // Üye bu arada sesten çıkmış olabilir; boş oda kalmasın.
      await bosOdayiSil(guild, db, kanal.id);
      return;
    }

    // Panel gönderilemezse oda yine çalışır; sahip Discord ayarlarından yönetebilir.
    await kanal.send(panelMesaji(uye.id)).catch((error) => {
      console.warn(`Özel ses paneli gönderilemedi (${kanal.id}): ${error.message}`);
    });
  } catch (error) {
    console.warn(`Özel ses odası açılamadı: ${error.message}`);
  } finally {
    olusturuluyor.delete(anahtar);
  }
}

export const olaylar = [
  {
    name: Events.VoiceStateUpdate,
    gerekliIntent: ['GuildVoiceStates'],
    async execute(onceki, sonraki) {
      const { guild } = sonraki;
      const db = veritabani();

      const acik = sistemAcikMi(db, guild.id, 'ozelses');
      const hubId = acik ? ayarGetir(db, guild.id, 'ozelses.kanal') : null;
      const { hubaGirdi, ayrilanKanalId } = sesGecisi({
        oncekiKanalId: onceki.channelId, sonrakiKanalId: sonraki.channelId, hubId,
      });

      // Sistem kapatılmış olsa da eski odalar boşalınca temizlenir.
      if (ayrilanKanalId) await bosOdayiSil(guild, db, ayrilanKanalId);

      const uye = sonraki.member;
      if (hubaGirdi && uye && !uye.user?.bot && sonraki.channel) {
        await odaAc(uye, sonraki.channel, db);
      }
    },
  },
  {
    // Sahip odasını elle silerse kayıt boşa kalmasın.
    name: Events.ChannelDelete,
    async execute(kanal) {
      odaSil(veritabani(), kanal.id);
    },
  },
  {
    // Bot kapalıyken boşalan odalar olay üretmez; açılışta toparlanır.
    // Oda oluştur kanalında bekleyen varsa ona da oda açılır.
    name: Events.ClientReady,
    once: true,
    gerekliIntent: ['GuildVoiceStates'],
    async execute(client) {
      const guild = await client.guilds.fetch(izinliGuild()).catch(() => null);
      if (!guild) return;
      const db = veritabani();

      for (const kayit of tumOdalar(db, guild.id)) {
        await bosOdayiSil(guild, db, kayit.kanal_id);

        // Hâlâ dolu oda: izin kuralları değişmiş olabilir, durumu koruyarak yenile.
        const kanal = guild.channels.cache.get(kayit.kanal_id);
        if (kanal && odaGetir(db, kanal.id)) {
          const sonuc = await odaIzinleriniYenile(kanal, kayit.sahip_id).catch((error) => ({
            ok: false, sebep: error.message,
          }));
          if (!sonuc.ok) console.warn(`Özel ses odası izinleri yenilenemedi (${kanal.id}): ${sonuc.sebep}`);
        }
      }

      if (!sistemAcikMi(db, guild.id, 'ozelses')) return;
      const hubId = ayarGetir(db, guild.id, 'ozelses.kanal');
      const hub = hubId ? guild.channels.cache.get(hubId) : null;
      if (hub?.type !== ChannelType.GuildVoice) return;

      for (const uye of hub.members.values()) {
        if (!uye.user.bot) await odaAc(uye, hub, db);
      }
    },
  },
];
