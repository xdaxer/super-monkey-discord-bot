import { Events, PermissionFlagsBits } from 'discord.js';

import { ayarGetir, sistemAcikMi } from '../lib/ayarlar.js';
import { PINGSIZ } from '../lib/bicim.js';
import {
  ayrilmaIsaretle, davetKaydi, davetSayisi, katilimKaydet, kullanilanDavet,
} from '../lib/davet.js';
import { veritabani } from '../lib/db.js';
import { izinliGuild } from '../lib/guild-kilidi.js';

/** Özel URL'nin (discord.gg/ad) önbellekteki anahtarı; gerçek davet kodlarıyla çakışmaz. */
const OZEL_URL = '#ozel-url';
/** Silinen davet bu kadar süre giriş eşleştirmesine aday kalır. */
const SILINEN_OMRU = 30_000;

/** guildId → Map<kod, kayıt>. */
const onbellek = new Map();
/** guildId → Map<kod, kayıt & {silinme}>. */
const silinenler = new Map();
/** Aynı anda iki giriş gelirse ikinci, birincinin önbelleği güncellemesini bekler. */
let sira = Promise.resolve();

/** Sunucunun güncel davetlerini (ve özel URL kullanımını) çeker. */
async function davetleriCek(guild) {
  const harita = new Map();
  const davetler = await guild.invites.fetch({ cache: false });
  for (const davet of davetler.values()) harita.set(davet.code, davetKaydi(davet));

  if (guild.vanityURLCode) {
    const ozel = await guild.fetchVanityData().catch(() => null);
    if (ozel) harita.set(OZEL_URL, { uses: ozel.uses, maxUses: 0, inviterId: null, kod: ozel.code });
  }
  return harita;
}

function eskiSilinenleriAt(guildId) {
  const harita = silinenler.get(guildId) ?? new Map();
  const simdi = Date.now();
  for (const [kod, d] of harita) if (simdi - d.silinme > SILINEN_OMRU) harita.delete(kod);
  silinenler.set(guildId, harita);
  return harita;
}

async function logYaz(guild, icerik) {
  const kanalId = ayarGetir(veritabani(), guild.id, 'davet.logKanal');
  if (!kanalId) return;

  const kanal = await guild.client.channels.fetch(kanalId).catch(() => null);
  if (!kanal?.isTextBased?.()) return;

  const botUye = guild.members.me;
  if (botUye && !kanal.permissionsFor(botUye)?.has(PermissionFlagsBits.SendMessages)) return;

  await kanal.send({ content: icerik, ...PINGSIZ }).catch(() => null);
}

async function girisIsle(member) {
  const { guild } = member;
  const db = veritabani();

  const onceki = onbellek.get(guild.id) ?? new Map();
  const simdiki = await davetleriCek(guild).catch((error) => {
    console.warn(`Davetler çekilemedi: ${error.message}`);
    return null;
  });
  if (!simdiki) return;
  onbellek.set(guild.id, simdiki);

  const kod = kullanilanDavet(onceki, simdiki, eskiSilinenleriAt(guild.id));
  const davet = kod ? (simdiki.get(kod) ?? onceki.get(kod) ?? silinenler.get(guild.id)?.get(kod)) : null;
  if (kod) silinenler.get(guild.id)?.delete(kod);

  const davetEdenId = davet?.inviterId ?? null;
  const davetEdenAd = davetEdenId
    ? (await member.client.users.fetch(davetEdenId).catch(() => null))?.username ?? davet.inviterAd
    : null;

  katilimKaydet(db, guild.id, {
    uyeId: member.id, davetEdenId, davetEdenAd, kod: kod === OZEL_URL ? davet.kod : kod,
  });

  let metin;
  if (davetEdenId) {
    const { toplam } = davetSayisi(db, guild.id, davetEdenId);
    metin = `<@${member.id}> **katıldı**; **${davetEdenAd}** davet etti (**${toplam}** davet)`;
  } else if (kod === OZEL_URL) {
    metin = `<@${member.id}> **katıldı**; özel URL ile geldi (discord.gg/${davet.kod})`;
  } else {
    metin = `<@${member.id}> **katıldı**; hangi davetle geldiği bulunamadı.`;
  }
  await logYaz(guild, metin);
}

export const olaylar = [
  {
    name: Events.ClientReady,
    once: true,
    gerekliIntent: ['GuildInvites'],
    async execute(client) {
      const guild = await client.guilds.fetch(izinliGuild()).catch(() => null);
      if (!guild) return;
      const harita = await davetleriCek(guild).catch((error) => {
        console.warn(`Davet önbelleği kurulamadı (Sunucuyu Yönet izni gerekir): ${error.message}`);
        return null;
      });
      if (harita) onbellek.set(guild.id, harita);
    },
  },
  {
    name: Events.InviteCreate,
    gerekliIntent: ['GuildInvites'],
    async execute(davet) {
      if (!davet.guild) return;
      const harita = onbellek.get(davet.guild.id) ?? new Map();
      harita.set(davet.code, davetKaydi(davet));
      onbellek.set(davet.guild.id, harita);
    },
  },
  {
    name: Events.InviteDelete,
    gerekliIntent: ['GuildInvites'],
    async execute(davet) {
      if (!davet.guild) return;
      const harita = onbellek.get(davet.guild.id);
      const kayit = harita?.get(davet.code);
      if (!kayit) return;
      harita.delete(davet.code);
      eskiSilinenleriAt(davet.guild.id).set(davet.code, { ...kayit, silinme: Date.now() });
    },
  },
  {
    name: Events.GuildMemberAdd,
    gerekliIntent: ['GuildMembers', 'GuildInvites'],
    async execute(member) {
      if (member.user.bot || !sistemAcikMi(veritabani(), member.guild.id, 'davet')) return;
      sira = sira.then(() => girisIsle(member)).catch((error) => {
        console.warn(`Davet girişi işlenemedi (${member.id}): ${error.message}`);
      });
      await sira;
    },
  },
  {
    name: Events.GuildMemberRemove,
    gerekliIntent: ['GuildMembers'],
    async execute(member) {
      if (member.user.bot || !sistemAcikMi(veritabani(), member.guild.id, 'davet')) return;

      const satir = ayrilmaIsaretle(veritabani(), member.guild.id, member.id);
      const kim = member.user.username;
      const metin = satir?.davet_eden_ad
        ? `**${kim}** (<@${member.id}>) **ayrıldı**; **${satir.davet_eden_ad}** davet etmişti`
        : `**${kim}** (<@${member.id}>) **ayrıldı**; davet edeni bilinmiyor`;
      await logYaz(member.guild, metin);
    },
  },
];
