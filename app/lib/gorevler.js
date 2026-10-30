/**
 * Günlük ve haftalık görevler.
 *
 * Havuz ve ödüller docs/para.md "Görevler" bölümüyle birebir aynıdır; biri
 * değişirse diğeri de değişmeli. Görevler tabloda değil bu dosyadaki havuzda
 * tanımlıdır: her üyenin o günkü/haftaki görevleri (sunucu + kullanıcı + dönem)
 * tohumundan belirlenimli seçilir, yani yeniden başlatmada ya da başka bir
 * zamanda sorulduğunda hep aynı çıkar. Veritabanında yalnız ilerleme satırı
 * tutulur ve o da üyenin dönemdeki ilk ilerlemesinde/görünümünde oluşur;
 * üyenin eski dönem satırları yeni dönemde silinir, tablo şişmez.
 */

import { sistemAcikMi } from './ayarlar.js';
import {
  ekle, islem, TURLER, trGunBaslangici, trGunu,
} from './ekonomi.js';
import { esyaGetir } from './esyalar.js';
import { kasaVer } from './kasalar.js';
import { borcaKes } from './kredi.js';
import { carpanUygula, prestijCarpani } from './prestij-carpan.js';
import { uyelikCarpani } from './uyelik-carpan.js';
import { yoneticiCarpani } from './yonetici-carpan.js';

const GUN_MS = 86_400_000;
const TR_OFFSET_MS = 3 * 3_600_000;

/** Bonus satırının sırası (görev sıraları 0, 1, 2 ...). */
const BONUS_SIRASI = 9;

/**
 * İlerleme türleri ve kancaların nereden çağırdığı:
 *  mesaj      sohbet muzu verildiğinde (dakikada en çok bir; events/ekonomi.js)
 *  gunluk     /gunluk alındı
 *  kasa-ac    bir kasa açıldı (tek tek, çoklu ve buton)
 *  kumar      bir bahis oynandı (blackjack dahil)
 *  kumar-kazan kârla biten bahis
 *  gonder     muz gönderildi (miktar = gönderilen tutar)
 *  kart-sat   kart satıldı (miktar = adet)
 *  magaza     mağazadan alım
 *  kart-yeni  koleksiyona yeni kart girdi
 */
export const GOREV_TURLERI = Object.freeze([
  'mesaj', 'gunluk', 'kasa-ac', 'kumar', 'kumar-kazan', 'gonder', 'kart-sat', 'magaza', 'kart-yeni',
]);

const MUZ = (miktar) => ({ muz: miktar });
const KASA = (kasa) => ({ kasa });

/** Günlük havuz; her gün bir kolay, bir orta, bir zor görev düşer. */
export const GUNLUK_HAVUZ = Object.freeze({
  kolay: [
    { kimlik: 'g-mesaj-10', tur: 'mesaj', hedef: 10, ad: '10 sohbet ödülü topla', odul: MUZ(120) },
    { kimlik: 'g-gunluk', tur: 'gunluk', hedef: 1, ad: 'Günlük ödülünü al', odul: MUZ(120) },
    { kimlik: 'g-kumar-3', tur: 'kumar', hedef: 3, ad: '3 kez kumar oyna', odul: MUZ(120) },
    { kimlik: 'g-gonder-100', tur: 'gonder', hedef: 100, ad: 'Birilerine toplam 100 muz gönder', odul: MUZ(120) },
  ],
  orta: [
    { kimlik: 'g-mesaj-25', tur: 'mesaj', hedef: 25, ad: '25 sohbet ödülü topla', odul: MUZ(220) },
    { kimlik: 'g-kasa-2', tur: 'kasa-ac', hedef: 2, ad: '2 kasa aç', odul: MUZ(220) },
    { kimlik: 'g-kart-sat-3', tur: 'kart-sat', hedef: 3, ad: '3 kart sat', odul: MUZ(220) },
    { kimlik: 'g-magaza-1', tur: 'magaza', hedef: 1, ad: 'Mağazadan bir şey al', odul: MUZ(220) },
  ],
  zor: [
    { kimlik: 'g-kumar-kazan-3', tur: 'kumar-kazan', hedef: 3, ad: 'Kumarda 3 kez kârla ayrıl', odul: KASA('kasa-ahsap') },
    { kimlik: 'g-kasa-5', tur: 'kasa-ac', hedef: 5, ad: '5 kasa aç', odul: MUZ(350) },
    { kimlik: 'g-kumar-15', tur: 'kumar', hedef: 15, ad: '15 kez kumar oyna', odul: MUZ(350) },
    { kimlik: 'g-kart-yeni-2', tur: 'kart-yeni', hedef: 2, ad: 'Koleksiyonuna 2 yeni kart ekle', odul: KASA('kasa-ahsap') },
  ],
});

/** Haftalık havuz; her hafta bir orta, bir zor görev düşer. */
export const HAFTALIK_HAVUZ = Object.freeze({
  orta: [
    { kimlik: 'h-mesaj-150', tur: 'mesaj', hedef: 150, ad: '150 sohbet ödülü topla', odul: MUZ(2_000) },
    { kimlik: 'h-kumar-40', tur: 'kumar', hedef: 40, ad: '40 kez kumar oyna', odul: MUZ(2_000) },
    { kimlik: 'h-kasa-10', tur: 'kasa-ac', hedef: 10, ad: '10 kasa aç', odul: KASA('kasa-demir') },
  ],
  zor: [
    { kimlik: 'h-gunluk-7', tur: 'gunluk', hedef: 7, ad: 'Haftanın her günü günlük ödülü al', odul: MUZ(4_500) },
    { kimlik: 'h-kumar-kazan-15', tur: 'kumar-kazan', hedef: 15, ad: 'Kumarda 15 kez kârla ayrıl', odul: MUZ(4_000) },
    { kimlik: 'h-kart-yeni-6', tur: 'kart-yeni', hedef: 6, ad: 'Koleksiyonuna 6 yeni kart ekle', odul: KASA('kasa-altin') },
    { kimlik: 'h-gonder-5000', tur: 'gonder', hedef: 5_000, ad: 'Birilerine toplam 5.000 muz gönder', odul: MUZ(3_000) },
  ],
});

/** Bütün günlük görevleri bitirene ek ödül. */
export const GUNLUK_BONUS = Object.freeze(KASA('kasa-ahsap'));

const TUM_GOREVLER = new Map(
  [...Object.values(GUNLUK_HAVUZ), ...Object.values(HAFTALIK_HAVUZ)].flat().map((g) => [g.kimlik, g]),
);

export function gorevGetir(kimlik) {
  return TUM_GOREVLER.get(kimlik) ?? null;
}

// ── Dönemler ───────────────────────────────────────────────────────────────

/** Bu haftanın Pazartesi 00:00 (Türkiye) anı, UTC ms. */
export function haftaBaslangici(simdi = Date.now()) {
  const gun = trGunBaslangici(simdi);
  // getUTCDay: 0 = Pazar; Pazartesi'den geçen gün sayısı = (gün + 6) % 7.
  const gecen = (new Date(gun + TR_OFFSET_MS).getUTCDay() + 6) % 7;
  return gun - gecen * GUN_MS;
}

/** Bir sonraki Pazartesi 00:00 (Türkiye), UTC ms. */
export function sonrakiHaftaBaslangici(simdi = Date.now()) {
  return haftaBaslangici(simdi) + 7 * GUN_MS;
}

/** Günlük dönem anahtarı: "g:2026-10-09". */
export function gunDonemi(simdi = Date.now()) {
  return `g:${trGunu(simdi)}`;
}

/** Haftalık dönem anahtarı: "h:" + haftanın Pazartesi'si. */
export function haftaDonemi(simdi = Date.now()) {
  return `h:${trGunu(haftaBaslangici(simdi))}`;
}

// ── Belirlenimli seçim ─────────────────────────────────────────────────────

/** FNV-1a 32 bit: küçük, bağımlılıksız, her çalıştırmada aynı sonuç. */
function ozet(metin) {
  let h = 0x811c9dc5;
  for (let i = 0; i < metin.length; i += 1) {
    h ^= metin.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Son karıştırma: yalnız sonu değişen girdiler (kullanıcı kimliği) küçük modda da dağılsın.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/**
 * Havuzlardan (kademe sırasıyla) birer görev seçer. Aynı türden iki görev
 * düşmesin diye çakışan türde havuzda bir sonrakine geçilir.
 *
 * @param {object} havuz kademe → görev listesi
 * @param {string[]} kademeler seçim sırası
 * @returns {object[]} seçilen görev tanımları
 */
export function gorevSec(havuz, kademeler, guildId, kullaniciId, donem) {
  const secilen = [];
  kademeler.forEach((kademe, sira) => {
    const liste = havuz[kademe];
    const bas = ozet(`${guildId}:${kullaniciId}:${donem}:${sira}`) % liste.length;
    for (let k = 0; k < liste.length; k += 1) {
      const aday = liste[(bas + k) % liste.length];
      if (!secilen.some((g) => g.tur === aday.tur) || k === liste.length - 1) {
        secilen.push(aday);
        return;
      }
    }
  });
  return secilen;
}

const GUNLUK_KADEMELER = ['kolay', 'orta', 'zor'];
const HAFTALIK_KADEMELER = ['orta', 'zor'];

/** Üyenin o günkü üç görevi. */
export function gunlukGorevler(guildId, kullaniciId, simdi = Date.now()) {
  return gorevSec(GUNLUK_HAVUZ, GUNLUK_KADEMELER, guildId, kullaniciId, gunDonemi(simdi));
}

/** Üyenin o haftaki iki görevi. */
export function haftalikGorevler(guildId, kullaniciId, simdi = Date.now()) {
  return gorevSec(HAFTALIK_HAVUZ, HAFTALIK_KADEMELER, guildId, kullaniciId, haftaDonemi(simdi));
}

// ── Ödül metni ─────────────────────────────────────────────────────────────

/** Ödülün kısa yazısı: "220 🍌" ya da "📦 Ahşap Kasa". Başlıkta kullanılmaz (özel emoji). */
export function odulMetni(odul, muzBicimi) {
  if (odul.muz) return muzBicimi(odul.muz);
  const esya = esyaGetir(odul.kasa);
  return `${esya.yedek} ${esya.ad}`;
}

/** İlerleme çubuğu: `▰▰▰▱▱ 3/5`. Uzun hedeflerde 5 parçaya ölçeklenir. */
export function ilerlemeCubugu(ilerleme, hedef, parca = 5) {
  const dolu = Math.min(parca, Math.floor((Math.min(ilerleme, hedef) / hedef) * parca));
  return `${'▰'.repeat(dolu)}${'▱'.repeat(parca - dolu)} ${Math.min(ilerleme, hedef).toLocaleString('tr-TR')}/${hedef.toLocaleString('tr-TR')}`;
}

// ── Veritabanı ─────────────────────────────────────────────────────────────

/**
 * Dönem satırlarını yoksa oluşturur; üyenin aynı türdeki eski dönem satırlarını siler.
 * Görevler seçimden geldiği için satırlar her zaman havuzla uyumludur.
 */
function satirlariHazirla(db, guildId, kullaniciId, donem, gorevler) {
  const g = String(guildId);
  const k = String(kullaniciId);
  db.prepare('DELETE FROM gorev_ilerleme WHERE guild_id = ? AND kullanici_id = ? AND donem LIKE ? AND donem <> ?')
    .run(g, k, `${donem.slice(0, 2)}%`, donem);
  const ekleSorgu = db.prepare(
    'INSERT OR IGNORE INTO gorev_ilerleme (guild_id, kullanici_id, donem, sira, gorev) VALUES (?, ?, ?, ?, ?)',
  );
  gorevler.forEach((gorev, sira) => ekleSorgu.run(g, k, donem, sira, gorev.kimlik));
}

function satirlar(db, guildId, kullaniciId, donem) {
  return db.prepare(
    'SELECT sira, gorev, ilerleme, bitti FROM gorev_ilerleme WHERE guild_id = ? AND kullanici_id = ? AND donem = ? ORDER BY sira',
  ).all(String(guildId), String(kullaniciId), donem);
}

function odulVer(db, { guildId, kullaniciId, odul, simdi }) {
  if (odul.muz) {
    const miktar = carpanUygula(odul.muz, prestijCarpani(db, guildId, kullaniciId) * uyelikCarpani(db, guildId, kullaniciId)
      * yoneticiCarpani(kullaniciId));
    ekle(db, { guildId, kullaniciId, miktar, tur: TURLER.gorev, simdi });
    borcaKes(db, guildId, kullaniciId, miktar, simdi); // borçluysa gelirin payı borca gider
  } else {
    kasaVer(db, { guildId, kullaniciId, kasa: odul.kasa, tur: TURLER.gorev, simdi });
  }
}

/**
 * Üyenin dönemdeki görevleri ve ilerlemesi (satırlar yoksa oluşturur).
 * @returns {{donem: string, bitis: number, gorevler: Array<{sira: number, tanim: object, ilerleme: number, bitti: number}>, bonus: number|null}}
 *   `bonus`: bonus alındıysa alınma zamanı, günlükte alınmadıysa 0, haftalıkta null
 */
export function gorevleriGetir(db, { guildId, kullaniciId, simdi = Date.now() }) {
  const sonuc = {};
  for (const [ad, donem, secim, bitis] of [
    ['gunluk', gunDonemi(simdi), gunlukGorevler(guildId, kullaniciId, simdi), trGunBaslangici(simdi) + GUN_MS],
    ['haftalik', haftaDonemi(simdi), haftalikGorevler(guildId, kullaniciId, simdi), sonrakiHaftaBaslangici(simdi)],
  ]) {
    satirlariHazirla(db, guildId, kullaniciId, donem, secim);
    const kayit = satirlar(db, guildId, kullaniciId, donem);
    sonuc[ad] = {
      donem,
      bitis,
      gorevler: secim.map((tanim, sira) => {
        const satir = kayit.find((s) => s.sira === sira);
        return { sira, tanim, ilerleme: satir?.ilerleme ?? 0, bitti: satir?.bitti ?? 0 };
      }),
      bonus: ad === 'gunluk' ? (kayit.find((s) => s.sira === BONUS_SIRASI)?.bitti ?? 0) : null,
    };
  }
  return sonuc;
}

/**
 * Tek giriş noktası: bir olayı üyenin açık görevlerine yazar. Biten görevin
 * ödülü aynı işlemde kendiliğinden verilir (bir görev bir kez biter, ödülü bir
 * kez verilir); bütün günlük görevler bitince bonus da verilir.
 *
 * Ekonomi sistemi kapalıyken hiçbir şey yapmaz. Hata atmaz: kancanın bulunduğu
 * asıl işlem (mesaj ödülü, bahis, kasa...) görev yüzünden asla bozulmasın.
 *
 * @returns {Array<{donem: 'gunluk'|'haftalik'|'bonus', ad: string, odul: object}>} bu çağrıda biten görevler
 */
export function gorevIlerlet(db, {
  guildId, kullaniciId, tur, miktar = 1, simdi = Date.now(),
}) {
  try {
    if (!GOREV_TURLERI.includes(tur)) return [];
    if (!Number.isSafeInteger(miktar) || miktar < 1) return [];
    if (!sistemAcikMi(db, guildId, 'ekonomi')) return [];

    return islem(db, () => {
      const biten = [];
      const bitenGunluk = [];
      const durum = gorevleriGetir(db, { guildId, kullaniciId, simdi });

      for (const donemAdi of ['gunluk', 'haftalik']) {
        const donem = durum[donemAdi];
        for (const g of donem.gorevler) {
          if (g.tanim.tur !== tur || g.bitti > 0) continue;

          const yeni = Math.min(g.tanim.hedef, g.ilerleme + miktar);
          const tamam = yeni >= g.tanim.hedef;
          // bitti = 0 koşulu: aynı görevin ödülü yarışta bile bir kez verilir.
          const { changes } = db.prepare(
            `UPDATE gorev_ilerleme SET ilerleme = ?, bitti = ?
             WHERE guild_id = ? AND kullanici_id = ? AND donem = ? AND sira = ? AND bitti = 0`,
          ).run(yeni, tamam ? simdi : 0, String(guildId), String(kullaniciId), donem.donem, g.sira);
          if (changes === 0 || !tamam) continue;

          odulVer(db, { guildId, kullaniciId, odul: g.tanim.odul, simdi });
          biten.push({ donem: donemAdi, ad: g.tanim.ad, odul: g.tanim.odul });
          if (donemAdi === 'gunluk') bitenGunluk.push(g.sira);
        }
      }

      // Bonus: bu çağrıda bir günlük görev bittiyse ve hepsi tamamsa, bir kez.
      if (bitenGunluk.length > 0) {
        const tumu = durum.gunluk.gorevler.every((g) => g.bitti > 0 || bitenGunluk.includes(g.sira));
        if (tumu && durum.gunluk.bonus === 0) {
          const { changes } = db.prepare(
            `INSERT OR IGNORE INTO gorev_ilerleme (guild_id, kullanici_id, donem, sira, gorev, ilerleme, bitti)
             VALUES (?, ?, ?, ?, 'bonus', 1, ?)`,
          ).run(String(guildId), String(kullaniciId), durum.gunluk.donem, BONUS_SIRASI, simdi);
          if (changes > 0) {
            odulVer(db, { guildId, kullaniciId, odul: GUNLUK_BONUS, simdi });
            biten.push({ donem: 'bonus', ad: 'Bütün günlük görevler', odul: GUNLUK_BONUS });
          }
        }
      }

      return biten;
    });
  } catch {
    return [];
  }
}
