// T-OZELSES: "oda oluştur" ses kanalını açar, ayara bağlar ve sistemi açar.
// Kanal, ses kategorisinin en üstüne konur; odalar da aynı kategoride açılır.
// Yeniden çalıştırılabilir: aynı adlı kanal varsa yeniden açmaz.
import { ChannelType, Client, Events, GatewayIntentBits, PermissionFlagsBits as P } from 'discord.js';
import { ayarYaz, sistemAyarla } from '../lib/ayarlar.js';
import { veritabani } from '../lib/db.js';
import { requireEnv } from '../lib/env.js';

const KATEGORI = '#002・Voice Chats';
const AD = '➕ Oda Oluştur';

const { token, guildID } = requireEnv('token', 'guildID');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
await client.login(token);
await new Promise((r) => client.once(Events.ClientReady, r));

const guild = await client.guilds.fetch(guildID);
const kanallar = await guild.channels.fetch();
const bul = (ad, tur) => kanallar.find((k) => k?.name === ad && k.type === tur) ?? null;

const botUye = await guild.members.fetchMe();
if (!botUye.permissions.has(P.ManageChannels) || !botUye.permissions.has(P.MoveMembers)) {
  console.error('HATA: botta Kanalları Yönet ve Üyeleri Taşı yetkisi gerekli, hiçbir şey açılmadı.');
  await client.destroy();
  process.exit(1);
}

const kategori = bul(KATEGORI, ChannelType.GuildCategory);
if (!kategori) {
  console.error(`HATA: "${KATEGORI}" kategorisi bulunamadı, hiçbir şey açılmadı.`);
  await client.destroy();
  process.exit(1);
}

let hub = bul(AD, ChannelType.GuildVoice);
const durum = hub ? 'var ' : 'YENİ';
// Kategori izinlerini devralır: kategoriyi gören herkes girip oda açabilir.
hub ??= await guild.channels.create({
  name: AD,
  type: ChannelType.GuildVoice,
  parent: kategori.id,
  reason: 'Özel ses odası: oda oluştur kanalı',
});
await hub.setPosition(0).catch(() => null);

const db = veritabani();
ayarYaz(db, guildID, 'ozelses.kanal', hub.id);
sistemAyarla(db, guildID, 'ozelses', true);

console.log(`  ${durum} ${AD} (${hub.id}) → ${kategori.name} (${kategori.id})`);
console.log(`Ayar: ozelses.kanal = ${hub.id}; sistem ozelses açıldı.`);

await client.destroy();
