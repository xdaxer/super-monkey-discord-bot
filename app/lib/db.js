import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const VARSAYILAN_YOL = path.join(appDir, 'veri', 'bot.sqlite');

const SEMA = `
CREATE TABLE IF NOT EXISTS ayarlar (
  guild_id   TEXT    NOT NULL,
  anahtar    TEXT    NOT NULL,
  deger      TEXT    NOT NULL,
  guncelleme INTEGER NOT NULL,
  PRIMARY KEY (guild_id, anahtar)
);

CREATE TABLE IF NOT EXISTS uyarilar (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  moderator_id TEXT    NOT NULL,
  sebep        TEXT    NOT NULL,
  zaman        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_uyari_kullanici ON uyarilar (guild_id, kullanici_id);

CREATE TABLE IF NOT EXISTS basvurular (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id       TEXT    NOT NULL,
  kullanici_id   TEXT    NOT NULL,
  form           TEXT    NOT NULL,
  cevaplar       TEXT    NOT NULL,
  durum          TEXT    NOT NULL,
  karar_veren_id TEXT,
  mesaj_id       TEXT,
  zaman          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_basvuru_durum ON basvurular (guild_id, kullanici_id, durum);

CREATE TABLE IF NOT EXISTS youtube_abonelikleri (
  guild_id       TEXT    NOT NULL,
  kanal_id       TEXT    NOT NULL,
  hedef_kanal_id TEXT    NOT NULL,
  son_video_id   TEXT,
  eklenme        INTEGER NOT NULL,
  herkesi_etiketle INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, kanal_id)
);

CREATE TABLE IF NOT EXISTS talepler (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  kanal_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  konu         TEXT    NOT NULL,
  durum        TEXT    NOT NULL,
  acilis       INTEGER NOT NULL,
  kapanis      INTEGER,
  kapatan_id   TEXT
);
-- Mukerrer talep engeli bu indeksi kullanir: "bu kullanicinin acik talebi var mi".
CREATE INDEX IF NOT EXISTS ix_talep_sahip ON talepler (guild_id, kullanici_id, durum);
CREATE UNIQUE INDEX IF NOT EXISTS ix_talep_kanal ON talepler (kanal_id);

CREATE TABLE IF NOT EXISTS cekilisler (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id       TEXT    NOT NULL,
  kanal_id       TEXT    NOT NULL,
  mesaj_id       TEXT,
  odul           TEXT    NOT NULL,
  kazanan_sayisi INTEGER NOT NULL,
  bitis          INTEGER NOT NULL,
  durum          TEXT    NOT NULL,
  olusturan_id   TEXT    NOT NULL,
  kazananlar     TEXT
);
-- Acilista "suresi gecmis acik cekilisler" taramasi icin.
CREATE INDEX IF NOT EXISTS ix_cekilis_durum ON cekilisler (durum, bitis);

CREATE TABLE IF NOT EXISTS cekilis_katilimlari (
  cekilis_id   INTEGER NOT NULL REFERENCES cekilisler (id) ON DELETE CASCADE,
  kullanici_id TEXT    NOT NULL,
  zaman        INTEGER NOT NULL,
  PRIMARY KEY (cekilis_id, kullanici_id)
);

CREATE TABLE IF NOT EXISTS seviyeler (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  xp           INTEGER NOT NULL DEFAULT 0,
  seviye       INTEGER NOT NULL DEFAULT 0,
  mesaj_sayisi INTEGER NOT NULL DEFAULT 0,
  son_kazanma  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, kullanici_id)
);
-- /seviye siralama: sunucu icinde XP'ye gore azalan sira.
CREATE INDEX IF NOT EXISTS ix_seviye_siralama ON seviyeler (guild_id, xp DESC);

-- Ses XP'si gunluk tavani: kisi basi tek satir; gun (TR gun baslangici, ms)
-- degisince xp sifirdan sayilir.
CREATE TABLE IF NOT EXISTS ses_xp_gunluk (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  gun          INTEGER NOT NULL,
  xp           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, kullanici_id)
);

-- Ozel ses odalari: yalniz burada kayitli kanallar bot tarafindan silinir.
CREATE TABLE IF NOT EXISTS ozel_ses_odalari (
  kanal_id  TEXT    PRIMARY KEY,
  guild_id  TEXT    NOT NULL,
  sahip_id  TEXT    NOT NULL,
  olusturma INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ozelses_sahip ON ozel_ses_odalari (guild_id, sahip_id);

CREATE TABLE IF NOT EXISTS hatirlaticilar (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  kanal_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  mesaj        TEXT    NOT NULL,
  etiket_id    TEXT,
  etiket_tur   TEXT,
  zaman        INTEGER NOT NULL,
  durum        TEXT    NOT NULL,
  olusturma    INTEGER NOT NULL,
  mesaj_id     TEXT
);
-- Servis turu "zamani gelmis bekleyenler"i, /hatirlat liste kisinin bekleyenlerini sorar.
CREATE INDEX IF NOT EXISTS ix_hatirlatici_zaman ON hatirlaticilar (durum, zaman);
CREATE INDEX IF NOT EXISTS ix_hatirlatici_kisi ON hatirlaticilar (guild_id, kullanici_id, durum);

-- Para (muz) ekonomisi. Bakiye yalniz lib/ekonomi.js uzerinden degisir; her
-- degisim ekonomi_hareketleri defterine de yazilir.
CREATE TABLE IF NOT EXISTS bakiyeler (
  guild_id        TEXT    NOT NULL,
  kullanici_id    TEXT    NOT NULL,
  bakiye          INTEGER NOT NULL DEFAULT 0 CHECK (bakiye >= 0),
  gunluk_seri     INTEGER NOT NULL DEFAULT 0,
  son_gunluk      TEXT,
  son_mesaj_odulu INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, kullanici_id)
);
CREATE INDEX IF NOT EXISTS ix_bakiye_siralama ON bakiyeler (guild_id, bakiye DESC);

CREATE TABLE IF NOT EXISTS ekonomi_hareketleri (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  tur          TEXT    NOT NULL,
  miktar       INTEGER NOT NULL,
  bakiye_sonra INTEGER NOT NULL,
  karsi_id     TEXT,
  zaman        INTEGER NOT NULL,
  -- Kumar ve duello satirlarinda oyun (slot, yazitura, zar, rulet, at, mines, blackjack, xox); digerlerinde NULL.
  oyun         TEXT
);
-- Gunluk transfer limiti "bugun gonderilen toplam"i bu indeksle sorar.
CREATE INDEX IF NOT EXISTS ix_hareket_kisi ON ekonomi_hareketleri (guild_id, kullanici_id, tur, zaman);
-- Haftalik kumar siralamasi sunucu genelinde "bu haftanin bahis/kazanc" satirlarini tarar.
CREATE INDEX IF NOT EXISTS ix_hareket_tur_zaman ON ekonomi_hareketleri (guild_id, tur, zaman);

-- Gunluk ve haftalik gorev ilerlemesi. Gorevler tabloda degil lib/gorevler.js
-- havuzunda tanimlidir; satir, kullanicinin o donemdeki ilk ilerlemesinde/
-- gorunumunde olusur. donem: 'g:YYYY-MM-DD' (gun) ya da 'h:YYYY-MM-DD'
-- (haftanin Pazartesi'si). sira 9 = tum gunluk gorevler bonusu.
CREATE TABLE IF NOT EXISTS gorev_ilerleme (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  donem        TEXT    NOT NULL,
  sira         INTEGER NOT NULL,
  gorev        TEXT    NOT NULL,
  ilerleme     INTEGER NOT NULL DEFAULT 0,
  bitti        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, kullanici_id, donem, sira)
);

-- Suren blackjack elleri; bahis baslangicta dusulur. Acilista kalan eller iade edilir.
CREATE TABLE IF NOT EXISTS blackjack_oyunlari (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  bahis        INTEGER NOT NULL,
  deste        TEXT    NOT NULL,
  oyuncu       TEXT    NOT NULL,
  kurpiyer     TEXT    NOT NULL,
  mesaj_id     TEXT,
  baslangic    INTEGER NOT NULL,
  PRIMARY KEY (guild_id, kullanici_id)
);

-- Bekleyen düellolar; meydan okuyanın bahsi emanette (düşülmüş). Çözülünce satır silinir,
-- açılışta kalanlar iade edilir.
CREATE TABLE IF NOT EXISTS duello_meydanlari (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT    NOT NULL,
  kanal_id   TEXT    NOT NULL,
  mesaj_id   TEXT,
  meydan_id  TEXT    NOT NULL,
  rakip_id   TEXT    NOT NULL,
  bahis      INTEGER NOT NULL CHECK (bahis > 0),
  oyun       TEXT    NOT NULL,
  secim      TEXT,
  olusturma  INTEGER NOT NULL,
  bitis      INTEGER NOT NULL,
  UNIQUE (guild_id, meydan_id)
);

-- Süren mines oyunları; bahis başta düşülür, mayın yerleri başta belirlenir.
-- Açılışta kalanlar iade edilir.
CREATE TABLE IF NOT EXISTS mines_oyunlari (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  bahis        INTEGER NOT NULL CHECK (bahis > 0),
  mayin_sayisi INTEGER NOT NULL,
  mayinlar     TEXT    NOT NULL,
  acilan       TEXT    NOT NULL,
  baslangic    INTEGER NOT NULL,
  UNIQUE (guild_id, kullanici_id)
);

-- Süren XOX düelloları; iki tarafın bahsi düşülmüş. Bitince satır silinir,
-- açılışta kalanlar iki tarafa iade edilir.
CREATE TABLE IF NOT EXISTS xox_oyunlari (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT    NOT NULL,
  kanal_id   TEXT    NOT NULL,
  x_id       TEXT    NOT NULL,
  o_id       TEXT    NOT NULL,
  bahis      INTEGER NOT NULL CHECK (bahis > 0),
  tahta      TEXT    NOT NULL,
  sira       TEXT    NOT NULL CHECK (sira IN ('X', 'O')),
  son_hamle  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS magaza_urunleri (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT    NOT NULL,
  rol_id     TEXT    NOT NULL,
  fiyat      INTEGER NOT NULL CHECK (fiyat > 0),
  ekleyen_id TEXT    NOT NULL,
  eklenme    INTEGER NOT NULL,
  UNIQUE (guild_id, rol_id)
);

-- Magazadan alinan esyalar: rozetler (adet 1) ve stoklu esyalar (seri koruyucu).
CREATE TABLE IF NOT EXISTS envanter (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  esya         TEXT    NOT NULL,
  adet         INTEGER NOT NULL DEFAULT 0 CHECK (adet >= 0),
  PRIMARY KEY (guild_id, kullanici_id, esya)
);

-- Sureli takviyeler (XP iksiri, muz ciftligi): bitis gecince etkisizdir.
CREATE TABLE IF NOT EXISTS etkiler (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  tur          TEXT    NOT NULL,
  bitis        INTEGER NOT NULL,
  PRIMARY KEY (guild_id, kullanici_id, tur)
);

-- Esya defteri: kasa acma, kasa odulu, kart satisi, hediye. Gunluk hediye
-- siniri buradan sayilir.
CREATE TABLE IF NOT EXISTS esya_hareketleri (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  esya         TEXT    NOT NULL,
  adet         INTEGER NOT NULL,
  tur          TEXT    NOT NULL,
  karsi_id     TEXT,
  zaman        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_esya_hareket_kisi ON esya_hareketleri (guild_id, kullanici_id, tur, zaman);

-- Vadeli mevduat: anapara vade boyunca kilitli; servis vadesi gelenleri oder.
CREATE TABLE IF NOT EXISTS mevduatlar (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  anapara      INTEGER NOT NULL CHECK (anapara > 0),
  faiz_yuzde   INTEGER NOT NULL,
  baslangic    INTEGER NOT NULL,
  vade         INTEGER NOT NULL,
  durum        TEXT    NOT NULL,
  odenen       INTEGER,
  kapanis      INTEGER
);
CREATE INDEX IF NOT EXISTS ix_mevduat_vade ON mevduatlar (durum, vade);
CREATE INDEX IF NOT EXISTS ix_mevduat_kisi ON mevduatlar (guild_id, kullanici_id, durum);

-- Takas teklifleri: esyalar teklifte kilitlenmez, kabul aninda dogrulanir.
-- durum: acik | kabul | red | geri | suresi
CREATE TABLE IF NOT EXISTS takas_teklifleri (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  teklif_eden  TEXT    NOT NULL,
  karsi_id     TEXT    NOT NULL,
  ver_esya     TEXT,
  ver_adet     INTEGER NOT NULL DEFAULT 0,
  iste_esya    TEXT,
  iste_adet    INTEGER NOT NULL DEFAULT 0,
  muz_ver      INTEGER NOT NULL DEFAULT 0,
  muz_iste     INTEGER NOT NULL DEFAULT 0,
  durum        TEXT    NOT NULL DEFAULT 'acik',
  olusturma    INTEGER NOT NULL,
  bitis        INTEGER NOT NULL,
  kanal_id     TEXT,
  mesaj_id     TEXT
);
CREATE INDEX IF NOT EXISTS ix_takas_eden ON takas_teklifleri (guild_id, teklif_eden, durum, bitis);

-- Topluluk pazari (lib/pazar.js): ilandaki kopyalar envanterden duser, ilanda
-- emanette durur; adet satildikca azalir. durum: acik | bitti | iptal (uye kaldirdi) | kaldirildi (yonetici).
CREATE TABLE IF NOT EXISTS pazar_ilanlari (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  satici_id    TEXT    NOT NULL,
  kart         TEXT    NOT NULL,
  adet         INTEGER NOT NULL CHECK (adet >= 0),
  ilk_adet     INTEGER NOT NULL,
  fiyat        INTEGER NOT NULL CHECK (fiyat > 0),
  durum        TEXT    NOT NULL DEFAULT 'acik',
  olusturma    INTEGER NOT NULL,
  kapanis      INTEGER
);
CREATE INDEX IF NOT EXISTS ix_pazar_kart ON pazar_ilanlari (guild_id, durum, kart, fiyat);
CREATE INDEX IF NOT EXISTS ix_pazar_satici ON pazar_ilanlari (guild_id, satici_id, durum);

-- Pazarda gerceklesen satislar (fiyat birim fiyat, kesinti satisin tamami icin).
-- geri_alan/geri_zaman: yoneticinin geri aldigi satis; istek_id: alim isteginden
-- gelen satis (ilan_id 0 olabilir). Ucu de sutunlariTamamla ile eklenir.
CREATE TABLE IF NOT EXISTS pazar_satislari (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  ilan_id      INTEGER NOT NULL,
  satici_id    TEXT    NOT NULL,
  alici_id     TEXT    NOT NULL,
  kart         TEXT    NOT NULL,
  adet         INTEGER NOT NULL,
  fiyat        INTEGER NOT NULL,
  kesinti      INTEGER NOT NULL,
  zaman        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_pazar_satis_kart ON pazar_satislari (guild_id, kart, zaman);
CREATE INDEX IF NOT EXISTS ix_pazar_satis_kisi ON pazar_satislari (guild_id, satici_id, alici_id);

-- Pazarda alim istekleri (Steam'deki buy order): alici tanesi en cok fiyat
-- muza adet kopya ister; fiyat x kalan adet emanettedir (defterde pazar,
-- karsi 'alim-<id>'). durum: acik | bitti | iptal (uye) | kaldirildi (yonetici).
CREATE TABLE IF NOT EXISTS alim_istekleri (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  alici_id     TEXT    NOT NULL,
  kart         TEXT    NOT NULL,
  adet         INTEGER NOT NULL CHECK (adet >= 0),
  ilk_adet     INTEGER NOT NULL,
  fiyat        INTEGER NOT NULL CHECK (fiyat > 0),
  durum        TEXT    NOT NULL DEFAULT 'acik',
  olusturma    INTEGER NOT NULL,
  kapanis      INTEGER
);
CREATE INDEX IF NOT EXISTS ix_alim_kart ON alim_istekleri (guild_id, durum, kart, fiyat);
CREATE INDEX IF NOT EXISTS ix_alim_alici ON alim_istekleri (guild_id, alici_id, durum);

-- Pazarda yonetici islemleri (ilan duzenle/kaldir, satis geri al, ayar).
CREATE TABLE IF NOT EXISTS pazar_yonetim_gunlugu (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  yonetici_id  TEXT    NOT NULL,
  eylem        TEXT    NOT NULL,
  hedef_id     INTEGER,
  uye_id       TEXT,
  ayrinti      TEXT    NOT NULL,
  zaman        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_pazar_gunluk ON pazar_yonetim_gunlugu (guild_id, id);

-- Uyenin satin aldigi kisisel renk rolu; renk degisiminde ayni rol guncellenir.
CREATE TABLE IF NOT EXISTS ozel_roller (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  rol_id       TEXT    NOT NULL,
  renk         INTEGER NOT NULL,
  PRIMARY KEY (guild_id, kullanici_id)
);

-- Alinan koleksiyon seti odulleri: kisi basi her set icin bir kez. Kart sonradan
-- satilsa da satir silinmez; ayni set ikinci kez odul vermez.
CREATE TABLE IF NOT EXISTS set_oduller (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  set_kimligi  TEXT    NOT NULL,
  zaman        INTEGER NOT NULL,
  PRIMARY KEY (guild_id, kullanici_id, set_kimligi)
);

-- Yoneticinin actigi sureli ekonomi etkinlikleri; sunucuda tur basina tek satir.
-- Suresi gecen satir etkisizdir (okurken bitis > simdi), ayrica silinmesi gerekmez.
CREATE TABLE IF NOT EXISTS etkinlikler (
  guild_id   TEXT    NOT NULL,
  tur        TEXT    NOT NULL,
  bitis      INTEGER NOT NULL,
  baslatan   TEXT    NOT NULL,
  baslangic  INTEGER NOT NULL,
  PRIMARY KEY (guild_id, tur)
);

-- Etkinlik gecmisi: her baslatma bir satir. Ayni tur etkinken yeniden baslatilirsa
-- son satirin bitisi uzar; erken bitirilirse bitis o an olur ve erken = 1.
CREATE TABLE IF NOT EXISTS etkinlik_gecmisi (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT    NOT NULL,
  tur        TEXT    NOT NULL,
  baslangic  INTEGER NOT NULL,
  bitis      INTEGER NOT NULL,
  baslatan   TEXT    NOT NULL,
  erken      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_etkinlik_gecmisi ON etkinlik_gecmisi (guild_id, tur, baslangic);

-- Kasa garantisi (lib/kasalar.js): kisi ve kasa basina ust uste kac acilista
-- hedef nadirlik cikmadi. Hedef cikinca ya da garanti verilince 0'a doner.
CREATE TABLE IF NOT EXISTS kasa_garantileri (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  kasa         TEXT    NOT NULL,
  sayac        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, kullanici_id, kasa)
);

-- /calis: kisi basi son calisma zamani (bekleme) ve secilen meslek (NULL = en yuksek acik meslek).
-- enerji/enerji_zaman: tembel dolan enerji (zaman 0 = dolu). maymun: kilitli kart (envanterde bir kopyasi kilitli).
CREATE TABLE IF NOT EXISTS calismalar (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  son_calisma  INTEGER NOT NULL DEFAULT 0,
  meslek       TEXT,
  enerji       REAL    NOT NULL DEFAULT 0,
  enerji_zaman INTEGER NOT NULL DEFAULT 0,
  maymun       TEXT,
  -- Sıradaki ustabaşı yoklamasına kalan çalışma (lib/calis-yoklama.js); NULL = henüz kurulmadı.
  yoklama_kalan INTEGER,
  PRIMARY KEY (guild_id, kullanici_id)
);

-- Calisan maymunlarin deneyimi (kart kimligi basina; kart satilsa da kalir).
CREATE TABLE IF NOT EXISTS maymun_deneyim (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  kart         TEXT    NOT NULL,
  xp           INTEGER NOT NULL DEFAULT 0,
  yukseltme    TEXT    NOT NULL DEFAULT '0-0-0',
  PRIMARY KEY (guild_id, kullanici_id, kart)
);

-- Maymun seferleri: muz ve XP gonderirken hesaplanir, toplaninca satir silinir.
-- Seferdeki maymunun bir kopyasi kilitlidir (envanter.js esyaDus).
CREATE TABLE IF NOT EXISTS maymun_seferleri (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  kart         TEXT    NOT NULL,
  sure         TEXT    NOT NULL,
  muz          INTEGER NOT NULL,
  xp           INTEGER NOT NULL,
  baslangic    INTEGER NOT NULL,
  bitis        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_maymun_seferleri ON maymun_seferleri (guild_id, kullanici_id);

-- Maymun ciftlikleri (lib/ciftlik.js): arsa basina bir ciftlik; birikmis muz
-- son_toplama'dan hesaplanir (hiz x gecen sn, depo siniriyla). yollar: '5-2-0';
-- harcanan: kurma + yukseltmeler (satis iadesi bundan). seviye: eski 10
-- seviyeli sistemden kalan sutun, gecis iadesinden sonra hep 1.
CREATE TABLE IF NOT EXISTS ciftlikler (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  arsa         INTEGER NOT NULL,
  seviye       INTEGER NOT NULL DEFAULT 1,
  yollar       TEXT    NOT NULL DEFAULT '0-0-0',
  harcanan     INTEGER NOT NULL DEFAULT 0,
  son_toplama  INTEGER NOT NULL,
  kurulus      INTEGER NOT NULL,
  PRIMARY KEY (guild_id, kullanici_id, arsa)
);

-- /calis olayinin bekleyen secimi (kisi basi en cok bir); kazanc: olayin ciktigi calismanin muzu.
CREATE TABLE IF NOT EXISTS calis_olaylari (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  olay         TEXT    NOT NULL,
  kazanc       INTEGER NOT NULL,
  bitis        INTEGER NOT NULL,
  PRIMARY KEY (guild_id, kullanici_id)
);

-- Activity'de gecen sure (lib/arayuz-sure.js): acik ve kullanilan arayuzun
-- nabzindan. Oturum: nabizlar arasi kopma olmadan gecen kesintisiz sure.
CREATE TABLE IF NOT EXISTS arayuz_oturumlari (
  id           INTEGER PRIMARY KEY,
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  baslangic    INTEGER NOT NULL,
  son          INTEGER NOT NULL,
  sure_ms      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_arayuz_oturum_kisi ON arayuz_oturumlari (guild_id, kullanici_id, son);
CREATE INDEX IF NOT EXISTS ix_arayuz_oturum_zaman ON arayuz_oturumlari (guild_id, baslangic);

-- Ayni surenin Turkiye gunu ve ekran kirilimi (yonetici paneli).
CREATE TABLE IF NOT EXISTS arayuz_sureleri (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  gun          TEXT    NOT NULL,
  ekran        TEXT    NOT NULL,
  sure_ms      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, kullanici_id, gun, ekran)
);
CREATE INDEX IF NOT EXISTS ix_arayuz_sure_gun ON arayuz_sureleri (guild_id, gun);

-- Haftalik piyango: bilet bir sonraki cekilis zamanina (ms) baglanir.
CREATE TABLE IF NOT EXISTS piyango_biletleri (
  guild_id     TEXT    NOT NULL,
  cekilis      INTEGER NOT NULL,
  kullanici_id TEXT    NOT NULL,
  adet         INTEGER NOT NULL CHECK (adet > 0),
  PRIMARY KEY (guild_id, cekilis, kullanici_id)
);

-- Her cekilis icin tek satir; (guild, cekilis) anahtari "bir kez cekilir" kilidi.
-- durum: bitti (kazanan var) | devir (bilet yoktu, havuz sonrakine gecti)
CREATE TABLE IF NOT EXISTS piyango_cekilisleri (
  guild_id     TEXT    NOT NULL,
  cekilis      INTEGER NOT NULL,
  durum        TEXT    NOT NULL,
  bilet_toplam INTEGER NOT NULL DEFAULT 0,
  gelir        INTEGER NOT NULL DEFAULT 0,
  taban        INTEGER NOT NULL DEFAULT 0,
  havuz        INTEGER NOT NULL DEFAULT 0,
  kazanan_id   TEXT,
  zaman        INTEGER NOT NULL,
  duyuruldu    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, cekilis)
);

-- Haftalik boss savasi: sunucuda ayni anda tek aktif boss (kismi tekil indeks).
-- cikis: planlanan haftalik cikis ani (ms); elle cagrilan bosslarda NULL.
-- durum: aktif | yenildi | kacti. duyuruldu: sonuc duyurusu gonderildi mi.
CREATE TABLE IF NOT EXISTS boss_savaslari (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  boss         TEXT    NOT NULL,
  elit         INTEGER NOT NULL DEFAULT 0,
  max_can      INTEGER NOT NULL,
  can          INTEGER NOT NULL,
  aktif_uye    INTEGER NOT NULL DEFAULT 0,
  beklenen     INTEGER NOT NULL DEFAULT 0,
  cikis        INTEGER,
  baslangic    INTEGER NOT NULL,
  bitis        INTEGER NOT NULL,
  durum        TEXT    NOT NULL DEFAULT 'aktif',
  son_vurus_id TEXT,
  kanal_id     TEXT,
  mesaj_id     TEXT,
  sonuc_zaman  INTEGER,
  duyuruldu    INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_boss_aktif ON boss_savaslari (guild_id) WHERE durum = 'aktif';
CREATE UNIQUE INDEX IF NOT EXISTS ux_boss_cikis ON boss_savaslari (guild_id, cikis);

CREATE TABLE IF NOT EXISTS boss_hasarlari (
  savas_id     INTEGER NOT NULL,
  kullanici_id TEXT    NOT NULL,
  hasar        INTEGER NOT NULL DEFAULT 0,
  saldiri      INTEGER NOT NULL DEFAULT 0,
  son_saldiri  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (savas_id, kullanici_id)
);

-- Kazanilan basarimlar: kisi basi her basarim icin bir kez (odul de bir kez verilir).
CREATE TABLE IF NOT EXISTS basarimlar (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  basarim      TEXT    NOT NULL,
  zaman        INTEGER NOT NULL,
  PRIMARY KEY (guild_id, kullanici_id, basarim)
);

-- Kredi (borc): kisi basi en cok bir acik (aktif | gecikmis) kredi; kismi benzersiz dizin bunu veritabaninda da garanti eder.
-- faiz: vade sonunda ana paraya eklenen tam faiz; odenen: simdiye kadar odenen toplam; ceza: birikmis gecikme cezasi.
CREATE TABLE IF NOT EXISTS krediler (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  anapara      INTEGER NOT NULL CHECK (anapara > 0),
  faiz_yuzde   INTEGER NOT NULL,
  faiz         INTEGER NOT NULL,
  baslangic    INTEGER NOT NULL,
  vade         INTEGER NOT NULL,
  durum        TEXT    NOT NULL,
  odenen       INTEGER NOT NULL DEFAULT 0,
  ceza         INTEGER NOT NULL DEFAULT 0,
  kapanis      INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_kredi_acik ON krediler (guild_id, kullanici_id) WHERE durum IN ('aktif', 'gecikmis');
CREATE INDEX IF NOT EXISTS ix_kredi_vade ON krediler (durum, vade);

-- Hisse piyasasi: 5 dakikalik fiyat gecmisi (saat = adim baslangici, 3 gun saklanir), pozisyonlar (maliyet = odenen toplam muz,
-- komisyon dahil), islem kaydi ve haberler (duyuruldu: kanal duyurusu bir kez).
CREATE TABLE IF NOT EXISTS hisse_fiyatlari (
  guild_id TEXT    NOT NULL,
  sembol   TEXT    NOT NULL,
  saat     INTEGER NOT NULL,
  fiyat    REAL    NOT NULL,
  PRIMARY KEY (guild_id, sembol, saat)
);

CREATE TABLE IF NOT EXISTS hisse_pozisyonlari (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  sembol       TEXT    NOT NULL,
  adet         INTEGER NOT NULL DEFAULT 0,
  maliyet      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, kullanici_id, sembol)
);

CREATE TABLE IF NOT EXISTS hisse_islemleri (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  sembol       TEXT    NOT NULL,
  yon          TEXT    NOT NULL,
  adet         INTEGER NOT NULL,
  fiyat        INTEGER NOT NULL,
  komisyon     INTEGER NOT NULL,
  sonuc        INTEGER NOT NULL DEFAULT 0,
  zaman        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS hisse_islemleri_kisi ON hisse_islemleri (guild_id, kullanici_id, zaman);

CREATE TABLE IF NOT EXISTS hisse_haberleri (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id  TEXT    NOT NULL,
  sembol    TEXT    NOT NULL,
  saat      INTEGER NOT NULL,
  yuzde     REAL    NOT NULL,
  metin     TEXT    NOT NULL,
  duyuruldu INTEGER NOT NULL DEFAULT 0,
  UNIQUE (guild_id, saat)
);

-- Ekonomiden uzaklastirma (lib/ekonomi-uzak.js): satir varken uye ekonomiye
-- (komut, buton, Activity) giremez, sohbet muzu ve XP kazanamaz, kimse ona
-- muz/esya aktaramaz. Kaldirilinca satir silinir.
CREATE TABLE IF NOT EXISTS ekonomi_uzaklastirmalari (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  sebep        TEXT    NOT NULL,
  yetkili_id   TEXT    NOT NULL,
  zaman        INTEGER NOT NULL,
  PRIMARY KEY (guild_id, kullanici_id)
);

-- Gece supheli aktarim taramasi (servisler/supheli.js): taranan her Turkiye
-- gunu icin bir satir; bot kapaliyken gecen gece acilista bir kez taranir.
CREATE TABLE IF NOT EXISTS supheli_taramalari (
  guild_id     TEXT    NOT NULL,
  gun          INTEGER NOT NULL,
  zaman        INTEGER NOT NULL,
  bulunan      INTEGER NOT NULL,
  PRIMARY KEY (guild_id, gun)
);

-- Yonetici bildirimleri (lib/duyuru.js): Activity'de acilir pencere olarak
-- gosterilir. alicilar JSON dizi (bos = herkes); bitis'e kadar gecerli,
-- geri cekilince silinir.
CREATE TABLE IF NOT EXISTS duyurular (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  baslik       TEXT    NOT NULL,
  metin        TEXT    NOT NULL,
  ikon         TEXT    NOT NULL,
  alicilar     TEXT,
  gonderen_id  TEXT    NOT NULL,
  zaman        INTEGER NOT NULL,
  bitis        INTEGER NOT NULL
);

-- Promosyon kodlari (lib/promo.js): yayinlarda dagitilan kod, sure boyunca
-- kullanan her uyeye bir kez muz verir. kod buyuk harfle saklanir.
CREATE TABLE IF NOT EXISTS promo_kodlari (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  kod          TEXT    NOT NULL,
  odul         INTEGER NOT NULL,
  sinir        INTEGER,
  olusturan_id TEXT    NOT NULL,
  zaman        INTEGER NOT NULL,
  bitis        INTEGER NOT NULL,
  UNIQUE (guild_id, kod)
);
CREATE TABLE IF NOT EXISTS promo_kullanimlari (
  kod_id       INTEGER NOT NULL,
  kullanici_id TEXT    NOT NULL,
  zaman        INTEGER NOT NULL,
  PRIMARY KEY (kod_id, kullanici_id)
);

-- Prestij: kisi basi tek satir. Seviye muz kazanc carpanini belirler
-- (lib/prestij-carpan.js); bakiye/envanter sifirlansa da korunur.
CREATE TABLE IF NOT EXISTS prestijler (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  seviye       INTEGER NOT NULL DEFAULT 0 CHECK (seviye >= 0),
  son_prestij  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, kullanici_id)
);

-- Katil (YouTube uyelik) rolleri: muz carpani mesaj/gorev gibi uye nesnesi
-- olmayan yerlerde de hesaplanabilsin diye rol olaylarindan aynalanir
-- (lib/uyelik-carpan.js). Acilista butun uyelerden yeniden kurulur.
CREATE TABLE IF NOT EXISTS uyelik_rolleri (
  guild_id     TEXT NOT NULL,
  kullanici_id TEXT NOT NULL,
  rol_id       TEXT NOT NULL,
  PRIMARY KEY (guild_id, kullanici_id, rol_id)
);

-- Davet takibi (lib/davet.js). Her giris bir satir: ayni uye cikip girerse
-- yeni satir acilir (InviteManager da yeniden girisi sayiyordu).
-- kaynak 'bot' satirlari sayima girer; 'invitemanager' satirlari invite-log
-- kanalindan ice aktarilan gecmistir, yalniz "kim davet etti" icin tutulur.
CREATE TABLE IF NOT EXISTS davet_katilimlari (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id        TEXT    NOT NULL,
  uye_id          TEXT    NOT NULL,
  davet_eden_id   TEXT,
  davet_eden_ad   TEXT,
  kod             TEXT,
  kaynak          TEXT    NOT NULL,
  kaynak_mesaj_id TEXT    UNIQUE,
  zaman           INTEGER NOT NULL,
  ayrilma         INTEGER
);
CREATE INDEX IF NOT EXISTS ix_davet_eden ON davet_katilimlari (guild_id, davet_eden_id);
CREATE INDEX IF NOT EXISTS ix_davet_uye ON davet_katilimlari (guild_id, uye_id);

-- InviteManager'in son bildirdigi davet sayisi. Sayim = adet + bu andan
-- sonraki 'bot' satirlari; boylece eski sayilar kaybolmaz, iki kez de sayilmaz.
CREATE TABLE IF NOT EXISTS davet_baslangic (
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  adet         INTEGER NOT NULL,
  zaman        INTEGER NOT NULL,
  PRIMARY KEY (guild_id, kullanici_id)
);

-- Yildiz panosu (lib/yildiz.js): panoya giren her mesajin pano kopyasi.
-- Sayi esigin altina dusunce kopya silinir, satir da gider.
CREATE TABLE IF NOT EXISTS yildiz_mesajlari (
  mesaj_id      TEXT    PRIMARY KEY,
  guild_id      TEXT    NOT NULL,
  kanal_id      TEXT    NOT NULL,
  pano_mesaj_id TEXT    NOT NULL,
  sayi          INTEGER NOT NULL
);

-- Maymun grevi (lib/grev.js): her grev ve sonucu. sonuc NULL = sürüyor ya da
-- bot yeniden başladığı için yarım kaldı. test = gizli düğmeyle başlatıldı.
CREATE TABLE IF NOT EXISTS grev_kayitlari (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  baslangic    INTEGER NOT NULL,
  bitis        INTEGER,
  sonuc        TEXT,
  vurulan      INTEGER,
  test         INTEGER NOT NULL DEFAULT 0
);

-- Çalışma yoklaması (lib/calis-yoklama.js): makroya karşı ustabaşı sorusu.
-- sonuc NULL = bekliyor (kişi başı bir); 'dogru' | 'yanlis' | 'hizli'.
-- acilis'ten önce cevap alınmaz (yanlış cevabın ceza beklemesi). secenekler
-- JSON meslek kimlikleri; bos_tik = pencerede seçenek dışına tıklama.
CREATE TABLE IF NOT EXISTS calis_yoklamalari (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  sebep        TEXT    NOT NULL,
  hedef        TEXT    NOT NULL,
  secenekler   TEXT    NOT NULL,
  olusturma    INTEGER NOT NULL,
  acilis       INTEGER NOT NULL,
  cevap        INTEGER,
  sonuc        TEXT,
  bos_tik      INTEGER
);
CREATE INDEX IF NOT EXISTS ix_yoklama_kisi ON calis_yoklamalari (guild_id, kullanici_id, id);
CREATE INDEX IF NOT EXISTS ix_yoklama_zaman ON calis_yoklamalari (guild_id, olusturma);

-- Talep yapay zekası (lib/talep-yz.js): otomatik yanıtın tuttuğu raporlar.
-- mesaj_id = rapor kanalına giden mesaj (kanal yoksa NULL).
CREATE TABLE IF NOT EXISTS talep_raporlari (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  talep_id     INTEGER NOT NULL,
  guild_id     TEXT    NOT NULL,
  kullanici_id TEXT    NOT NULL,
  tur          TEXT    NOT NULL,
  baslik       TEXT    NOT NULL,
  ozet         TEXT    NOT NULL,
  mesaj_id     TEXT,
  zaman        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_talep_raporlari ON talep_raporlari (talep_id);

-- Talep yapay zekasinin talep basina verdigi yanit sayisi: bot yeniden
-- baslasa da sinir (TALEP_YANIT_SINIRI) sifirlanmasin.
CREATE TABLE IF NOT EXISTS talep_yz (
  talep_id     INTEGER PRIMARY KEY,
  yanit_sayisi INTEGER NOT NULL DEFAULT 0
);
`;

/** CREATE TABLE IF NOT EXISTS var olan tabloya sütun eklemez; eksikleri burada tamamlarız. */
function sutunlariTamamla(db) {
  const sutunlar = db.prepare('PRAGMA table_info(youtube_abonelikleri)').all().map((s) => s.name);
  if (!sutunlar.includes('herkesi_etiketle')) {
    db.exec('ALTER TABLE youtube_abonelikleri ADD COLUMN herkesi_etiketle INTEGER NOT NULL DEFAULT 0');
  }
  const calisma = db.prepare('PRAGMA table_info(calismalar)').all().map((s) => s.name);
  if (!calisma.includes('enerji')) db.exec('ALTER TABLE calismalar ADD COLUMN enerji REAL NOT NULL DEFAULT 0');
  if (!calisma.includes('enerji_zaman')) db.exec('ALTER TABLE calismalar ADD COLUMN enerji_zaman INTEGER NOT NULL DEFAULT 0');
  if (!calisma.includes('maymun')) db.exec('ALTER TABLE calismalar ADD COLUMN maymun TEXT');
  if (!calisma.includes('yoklama_kalan')) db.exec('ALTER TABLE calismalar ADD COLUMN yoklama_kalan INTEGER');
  const deneyim = db.prepare('PRAGMA table_info(maymun_deneyim)').all().map((s) => s.name);
  if (!deneyim.includes('yukseltme')) db.exec("ALTER TABLE maymun_deneyim ADD COLUMN yukseltme TEXT NOT NULL DEFAULT '0-0-0'");
  const boss = db.prepare('PRAGMA table_info(boss_savaslari)').all().map((s) => s.name);
  if (!boss.includes('beklenen')) db.exec('ALTER TABLE boss_savaslari ADD COLUMN beklenen INTEGER NOT NULL DEFAULT 0');
  // Çiftlikler 2026-10-23'te üç yollu sisteme geçti: yollar ve satış için harcanan.
  // Var olan çiftliklerin harcananı arsa bedelidir; eski yükseltme harcaması
  // scripts/ciftlik-gecis.js ile iade edilir.
  const hareket = db.prepare('PRAGMA table_info(ekonomi_hareketleri)').all().map((s) => s.name);
  if (!hareket.includes('oyun')) db.exec('ALTER TABLE ekonomi_hareketleri ADD COLUMN oyun TEXT');
  // Etkinlik geçmişi 2026-10-24'te eklendi: o an tablodaki son etkinlikler ilk kayıtlar olur.
  db.exec(`INSERT INTO etkinlik_gecmisi (guild_id, tur, baslangic, bitis, baslatan)
    SELECT guild_id, tur, baslangic, bitis, baslatan FROM etkinlikler
     WHERE NOT EXISTS (SELECT 1 FROM etkinlik_gecmisi)`);
  // Pazarda yöneticinin geri aldığı satışlar (2026-10-25).
  const pazarSatis = db.prepare('PRAGMA table_info(pazar_satislari)').all().map((s) => s.name);
  if (!pazarSatis.includes('geri_alan')) db.exec('ALTER TABLE pazar_satislari ADD COLUMN geri_alan TEXT');
  if (!pazarSatis.includes('geri_zaman')) db.exec('ALTER TABLE pazar_satislari ADD COLUMN geri_zaman INTEGER');
  if (!pazarSatis.includes('istek_id')) db.exec('ALTER TABLE pazar_satislari ADD COLUMN istek_id INTEGER');
  const ciftlik = db.prepare('PRAGMA table_info(ciftlikler)').all().map((s) => s.name);
  if (!ciftlik.includes('yollar')) db.exec("ALTER TABLE ciftlikler ADD COLUMN yollar TEXT NOT NULL DEFAULT '0-0-0'");
  if (!ciftlik.includes('harcanan')) {
    db.exec('ALTER TABLE ciftlikler ADD COLUMN harcanan INTEGER NOT NULL DEFAULT 0');
    db.exec(`UPDATE ciftlikler SET harcanan = CASE arsa
      WHEN 0 THEN 3000 WHEN 1 THEN 8000 WHEN 2 THEN 15000 WHEN 3 THEN 25000
      WHEN 4 THEN 40000 WHEN 5 THEN 60000 ELSE 5000 END`);
  }
}

/**
 * Yeni bir veritabanı açar ve şemayı kurar.
 * Testler ':memory:' ile çağırıp yalıtılmış kopya alabilir.
 */
export function acVeritabani(yol = VARSAYILAN_YOL) {
  if (yol !== ':memory:') {
    mkdirSync(path.dirname(yol), { recursive: true });
  }

  const db = new DatabaseSync(yol);

  // WAL, bot yazarken okumaların bloklanmamasını sağlar. Bellek içi veritabanı
  // WAL desteklemez; orada sessizce atlıyoruz.
  if (yol !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
  }
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SEMA);
  sutunlariTamamla(db);

  return db;
}

let paylasilan = null;

/** Bot süreci boyunca tek veritabanı örneği. */
export function veritabani() {
  paylasilan ??= acVeritabani();
  return paylasilan;
}

export function kapat() {
  paylasilan?.close();
  paylasilan = null;
}
