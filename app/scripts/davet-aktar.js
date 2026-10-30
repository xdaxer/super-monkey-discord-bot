// InviteManager'ın invite-log kanalındaki geçmişini davet takibine aktarır.
// - Her "joined" satırı, "kim kimi davet etti" geçmişi olarak yazılır
//   (kaynak 'invitemanager'; mesaj kimliğiyle tekil, yeniden çalıştırmak çift yazmaz).
// - Her davet edenin InviteManager'daki son sayısı başlangıç olarak yazılır;
//   botun saydığı girişler yalnız InviteManager'ın son mesajından sonrası için
//   eklenir. InviteManager çıkarılmadan hemen önce yeniden çalıştırmak sayıları eşitler.
// InviteManager davet edeni yalnız kullanıcı adıyla yazıyor; ad şu anki üyelerden
// kimliğe çevrilir. Sunucudan ayrılmış davet edenin sayısı başlangıca yazılamaz.
// Kullanım: `node scripts/davet-aktar.js [--kanal <id>] [--dene]`
import { Client, Events, GatewayIntentBits } from 'discord.js';

import { ayarGetir } from '../lib/ayarlar.js';
import { baslangicYaz, inviteManagerSatiri, katilimKaydet } from '../lib/davet.js';
import { acVeritabani } from '../lib/db.js';
import { requireEnv } from '../lib/env.js';

const DENE = process.argv.includes('--dene');
const kanalArg = process.argv[process.argv.indexOf('--kanal') + 1];

const { token, guildID } = requireEnv('token', 'guildID');
const db = acVeritabani();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
await client.login(token);
await new Promise((r) => client.once(Events.ClientReady, r));

try {
  const guild = await client.guilds.fetch(guildID);
  const kanalId = process.argv.includes('--kanal')
    ? kanalArg
    : ayarGetir(db, guildID, 'davet.logKanal')
      ?? (await guild.channels.fetch()).find((k) => k?.name.includes('invite-log'))?.id;
  if (!kanalId) throw new Error('invite-log kanalı bulunamadı; --kanal <id> ver.');
  const kanal = await client.channels.fetch(kanalId);

  const mesajlar = [];
  let once;
  for (;;) {
    const parti = await kanal.messages.fetch({ limit: 100, ...(once ? { before: once } : {}) });
    if (parti.size === 0) break;
    mesajlar.push(...parti.values());
    once = parti.last().id;
    if (parti.size < 100) break;
  }
  mesajlar.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  // Yalnız InviteManager'ın yazdıkları; botumuzun aynı kanala yazdıkları geçmiş değil.
  const imMesajlari = mesajlar
    .filter((m) => m.author.username === 'InviteManager')
    .map((m) => ({ m, s: inviteManagerSatiri(m.content) }))
    .filter(({ s }) => s);
  if (imMesajlari.length === 0) throw new Error(`${kanal.name}: InviteManager satırı yok.`);

  const uyeler = await guild.members.fetch();
  const adlar = new Map(uyeler.map((u) => [u.user.username, u.id]));

  const sonSayi = new Map();
  let yazilan = 0;
  for (const { m, s } of imMesajlari) {
    const davetEdenId = s.davetEdenAd ? adlar.get(s.davetEdenAd) ?? null : null;
    if (!DENE) {
      const sonuc = katilimKaydet(db, guildID, {
        uyeId: s.uyeId, davetEdenId, davetEdenAd: s.davetEdenAd,
        kaynak: 'invitemanager', kaynakMesajId: m.id, zaman: m.createdTimestamp,
      });
      yazilan += Number(sonuc.changes);
    }
    if (s.davetEdenAd && s.sayi !== null) sonSayi.set(s.davetEdenAd, s.sayi);
  }

  const sonZaman = imMesajlari.at(-1).m.createdTimestamp;
  const bulunamayan = [];
  console.log(`${imMesajlari.length} InviteManager satırı; ${DENE ? 'deneme, yazılmadı' : `${yazilan} yeni geçmiş satırı`}.`);
  console.log(`Başlangıç sayıları (InviteManager'ın son mesajı: ${new Date(sonZaman).toISOString()}):`);
  for (const [ad, sayi] of [...sonSayi].sort((a, b) => b[1] - a[1])) {
    const id = adlar.get(ad);
    if (!id) {
      bulunamayan.push(`${ad} (${sayi})`);
      continue;
    }
    if (!DENE) baslangicYaz(db, guildID, id, sayi, sonZaman);
    console.log(`  ${ad} → ${sayi}`);
  }
  if (bulunamayan.length) {
    console.log(`Sunucuda olmadığı için başlangıcı yazılamayan: ${bulunamayan.join(', ')}`);
  }
} finally {
  db.close();
  await client.destroy();
}
