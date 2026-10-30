// Seviye rollerini (lib/seviye-rol.js KADEMELER) açar, Okçu Maymun'un hemen
// üstüne sıralar, genel-sohbet izinlerini yazar, rol kimliklerini ayara kaydeder
// ve XP kaydı olan üyelere rollerini dağıtır.
// `--dene` ile hiçbir şey yazmadan yapılacakları listeler.
// Yeniden çalıştırılabilir: var olan rolü yeniden açmaz, adını/rengini ezmez.
import { ChannelType, Client, Events, GatewayIntentBits, PermissionFlagsBits as P } from 'discord.js';
import { ayarGetir, ayarYaz } from '../lib/ayarlar.js';
import { veritabani } from '../lib/db.js';
import { requireEnv } from '../lib/env.js';
import { seviyeHesapla } from '../lib/seviye.js';
import {
  KADEMELER, ROL_IZINLERI, genelSohbetIzinleri, kademeRolIdleri, rolAyarAnahtari, rolDegisimi, uyeyiEsitle,
} from '../lib/seviye-rol.js';

const DENE = process.argv.includes('--dene');
const SEBEP = 'Seviye rolleri kurulumu';
const TABAN_ROL = 'Okçu Maymun';
const GENEL_SOHBET = '・💬・genel-sohbet';

const { token, guildID } = requireEnv('token', 'guildID');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
await client.login(token);
await new Promise((r) => client.once(Events.ClientReady, r));

const guild = await client.guilds.fetch(guildID);
const db = veritabani();
const botUye = await guild.members.fetchMe();
if (!botUye.permissions.has(P.ManageRoles) || !botUye.permissions.has(P.ManageChannels)) {
  console.error('HATA: botta Rolleri Yönet ve Kanalları Yönet yetkisi gerekli, hiçbir şey yapılmadı.');
  await client.destroy();
  process.exit(1);
}

let roller = await guild.roles.fetch();
const taban = roller.find((r) => r.name === TABAN_ROL);
if (!taban) {
  console.error(`HATA: "${TABAN_ROL}" rolü bulunamadı; roller onun üstüne sıralanıyor.`);
  await client.destroy();
  process.exit(1);
}

const rapor = [];

// 1) Roller: önce ayardaki kimlik, yoksa aynı ad; ikisi de yoksa açılır.
const kademeRolleri = [];
for (const kademe of KADEMELER) {
  const kayitli = ayarGetir(db, guildID, rolAyarAnahtari(kademe.seviye));
  let rol = (kayitli && roller.get(kayitli)) || roller.find((r) => r.name === kademe.ad) || null;

  if (rol) {
    rapor.push(`  var  Sv ${kademe.seviye} ${rol.name} (${rol.id})`);
  } else if (DENE) {
    rapor.push(`  AÇILACAK Sv ${kademe.seviye} ${kademe.ad}`);
  } else {
    rol = await guild.roles.create({
      name: kademe.ad, colors: { primaryColor: kademe.renk }, hoist: kademe.ayriGoster, mentionable: false,
      permissions: ROL_IZINLERI, reason: SEBEP,
    });
    rapor.push(`  YENİ Sv ${kademe.seviye} ${rol.name} (${rol.id})`);
  }

  if (rol && !DENE) ayarYaz(db, guildID, rolAyarAnahtari(kademe.seviye), rol.id);
  kademeRolleri.push({ kademe, rol });
}

// 2) Sıra: kademe rolleri Okçu Maymun'un hemen üstünde, küçükten büyüğe.
// Böylece YouTube üyelik rollerinin rengi ve ayrı listesi üstte kalır.
roller = await guild.roles.fetch();
const mevcutlar = kademeRolleri.map(({ rol }) => rol).filter(Boolean).map((r) => roller.get(r.id));
const kademeIdleri = new Set(mevcutlar.map((r) => r.id));
const sirali = [...roller.values()]
  .filter((r) => r.id !== guild.id && !kademeIdleri.has(r.id))
  .sort((a, b) => a.position - b.position);
sirali.splice(sirali.findIndex((r) => r.id === taban.id) + 1, 0, ...mevcutlar);

const tasinan = sirali
  .map((r, i) => ({ role: r.id, position: i + 1, eski: r.position, ad: r.name }))
  .filter((d) => d.position !== d.eski);
const ustteKalan = tasinan.filter((d) => d.eski >= botUye.roles.highest.position);
if (ustteKalan.length > 0) {
  console.error(`HATA: botun rolünün üstündeki roller yer değiştirecekti: ${ustteKalan.map((d) => d.ad).join(', ')}`);
  await client.destroy();
  process.exit(1);
}
// Discord'a yalnız yeri değişenleri göndermek yetmiyor: gönderilmeyen roller
// eski konumunda kalıp araya karışıyor. Botun altındaki bütün sırayı gönderiyoruz.
if (tasinan.length > 0 && !DENE) {
  await guild.roles.setPositions(sirali
    .map((r, i) => ({ role: r.id, position: i + 1 }))
    .filter(({ position }) => position < botUye.roles.highest.position));
}
rapor.push(`  sıra: ${tasinan.length} rolün konumu ${DENE ? 'değişecek' : 'güncellendi'}`);

// 3) genel-sohbet: her kademe kendisi ve altındakilerin izinlerini taşır,
// çünkü üyede yalnız en yüksek kademenin rolü kalıyor.
const kanallar = await guild.channels.fetch();
const genel = kanallar.find((k) => k?.name === GENEL_SOHBET && k.type === ChannelType.GuildText);
if (!genel) {
  rapor.push(`  UYARI: ${GENEL_SOHBET} bulunamadı, kanal izinleri yazılmadı`);
} else {
  for (const { kademe, rol } of kademeRolleri) {
    const izinler = genelSohbetIzinleri(kademe);
    if (izinler.length === 0) continue;
    if (rol && !DENE) {
      await genel.permissionOverwrites.edit(rol.id, Object.fromEntries(izinler.map((p) => [p, true])), { reason: SEBEP });
    }
    rapor.push(`  ${GENEL_SOHBET} ← ${kademe.ad}: ${izinler.join(', ')}`);
  }
}

// 4) Mevcut XP kayıtlarına göre rol dağıtımı.
const rolIdleri = DENE
  ? Object.fromEntries(kademeRolleri.map(({ kademe, rol }) => [kademe.seviye, rol?.id ?? `<${kademe.ad}>`]))
  : kademeRolIdleri((anahtar) => ayarGetir(db, guildID, anahtar));
const kayitlar = db.prepare('SELECT kullanici_id, xp FROM seviyeler WHERE guild_id = ?').all(guildID);
const uyeler = await guild.members.fetch();
const sayac = new Map();
let hata = 0;

for (const { kullanici_id: id, xp } of kayitlar) {
  const uye = uyeler.get(id);
  if (!uye || uye.user.bot) continue;
  const { seviye } = seviyeHesapla(xp);

  if (DENE) {
    const { ekle, cikar, kademe } = rolDegisimi(uye.roles.cache.keys(), seviye, rolIdleri);
    if (ekle.length || cikar.length) sayac.set(kademe?.ad ?? '(rol yok)', (sayac.get(kademe?.ad ?? '(rol yok)') ?? 0) + 1);
    continue;
  }

  try {
    const { ekle, cikar, kademe } = await uyeyiEsitle(uye, seviye, rolIdleri, SEBEP);
    if (ekle.length || cikar.length) sayac.set(kademe?.ad ?? '(rol yok)', (sayac.get(kademe?.ad ?? '(rol yok)') ?? 0) + 1);
  } catch (e) {
    hata += 1;
    console.error(`  rol verilemedi: ${uye.user.tag} — ${e.message}`);
  }
}

console.log(DENE ? 'DENEME — hiçbir şey yazılmadı.\n' : '');
console.log('Roller ve izinler:');
console.log(rapor.join('\n'));
console.log(`\nRol ${DENE ? 'verilecek' : 'verilen'} üyeler (${kayitlar.length} XP kaydı tarandı):`);
for (const kademe of KADEMELER) if (sayac.has(kademe.ad)) console.log(`  ${kademe.ad}: ${sayac.get(kademe.ad)}`);
if (sayac.size === 0) console.log('  değişiklik yok');
if (hata) console.log(`  ${hata} üyede hata oluştu (yukarıda).`);

await client.destroy();
