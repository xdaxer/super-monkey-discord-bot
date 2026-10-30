// T-KANAL: gerekli kategori ve kanalları açar, ayar anahtarlarına bağlar.
// Yeniden çalıştırılabilir: aynı adlı kanal varsa yeniden açmaz.
import { ChannelType, Client, Events, GatewayIntentBits, PermissionFlagsBits } from 'discord.js';
import { ayarYaz, sistemAyarla } from '../lib/ayarlar.js';
import { veritabani } from '../lib/db.js';
import { requireEnv } from '../lib/env.js';

const { token, guildID } = requireEnv('token', 'guildID');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
await client.login(token);
await new Promise((r) => client.once(Events.ClientReady, r));

const guild = await client.guilds.fetch(guildID);
const kanallar = await guild.channels.fetch();
const bul = (ad) => kanallar.find((k) => k?.name === ad) ?? null;

const botUye = await guild.members.fetchMe();
if (!botUye.permissions.has(PermissionFlagsBits.ManageChannels)) {
  console.error('HATA: botta Kanalları Yönet yetkisi yok, hiçbir şey açılmadı.');
  await client.destroy();
  process.exit(1);
}

const rapor = [];
async function kanalAc(ad, secenekler) {
  const mevcut = bul(ad);
  if (mevcut) {
    rapor.push(`  var  ${ad} (${mevcut.id})`);
    return mevcut;
  }
  const yeni = await guild.channels.create({ name: ad, ...secenekler });
  rapor.push(`  YENİ ${ad} (${yeni.id})`);
  return yeni;
}

const herkes = guild.roles.everyone.id;

// 1) Destek kategorisi
const kategori = await kanalAc('#004・Destek', { type: ChannelType.GuildCategory });

// 2) Panel kanalı: herkes görür ve okur, yalnız bot yazar.
const panel = await kanalAc('・🎫・destek-talebi', {
  type: ChannelType.GuildText,
  parent: kategori.id,
  topic: 'Yetkililere özel ulaşmak için buradaki butonu kullan.',
  permissionOverwrites: [
    { id: herkes, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages] },
    { id: botUye.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels] },
  ],
});

// 3) Transkript kanalı: Moderator kategorisinde, @everyone'a kapalı.
const moderator = bul('#003・Moderator');
const log = await kanalAc('・📋・talep-log', {
  type: ChannelType.GuildText,
  parent: moderator?.id ?? null,
  topic: 'Kapanan destek taleplerinin transkriptleri.',
  permissionOverwrites: [
    { id: herkes, deny: [PermissionFlagsBits.ViewChannel] },
    { id: botUye.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] },
  ],
});

// 4) Seviye duyuru kanalı: Social kategorisinde, herkes görür.
const social = bul('#001・Social');
const seviye = await kanalAc('・📈・seviye', {
  type: ChannelType.GuildText,
  parent: social?.id ?? null,
  topic: 'Seviye atlama duyuruları. /seviye bilgi ve /seviye siralama.',
});

// 5) Mevcut çekiliş kanalı yeniden açılmıyor, bulunup bağlanıyor.
const cekilis = bul('・🎁・çekiliş');
rapor.push(cekilis ? `  var  ・🎁・çekiliş (${cekilis.id})` : '  YOK  ・🎁・çekiliş bulunamadı!');

// 6) Ayar anahtarlarını bağla.
const db = veritabani();
const ayarlar = {
  'talep.kategori': kategori.id,
  'talep.panelKanal': panel.id,
  'talep.logKanal': log.id,
  'seviye.kanal': seviye.id,
  ...(cekilis ? { 'cekilis.kanal': cekilis.id } : {}),
};
for (const [anahtar, deger] of Object.entries(ayarlar)) ayarYaz(db, guildID, anahtar, deger);

// 7) Yeni sistemleri aç.
for (const sistem of ['talep', 'cekilis', 'seviye', 'yedek']) sistemAyarla(db, guildID, sistem, true);

console.log('Kanallar:');
console.log(rapor.join('\n'));
console.log('\nAyarlar:');
for (const [k, v] of Object.entries(ayarlar)) console.log(`  ${k} = ${v}`);
console.log('\nAçılan sistemler: talep, cekilis, seviye, yedek');

await client.destroy();
