// Prestij rollerini (lib/prestij-rol.js: "🌟 Prestij n") açar, kimlikleri
// prestij.rol.<n> ayarlarına yazar ve prestiji olan üyelere ulaştıkları
// seviyenin rolünü verir (daha düşük prestij rolleri alınır).
// `--dene` ile hiçbir şey yazmadan yapılacakları listeler.
// Yeniden çalıştırılabilir: var olan rolü yeniden açmaz.
// Roller botun hemen altında açılır; sıralamayı yönetici ayarlayabilir.
import {
  Client, Events, GatewayIntentBits, PermissionFlagsBits as P,
} from 'discord.js';

import { ayarGetir, ayarYaz } from '../lib/ayarlar.js';
import { veritabani } from '../lib/db.js';
import { requireEnv } from '../lib/env.js';
import {
  PRESTIJ_ROL_RENGI, PRESTIJ_SEVIYELERI, prestijRolAdi, prestijRolAnahtari, prestijRoluVer,
} from '../lib/prestij-rol.js';

const DENE = process.argv.includes('--dene');
const SEBEP = 'Prestij rolleri kurulumu';

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

const roller = await guild.roles.fetch();
const oku = (anahtar) => ayarGetir(db, guildID, anahtar);

const rapor = [];
for (const n of PRESTIJ_SEVIYELERI) {
  const kayitli = oku(prestijRolAnahtari(n));
  let rol = (kayitli && roller.get(kayitli)) || roller.find((r) => r.name === prestijRolAdi(n)) || null;

  if (rol) {
    rapor.push(`  var  ${rol.name} (${rol.id})`);
  } else if (DENE) {
    rapor.push(`  AÇILACAK ${prestijRolAdi(n)}`);
  } else {
    rol = await guild.roles.create({
      name: prestijRolAdi(n), colors: { primaryColor: PRESTIJ_ROL_RENGI }, hoist: false,
      mentionable: false, permissions: [], reason: SEBEP,
    });
    rapor.push(`  YENİ ${rol.name} (${rol.id})`);
  }
  if (rol && !DENE) ayarYaz(db, guildID, prestijRolAnahtari(n), rol.id);
}

// Prestiji olan üyelere ulaştıkları seviyenin rolü.
const sahipler = db
  .prepare('SELECT kullanici_id, seviye FROM prestijler WHERE guild_id = ? AND seviye > 0')
  .all(guildID);
const uyeler = await guild.members.fetch();
let verilen = 0;
for (const { kullanici_id: id, seviye } of sahipler) {
  const uye = uyeler.get(id);
  if (!uye) continue;
  if (DENE) {
    verilen += 1;
    continue;
  }
  if (await prestijRoluVer(uye, seviye, oku, SEBEP)) verilen += 1;
}

console.log(DENE ? 'DENEME — hiçbir şey yazılmadı.\n' : '');
console.log('Prestij rolleri:');
console.log(rapor.join('\n'));
console.log(`Dağıtım: ${verilen} üye ${DENE ? 'için rol verilecek' : 'için rol verildi'}`);
await client.destroy();
