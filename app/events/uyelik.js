import { Events, PermissionFlagsBits } from 'discord.js';

import { ayarGetir, sistemAcikMi } from '../lib/ayarlar.js';
import { gomu, PINGSIZ } from '../lib/bicim.js';
import { veritabani } from '../lib/db.js';
import { izinliGuild } from '../lib/guild-kilidi.js';
import { degisimTuru, uyelikDegisimi, uyelikRolleri } from '../lib/uyelik.js';
import { uyelikleriEsitle, uyelikRolleriYaz } from '../lib/uyelik-carpan.js';

const BASLIK = {
  basladi: ['basari', 'YouTube üyeliği başladı'],
  bitti: ['hata', 'YouTube üyeliği bitti'],
  degisti: ['bilgi', 'YouTube üyelik seviyesi değişti'],
};

const rolAdlari = (guild, idler) => idler
  .map((id) => guild.roles.cache.get(id)?.name ?? id)
  .join(', ');

async function logYaz(guild, embed) {
  const db = veritabani();
  if (!sistemAcikMi(db, guild.id, 'uyelik')) return false;

  const kanalId = ayarGetir(db, guild.id, 'uyelik.logKanal');
  if (!kanalId) return false;

  const kanal = await guild.client.channels.fetch(kanalId).catch(() => null);
  if (!kanal?.isTextBased?.()) return false;

  const botUye = guild.members.me;
  if (botUye && !kanal.permissionsFor(botUye)?.has(PermissionFlagsBits.SendMessages)) return false;

  await kanal.send({ embeds: [embed], ...PINGSIZ }).catch(() => null);
  return true;
}

export const olaylar = [
  {
    // Önbellekte olmayan üyenin rol değişimi discord.js tarafından olay olarak
    // yayılmaz; açılışta üyeleri çekmezsek bot yeniden başladıktan sonraki
    // ilk üyelik bitişleri kaçar. Tek küçük sunucu için ucuz bir istek.
    // Kapalıyken değişen roller de burada muz çarpanı tablosuna yeniden yazılır.
    name: Events.ClientReady,
    once: true,
    gerekliIntent: ['GuildMembers'],
    async execute(client) {
      const guild = await client.guilds.fetch(izinliGuild()).catch(() => null);
      const uyeler = await guild?.members.fetch().catch(() => null);
      if (!uyeler) return;
      const idler = new Set(uyelikRolleri(guild.roles.cache).map((r) => r.id));
      uyelikleriEsitle(veritabani(), guild.id, [...uyeler.values()]
        .map((u) => ({ kullaniciId: u.id, rolIdleri: [...u.roles.cache.keys()].filter((id) => idler.has(id)) }))
        .filter((u) => u.rolIdleri.length > 0));
    },
  },
  {
    name: Events.GuildMemberUpdate,
    gerekliIntent: ['GuildMembers'],
    async execute(onceki, sonraki) {
      const { guild } = sonraki;
      const uyelikIdleri = uyelikRolleri(guild.roles.cache).map((r) => r.id);
      if (uyelikIdleri.length === 0) return;

      const degisim = uyelikDegisimi(
        onceki.roles.cache.keys(), sonraki.roles.cache.keys(), uyelikIdleri,
      );
      const kalan = sonraki.roles.cache.filter((r) => uyelikIdleri.includes(r.id)).size;
      if (degisim.eklenen.length || degisim.cikan.length) {
        uyelikRolleriYaz(veritabani(), guild.id, sonraki.id,
          [...sonraki.roles.cache.keys()].filter((id) => uyelikIdleri.includes(id)));
      }
      const tur = degisimTuru(degisim, kalan);
      if (!tur) return;

      const [renk, baslik] = BASLIK[tur];
      const embed = gomu(renk, baslik).addFields(
        { name: 'Kullanıcı', value: `<@${sonraki.id}> (\`${sonraki.user.tag ?? sonraki.user.username}\`)` },
      );
      if (degisim.eklenen.length) {
        embed.addFields({ name: 'Alınan seviye', value: rolAdlari(guild, degisim.eklenen), inline: true });
      }
      if (degisim.cikan.length) {
        embed.addFields({ name: 'Biten seviye', value: rolAdlari(guild, degisim.cikan), inline: true });
      }

      await logYaz(guild, embed);
    },
  },
  {
    // Üye sunucudan çıkınca rol değişimi olayı gelmez; üyeliği varken
    // ayrılanı ayrıca yazıyoruz.
    name: Events.GuildMemberRemove,
    gerekliIntent: ['GuildMembers'],
    async execute(uye) {
      uyelikRolleriYaz(veritabani(), uye.guild.id, uye.id, []);
      if (uye.partial) return;
      const roller = uyelikRolleri(uye.roles.cache);
      if (roller.length === 0) return;

      const embed = gomu('uyari', 'YouTube üyesi sunucudan ayrıldı').addFields(
        { name: 'Kullanıcı', value: `${uye.user.tag ?? uye.user.username} (\`${uye.id}\`)` },
        { name: 'Seviye', value: roller.map((r) => r.name).join(', '), inline: true },
      );
      await logYaz(uye.guild, embed);
    },
  },
];
