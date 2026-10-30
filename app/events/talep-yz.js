import { EmbedBuilder, Events } from 'discord.js';

import { ayarGetir, sistemAcikMi } from '../lib/ayarlar.js';
import { veritabani } from '../lib/db.js';
import { izinliGuild } from '../lib/guild-kilidi.js';
import { acikTalepler, kanaldanTalep } from '../lib/talep.js';
import {
  BEKLEME_MS, claudeVarMi, GECMIS_SINIRI, istemMetni, modelSor, raporEkle, raporGomuVerisi,
  raporlariGetir, telafiGecikmesi, yanitlanmaliMi, yanitMetni, yanitSay, yanitSayisi, yazismaMetni,
} from '../lib/talep-yz.js';

/**
 * Talep sahibi yazınca BEKLEME_MS sonra yapay zekâ yanıtı (lib/talep-yz.js).
 * Zamanlayıcılar bellekte ama kaybolmaları sorun değil: açılışta cevapsız
 * talepler Discord'daki yazışmadan bulunup yanıtlanır, yanıt sayısı da
 * veritabanında.
 */
const zamanlayicilar = new Map();
const calisanlar = new Set();

function acikMi(db, guildId) {
  return sistemAcikMi(db, guildId, 'talep') && ayarGetir(db, guildId, 'talep.yapayZeka') && claudeVarMi();
}

function zamanla(kanal, talepId, gecikme) {
  clearTimeout(zamanlayicilar.get(talepId));
  zamanlayicilar.set(talepId, setTimeout(() => {
    zamanlayicilar.delete(talepId);
    yanitla(kanal, talepId).catch((error) => console.error(`Talep #${talepId} yapay zekâ yanıtı:`, error));
  }, gecikme));
}

export const olaylar = [
  {
    name: Events.MessageCreate,
    gerekliIntent: ['GuildMessages', 'MessageContent'],
    async execute(message) {
      if (!message.guildId || message.author.bot) return;
      const db = veritabani();
      const talep = kanaldanTalep(db, message.channelId);
      if (!talep || talep.durum !== 'acik' || String(talep.kullanici_id) !== message.author.id) return;
      if (!acikMi(db, message.guildId)) return;
      zamanla(message.channel, talep.id, BEKLEME_MS);
    },
  },
  {
    // Yeniden başlatmada düşen bekleyen yanıtlar: son mesajı üyenin olan açık
    // talepler kalan bekleme süresi dolunca yanıtlanır.
    name: Events.ClientReady,
    once: true,
    gerekliIntent: ['GuildMessages', 'MessageContent'],
    async execute(client) {
      const guild = await client.guilds.fetch(izinliGuild()).catch(() => null);
      if (!guild) return;
      const db = veritabani();
      if (!acikMi(db, guild.id)) return;

      for (const talep of acikTalepler(db, guild.id)) {
        const kanal = await client.channels.fetch(talep.kanal_id).catch(() => null);
        if (!kanal?.isTextBased?.()) continue;
        const mesajlar = await kanal.messages.fetch({ limit: 1 }).catch(() => null);
        const gecikme = mesajlar && telafiGecikmesi([...mesajlar.values()], talep.kullanici_id);
        if (gecikme !== null) zamanla(kanal, talep.id, gecikme);
      }
    },
  },
];

async function yanitla(kanal, talepId) {
  // Aynı talepte iki yanıt aynı anda yazılmasın; arada gelen mesaj yeniden tetikler.
  if (calisanlar.has(talepId)) return;
  calisanlar.add(talepId);
  try {
    const db = veritabani();
    const talep = kanaldanTalep(db, kanal.id);
    if (!talep || talep.id !== talepId || talep.durum !== 'acik') return;

    const mesajlar = [...(await kanal.messages.fetch({ limit: GECMIS_SINIRI })).values()].reverse();
    const karar = yanitlanmaliMi(mesajlar, { sahipId: talep.kullanici_id, yanitSayisi: yanitSayisi(db, talepId) });
    if (!karar.ok) return;

    const sonuc = await modelSor(istemMetni({
      talep,
      yazisma: yazismaMetni(mesajlar, talep.kullanici_id),
      oncekiRaporlar: raporlariGetir(db, talep.id),
    }));
    if (!sonuc) return;

    // Model düşünürken üye yeni mesaj yazdıysa o mesajın zamanlayıcısı yeniden yanıtlar.
    const sonUye = mesajlar.at(-1);
    const gonderilen = await sonUye.reply({
      content: yanitMetni(sonuc.yanit),
      allowedMentions: { parse: [], repliedUser: true },
    });
    yanitSay(db, talepId);

    if (sonuc.rapor) await raporGonder(kanal, db, talep, sonuc.rapor, sonUye.url ?? gonderilen.url);
  } finally {
    calisanlar.delete(talepId);
  }
}

async function raporGonder(kanal, db, talep, rapor, mesajUrl) {
  const raporKanalId = ayarGetir(db, talep.guild_id, 'talep.raporKanal');
  const raporKanal = raporKanalId ? await kanal.client.channels.fetch(raporKanalId).catch(() => null) : null;
  const giden = raporKanal?.isTextBased?.()
    ? await raporKanal.send({
      embeds: [new EmbedBuilder(raporGomuVerisi({ talep, rapor, mesajUrl }))],
      allowedMentions: { parse: [] },
    }).catch((error) => {
      console.error(`Talep #${talep.id} raporu gönderilemedi:`, error.message);
      return null;
    })
    : null;
  raporEkle(db, { talep, rapor, mesajId: giden?.id ?? null });
}
