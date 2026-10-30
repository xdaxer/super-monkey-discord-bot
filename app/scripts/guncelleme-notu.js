// Commit'i ・💵・güncelleme-notları kanalına not olarak yazar (git post-commit
// kancası çağırır; kurulum docs/kullanim.md "Güncelleme notları").
//
// Biçim #duyuru'daki ekonomi duyurusuyla aynı (2026-10-23): yeni not
// 🍌 Ekonomi Bildirimi rolünü etiketler, her commit `## 🍌 konu` başlığı, gövde
// (emojili bölüm satırları, • maddeler, **kalın**) ve altta küçük commit/saat
// satırıdır. Botun bu kanalda son 6 saat içinde açtığı bir not varsa yeni
// commit ona eklenir (mesaj düzenlenir; düzenleme yeniden bildirim göndermez);
// yoksa ya da 2000 karakteri aşacaksa yeni mesaj açılır. Aynı commit iki kez
// yazılmaz.
//
// Kullanım: node scripts/guncelleme-notu.js [commit] [--dene]
//   --dene: hiçbir şey göndermeden yapılacağı yazar.

import { execFileSync } from 'node:child_process';

import { REST, Routes } from 'discord.js';

import { optionalEnv, requireEnv } from '../lib/env.js';

const { token, guncellemeKanalID: KANAL } = requireEnv('token', 'guncellemeKanalID');
/** 🍌 Ekonomi Bildirimi (lib/bildirim-rol.js); yalnız yeni not açılırken etiketlenir. Boşsa etiket yok. */
const ROL = optionalEnv('guncellemeRolID');
const PENCERE_MS = 6 * 3_600_000;
const SINIR = 2000;
const TR = { timeZone: 'Europe/Istanbul' };

const DENE = process.argv.includes('--dene');
const hedef = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'HEAD';

/**
 * Commit gövdesi: imza satırları atılır, 72 sütunda kırılmış satırlar
 * birleştirilir. Yeni satır başlatanlar: boş satırdan sonrası, `-`/`•`/`*`
 * maddeleri (• olur) ve emojiyle başlayan bölüm satırları (`🏦 **Başlık:** …`).
 */
function govdeMetni(satirlar) {
  const paragraflar = [];
  for (const ham of satirlar) {
    const satir = ham.trimEnd();
    if (/^(Co-Authored-By|Claude-Session|Signed-off-by):/i.test(satir)) continue;
    if (!satir.trim()) {
      paragraflar.push('');
      continue;
    }
    const madde = /^\s*[-•*]\s/.test(satir);
    const bolum = /^\p{Extended_Pictographic}/u.test(satir);
    const son = paragraflar.length - 1;
    if (!madde && !bolum && son >= 0 && paragraflar[son] !== '') paragraflar[son] += ` ${satir.trim()}`;
    else paragraflar.push(madde ? `• ${satir.replace(/^\s*[-•*]\s+/, '')}` : satir.trim());
  }
  return paragraflar.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const git = (...arg) => execFileSync('git', arg, { encoding: 'utf8' });
const [kisa, unix, konu, ...govde] = git('log', '-1', '--format=%h%n%ct%n%s%n%b', hedef).split('\n');
const zaman = new Date(Number(unix) * 1000);
const saat = zaman.toLocaleTimeString('tr-TR', { ...TR, hour: '2-digit', minute: '2-digit' });
const etiket = ROL ? `<@&${ROL}>` : '';
const baslikEmojili = /^\p{Extended_Pictographic}/u.test(konu) ? konu : `🍌 ${konu}`;
const alt = `-# \`${kisa}\` · ${zaman.toLocaleDateString('tr-TR', TR)} ${saat}`;

const aciklama = govdeMetni(govde);
let govdeKismi = aciklama;
// Tek commit bile sınırı aşmasın (etiket, başlık ve alt satır dahil).
const yer = SINIR - etiket.length - baslikEmojili.length - alt.length - 12;
if (govdeKismi.length > yer) govdeKismi = `${govdeKismi.slice(0, yer - 1)}…`;
const madde = [`## ${baslikEmojili}`, ...(govdeKismi ? ['', govdeKismi] : []), '', alt].join('\n');

const rest = new REST({ version: '10' }).setToken(token);
const ben = await rest.get(Routes.user('@me'));
const mesajlar = await rest.get(Routes.channelMessages(KANAL), { query: new URLSearchParams({ limit: '20' }) });
const acik = mesajlar.find((m) => m.author.id === ben.id && Date.now() - Date.parse(m.timestamp) < PENCERE_MS);

if (acik?.content.includes(`\`${kisa}\``)) {
  console.log(`${kisa} zaten yazılmış; geçildi.`);
  process.exit(0);
}

const birlesik = acik ? `${acik.content}\n\n${madde}` : null;
const govdeGonder = (content) => ({ body: { content, allowed_mentions: { roles: ROL ? [ROL] : [] } } });

if (birlesik && birlesik.length <= SINIR) {
  if (DENE) console.log(`DÜZENLENECEK ${acik.id}:\n${birlesik}`);
  else await rest.patch(Routes.channelMessage(KANAL, acik.id), govdeGonder(birlesik));
  console.log(`${kisa} → mevcut nota eklendi (${acik.id})`);
} else {
  const yeni = etiket ? `${etiket}\n${madde}` : madde;
  if (DENE) console.log(`YENİ:\n${yeni}`);
  else {
    const m = await rest.post(Routes.channelMessages(KANAL), govdeGonder(yeni));
    console.log(`${kisa} → yeni not (${m.id})`);
  }
}
