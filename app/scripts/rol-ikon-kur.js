// Sunucudaki rollere anlamlarına uygun ikon koyar (Boost seviye 2 gerekir).
// Öncelik sunucunun BTD emojisi (PNG olarak indirilip rol ikonu yapılır);
// uygun BTD emojisi yoksa tek bir unicode emoji kullanılır.
// `--dene` ile hiçbir şey yazmadan planı listeler.
// Yeniden çalıştırılabilir: ikonu olan rola dokunmaz, yani ikinci çalıştırma değişiklik yapmaz.
import { fileURLToPath } from 'node:url';

import { REST, Routes } from 'discord.js';

import { requireEnv } from '../lib/env.js';

const SEBEP = 'Rol ikonları kurulumu';
const BTD_ONEKI = 'btd_';

// Rol adı (baştaki emoji/süs ayıklanmış) → { btd } ya da { unicode }.
const AD_ESLEMESI = new Map([
  // Seviye rolleri (BTD kuleleri)
  ['Okçu Maymun', { btd: 'dart_monkey' }],
  ['Bumerang Maymunu', { btd: 'boomerang' }],
  ['Bomba Maymunu', { btd: 'bomb_shooter' }],
  ['Ninja Maymun', { btd: 'ninja' }],
  ['Büyücü Maymun', { btd: 'wizard' }],
  ['Medyum Maymun', { btd: 'druid' }],
  ['Simyacı Maymun', { btd: 'alchemist' }],
  // Rozet rolleri (balonlar)
  ['Kırmızı Balon', { btd: 'red' }],
  ['Mavi Balon', { btd: 'blue' }],
  ['Yeşil Balon', { btd: 'green' }],
  ['Sarı Balon', { btd: 'yellow' }],
  ['Pembe Balon', { btd: 'pink' }],
  ['Siyah Balon', { btd: 'black' }],
  ['Gökkuşağı Balon', { btd: 'rainbow' }],
  ['Seramik Balon', { btd: 'ceramic' }],
  ['Altın Balon', { btd: 'golden' }],
  ['M.O.A.B.', { btd: 'moab' }],
  ['B.F.B.', { btd: 'bfb' }],
  ['Z.O.M.G.', { btd: 'zomg' }],
  ['B.A.D.', { btd: 'bad' }],
  // Diğer
  ['Muz Çiftliği', { btd: 'banana_farm' }],
  ['Süper Maymun', { btd: 'super_monkey' }],
  ['İçerik Üretcisi', { unicode: '🎬' }],
  ['Para Babası', { unicode: '💰' }],
  ['Bot', { unicode: '🤖' }],
  ['⛤・DaXer', { unicode: '👑' }],
  ['⛤・Muho', { unicode: '🛠️' }],
  ['⛤・AlpGDK', { unicode: '🛠️' }],
]);

// Desen eşlemeleri: ada göre, sırayla ilk uyan kazanır.
const DESENLER = [
  [/^🌟 Prestij \d+$/, { unicode: '🌟' }],
  [/^YouTube Member/, { unicode: '▶️' }],
  [/^UYARI\b/i, { unicode: '⚠️' }],
  [/(moderatör|yetkili|mod\b)/i, { unicode: '🛡️' }],
  [/(yönetici|admin)/i, { unicode: '👑' }],
];

/**
 * Rol adı için ikon seçer.
 * @param {string} ad Rol adı
 * @param {Set<string>} [emojiAdlari] Sunucudaki emoji adları (btd_ eşlemesi yoksa unicode'a düşmek için)
 * @returns {{btd: string}|{unicode: string}|null} Eşleşme yoksa null
 */
export function ikonSec(ad, emojiAdlari) {
  const temiz = ad.replace(/^🎈\s*/, '').trim();
  const secim = AD_ESLEMESI.get(temiz) ?? AD_ESLEMESI.get(ad)
    ?? DESENLER.find(([desen]) => desen.test(ad))?.[1] ?? null;
  if (!secim) return null;
  // Sunucuda o BTD emojisi yoksa (silinmişse) sessizce atlanır, rastgele ikon konmaz.
  if (secim.btd && emojiAdlari && !emojiAdlari.has(BTD_ONEKI + secim.btd)) return null;
  return secim;
}

/**
 * Rolün neden atlandığını söyler; ayarlanabiliyorsa null.
 * @param {{id: string, managed: boolean, position: number, icon: string|null, unicode_emoji: string|null}} rol
 */
export function atlamaNedeni(rol, sunucuId, botEnUst) {
  if (rol.id === sunucuId) return '@everyone';
  if (rol.icon || rol.unicode_emoji) return 'zaten ikonu var';
  if (rol.managed) return 'yönetilen (bot/entegrasyon) rol';
  if (rol.position >= botEnUst) return 'botun en üst rolüne eşit/üstünde';
  return null;
}

async function calistir() {
  const DENE = process.argv.includes('--dene');
  const { token, guildID } = requireEnv('token', 'guildID');
  const rest = new REST().setToken(token);

  const [roller, emojiler, bot] = await Promise.all([
    rest.get(Routes.guildRoles(guildID)),
    rest.get(Routes.guildEmojis(guildID)),
    rest.get(Routes.user('@me')),
  ]);
  const botUye = await rest.get(Routes.guildMember(guildID, bot.id));
  const botEnUst = Math.max(...roller.filter((r) => botUye.roles.includes(r.id)).map((r) => r.position));
  const emojiHaritasi = new Map(emojiler.map((e) => [e.name, e]));
  const emojiAdlari = new Set(emojiHaritasi.keys());

  let degisecek = 0;
  let atlanan = 0;
  let eslesmeyen = 0;
  for (const rol of roller.sort((a, b) => b.position - a.position)) {
    const neden = atlamaNedeni(rol, guildID, botEnUst);
    if (neden) {
      // Zaten ikonlu rolleri gürültü olmasın diye de listeliyoruz: durum görünsün.
      console.log(`  atla  ${rol.name} — ${neden}`);
      atlanan += 1;
      continue;
    }
    const secim = ikonSec(rol.name, emojiAdlari);
    if (!secim) {
      console.log(`  ?     ${rol.name} — eşleşme yok, atlandı`);
      eslesmeyen += 1;
      continue;
    }
    const aciklama = secim.btd ? `${BTD_ONEKI}${secim.btd} (sunucu emojisi)` : `${secim.unicode} (unicode)`;
    console.log(`  ${DENE ? 'KOYULACAK' : 'KOY'}  ${rol.name} → ${aciklama}`);
    degisecek += 1;
    if (DENE) continue;

    try {
      let govde;
      if (secim.btd) {
        const emoji = emojiHaritasi.get(BTD_ONEKI + secim.btd);
        const yanit = await fetch(`https://cdn.discordapp.com/emojis/${emoji.id}.png?size=128`);
        if (!yanit.ok) throw new Error(`emoji indirilemedi (${yanit.status})`);
        const veri = Buffer.from(await yanit.arrayBuffer());
        if (veri.length > 256 * 1024) throw new Error('ikon 256KB üstünde');
        govde = { icon: `data:image/png;base64,${veri.toString('base64')}` };
      } else {
        govde = { unicode_emoji: secim.unicode };
      }
      await rest.patch(Routes.guildRole(guildID, rol.id), { body: govde, reason: SEBEP });
    } catch (e) {
      console.error(`  HATA ${rol.name}: ${e.message}`);
    }
  }
  console.log(`\n${DENE ? 'DENEME — hiçbir şey yazılmadı. ' : ''}İkon ${DENE ? 'konacak' : 'konan'}: ${degisecek}, atlanan: ${atlanan}, eşleşmeyen: ${eslesmeyen}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await calistir();
