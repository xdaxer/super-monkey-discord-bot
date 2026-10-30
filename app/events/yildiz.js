import { Events } from 'discord.js';

import { veritabani } from '../lib/db.js';
import {
  kayitGetir, kayitSil, kayitYaz, nsfwEngeli, panoAyari, panoKarari, panoMesaji, YILDIZ, yildizSayisi,
} from '../lib/yildiz.js';

// Aynı mesaja art arda gelen tepkiler sırayla işlenir; yoksa iki eşzamanlı
// olay ikisi de "kayıt yok" görüp panoya iki kopya atabilir.
const kuyruk = new Map();

function sirala(mesajId, is) {
  const onceki = kuyruk.get(mesajId) ?? Promise.resolve();
  const sonraki = onceki.then(is, is).finally(() => {
    if (kuyruk.get(mesajId) === sonraki) kuyruk.delete(mesajId);
  });
  kuyruk.set(mesajId, sonraki);
  return sonraki;
}

async function panoyuGetir(guild, panoId) {
  const kanal = guild.channels.cache.get(panoId) ?? await guild.channels.fetch(panoId).catch(() => null);
  return kanal?.isTextBased() ? kanal : null;
}

async function yildizlariSay(mesaj) {
  const tepki = mesaj.reactions.cache.find((t) => t.emoji.name === YILDIZ);
  if (!tepki) return 0;
  const kullanicilar = await tepki.users.fetch({ limit: 100 });
  // 100'ü aşan kısım tek tek denetlenmez; o sayıda eşik zaten çoktan aşılmıştır.
  return yildizSayisi(kullanicilar.values(), mesaj.author.id) + Math.max(0, tepki.count - kullanicilar.size);
}

async function guncelle(mesaj) {
  try {
    // Partial mesajda yazar ve tepkiler eksik; fetch ikisini de tazeler.
    mesaj = await mesaj.fetch();
  } catch {
    return;
  }
  if (!mesaj.guild) return;

  const db = veritabani();
  const ayar = panoAyari(db, mesaj.guild.id, mesaj.channelId);
  if (!ayar.ok) return;
  const pano = await panoyuGetir(mesaj.guild, ayar.panoId);
  if (!pano || nsfwEngeli(mesaj.channel?.nsfw, pano.nsfw)) return;

  const kayit = kayitGetir(db, mesaj.id);
  const sayi = await yildizlariSay(mesaj);
  const karar = panoKarari(sayi, ayar.esik, Boolean(kayit));
  if (karar === 'yok' || (karar === 'guncelle' && kayit.sayi === sayi)) return;

  if (karar === 'sil') {
    await pano.messages.delete(kayit.pano_mesaj_id).catch(() => null);
    kayitSil(db, mesaj.id);
    return;
  }

  const icerik = panoMesaji(mesaj, sayi);
  if (karar === 'guncelle') {
    const kopya = await pano.messages.edit(kayit.pano_mesaj_id, icerik).catch(() => null);
    // Kopya elle silinmişse yeniden atılmaz: yetkili onu bilerek kaldırmıştır.
    if (kopya) kayitYaz(db, { ...satir(mesaj, kayit.pano_mesaj_id), sayi });
    return;
  }

  const kopya = await pano.send(icerik).catch((error) => {
    console.warn(`Yıldız panosuna yazılamadı (${pano.id}): ${error.message}`);
    return null;
  });
  if (kopya) kayitYaz(db, { ...satir(mesaj, kopya.id), sayi });
}

function satir(mesaj, panoMesajId) {
  return { guildId: mesaj.guild.id, mesajId: mesaj.id, kanalId: mesaj.channelId, panoMesajId };
}

const tepkiOlayi = (name) => ({
  name,
  gerekliIntent: ['GuildMessageReactions'],
  async execute(tepki) {
    if (tepki.emoji.name !== YILDIZ) return;
    await sirala(tepki.message.id, () => guncelle(tepki.message));
  },
});

export const olaylar = [
  tepkiOlayi(Events.MessageReactionAdd),
  tepkiOlayi(Events.MessageReactionRemove),
  {
    name: Events.MessageReactionRemoveEmoji,
    gerekliIntent: ['GuildMessageReactions'],
    async execute(tepki) {
      if (tepki.emoji.name !== YILDIZ) return;
      await sirala(tepki.message.id, () => guncelle(tepki.message));
    },
  },
  {
    name: Events.MessageReactionRemoveAll,
    gerekliIntent: ['GuildMessageReactions'],
    async execute(mesaj) {
      await sirala(mesaj.id, () => guncelle(mesaj));
    },
  },
  {
    // Özgün mesaj silinince pano kopyası da gider.
    name: Events.MessageDelete,
    async execute(mesaj) {
      const db = veritabani();
      const kayit = kayitGetir(db, mesaj.id);
      if (!kayit || !mesaj.guild) return;
      kayitSil(db, mesaj.id);
      const ayar = panoAyari(db, mesaj.guild.id);
      if (!ayar.ok) return;
      const pano = await panoyuGetir(mesaj.guild, ayar.panoId);
      await pano?.messages.delete(kayit.pano_mesaj_id).catch(() => null);
    },
  },
];
