// YouTube üyelik ("Katıl") kategorisini, kanallarını ve log kanalını açar.
// Üyelik rolünü Discord'un YouTube entegrasyonu verir; betik rolü entegrasyon
// etiketinden bulur. Rol henüz yoksa kanallar yalnız yetkililere açık kurulur;
// entegrasyon bağlandıktan sonra betik yeniden çalıştırılınca izinler güncellenir.
// Yeniden çalıştırılabilir: aynı adlı kanal varsa yeniden açmaz, izinlerini yeniler.
import { ChannelType, Client, Events, GatewayIntentBits, PermissionFlagsBits as P } from 'discord.js';
import { ayarGetir, ayarYaz, sistemAyarla } from '../lib/ayarlar.js';
import { gomu } from '../lib/bicim.js';
import { veritabani } from '../lib/db.js';
import { requireEnv } from '../lib/env.js';
import {
  kademeBonusAnahtari, kademeRolAnahtari, kademeSirasi, UYELIK_KADEMELERI, uyelikRolleri,
} from '../lib/uyelik.js';

const { token, guildID } = requireEnv('token', 'guildID');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
await client.login(token);
await new Promise((r) => client.once(Events.ClientReady, r));

const guild = await client.guilds.fetch(guildID);
const kanallar = await guild.channels.fetch();
const roller = await guild.roles.fetch();
const bul = (ad) => kanallar.find((k) => k?.name === ad) ?? null;
const rolBul = (ad) => roller.find((r) => r.name === ad) ?? null;

const botUye = await guild.members.fetchMe();
if (!botUye.permissions.has(P.ManageChannels) || !botUye.permissions.has(P.ManageRoles)) {
  console.error('HATA: botta Kanalları Yönet ve Rolleri Yönet yetkisi gerekli, hiçbir şey açılmadı.');
  await client.destroy();
  process.exit(1);
}

const herkes = guild.roles.everyone.id;
const uyelik = uyelikRolleri(roller);
const yetkili = ['⛤・DaXer', '⛤・AlpGDK', 'İçerik Üretcisi'].map(rolBul).filter(Boolean);
const okcu = rolBul('Okçu Maymun');

const GOR = [P.ViewChannel, P.ReadMessageHistory];
const YAZ = [P.SendMessages, P.AddReactions, P.AttachFiles, P.EmbedLinks,
  P.CreatePublicThreads, P.SendMessagesInThreads];
// Ses kanalının yazı sohbeti de üyelere açık.
const SES = [P.ViewChannel, P.Connect, P.Speak, P.Stream, P.UseVAD, P.SendMessages, P.ReadMessageHistory];

/** Kanal izinleri: üyeler `uyeYazar` ise yazar, değilse yalnız okur ve tepki bırakır. */
function metinIzinleri(uyeYazar) {
  return [
    { id: herkes, deny: [P.ViewChannel] },
    ...uyelik.map((r) => ({
      id: r.id,
      allow: uyeYazar ? [...GOR, ...YAZ] : [...GOR, P.AddReactions],
      ...(uyeYazar ? {} : { deny: [P.SendMessages, P.CreatePublicThreads] }),
    })),
    ...yetkili.map((r) => ({ id: r.id, allow: [...GOR, ...YAZ, P.ManageMessages] })),
    { id: botUye.id, allow: [...GOR, ...YAZ, P.ManageMessages] },
  ];
}

const rapor = [];
async function kanalKur(ad, secenekler) {
  const mevcut = bul(ad);
  if (mevcut) {
    if (secenekler.permissionOverwrites) await mevcut.permissionOverwrites.set(secenekler.permissionOverwrites);
    rapor.push(`  var  ${ad} (${mevcut.id}) — izinler yenilendi`);
    return { kanal: mevcut, yeni: false };
  }
  const kanal = await guild.channels.create({ name: ad, ...secenekler });
  rapor.push(`  YENİ ${ad} (${kanal.id})`);
  return { kanal, yeni: true };
}

// 1) Kategori: Social'ın hemen altına.
const social = bul('#001・Social');
const { kanal: kategori } = await kanalKur('#005・YouTube Üyeleri', {
  type: ChannelType.GuildCategory,
  permissionOverwrites: metinIzinleri(true),
});
if (social) await kategori.setPosition(social.position + 1).catch(() => null);

const { kanal: bilgi, yeni: bilgiYeni } = await kanalKur('・📌・üye-bilgi', {
  type: ChannelType.GuildText, parent: kategori.id,
  topic: 'YouTube kanal üyeliğinin avantajları ve kuralları.',
  permissionOverwrites: metinIzinleri(false),
});
const { kanal: sohbet } = await kanalKur('・💬・üye-sohbet', {
  type: ChannelType.GuildText, parent: kategori.id,
  topic: 'Kanal üyelerine özel sohbet. Desteğin için teşekkürler!',
  permissionOverwrites: metinIzinleri(true),
});
const { kanal: anket } = await kanalKur('・🗳️・üye-anket', {
  type: ChannelType.GuildText, parent: kategori.id,
  topic: 'Sıradaki içerikler için üyelere özel anketler.',
  permissionOverwrites: metinIzinleri(false),
});
const { kanal: istek } = await kanalKur('・💡・üye-istekleri', {
  type: ChannelType.GuildText, parent: kategori.id,
  topic: 'Video ve içerik isteklerin. Bir istek bir mesaj, lütfen.',
  rateLimitPerUser: 60,
  permissionOverwrites: metinIzinleri(true),
});

// Ses kanalı: Okçu Maymun görür ama katılamaz. Hem Okçu hem üye olan kişide
// rol izinlerinde "izin ver" kazandığı için üye olarak katılabilir.
const { kanal: ses } = await kanalKur('🔊 Üye Sohbet', {
  type: ChannelType.GuildVoice, parent: kategori.id,
  permissionOverwrites: [
    { id: herkes, deny: [P.ViewChannel] },
    ...uyelik.map((r) => ({ id: r.id, allow: SES })),
    ...(okcu ? [{ id: okcu.id, allow: [P.ViewChannel], deny: [P.Connect] }] : []),
    ...yetkili.map((r) => ({ id: r.id, allow: [...SES, P.MuteMembers, P.MoveMembers] })),
    { id: botUye.id, allow: [P.ViewChannel, P.ManageChannels] },
  ],
});

// 2) Herkese açık tanıtım kanalı: Dashboard'da, yalnız okunur.
const dashboard = bul('#000・Dashboard');
const { kanal: tanitim, yeni: tanitimYeni } = await kanalKur('・🔓・nasıl-üye-olunur', {
  type: ChannelType.GuildText, parent: dashboard?.id ?? null,
  topic: 'YouTube kanalına üye ol, sunucudaki özel alana eriş.',
  permissionOverwrites: [
    { id: herkes, allow: [...GOR, P.AddReactions], deny: [P.SendMessages, P.CreatePublicThreads] },
    { id: botUye.id, allow: [...GOR, P.SendMessages, P.EmbedLinks] },
  ],
});

// 3) Üyelik logu: Moderator kategorisinde, kategorinin izinlerini devralır.
const moderator = bul('#004・Moderator');
const logAd = '・🎟️・üyelik-log';
let log = bul(logAd);
if (log) {
  rapor.push(`  var  ${logAd} (${log.id})`);
} else {
  log = await guild.channels.create({
    name: logAd, type: ChannelType.GuildText, parent: moderator?.id ?? null,
    topic: 'YouTube üyeliği başlayan, biten ve seviye değiştiren üyeler.',
  });
  if (!moderator) await log.permissionOverwrites.edit(herkes, { ViewChannel: false });
  rapor.push(`  YENİ ${logAd} (${log.id})`);
}
await log.permissionOverwrites.edit(botUye.id, { ViewChannel: true, SendMessages: true, EmbedLinks: true });

// 4) Bilgi mesajları yalnız kanal ilk açıldığında gönderilir, tekrar çalıştırmada çoğalmaz.
if (tanitimYeni) {
  const mesaj = await tanitim.send({ embeds: [gomu('bilgi', '🎟️ Nasıl üye olunur?', [
    '1. YouTube kanalımızda videonun altındaki **Katıl** butonuna bas ve bir seviye seç.',
    '2. Discord\'da **Kullanıcı Ayarları → Bağlantılar** kısmından YouTube (Google) hesabını bağla.',
    '3. Birkaç dakika içinde üyelik rolün otomatik gelir ve **YouTube Üyeleri** kategorisi açılır.',
    '',
    '**Avantajlar**',
    '• Üyelere özel sohbet ve sesli kanal',
    '• Sıradaki içerikler için üye anketleri',
    '• Video isteklerini doğrudan iletme kanalı',
    '• Seviye sisteminde **%50 fazla XP**',
    '',
    'Üyelik bitince rol de otomatik kalkar.',
  ].join('\n'))] });
  await mesaj.pin().catch(() => null);
}
if (bilgiYeni) {
  const mesaj = await bilgi.send({ embeds: [gomu('basari', '💜 Üyeler alanına hoş geldin!', [
    'Kanalı desteklediğin için teşekkürler. Bu kategori yalnız YouTube kanal üyelerine açık.',
    '',
    `• <#${sohbet.id}>: serbest sohbet`,
    `• <#${anket.id}>: sıradaki içerikler için oylamalar`,
    `• <#${istek.id}>: video ve içerik isteklerin (dakikada bir mesaj)`,
    `• <#${ses.id}>: üyelere özel sesli kanal`,
    '',
    'Sunucu kuralları burada da geçerli. Seviye sisteminde üyeler **%50 fazla XP** kazanır.',
  ].join('\n'))] });
  await mesaj.pin().catch(() => null);
}

// 5) Ayarlar ve sistem.
const db = veritabani();
ayarYaz(db, guildID, 'uyelik.logKanal', log.id);
sistemAyarla(db, guildID, 'uyelik', true);

// Muz bonusu kademeleri: yalnız boş kademe rolleri doldurulur, elle
// düzeltilmiş eşleme ezilmez.
const kademeler = kademeSirasi(uyelik).slice(0, UYELIK_KADEMELERI.length);
kademeler.forEach((rol, i) => {
  const anahtar = kademeRolAnahtari(i + 1);
  if (!ayarGetir(db, guildID, anahtar)) ayarYaz(db, guildID, anahtar, rol.id);
});

console.log('Kanallar:');
console.log(rapor.join('\n'));
console.log(`\nAyar: uyelik.logKanal = ${log.id}; sistem uyelik açıldı.`);
console.log(uyelik.length
  ? `Üyelik rolleri: ${uyelik.map((r) => r.name).join(', ')}`
  : '\nUYARI: YouTube üyelik rolü bulunamadı. Kanallar şimdilik yalnız yetkililere açık.\n'
    + 'Sunucu Ayarları → Entegrasyonlar → YouTube bağlandıktan sonra `npm run uyelik` yeniden çalıştır.');
for (const { no } of UYELIK_KADEMELERI) {
  const rolId = ayarGetir(db, guildID, kademeRolAnahtari(no));
  if (rolId) console.log(`Kademe ${no}: ${roller.get(rolId)?.name ?? rolId} → +%${ayarGetir(db, guildID, kademeBonusAnahtari(no))} muz`);
}
if (!okcu) console.log('UYARI: "Okçu Maymun" rolü bulunamadı, ses kanalı izni eklenmedi.');

await client.destroy();
