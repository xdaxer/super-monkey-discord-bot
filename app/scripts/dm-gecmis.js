// Bota şimdiye kadar gelmiş DM'leri dm.logKanal kanalına aktarır.
// Discord botların DM listesini vermez; sunucudaki her üyenin bot ile DM
// kanalı açılıp (üyeye bildirim gitmez) geçmişi okunur. Sunucudan ayrılmış
// birinin DM'leri bu yüzden bulunamaz. Kişi başı gönderim, 10 gömülük
// mesajlar halinde ve zaman sırasıyla yapılır.
// `--dene` hiçbir şey göndermeden kimden kaç DM bulunduğunu listeler.
import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';

import { ayarGetir } from '../lib/ayarlar.js';
import { acVeritabani } from '../lib/db.js';
import { aktarilirMi, dmGomusu } from '../lib/dm-log.js';
import { requireEnv } from '../lib/env.js';

const DENE = process.argv.includes('--dene');
const GOMU_BASINA = 10;

const { token, guildID } = requireEnv('token', 'guildID');
const db = acVeritabani();
const kanalId = ayarGetir(db, guildID, 'dm.logKanal');
db.close();
if (!kanalId && !DENE) {
  console.error('HATA: dm.logKanal ayarlı değil; önce kanalı bağla.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
});
await client.login(token);
await new Promise((r) => client.once(Events.ClientReady, r));

const guild = await client.guilds.fetch(guildID);
const uyeler = [...(await guild.members.fetch()).values()].filter((u) => !u.user.bot);
const kanal = kanalId ? await client.channels.fetch(kanalId) : null;

/** Bir DM kanalının bütün mesajları (eskiden yeniye). */
async function butunMesajlar(dm) {
  const hepsi = [];
  let once;
  for (;;) {
    const parti = await dm.messages.fetch({ limit: 100, ...(once ? { before: once } : {}) });
    if (parti.size === 0) break;
    hepsi.push(...parti.values());
    once = parti.last().id;
    if (parti.size < 100) break;
  }
  return hepsi.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

let kisi = 0;
let toplam = 0;
for (const uye of uyeler) {
  const dm = await uye.user.createDM().catch(() => null);
  if (!dm) continue;
  const mesajlar = (await butunMesajlar(dm).catch(() => [])).filter(aktarilirMi);
  if (mesajlar.length === 0) continue;

  kisi += 1;
  toplam += mesajlar.length;
  console.log(`${uye.user.tag}: ${mesajlar.length} DM`);
  if (DENE) continue;

  for (let i = 0; i < mesajlar.length; i += GOMU_BASINA) {
    const parca = mesajlar.slice(i, i + GOMU_BASINA);
    await kanal.send({
      content: i === 0 ? `📨 <@${uye.id}> — geçmiş DM'ler (${mesajlar.length})` : undefined,
      embeds: parca.map((m) => dmGomusu(m, { gecmis: true })),
      allowedMentions: { parse: [] },
    });
  }
}

console.log(DENE ? 'DENEME — hiçbir şey gönderilmedi.' : 'Aktarıldı.');
console.log(`${uyeler.length} üye tarandı · ${kisi} kişiden ${toplam} DM`);
await client.destroy();
