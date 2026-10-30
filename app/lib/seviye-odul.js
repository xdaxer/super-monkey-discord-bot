import { PermissionFlagsBits } from 'discord.js';

import { ayarGetir, sistemAcikMi } from './ayarlar.js';
import { kanalYetkisiKontrol } from './izin.js';
import { ekle, muz, seviyeOdulu, TURLER } from './ekonomi.js';
import { etkiAktifMi } from './envanter.js';
import { etkinlikCarpani, seviyeKasasiEtkinlikli } from './etkinlik.js';
import { esyaGetir } from './esyalar.js';
import { kasaVer, seviyeKasasi } from './kasalar.js';
import { duyuruMetni } from './seviye.js';
import { kademeBul, kademeRolIdleri, uyeyiEsitle } from './seviye-rol.js';
import { bonusluXp, uyelikRoluMu } from './uyelik.js';

/**
 * Mesaj ve ses XP'si için aynı çarpanlar: üyelik bonusu, XP İksiri ve xp-2x
 * etkinliği. `xpVer`'e `bonus` olarak verilir.
 */
export function xpBonusu(db, guildId, member) {
  // YouTube üyesine bonus: üyelik sistemi kapalıysa herkes aynı XP'yi alır.
  const uye = sistemAcikMi(db, guildId, 'uyelik')
    && Boolean(member?.roles?.cache.some(uyelikRoluMu));
  const yuzde = uye ? ayarGetir(db, guildId, 'uyelik.xpBonusYuzde') : 0;

  // Mağazadan alınan XP İksiri: ekonomi açıkken süresi boyunca 2 kat.
  const ekonomi = sistemAcikMi(db, guildId, 'ekonomi');
  const iksir = ekonomi && etkiAktifMi(db, guildId, member?.id, 'xp-iksiri');

  // xp-2x etkinliği iksirle çarpılır (4x); ekonomi kapalıyken uygulanmaz.
  const xpEtkinligi = ekonomi ? etkinlikCarpani(db, guildId, 'xp-2x') : 1;

  return (xp) => bonusluXp(xp, yuzde) * (iksir ? 2 : 1) * xpEtkinligi;
}

/**
 * `xpVer` sonucunun ardından: kademe rolünü eşitler, seviye atlandıysa muz ve
 * kasa verir, duyuruyu gönderir. Mesaj da ses de buradan geçer.
 */
export async function xpSonrasi(db, { guild, member, kullaniciId, sonuc, client }) {
  const guildId = guild.id;

  // Rolü her XP'de eşitliyoruz, yalnız seviye atlayınca değil: kurulumdan önce
  // seviye almış ya da rolü elle alınmış üye bir sonraki XP'sinde düzelir.
  // Önbellekte fark yoksa Discord'a istek gitmez.
  const rolIdleri = kademeRolIdleri((anahtar) => ayarGetir(db, guildId, anahtar));
  const roller = member
    ? await uyeyiEsitle(member, sonuc.seviye, rolIdleri).catch(() => null)
    : null;

  if (!sonuc.atladi) return;

  // Ekonomi açıksa seviye atlayana muz ve kasa: duyuru kanalı olmasa da verilir.
  const ekonomi = sistemAcikMi(db, guildId, 'ekonomi');
  const odul = ekonomi ? seviyeOdulu(sonuc.seviye, ayarGetir(db, guildId, 'ekonomi.seviyeOdulu')) : 0;
  if (odul > 0) {
    ekle(db, { guildId, kullaniciId, miktar: odul, tur: TURLER.seviye });
  }
  // Birden çok seviye birden atlanırsa (iksir + bonus) her seviye için bir kasa.
  const kasalar = [];
  if (ekonomi) {
    for (let sv = sonuc.oncekiSeviye + 1; sv <= sonuc.seviye; sv += 1) {
      const kasa = seviyeKasasiEtkinlikli(db, guildId, seviyeKasasi(sv));
      kasaVer(db, { guildId, kullaniciId, kasa, tur: 'seviye' });
      kasalar.push(kasa);
    }
  }

  // Duyuru kanalı ayarlanmamışsa sessiz kalıyoruz: seviye atlamalarını
  // sohbetin ortasına düşürmek yerine kanalı yönetici seçsin (docs/ekonomi.md).
  const kanalId = ayarGetir(db, guildId, 'seviye.kanal');
  if (!kanalId) return;

  const kanal = await client.channels.fetch(kanalId).catch(() => null);
  if (!kanal?.isTextBased?.()) return;

  const botUye = guild.members.me;
  if (botUye && !kanalYetkisiKontrol(kanal, botUye, PermissionFlagsBits.SendMessages).ok) return;

  let content = duyuruMetni(ayarGetir(db, guildId, 'seviye.mesaj'), {
    kullaniciId,
    seviye: sonuc.seviye,
    sunucuAdi: guild.name,
  });

  const odulParcalari = [];
  if (odul > 0) odulParcalari.push(`+${muz(odul)}`);
  for (const kasa of kasalar) odulParcalari.push(`${esyaGetir(kasa).yedek} ${esyaGetir(kasa).ad}`);
  if (odulParcalari.length > 0) content += ` (${odulParcalari.join(', ')})`;

  // Yeni kademeye geçtiyse rolü de duyuruyoruz; rol etiketi bildirim atmaz
  // çünkü allowedMentions yalnız seviye atlayanı içeriyor.
  const kademe = kademeBul(sonuc.seviye);
  if (kademe && kademe !== kademeBul(sonuc.oncekiSeviye) && roller?.ekle.length) {
    content += `\n🏅 Yeni rol: <@&${roller.ekle[0]}>`;
  }

  await kanal.send({
    content,
    // Seviye atlayanı etiketliyoruz ama şablona yazılmış başka etiket geçmiyor.
    allowedMentions: { users: [kullaniciId] },
  }).catch(() => null);
}
