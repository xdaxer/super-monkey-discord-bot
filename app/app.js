import { Client, Collection, Events, Partials } from 'discord.js';

import { sistemAcikMi } from './lib/ayarlar.js';
import { basvuruBilesenleri } from './lib/basvuru-bilesen.js';
import { bildirimBilesenleri } from './lib/bildirim-rol.js';
import { acikElleriIadeEt } from './lib/blackjack.js';
import { acikDuellolariIadeEt } from './lib/duello.js';
import { duelloBilesenleri } from './lib/duello-bilesen.js';
import { acikXoxlariIadeEt } from './lib/xox.js';
import { acikMinesIadeEt } from './lib/mines.js';
import { minesBilesenleri } from './lib/mines-bilesen.js';
import { xoxBilesenleri } from './lib/xox-bilesen.js';
import { cekilisBilesenleri } from './lib/cekilis-bilesen.js';
import { ozelsesBilesenleri } from './lib/ozelses-bilesen.js';
import { loadCommands } from './lib/commands.js';
import { veritabani } from './lib/db.js';
import { EMOJI_ADI, emojiMetni, paraSimgesiAyarla } from './lib/ekonomi.js';
import { ekonomiBilesenleri } from './lib/ekonomi-bilesen.js';
import { uzakYaniti } from './lib/ekonomi-uzak-bilesen.js';
import { bossBilesenleri } from './lib/boss-bilesen.js';
import { kasaBilesenleri } from './lib/kasa-bilesen.js';
import { setBilesenleri } from './lib/set-bilesen.js';
import { prestijBilesenleri } from './lib/prestij-bilesen.js';
import { calisBilesenleri } from './lib/calis-bilesen.js';
import { loadEvents, olaylariBagla } from './lib/events.js';
import { optionalEnv, requireEnv } from './lib/env.js';
import { izinliGuild, yetkisizSunuculariTemizle } from './lib/guild-kilidi.js';
import { eksikIntentUyarisi, girisYap, intentAdlari } from './lib/intents.js';
import { createInteractionHandler } from './lib/interactions.js';
import { kanalSiniriMesaji } from './lib/kanal-siniri.js';
import { takasBilesenleri } from './lib/takas-bilesen.js';
import { talepBilesenleri } from './lib/talep-bilesen.js';
import { bankaDongusuBaslat } from './servisler/banka.js';
import { krediDongusuBaslat } from './servisler/kredi.js';
import { cekilisDongusuBaslat } from './servisler/cekilis.js';
import { bossDongusuBaslat } from './servisler/boss.js';
import { hisseDongusuBaslat } from './servisler/hisse.js';
import { piyangoDongusuBaslat } from './servisler/piyango.js';
import { supheliDongusuBaslat } from './servisler/supheli.js';
import { sesXpDongusuBaslat } from './servisler/ses-xp.js';
import { hatirlaticiDongusuBaslat } from './servisler/hatirlatici.js';
import { yedekDongusuBaslat } from './servisler/yedek.js';
import { youtubeDongusuBaslat } from './servisler/youtube.js';
import { oturumDeposu } from './web/oturum.js';
import { tumRotalar } from './web/rotalar/index.js';
import { webSunucusuBaslat } from './web/sunucu.js';

async function main() {
  // Ağ tutamağı açılmadan önce: burada process.exit güvenli.
  let token;
  try {
    // guildID sunucu kilidi icin de zorunlu; eksikse acilista dur.
    ({ token } = requireEnv('token', 'guildID'));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const db = veritabani();

  // Önceki çalışmadan yarım kalan blackjack ellerinin bahsi iade edilir;
  // eski mesajlardaki butonlar "el bitmiş" yanıtı alır.
  const iade = acikElleriIadeEt(db);
  if (iade > 0) console.log(`Blackjack: yarım kalan ${iade} elin bahsi iade edildi.`);
  // Kabul edilmemiş düelloların emaneti de iade edilir.
  const duelloIade = acikDuellolariIadeEt(db);
  if (duelloIade > 0) console.log(`Düello: bekleyen ${duelloIade} meydan okumanın bahsi iade edildi.`);
  // Yarım kalan XOX oyunlarında iki tarafa da bahsi iade edilir.
  const xoxIade = acikXoxlariIadeEt(db);
  if (xoxIade > 0) console.log(`XOX: yarım kalan ${xoxIade} oyunun bahisleri iade edildi.`);
  const minesIade = acikMinesIadeEt(db);
  if (minesIade > 0) console.log(`Mines: yarım kalan ${minesIade} oyunun bahsi iade edildi.`);

  let commands;
  let olaylar;
  try {
    commands = await loadCommands();
    olaylar = await loadEvents();
  } catch (error) {
    console.error('Komutlar veya olaylar yüklenemedi:', error.message);
    process.exit(1);
  }

  const handler = createInteractionHandler(commands, console, {
    sistemKontrol: (guildId, sistem) => sistemAcikMi(db, guildId, sistem),
    kanalKontrol: (interaction, komut) => kanalSiniriMesaji(db, interaction, komut),
    uzakKontrol: (interaction) => uzakYaniti(db, interaction),
    // Sıra önemli: her yönlendirici kendi customId önekini eşliyor, ilk eşleşen çalışır.
    // Ekonomi bileşenleri `ekonomi: true` ile işaretlenir: uzaklaştırılmış üye kullanamaz.
    bilesenler: [
      ...basvuruBilesenleri(), ...talepBilesenleri(), ...cekilisBilesenleri(), ...ozelsesBilesenleri(),
      ...[
        ...ekonomiBilesenleri(), ...kasaBilesenleri(), ...duelloBilesenleri(), ...xoxBilesenleri(), ...minesBilesenleri(),
        ...takasBilesenleri(), ...setBilesenleri(), ...bossBilesenleri(), ...prestijBilesenleri(), ...calisBilesenleri(),
      ].map((b) => ({ ...b, ekonomi: true })),
      ...bildirimBilesenleri(),
    ],
  });

  /** Verilen intent kümesiyle tam kurulmuş bir istemci üretir. */
  const olustur = (intentler) => {
    // Partial'sız, önbellekte olmayan bir mesaja gelen tepki olayı discord.js
    // tarafında sessizce düşürülür. Oylama kanalındaki mesajların çoğu bot
    // yeniden başladıktan sonra önbellekte olmaz; kendine oy engelinin eski
    // mesajlarda da çalışması buna bağlı.
    const client = new Client({
      intents: intentler,
      partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
    });
    const aktif = intentAdlari(intentler);

    client.commands = new Collection();
    for (const [ad, komut] of commands) client.commands.set(ad, komut);

    client.atlananOlaylar = olaylariBagla(client, olaylar, aktif, console);
    client.on(Events.InteractionCreate, handler);

    return client;
  };

  const { client, kapaliIntentler } = await girisYap({ olustur, token, logger: console });

  client.once(Events.ClientReady, async (hazir) => {
    console.log(`Giriş yapıldı: ${hazir.user.tag} (${hazir.user.id})`);
    console.log(`Bulunduğu sunucu sayısı: ${hazir.guilds.cache.size}`);

    // Para simgesi: `npm run muzemoji` ile yüklenen uygulama emojisi; yoksa 🍌.
    const emojiler = await hazir.application.emojis.fetch().catch(() => null);
    const simge = paraSimgesiAyarla(emojiMetni(emojiler?.find((e) => e.name === EMOJI_ADI)));
    console.log(`Para simgesi: ${simge}`);

    // Bot kapalıyken eklenmiş izinsiz sunucular guildCreate'i kaçırır; burada temizlenir.
    const ayrilinan = await yetkisizSunuculariTemizle(hazir, izinliGuild(), console);
    if (ayrilinan.length === 0) console.log('Sunucu kilidi: yalnız izinli sunucuda.');
  });

  const komutListesi = [...commands.keys()].map((ad) => `/${ad}`).join(', ');
  console.log(`${commands.size} komut yüklendi: ${komutListesi}`);
  console.log(`${olaylar.length} olay tanımı okundu.`);

  for (const atlanan of client.atlananOlaylar ?? []) {
    console.warn(
      `  atlandı: ${atlanan.yol} → ${atlanan.olay} (kapalı intent: ${atlanan.eksik.join(', ')})`,
    );
  }

  const uyari = eksikIntentUyarisi(kapaliIntentler);
  if (uyari) console.warn(uyari);

  const youtubeDurdur = youtubeDongusuBaslat(client, { db, logger: console });
  const cekilisDurdur = cekilisDongusuBaslat(client, { db, logger: console });
  const hatirlaticiDurdur = hatirlaticiDongusuBaslat(client, { db, logger: console });
  const bankaDurdur = bankaDongusuBaslat({ db, logger: console });
  const krediDurdur = krediDongusuBaslat({ db, logger: console });
  // Piyango da tek guild kapsamında (D-SUNUCU-KILIDI); çekilişler guild başına yapılır.
  const piyangoDurdur = piyangoDongusuBaslat(client, { db, guildId: izinliGuild(), logger: console });
  // Her gece 00:00 (TR): dünün şüpheli aktarımlarını tarayıp ekonomiden uzaklaştırır.
  const supheliDurdur = supheliDongusuBaslat(client, { db, guildId: izinliGuild(), logger: console });
  const bossDurdur = bossDongusuBaslat(client, { db, guildId: izinliGuild(), logger: console });
  const hisseDurdur = hisseDongusuBaslat(client, { db, guildId: izinliGuild(), logger: console });
  // Seste duranlara dakikada bir XP (docs/ekonomi.md → "Ses XP'si").
  const sesXpDurdur = sesXpDongusuBaslat(client, { db, guildId: izinliGuild(), logger: console });
  // Yedekleme ayarları tek guild kapsamında tutuluyor (D-SUNUCU-KILIDI).
  const yedekDurdur = yedekDongusuBaslat({ db, guildId: izinliGuild(), logger: console });
  // Discord Activity'nin API'si (activity/ ön yüzü; nginx /api/ → buraya). webPort boşsa kapalı.
  const webPort = Number(optionalEnv('webPort'));
  const webDurdur = webPort > 0
    ? webSunucusuBaslat({
      db,
      client,
      guildId: izinliGuild(),
      oturumlar: oturumDeposu(),
      rotalar: tumRotalar,
      clientId: optionalEnv('clientID'),
      clientSecret: optionalEnv('clientSecret'),
    }, { port: webPort, logger: console })
    : async () => {};

  const kapat = async () => {
    console.log('\nKapatılıyor...');
    youtubeDurdur();
    cekilisDurdur();
    hatirlaticiDurdur();
    bankaDurdur();
    krediDurdur();
    piyangoDurdur();
    supheliDurdur();
    bossDurdur();
    hisseDurdur();
    sesXpDurdur();
    yedekDurdur();
    await webDurdur();
    await client.destroy().catch(() => {});
    process.exit(0);
  };
  process.once('SIGINT', kapat);
  process.once('SIGTERM', kapat);
}

try {
  await main();
} catch (error) {
  // error.message token içermez (discord.js "An invalid token was provided." der).
  console.error('Başlatma başarısız:', error.message);
  process.exitCode = 1;
}
