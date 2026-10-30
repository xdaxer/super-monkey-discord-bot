// Rozet rollerini (lib/rozet-rol.js) açar, seviye rollerinin en üstündekinin
// hemen üstüne değerine göre sıralar (en değerli rozet en üstte), kimlikleri
// rozet.rol.<ad> ayarlarına yazar ve rozeti olan üyelere rollerini verir.
// `--dene` ile hiçbir şey yazmadan yapılacakları listeler.
// Yeniden çalıştırılabilir: var olan rolü yeniden açmaz, adını/rengini ezmez.
import {
  Client, Events, GatewayIntentBits, PermissionFlagsBits as P,
} from 'discord.js';

import { ayarGetir, ayarYaz } from '../lib/ayarlar.js';
import { veritabani } from '../lib/db.js';
import { requireEnv } from '../lib/env.js';
import {
  ROZET_RENKLERI, ROZETLER, rozetRolAdi, rozetRolAnahtari,
} from '../lib/rozet-rol.js';
import { kademeRolIdleri } from '../lib/seviye-rol.js';

const DENE = process.argv.includes('--dene');
const SEBEP = 'Rozet rolleri kurulumu';

const { token, guildID } = requireEnv('token', 'guildID');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
await client.login(token);
await new Promise((r) => client.once(Events.ClientReady, r));

const guild = await client.guilds.fetch(guildID);
const db = veritabani();
const botUye = await guild.members.fetchMe();
if (!botUye.permissions.has(P.ManageRoles)) {
  console.error('HATA: botta Rolleri Yönet yetkisi gerekli, hiçbir şey yapılmadı.');
  await client.destroy();
  process.exit(1);
}

let roller = await guild.roles.fetch();
const oku = (anahtar) => ayarGetir(db, guildID, anahtar);

// Taban: kurulu en yüksek seviye rolü; yoksa roller botun hemen altına gider.
const seviyeRolleri = Object.values(kademeRolIdleri(oku)).map((id) => id && roller.get(id)).filter(Boolean);
const taban = seviyeRolleri.sort((a, b) => b.position - a.position)[0] ?? null;

const rapor = [];
const rozetRolleri = [];
for (const rozet of ROZETLER) {
  const kayitli = oku(rozetRolAnahtari(rozet.kimlik));
  let rol = (kayitli && roller.get(kayitli)) || roller.find((r) => r.name === rozetRolAdi(rozet)) || null;

  if (rol) {
    rapor.push(`  var  ${rol.name} (${rol.id})`);
  } else if (DENE) {
    rapor.push(`  AÇILACAK ${rozetRolAdi(rozet)}`);
  } else {
    rol = await guild.roles.create({
      name: rozetRolAdi(rozet), colors: { primaryColor: ROZET_RENKLERI[rozet.kimlik] }, hoist: false,
      mentionable: false, permissions: [], reason: SEBEP,
    });
    rapor.push(`  YENİ ${rol.name} (${rol.id})`);
  }

  if (rol && !DENE) ayarYaz(db, guildID, rozetRolAnahtari(rozet.kimlik), rol.id);
  rozetRolleri.push({ rozet, rol });
}

// Sıra: rozet rolleri seviye rollerinin hemen üstünde, katalog sırasıyla
// (en değerli en üstte). Seviye rolü kurulu değilse botun hemen altında.
roller = await guild.roles.fetch();
const mevcutlar = rozetRolleri.map(({ rol }) => rol).filter(Boolean).map((r) => roller.get(r.id));
const rozetIdleri = new Set(mevcutlar.map((r) => r.id));
const sirali = [...roller.values()]
  .filter((r) => r.id !== guild.id && !rozetIdleri.has(r.id))
  .sort((a, b) => a.position - b.position);
const ekleme = taban
  ? sirali.findIndex((r) => r.id === taban.id) + 1
  : sirali.findIndex((r) => r.id === botUye.roles.highest.id);
sirali.splice(ekleme, 0, ...mevcutlar);

const tasinan = sirali
  .map((r, i) => ({ role: r.id, position: i + 1, eski: r.position, ad: r.name }))
  .filter((d) => d.position !== d.eski);
const ustteKalan = tasinan.filter((d) => d.eski >= botUye.roles.highest.position);
if (ustteKalan.length > 0) {
  console.error(`HATA: botun rolünün üstündeki roller yer değiştirecekti: ${ustteKalan.map((d) => d.ad).join(', ')}`);
  await client.destroy();
  process.exit(1);
}
// Yalnız yeri değişen roller gönderilir; her biri kesin son konumunu taşıdığı
// için değişmeyenlerle çakışmaz. Bütün sırayı göndermek bu sunucuda Missing
// Permissions verdi (YouTube entegrasyon rolleri ve botun kendi rolü listede).
if (tasinan.length > 0 && !DENE) {
  await guild.roles.setPositions(tasinan.map(({ role, position }) => ({ role, position })));
}
rapor.push(`  sıra: ${taban ? `"${taban.name}" üstü` : 'botun altı'}, ${tasinan.length} rolün konumu ${DENE ? 'değişecek' : 'güncellendi'}`);

// Rozeti olan üyelere rolleri.
const uyeler = await guild.members.fetch();
let verilen = 0;
let hata = 0;
for (const { rozet, rol } of rozetRolleri) {
  if (!rol) continue;
  const sahipler = db
    .prepare('SELECT kullanici_id FROM envanter WHERE guild_id = ? AND esya = ? AND adet > 0')
    .all(guildID, rozet.kimlik);
  for (const { kullanici_id: id } of sahipler) {
    const uye = uyeler.get(id);
    if (!uye || uye.roles.cache.has(rol.id)) continue;
    if (DENE) {
      verilen += 1;
      continue;
    }
    try {
      await uye.roles.add(rol.id, SEBEP);
      verilen += 1;
    } catch (e) {
      hata += 1;
      console.error(`  rol verilemedi: ${uye.user.tag} — ${e.message}`);
    }
  }
}

console.log(DENE ? 'DENEME — hiçbir şey yazılmadı.\n' : '');
console.log('Rozet rolleri:');
console.log(rapor.join('\n'));
console.log(`Dağıtım: ${verilen} rol ${DENE ? 'verilecek' : 'verildi'}${hata ? `, ${hata} hata` : ''}`);
await client.destroy();
