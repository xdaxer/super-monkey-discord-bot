import { Client, GatewayIntentBits } from 'discord.js';

/** Ayrıcalıklı olmayan, her zaman kullanılabilen intent'ler. */
export const TEMEL_INTENTLER = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildModeration,
  // Kendine oy engeli tepki olaylarını dinlemeyi gerektiriyor.
  // Ayrıcalıklı değil: Developer Portal'da ek bir anahtar istemez.
  GatewayIntentBits.GuildMessageReactions,
  // Özel ses odası kimin hangi ses kanalına girdiğini bu intent'le görür.
  GatewayIntentBits.GuildVoiceStates,
  // Bota gelen DM'ler yetkili kanalına aktarılır (lib/dm-log.js). Ayrıcalıklı
  // değil; DM içeriği MessageContent intent'i olmadan da gelir.
  GatewayIntentBits.DirectMessages,
  // Davet takibi davet oluşturma/silme olaylarını bu intent'le görür (lib/davet.js).
  GatewayIntentBits.GuildInvites,
];

/**
 * Developer Portal'da ayrıca açılması gereken intent'ler.
 * Kapalıyken login tamamen reddedilir, o yüzden ayrı ele alınıyorlar.
 */
export const AYRICALIKLI_INTENTLER = [
  {
    ad: 'GuildMembers',
    bit: GatewayIntentBits.GuildMembers,
    ozellikler: ['Karşılama ve uğurlama', 'Üye giriş/çıkış logu'],
  },
  {
    ad: 'MessageContent',
    bit: GatewayIntentBits.MessageContent,
    ozellikler: ['Silinen/düzenlenen mesaj içeriğinin loglanması'],
  },
];

const REDDEDILDI = /disallowed intents/i;

/** Sayısal intent listesini okunur adlara çevirir. */
export function intentAdlari(intentler) {
  return Object.entries(GatewayIntentBits)
    .filter(([, bit]) => typeof bit === 'number' && intentler.includes(bit))
    .map(([ad]) => ad);
}

/** Yalnız intent'in açık olup olmadığını ölçer; olay işleyicisi kurmaz. */
async function intentAcikMi(bit, token) {
  const deneme = new Client({ intents: [GatewayIntentBits.Guilds, bit] });
  try {
    await deneme.login(token);
    return { acik: true };
  } catch (error) {
    if (REDDEDILDI.test(error.message)) return { acik: false };
    return { acik: false, hata: error };
  } finally {
    await deneme.destroy().catch(() => {});
  }
}

/**
 * Önce bütün intent'lerle girer. Reddedilirse hangi ayrıcalıklı intent'in açık
 * olduğunu tek tek ölçer ve yalnız izin verilenlerle tekrar girer
 * (karar D-INTENT-DEGRADE: eksikle çalış, ama neyin eksik olduğunu söyle).
 *
 * `olustur` yalnız gerçek istemci için çağrılır; ölçüm istemcileri burada
 * yaratılıp yok edilir, böylece olay işleyicileri iki kez kurulmaz.
 */
export async function girisYap({ olustur, token, logger = console }) {
  const hepsi = [...TEMEL_INTENTLER, ...AYRICALIKLI_INTENTLER.map((i) => i.bit)];

  const ilk = olustur(hepsi);
  try {
    await ilk.login(token);
    return { client: ilk, kapaliIntentler: [], aktifIntentler: intentAdlari(hepsi) };
  } catch (error) {
    await ilk.destroy().catch(() => {});
    if (!REDDEDILDI.test(error.message)) throw error;
  }

  logger.warn('Ayrıcalıklı intent reddedildi; hangilerinin açık olduğu ölçülüyor...');

  const acik = [];
  const kapali = [];
  for (const intent of AYRICALIKLI_INTENTLER) {
    const sonuc = await intentAcikMi(intent.bit, token);
    if (sonuc.hata) throw sonuc.hata;
    (sonuc.acik ? acik : kapali).push(intent);
  }

  const izinli = [...TEMEL_INTENTLER, ...acik.map((i) => i.bit)];
  const client = olustur(izinli);
  await client.login(token);

  return {
    client,
    kapaliIntentler: kapali.map((i) => i.ad),
    aktifIntentler: intentAdlari(izinli),
  };
}

/** Kapalı intent'ler için kullanıcıya ne yapacağını söyleyen uyarı metni. */
export function eksikIntentUyarisi(kapaliAdlar) {
  if (kapaliAdlar.length === 0) return null;

  const satirlar = [
    '',
    '='.repeat(68),
    "UYARI: Şu ayrıcalıklı intent'ler KAPALI, bağlı özellikler devre dışı:",
  ];

  for (const ad of kapaliAdlar) {
    const tanim = AYRICALIKLI_INTENTLER.find((i) => i.ad === ad);
    satirlar.push(`  - ${ad}: ${tanim.ozellikler.join(', ')}`);
  }

  satirlar.push(
    '',
    'Açmak için: discord.com/developers/applications > uygulamanız > Bot >',
    'Privileged Gateway Intents altından ilgili anahtarları açıp botu yeniden',
    'başlatın. Ek kod gerekmez, kendiliğinden devreye girerler.',
    '='.repeat(68),
    '',
  );

  return satirlar.join('\n');
}
