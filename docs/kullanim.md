# Kullanım ve durum

`docs/özellikler.md` içindeki her kategorinin şu an nereye karşılık geldiği.
Son güncelleme: 2026-09-22. Canlı ölçümler bot `Süper Maymun#2271` (eski adı `testtt`) ve sunucu
**Bloons TD Severler** üzerinde yapıldı.

## Çalıştırma

```sh
cd app
npm install          # bir kez
npm run verify       # .env değerlerini canlı Discord API'sine karşı sınar
npm run deploy       # slash komutları sunucuya kaydeder (komut ekleyince tekrar çalıştır)
npm start            # botu başlatır
npm test             # 230 birim testi
```

`app/.env` gerekli: `token`, `clientID`, `guildID`. Örnek için `app/.env.example`.

## Sürekli çalıştırma (systemd)

Bot, bu makinede systemd **kullanıcı** servisi olarak 7/24 çalışır
(karar `D-BARINDIRMA`). Birim dosyası:
`~/.config/systemd/user/discord-bot.service`.

```sh
systemctl --user status discord-bot      # durum
systemctl --user restart discord-bot     # yeniden başlat (kod/.env değişince)
systemctl --user stop discord-bot        # durdur
journalctl --user -u discord-bot -f      # canlı log
```

- `Restart=always`, `RestartSec=5`: çökerse kendiliğinden geri gelir.
- `loginctl enable-linger $USER` açık: oturum kapalıyken ve açılışta da çalışır.
- `KillSignal=SIGTERM`: `app.js` sinyali yakalayıp `client.destroy()` sonrası
  temiz çıkar, bu yüzden `TimeoutStopSec=20` yeterli.
- Gizli değerler unit dosyasında **değil**, `app/.env` içinde durur.
- `ExecStart` nvm altındaki mutlak node yoluna bağlıdır
  (`~/.nvm/versions/node/<sürüm>/bin/node`, `which node` verir). nvm sürümü değişirse
  unit dosyasını güncelleyip `systemctl --user daemon-reload` çalıştır.
- Sistem geneli (`/etc/systemd/system`) servis kurulmadı: makinede `sudo`
  şifresiz kullanılamıyor. Gerekirse sudo ile oraya taşınabilir.

`npm start` ile elle başlatmadan önce servisi durdur; aksi halde aynı bot
iki kez bağlanır.

## Botu başkası sunucusuna ekleyemesin

İki katman var; **ikisi de gerekli.**

**1. Developer Portal anahtarı (elle yapılman gerek).**
discord.com/developers/applications → **Süper Maymun** → Bot →
**Public Bot** anahtarını **kapat** → Save.

Kapalıyken davet bağlantısını yalnız uygulama sahibi kullanabilir; başkası
aynı bağlantıyı açtığında Discord sunucu seçtirmez. Bu anahtar **API'den
değiştirilemiyor**: `PATCH /applications/@me` ile `bot_public:false`
gönderildiğinde Discord HTTP 200 döner ama değer `true` kalır (2026-09-21'de
ölçüldü). Tek yer Portal arayüzü.

**2. Kod tarafındaki sunucu kilidi (kurulu, çalışıyor).**
Portal anahtarı kapatılsa bile daha önce üretilmiş bir davet bağlantısıyla
eklenmiş sunucular kendiliğinden düşmez. Bot bunu kendisi kapatır
(karar `D-SUNUCU-KILIDI`):

- Yeni bir sunucuya eklendiği an `guildCreate` ile hemen ayrılır
  (`app/events/guild-kilidi.js`).
- Açılışta önbellekteki bütün sunucuları tarar, `.env`'deki `guildID` dışında
  ne varsa ayrılır — bot kapalıyken eklenmiş sunucular da temizlenir.
- Ayrılma hatası (`Missing Access`, `Unknown Guild`) loglanır, bot düşmez ve
  kalan sunucular işlenmeye devam eder.
- Açılış günlüğünde `Sunucu kilidi: yalnız izinli sunucuda.` satırı bunu
  doğrular; bir ayrılma olduysa `İzinsiz sunucudan ayrılındı: ...` yazar.

`guildID` artık açılışta zorunlu: eksikse bot açık hata verip çıkar, çünkü
kilit ona bağlıdır.

**Sunucuyu taşımak istersen** `app/.env` içindeki `guildID`'yi değiştir,
`npm run deploy` ile komutları yeni sunucuya kaydet ve
`systemctl --user restart discord-bot` yap. Aksi halde bot yeni sunucudan
kendi kendine ayrılır.

## Özellik tablosu → gerçek karşılığı

| Kategori | Karşılığı | Durum |
| --- | --- | --- |
| **Moderasyon** | `/ban` `/kick` `/sustur` `/temizle` `/uyari ver\|liste\|sil` | Çalışıyor |
| **Güvenlik** | `/automod liste\|kur\|sil` — Discord yerleşik AutoMod | Çalışıyor |
| **Log sistemi** | `log.*` ayarları; mesaj (toplu silme dahil), üye giriş/çıkış, ses giriş/çıkış/geçiş, üye rol/takma ad/avatar, kanal/başlık/rol oluşturma-silme-güncelleme, sunucu ayarı, ban olayları (Carl-bot logunun karşılığı) | Kısmen (aşağıya bak) |
| **Otorol** | `otorol` sistemi + `otorol.rol`; girene rol verir, botlara vermez (Carl-bot AutoRoles yerine) | Canlı kabul bekliyor |
| **Yıldız panosu** | `yildiz` sistemi + `yildiz.kanal` + `yildiz.esik` (varsayılan 2); ⭐ eşiği geçen mesaj panoya kopyalanır, sayı değişince güncellenir, eşik altına düşünce ya da özgün mesaj silinince kopya silinir. Botların ve mesaj sahibinin yıldızı sayılmaz (Carl-bot starboard yerine) | Canlı kabul bekliyor |
| **Davet takibi** | `davet` sistemi + `davet.logKanal`; `/davet bilgi\|siralama`; InviteManager geçmişi `npm run davetaktar` ile devralınır | Canlı kabul bekliyor |
| **Karşılama** | `karsilama.*` / `ugurlama.*` ayarları + PNG kart üretimi | **Engelli** (aşağıya bak) |
| **Başvuru sistemi** | `/basvuru` → modal form → inceleme kanalı → onay/ret | Çalışıyor |
| **Eğlence** | `/zar` `/yazitura` `/sec` `/8ball` | Çalışıyor |
| **Selamlaşma** | `selamlama.*` ayarları; seçilen kanalda selama gruba göre otomatik yanıt | Çalışıyor |
| **Oylama** | `oylama.kanal`; her mesaja ⬆️ ⬇️ tepkisi, kendine oy engeli, `/oylama gecmis` | Çalışıyor |
| **Özel ses odası** | `ozelses.*` ayarları; `➕ Oda Oluştur` kanalına girene kendi odası + kontrol paneli, boşalınca silinir | Canlı kabul bekliyor |
| **Destek talebi** | `/talep panel\|kapat\|liste`; panel butonu → üyeye özel kanal → transkriptli kapanış | Canlı kabul bekliyor |
| **Anket** | `/anket olustur\|bitir`; komutun yazıldığı kanalda Discord yerel anketi (2-10 seçenek, 1sa-32g) | Canlı kabul bekliyor |
| **Hatırlatıcı** | `/hatirlat kur\|liste\|sil`; zamanı gelince kurulduğu kanalda kurucuyu (+ seçilen kişi/rolü) etiketler | Canlı kabul bekliyor |
| **Çekiliş** | `/cekilis baslat\|uzat\|bitir\|iptal\|yeniden\|liste`; butonla katılım, tekrarsız kazanan | Canlı kabul bekliyor |
| **Seviye / XP** | `/seviye bilgi\|siralama`; mesaj başına XP, seviye atlama duyurusu, seviye rolleri (`npm run seviyerol`) | Canlı kabul bekliyor |
| **Ekonomi (muz) / kumar** | `/gunluk` `/cuzdan` `/gonder` `/zenginler` `/magaza liste\|al\|renk\|ekle\|kaldir` `/kasa ac\|bilgi` `/envanter goster\|kartlar\|sat\|kopyalari-sat\|hediye` `/banka yatir\|durum\|boz` `/gorev` `/takas teklif` `/duello` `/profil` `/envanter setler\|set-odul` `/ekonomi-etkinlik` `/calis` `/piyango bilet\|durum` `/basarim` `/envanter birlestir` `/ekonomi-panel` `/hisse` `/kredi` `/boss` `/prestij` `/kumar slot\|yazitura\|zar\|rulet\|at\|mines\|blackjack` `/ekonomi-yonet ver\|al\|sifirla` | Canlı kabul bekliyor |
| **Yedekleme** | `/yedek al\|liste` (sahip + yetkili geliştiriciler); 12 saatte bir `VACUUM INTO` + rotasyon | Çalışıyor |
| **Resim** | `/avatar` `/sunucugorsel` | Çalışıyor |
| **Kullanıcı** | `/kullanici` | Çalışıyor |
| **Sunucu** | `/sunucu` | Çalışıyor |
| **YouTube bildirimleri** | `/youtube ekle\|cikar\|liste` + 5 dakikada bir RSS yoklama | Çalışıyor |
| **Tam yapılandırılabilirlik** | `/ayar liste\|sistem\|ayarla\|sifirla` | Çalışıyor |
| **Türkçe** | Bütün komut açıklamaları, yanıtlar ve hata mesajları Türkçe | Çalışıyor |
| **Çok amaçlı yapı** | 48 komut, 18 modül dizini, tek bot süreci | Çalışıyor |
| ~~Müzik~~ | — | **Çıkarıldı** (kullanıcı geri çekti) |

## Ayrıcalıklı intent'ler

**2026-09-21 itibarıyla GuildMembers ve MessageContent açık.** Portal'da iki
anahtar da açıldıktan sonra bot tam intent kümesiyle ilk denemede giriyor;
açılış günlüğünde artık ne "ayrıcalıklı intent reddedildi" satırı ne de
atlanan olay var. Karşılama/uğurlama ve tam mesaj logu çalışır durumda.

Bunlar kapatılırsa bot yine açılır (karar `D-INTENT-DEGRADE`): kapalı
intent'leri tek tek ölçüp yalnız izin verilenlerle girer, bağlı olayları hiç
bağlamaz ve açılışta ne düştüğünü yazar. Düşecek özellikler:

| Intent | Kapatılırsa düşen özellik |
| --- | --- |
| `GuildMembers` | Karşılama ve uğurlama mesajları, giriş-çıkış görselleri, üye giriş/çıkış logu |
| `MessageContent` | Silinen/düzenlenen mesajın **içeriği** (olayın kendisi loglanır, içerik yerine açık not yazılır) |

**Anahtarlar:** discord.com/developers/applications → uygulamanız → Bot →
Privileged Gateway Intents. Değiştirdikten sonra
`systemctl --user restart discord-bot`. Ek kod gerekmez.

AutoMod bundan etkilenmez: filtreleme Discord tarafında yapıldığı için
`/automod` her durumda çalışır.

## Yapılandırma

Her şey sunucu bazında ve varsayılan olarak kapalı/açık ayarlıdır.

```
/ayar liste                                   # bütün sistemler ve ayarlar
/ayar sistem sistem:Log sistemi acik:Evet     # sistemi aç/kapat
/ayar ayarla anahtar:log.kanal kanal:#log     # ayar değeri ver
/ayar sifirla anahtar:karsilama.mesaj         # varsayılana döndür
```

Sistemler: `moderasyon` `guvenlik` `log` `karsilama` `basvuru` `selamlama`
`oylama` `youtube` `eglence` `resim` `kullanici` `sunucu` `otorol` `davet`
`yildiz`
(tam liste: `/ayar liste`).

### Davet takibi (InviteManager yerine)

```
/ayar ayarla anahtar:davet.logKanal kanal:#・🍔・invite-log
/ayar sistem sistem:Davet takibi acik:Evet
npm run davetaktar -- --dene     # InviteManager geçmişini önizle
npm run davetaktar               # geçmişi ve son sayıları yaz
```

Bot davetlerin kullanım sayılarını önbellekte tutar, üye girince yeniden
çeker; sayısı artan davet üyenin geldiği davettir. İki davet aynı anda
artarsa ya da sınırsız bir davet silinirse tahmin etmez, "bulunamadı" yazar.
Botun **Sunucuyu Yönet** izni olmalı (davet listesi bunu ister).

Sayım InviteManager'la aynı anlamdadır: her giriş bir davet, çıkış sayıdan
düşmez (`/davet bilgi` ayrılanı ayrıca gösterir). `davetaktar` her davet
edenin InviteManager'daki son sayısını başlangıç yapar ve botun yalnız
InviteManager'ın son mesajından sonraki girişlerini üstüne ekler; böylece
paralel çalışma sırasında iki kez sayılmaz. InviteManager çıkarılmadan hemen
önce bir kez daha çalıştırılmalı. Davet edeni sunucudan ayrılmış satırlar
geçmiş olarak yazılır ama başlangıç sayısı yazılamaz (ad → kimlik çevrilemez).

Karşılama şablonunda kullanılabilen yer tutucular:
`{kullanici}` `{kullaniciAdi}` `{kullaniciEtiket}` `{sunucu}` `{uyeSayisi}`.
Bilinmeyen yer tutucu olduğu gibi bırakılır — yazım hatası sessizce kaybolmaz.

### Selamlaşma

```
/ayar ayarla anahtar:selamlama.kanal kanal:#sohbet
/ayar sistem sistem:Selamlaşma acik:Evet
```

Yalnız `selamlama.kanal` ile seçilen kanalda çalışır; kanal ayarlanmadıkça
sistem açık olsa bile sessiz kalır (kazara bütün sunucuya yayılmasın).

Selamlar gruplara ayrılmıştır, her grubun kendi yanıtı vardır:

| Grup | Yakaladığı kalıplar | Yanıt ayarı | Varsayılan |
| --- | --- | --- | --- |
| `sa` | `sa` `s.a` `s a` `sea` `slm` `selam` `selamlar` `selamün aleyküm` `aleyküm selam` | `selamlama.cevap.sa` | `as` |
| `merhaba` | `merhaba` `mrb` `mrhb` | `selamlama.cevap.merhaba` | `merhaba` |
| `gunaydin` | `günaydın` `günaydınlar` `gnydn` `iyi/hayırlı sabahlar` | `selamlama.cevap.gunaydin` | `günaydın` |
| `iyiGunler` | `iyi günler` `iyigünler` `hayırlı günler` | `selamlama.cevap.iyiGunler` | `iyi günler` |
| `iyiAksamlar` | `iyi akşamlar` `hayırlı akşamlar` | `selamlama.cevap.iyiAksamlar` | `iyi akşamlar` |
| `iyiGeceler` | `iyi geceler` `iyigeceler` `hayırlı geceler` | `selamlama.cevap.iyiGeceler` | `iyi geceler` |

Büyük/küçük harf ve Türkçe harf farkı gözetilmez. Kelime sınırına bakılır —
"saat", "sana", "mesaj" gibi kelimeler tetiklemez. Bir mesajda iki grup da
geçiyorsa metinde önce gelen kazanır. Aynı kişiye aynı kanalda 5 saniyede bir
kez yanıt verilir (sel baskınını keser), botların mesajları hiç dikkate
alınmaz.

Yeni grup eklemek için `lib/selamlama.js` içindeki `GRUPLAR`'a bir satır ve
`ayarlar.js` içindeki `AYARLAR`'a karşılık gelen anahtarı eklemek yeterli;
bir test bu ikisinin eşleştiğini doğruluyor. Anahtar listesi komut kaydına
gömülü olmadığı için yeniden `npm run deploy` gerekmez (aşağıya bak).

`MessageContent` intent'ine bağlıdır; o kapalıyken olay hiç bağlanmaz.

### Oylama

```
/ayar ayarla anahtar:oylama.kanal kanal:#video-fikirleri
/ayar sistem sistem:Oylama acik:Evet
/oylama gecmis                      # eski mesajlara da tepkileri ekler
```

Ayarlanan kanala düşen **her** mesaja bot ⬆️ ve ⬇️ tepkisini bırakır; kanal
böylece hazır oy düğmeleriyle gelen bir oylama/öneri kanalına döner. Mesaj
içeriği okunmaz, o yüzden yalnız `GuildMessages` intent'i yeter.

| Durum | Davranış |
| --- | --- |
| Kanal ayarlanmamış / sistem kapalı | Hiçbir şey yapılmaz |
| Botun kendi mesajı | Atlanır (bildirim ve yanıtlar oylanmaz) |
| Başka botun veya webhook'un mesajı | Oylanır — "tüm mesajlar" böyle istendi |
| Katılma/sabitleme gibi sistem mesajı | Atlanır |
| Kanalda `Tepki Ekle` yetkisi yok | Sessizce atlanır, `/oylama gecmis` açık hata verir |
| **Üye kendi mesajına oy basıyor** | **Tepkisi hemen geri alınır** (aşağıya bak) |

**Kendine oy engellidir.** Bir üye kendi mesajına ⬆️ ya da ⬇️ basarsa tepkisi
sessizce geri alınır (karar `D-KENDINE-OY`). Gerekçe: herkes kendi fikrine bir
⬆️ ile başlarsa sıralama fikrin değerini değil kimin kendine oy verdiğini ölçer.

Bilinmesi gerekenler:
- Discord bir tepkinin **eklenmesini** engellemeye izin vermiyor; yapılabilen tek
  şey eklendikten sonra kaldırmak. Üye kısa bir an kendi oyunu görebilir.
- Aşağı ok da engelli. Kendi mesajına ⬇️ basmak nadir ama iki yönü ayrı kurala
  bağlamak sonradan "neden biri serbest" sorusunu doğururdu.
- Uyarı mesajı yazılmaz — her deneme için kanala uyarı düşmesi oylama kanalını
  sohbete çevirirdi.
- Engel `GuildMessageReactions` intent'ine (ayrıcalıklı değil) ve istemcinin
  partial ayarına bağlı: partial olmadan, önbellekte olmayan bir mesaja gelen
  tepki olayı discord.js tarafında sessizce düşer ve engel eski mesajlarda
  çalışmaz.
- Başkasının tepkisini kaldırmak `Mesajları Yönet` yetkisi ister; yetki yoksa
  olay sessizce atlar.

`/oylama gecmis` kanalı yeniden eskiye tarar (varsayılan 1000, en çok 10000
mesaj; `adet:` ile değiştirilir) ve eksik tepkileri ekler. Zaten tepki
bırakılmış mesajlar atlandığı için komut istendiği kadar tekrar
çalıştırılabilir: ikinci çalıştırma yalnız kalanları tamamlar. Tarama ayrıca
**daha önce verilmiş kendi oylarını temizler** ve özetinde kaç tane kaldırdığını
söyler; canlı engel eklenmeden önce birikmiş çarpıklık böyle düzeltilir. Tepki eklemek
mesaj başına iki istek olduğu için binlerce mesajlık tarama dakikalarca
sürebilir; komut arada ilerleme yazar. `/oylama durum` ayarlı kanalı gösterir.

Emojiyi değiştirmek için `lib/oylama.js` içindeki `YUKARI`/`ASAGI` sabitleri
düzenlenir — ayar anahtarı açılmadı, çünkü geçersiz bir emoji ancak Discord'a
gönderilince hata verir ve kanalı yarı tepkili bırakır.

### Destek talebi (ticket)

```
/ayar ayarla anahtar:talep.kategori kanal:#004・Destek
/ayar ayarla anahtar:talep.panelKanal kanal:#・🎫・destek-talebi
/ayar ayarla anahtar:talep.logKanal kanal:#・📋・talep-log
/ayar ayarla anahtar:talep.rol rol:@Yetkili
/ayar ayarla anahtar:talep.raporKanal kanal:#・📋・talep-raporları
/ayar sistem sistem:"Destek talebi (ticket)" acik:Evet
/talep panel                        # paneli kanala kurar
```

Panel butonuna basan üye için talep kategorisinde kendine özel bir kanal açılır;
o kanalı yalnız üye, yetkili rol ve bot görür. Aynı anda bir üyenin tek açık
talebi olabilir — ikinci deneme mevcut kanalına yönlendirilir.

Kapanışta (`/talep kapat` ya da kanaldaki **Talebi Kapat** butonu) yazışma düz
metin transkript olarak `talep.logKanal` kanalına dosya hâlinde düşer, sonra
kanal silinir. Talebi yalnız **sahibi**, **yetkili rol** veya **Sunucuyu Yönet**
yetkisi olan kapatabilir.

**Otomatik yanıt (yapay zekâ):** talep sahibi yazınca ~40 sn sonra (art arda
mesajlar tek seferde okunur) Claude Haiku bu belgelere dayanarak kısa bir
yanıt yazar; mesajın altında "Otomatik yanıt" notu bulunur. Söz vermez, bir
şey yapmış gibi davranmaz; mesajı anlamadıysa "anlamadım" deyip açıklama ister
ve rapor tutmaz. Üyenin açıkça söylediği öneri, hata, şikâyet ya da
cevaplayamadığı soru `talep.raporKanal` kanalına rapor olarak düşer (aynı
konu bir talepte iki kez raporlanmaz). Yetkili son 30 dakikada kanala
yazdıysa susar; bir talepte en çok 12 yanıt verir. Bot yeniden başlarsa
kaldığı yerden sürer: yanıt sayısı veritabanında tutulur, açılışta son mesajı
üyenin olan (48 saatten yeni) cevapsız talepler yanıtlanır. `talep.yapayZeka` ile
kapatılır. API anahtarı kullanılmaz: model, makinedeki Claude Code girişiyle
`claude -p` (araçsız, MCP'siz, oturum kaydetmeden) çağrılır; `claude` kurulu
değilse (`CLAUDE_YOLU`, varsayılan `~/.local/bin/claude`) hiç çalışmaz.
Modelin aracı yoktur (dosya okuyamaz, komut çalıştıramaz); yalnız o talebin
yazışmasını ve belgelerin üyeye dönük bölümlerini görür (kurulum, sunucu ve
yönetici iç bilgisi verilmez). Claude Code isteme hesap e-postası ve çalışma
dizinini kendiliğinden eklediği için yanıt gönderilmeden sızıntı denetiminden
geçer (e-posta, dosya yolu, IP, ortam bilgisi); takılırsa üyeye gitmez,
rapor kanalına "Otomatik yanıt engellendi" düşer.

Panel butonunun `customId`'si sabittir, bu yüzden bot yeniden başladığında
panel çalışmaya devam eder — paneli her açılışta yeniden kurmak gerekmez.

> Başvuru sisteminden farkı: `/basvuru` tek seferlik bir formdur, onay/ret ile
> biter. Talep ise karşılıklı yazışılan, kapanınca silinen geçici bir kanaldır.

### Çekiliş

```
/ayar ayarla anahtar:cekilis.kanal kanal:#・🎁・çekiliş
/ayar sistem sistem:Çekiliş acik:Evet
/cekilis baslat odul:"Nitro 1 ay" sure:2sa kazanan:2
```

Süre biçimi `/oylama` ile aynı: `30dk`, `2sa`, `3g` (en az 10 saniye, en çok 30
gün). Katılım **butonla** olur, tepkiyle değil: katılım kayıtta tutulduğu için
mesaj silinse ya da bot kapansa bile katılımcı listesi kaybolmaz.

| Komut | İşi |
| --- | --- |
| `/cekilis uzat no: sure:` | Bitişi verilen süre kadar ileri alır, mesajdaki bitişi de günceller (süresi geçmiş ama çekilmemişse ek süre şimdiden sayılır; bitiş en çok 30 gün sonra olabilir) |
| `/cekilis bitir no:` | Süreyi şimdiye çeker, sonuç birazdan kanala düşer |
| `/cekilis iptal no:` | Kazanan çekmeden kapatır |
| `/cekilis yeniden no: adet:` | Biten çekilişten yeni kazanan çeker (eski kazananlar havuz dışı) |
| `/cekilis liste` | Açık çekilişleri, kalan süreyi ve katılım sayısını gösterir |

Süresi dolan çekilişler 15 saniyede bir taranır. Çekiliş başına zamanlayıcı
kurulmaz: aynı tarama hem normal süre dolumunu hem de **bot kapalıyken geçen
süreyi** halleder, yani yeniden başlatma kurtarması ayrı bir yol değildir.
Katılan olmazsa kazanan ilan edilmez. Sistem kapalıyken çekiliş sonuçlanmaz,
yönetici açınca kaldığı yerden devam eder.

### Anket

Komutu hangi kanalda yazarsan anket o kanala düşer. Discord'un yerel anket
özelliği kullanılır: oy sayımı, süre dolunca kapanma ve sonuç Discord'da
tutulur, bot veri saklamaz (yeniden başlatma anketi etkilemez). Sistem
varsayılan açık; kapatmak için `/ayar sistem sistem:Anket acik:Hayır`.

```text
/anket olustur soru:"Akşam ne yiyelim?" secenekler:"Pizza | Lahmacun | Döner" sure:2sa
```

| Komut | Ne yapar |
|---|---|
| `/anket olustur soru: secenekler: [sure:] [coklu:]` | 2-10 seçenek (`\|` ya da virgülle ayır, her biri en çok 55 karakter). Süre varsayılan 24sa, en çok 32g; saat birimine yukarı yuvarlanır. `coklu:Evet` birden fazla seçim açar |
| `/anket bitir mesaj:` | Anketi süresi dolmadan kapatır (mesaj bağlantısı ya da aynı kanaldaysa kimliği) |

Varsayılan olarak **Mesajları Yönet** yetkisi olanlar görür; Sunucu Ayarları →
Entegrasyonlar'dan değiştirilebilir.

### Hatırlatıcı

Komutu hangi kanalda yazarsan hatırlatma zamanı gelince o kanala düşer ve seni
etiketler; `etiket:` ile bir kişi ya da rol de eklenebilir. Herkes kullanabilir,
sistem varsayılan açık (`/ayar sistem sistem:Hatırlatıcı`).

```text
/hatirlat kur zaman:21:30 mesaj:"Yayın başlıyor" etiket:@Moderatör
/hatirlat kur zaman:1sa30dk mesaj:"Fırını kapat"
```

| Komut | Ne yapar |
|---|---|
| `/hatirlat kur zaman: mesaj: [etiket:]` | Hatırlatma kurar. Onay mesajı kanalda herkese görünür ama kimseyi çağırmaz; hatırlatma o mesaja yanıt olarak gelir |
| `/hatirlat liste` | Bu sunucudaki bekleyen hatırlatmalarını gösterir (yalnız sana) |
| `/hatirlat sil no:` | Bekleyen hatırlatmayı iptal eder; başkasınınkini yalnız Mesajları Yönet yetkilisi silebilir |

- **Zaman biçimleri** (mutlak saatler Türkiye saati, UTC+3): `30dk`, `2sa`,
  `1sa30dk`, `3g`, `1hf`, `21:30` (geçtiyse yarın), `yarın 09:00`,
  `05.10 21:30`, `05.10.2026 21:30`. En az 1 dakika, en çok 1 yıl sonrası.
- Kişi başı en çok 25 bekleyen hatırlatma; mesaj en çok 1000 karakter.
- Yalnız kurucu ve seçilen hedef çağrılır; mesaja yazılan `@everyone` kimseyi
  çağırmaz. `@everyone` ya da herkese etiketlenemeyen bir rol seçmek için
  kurucuda (ve botta) **@everyone, @here ve Tüm Rollerden Bahset** yetkisi gerekir.
- Kayıtlar `hatirlaticilar` tablosunda; 15 saniyede bir taranır, bot
  kapalıyken zamanı geçenler açılıştan sonraki ilk turda gönderilir.
- Kanal silinmiş ya da bot artık yazamıyorsa hatırlatma kurucuya DM ile gider.
- Sistem kapalıyken hatırlatmalar bekletilir, açılınca gönderilir.

### Seviye / XP

```
/ayar ayarla anahtar:seviye.kanal kanal:#・📈・seviye
/ayar sistem sistem:"Seviye / XP" acik:Evet
```

Sayısal tasarım `docs/ekonomi.md` içindedir; koddaki sabitler o belgeyle birebir
aynıdır ve bir birim test bunu doğrular.

| Kural | Değer |
| --- | --- |
| Mesaj başına | 15–25 arası rastgele XP |
| Bekleme süresi | 60 saniye (spam XP kazandırmaz) |
| Seviye eşiği | `⌊(5n² + 50n + 100) / 2⌋` (2026-10-22'de yarıya indi) |
| Sayılmayan | Bot mesajları, DM, slash komutları |

Mesaj **içeriği okunmaz**, yalnız mesajın varlığı sayılır; bu yüzden ayrıcalıklı
`MessageContent` intent'i kapatılsa bile seviye sistemi çalışır. Seviye
atlayınca `seviye.kanal` kanalına duyuru düşer; kanal ayarlanmamışsa hiçbir şey
gönderilmez ve hata da oluşmaz. `seviye.mesaj` şablonunda `{kullanici}`,
`{seviye}` ve `{sunucu}` yer tutucuları kullanılır.

XP'yi kanallara sınırlamak: `/ayar kanal-ekle anahtar:seviye.kanallar kanal:#…`
(boş liste = her kanal; thread'ler üst kanalı sayar).

Ses XP'si: seste dakikada 5–10 XP, günde en çok `seviye.sesXpGunluk`
(varsayılan 1.000; `0` kapatır): `/ayar ayarla anahtar:seviye.sesXpGunluk deger:…`.
Kanalda kulaklığı açık en az iki insan ve mikrofonu açık en az bir insan gerekir.

`/seviye bilgi` XP, seviye, sıra, sonraki seviyeye kalanı ve bugünkü ses XP'sini gösterir;
`/seviye siralama` ilk 10 üyeyi verir.

#### Seviye rolleri

```
npm run seviyerol          # app/ içinde: rolleri açar, sıralar, izinleri yazar, rolleri dağıtır
npm run seviyerol -- --dene  # hiçbir şey yazmadan yapılacakları listeler
```

| Seviye | Rol | genel-sohbet'te açılan |
| ---: | --- | --- |
| 3 | Bumerang Maymunu | dış çıkartma |
| 5 | Bomba Maymunu | + görsel/dosya |
| 10 | Ninja Maymun | + thread açma, sesli mesaj |
| 15 | Büyücü Maymun | üye listesinde ayrı görünür |
| 25 | Medyum Maymun | üye listesinde ayrı görünür |
| 40 | Simyacı Maymun | üye listesinde ayrı görünür |

Bütün seviye rollerinde sunucu genelinde **takma ad değiştirme** açıktır. Üyede
yalnız en yüksek kademenin rolü kalır; izinler bu yüzden kümülatif yazılır.
Roller `Okçu Maymun`'un hemen üstüne, YouTube üyelik rollerinin altına dizilir;
üyelerin turuncu rengi ve ayrı listesi korunur.

Bot rolü her XP kazanımında eşitler: fark yoksa Discord'a istek atmaz, rolü elle
alınan veya kurulumdan önce seviye almış üye bir sonraki mesajında düzelir. Yeni
kademeye geçen üyenin seviye duyurusuna `🏅 Yeni rol` satırı eklenir.
`/seviye bilgi` kartı mevcut rolü ve sıradakine kalan XP'yi gösterir. Rol
kimlikleri `seviye.rol.<seviye>` ayarlarında durur; `/ayar` ile değiştirilebilir.
Simyacı Maymun'un "özel renk/rol isteme" hakkı yetkililerce elle verilir.

> Sunucuda seviye/ekonomi yapan başka bot (ProBot, carl-bot, UnbelievaBoat)
> varsa çakışmaması için onların seviye modülünü kapatın. Botun kendi para
> sistemi (muz) aşağıda; UnbelievaBoat'un bakiyesiyle ayrı tutulur.

### Ekonomi (muz) ve kumar

> **2026-10-21'den beri ekonomi yalnız Activity arayüzünden oynanır.** Aşağıdaki
> oyuncu komutları seçeneksiz kayıtlıdır; hangisi yazılırsa arayüzü ilgili ekranda
> başlatır (`/kumar` → Kumarhane, `/kasa` → Envanter → Kasalar). `/ekonomi-yonet`,
> `/ekonomi-etkinlik`, `/ekonomi-panel` kaydedilmez; işlerini arayüzün Yönetim ekranı
> yapar. Eski işleyiciler `app/commands/ekonomi/` içinde durur; bir komutu geri açmak
> için `app/lib/arayuz-komut.js` listesinden çıkarıp `npm run deploy` yeter. Aşağıdaki
> tablo eski komutların (ve arayüzdeki karşılıklarının) davranışını anlatır.

Varsayılan kapalı; açmak için:

```
/ayar sistem sistem:"Ekonomi (muz) ve kumar" acik:Evet
```

| Komut | Ne yapar |
| --- | --- |
| `/gunluk` | Günlük ödül: 200–400 + seri bonusu + 🎁 Günlük Kasa; her 7. gün 2x + Ahşap Kasa. Türkiye gece yarısı sıfırlanır |
| `/cuzdan [uye]` | Bakiye, sıra, seri; kendi cüzdanında bugün kalan gönderim limiti |
| `/gonder uye miktar` | Vergili transfer (varsayılan %5); günlük limit 2.000 + 500 × seviye |
| `/zenginler [tur]` | İlk 10: muz, toplam servet, seviye, koleksiyon, seri, prestij ya da haftalık kumar kazancı |
| `/gorev` | Günde 3, haftada 2 görev; ödül kendiliğinden, 3 günlüğü bitirene Ahşap Kasa |
| `/takas teklif` | Kart/kasa/muz takası; kabul anında tek işlemde, muz `/gonder` kurallarına tabi; yönetici ile üye arasında kapalı |
| `/duello uye bahis oyun` | Zar, yazı-tura, at yarışı (GIF'li) ya da XOX (sırayla, düğmelerle) ile muz bahsi; kazanandan %5 kasa payı |
| `/profil [uye]` | Seviye, muz, koleksiyon, en iyi kartlar ve rozetlerle görsel profil kartı |
| `/envanter setler\|set-odul` | Temalı ve nadirlik setlerini tamamlayana bir kerelik ödül |
| `/ekonomi-etkinlik baslat\|durum\|bitir` | (Yönetici) 2x muz, 2x XP, kasa indirimi, üst sınıf seviye kasası; `durum` son 10 etkinliği de gösterir |
| `/calis [meslek] [maymun] [bilgi]` | Asıl gelir: 15 sn'de bir çalış, enerji (100, boştan 1 saatte dolar) yettikçe; meslek seviyeyle açılır (çalışma başına 16–120 muz + küçük kasa şansı). %12 ihtimalle olay çıkar (usta yardımı, muz molası, düğmeli MOAB / Altın Balon). `maymun`: envanterdeki kule/kahramanı kilitle; OwO direnci yorgunluğu azaltır, maymun çalıştıkça seviye atlar. Rozetler kazanca kalıcı % ekler. Enerji bitince mağazadan ⚡ Enerji Totemi (200 muz, günde 40) |
| `/maymun liste` · `yukselt <maymun> [yol]` · `sefer <maymun> <sure>` · `topla` · `geri <sefer>` | Maymunlar: BTD6 gibi üç yükseltme yolu (Kazanç, Dayanıklılık, Şans; 5-2-0, muz + maymun seviyesi ister; `yol` boşsa yollar gösterilir). Sefer: maymun 1/4/8 saat gider, dönünce muz + XP + kasa şansı getirir (aynı anda Sv 0'da 1, Sv 10'da 2, Sv 25'te 3 sefer); `geri` ödülsüz geri çağırır. Activity: Maymunlar ekranı |
| `/piyango bilet\|durum` | Bilet 500 muz (haftada 20); Pazar 21:00 çekiliş, kazanan havuzu alır |
| `/basarim [uye]` | 30 başarım, ilk kez sağlanınca bir kerelik ödül |
| `/envanter birlestir kart [adet]` | 5 aynı kart → bir üst nadirlikten 1 kart; ✨ parlak kartlar %1 çıkar, 5 kat değerli |
| `/ekonomi-panel ozet\|kullanici` | (Yönetici) basılan / yok edilen muz, enflasyon, kumar oyunlarının geri ödemesi, dönemdeki etkinlikler, üye hareketleri; varsayılan yöneticiler hariç |
| `/hisse liste\|grafik\|al\|sat\|portfoy` | 6 BTD şirketi, saatlik fiyat; `liste` resimli borsa panosu, `grafik` 48 saatlik grafik; %1 komisyon. Elindeki hisseye haber gelince Activity pencere ve sesle bildirir |
| `/kredi al\|ode\|durum` | Sv 3'ten itibaren, seviyeye bağlı faizli borç (3g %25, 7g %60, 14g %130); vadesi geçerse gelirin %50'si borca gider, kumar/gönderme kapanır |
| `/boss saldir\|durum\|cagir` | Cumartesi 20:00 boss; saatte bir saldır (can son bossların katılımına göre), yenersen muz + kasa; `cagir` yalnız Yönetici. Activity boss gelince, yenilince (ödülün) ve kaçınca (teselli) pencere ve sesle bildirir |
| `/prestij bilgi\|yap` | Emek gelirin eşiğe (100K, 200K…) ulaşınca ekonomi ilerlemeni sıfırla; kalıcı +%20 muz kazancı (çiftlik dahil) ve ödül kasası al, çiftlikler muza çevrilir (en çok 10) |

**Ekonomi kanalları (2026-10-10 açıldı):** `#006・Ekonomi` kategorisinde
`・👹・boss-savaşı` (`boss.kanal`), `・📈・borsa` (`hisse.kanal`) ve
`・🎟️・piyango` (`piyango.kanal`). Üyeler görür ve tepki bırakır, yazamaz;
yalnız bot yazar (boss butonu ve slash komutları çalışır).

Piyango sonucu için kanal: `/ayar ayarla anahtar:piyango.kanal kanal:#…`.
Boss kanalı (ayarlanmazsa boss çıkmaz): `/ayar ayarla anahtar:boss.kanal kanal:#…`.
Borsa haberleri kanalı (isteğe bağlı): `/ayar ayarla anahtar:hisse.kanal kanal:#…`.
Ekonomi komutlarını kanallara sınırlamak: `/ayar kanal-ekle anahtar:ekonomi.kanallar kanal:#…`
(çıkarmak `kanal-cikar`, kaldırmak `/ayar sifirla anahtar:ekonomi.kanallar`).
| `/banka yatir\|durum\|boz` | Vadeli mevduat: 1g %4, 3g %14, 7g %40, 14g %100; aynı anda 5 mevduat; tavan 20.000 + 5.000 × seviye; erken bozma %10 ceza |
| `/kumar slot\|yazitura\|zar\|rulet\|at\|mines\|blackjack bahis` | Bahis 10 – seviye tavanı (1.000 + 500 × seviye, en çok `ekonomi.maksBahis`); `500`, `2.5k`, `yarı`, `hepsi` yazılabilir |
| `/magaza liste\|al` | Kasalar (1–10 adet), takviyeler (XP İksiri, Muz Çiftliği, Seri Koruyucu), BTD balon rozetleri ve roller |
| `/kasa ac kasa [adet]` | Envanterdeki kasayı hareketli açar (Ahşap / Demir / Altın / Elmas); `/kasa bilgi` olasılıkları ve garanti sayacını gösterir (Ahşap 20 açılışta Destansı, Altın 10 açılışta Efsanevi garanti) |
| `/envanter goster\|kartlar\|sat\|kopyalari-sat\|hediye` | Kasalar, 63 BTD kartı koleksiyonu, kart satışı, kasa/kart hediyesi (günde 10; yönetici ile üye arasında kapalı) |
| `/magaza renk #hex` | Kendine özel renkli rol (25.000; renk değişimi 2.500) |
| `/magaza ekle\|kaldir` | (Sunucuyu Yönet) rolü satışa koyar, fiyat değiştirir, kaldırır |
| `/ekonomi-yonet ver\|al\|sifirla` | (Yalnız **Yönetici**) `ver`: yazılan miktar kimseden kesilmeden üyeye eklenir; `al` / `sifirla` bakiye düzeltir. Hepsi deftere yazılır |

Sohbet eden üye dakikada bir 1–4 muz, seviye atlayan seviye × 100 muz ve bir
kasa alır (seviye duyurusuna eklenir); günlük serinin her 7. günü Ahşap Kasa verir. Ayarlar:

| Anahtar | Varsayılan | Anlamı |
| --- | --- | --- |
| `ekonomi.maksBahis` | 25.000 | Tek bahiste en çok muz (seviye tavanının üst sınırı) |
| `ekonomi.vergiYuzde` | 5 | Transfer vergisi (%) |
| `ekonomi.seviyeOdulu` | 100 | Seviye atlama ödülü çarpanı (0 = kapalı) |
| `ekonomi.mesajOdulu` | açık | Sohbet mesajına muz |
| `ekonomi.akisKanal` | yok | Öne çıkanlar kanalı (2026-10-21'den beri `・🤖・komutlar`) |
| `ekonomi.akisEsik` | 2.000 | Öne çıkanlara düşen en küçük net kazanç/kayıp |

**Öne çıkanlar (2026-10-21):** Ekonomi Activity'ye taşınınca oyunlar kanalda
görünmez olmuştu. Şimdi şunlar `ekonomi.akisKanal`a kısa bir embed olarak
düşer (`app/lib/akis.js`, `app/web/akis.js`, `GET /api/akis`). Activity'de her
ekranda CSGOCases tarzı bir "Canlı" barı var: genişte sağda dikey, darda
başlığın altında yatay. Kasadan düşen **her şey** (sıradan kart, muz dahil) ve
aşağıdaki kumar olayları karo olarak görünür: görsel, eşya adı, çıkaranın adı;
üzerine gelince kasa ve zaman. Yeni karolar 1,2 sn arayla tek tek üstten girer.
Kanala ise yalnız şunlar gider:

- Kumar: net kazanç ya da kayıp en az `ekonomi.akisEsik`; ×10 ve üstü çarpanda
  eşiğin onda biri yeter. Mines'ta mayına basınca kaç kare açıldığı da yazılır.
- Kasa: destansı ve üstü kart, her parlak kart ve rozet.
- Aynı kişinin kumar duyuruları kanala en çok dakikada bir gider (şeride hepsi
  düşer); kasa duyuruları sınırsız.
- Animasyonlu sonuçlar (tek kasa, slot, rulet, at, zar, yazı-tura) 7 sn,
  blackjack 3 sn bekletilir: kanal ve şerit sonucu oyuncudan önce ele vermez.
- Son 60 kayıt bellekte tutulur; bot yeniden başlayınca bar boşalır.
- Eşik 2.000 (2026-10-21): önceki haftada bahislerin ortancası 80, %90'ı
  1.234 muzun altındaydı; 2.000 günde ~16 olay (14 kişi), kanala ~8 duyuru
  verir. 10.000 günde 4–5 olayda kalıyordu.

Kapatmak: `/ayar sifirla anahtar:ekonomi.akisKanal` (şerit yine çalışır).

Rozet rolleri (her rozet bir `🎈 …` rolü, seviye rollerinin üstünde):

```
npm run rozetrol              # app/ içinde: rolleri açar, sıralar, ayarlara yazar, sahiplere dağıtır
npm run rozetrol -- --dene    # hiçbir şey yazmadan yapılacakları listeler
```

Para simgesi botun uygulama emojisi `:muz:` (BTD6 oyun içi para simgesi,
`app/varliklar/para.png`). Yüklemek / görseli değiştirdikten sonra yenilemek:

```
npm run muzemoji              # app/ içinde: yoksa yükler, varsa dokunmaz
npm run muzemoji -- --yenile  # silip dosyadaki görselle yeniden yükler (sonra servisi yeniden başlat)
```

Mağazanın rol verebilmesi için botun rolü, satılan rollerin üstünde olmalı ve
botta **Rolleri Yönet** yetkisi bulunmalı. Oran tabloları, eşya fiyatları ve gerekçeleri
`docs/para.md` içinde.

### YouTube üyelik (Katıl)

Üyelik rolünü bot değil, Discord'un YouTube entegrasyonu verir ve üyelik
bitince geri alır. Sunucu sahibi *Sunucu Ayarları → Entegrasyonlar → YouTube*
ile kanalı bağlar; her üyelik seviyesi için bir rol oluşur. Bot bu rolleri
entegrasyon etiketinden tanır, rol ayarı gerekmez.

```
npm run uyelik        # app/ içinde: kanalları açar veya izinlerini yeniler
```

Betik `#005・YouTube Üyeleri` kategorisini (üye-bilgi, üye-sohbet, üye-anket,
üye-istekleri, 🔊 Üye Sohbet), herkese açık `・🔓・nasıl-üye-olunur` kanalını ve
Moderator altında `・🎟️・üyelik-log` kanalını açar; `uyelik.logKanal` ayarını
yazar ve `uyelik` sistemini açar. `Okçu Maymun` ses kanalını görür ama
katılamaz. Entegrasyon rolü oluşmadan çalıştırılırsa kanallar yalnız yetkililere
açık kalır; rol oluşunca betiği **yeniden çalıştırın**.

- Üyelik başlayınca, bitince, seviye değişince veya üye sunucudan çıkınca log
  kanalına embed düşer (`GuildMembers` intent'i gerekir).
- Üyeler mesaj başına `uyelik.xpBonusYuzde` kadar fazla XP alır (varsayılan 50).
- Her Katıl kademesi ayrı muz bonusu verir (`uyelik.kademe.<n>.rol` +
  `uyelik.kademe.<n>.muzBonusYuzde`; varsayılan %10/%20/%35/%50/%75/%100).
  Betik boş kademe rollerini doldurur. Tablo: `docs/para.md`.
- Katıl üyesi kumarda günlük iade alır: günün net zararının %10'u, en çok
  günün toplam bahsinin %1'i (ayrıntı `docs/para.md`, "Katıl cashback").

### Özel ses odası

```
npm run ozelses       # app/ içinde: ➕ Oda Oluştur kanalını açar, ayara bağlar, sistemi açar
```

`#002・Voice Chats` kategorisinin en üstündeki `➕ Oda Oluştur` kanalına giren
üyeye aynı kategoride kendi ses odası açılır ve üye oraya taşınır. Odada bot
olmayan kimse kalmayınca oda silinir. Ayrıntılar karar D-OZELSES'te.

- Oda adı `ozelses.ad` şablonundan gelir (varsayılan `🔊 {kullanici}`), kişi
  sınırı `ozelses.limit` (0 = sınırsız).
- Oda kategori izinlerini devralır; üstüne @everyone'a **Mesaj Gönder**,
  **Mesaj Geçmişini Oku** ve **Ses Etkinliğini Kullan** açılır. Bu sunucuda
  @everyone ve üye rollerinde bu yetkiler kapalı, ses kategorisi de açmıyor;
  bunlar olmadan odanın sohbetine kimse yazamıyor, mikrofon yalnız bas-konuş
  ile çalışıyordu. Bot açılışta dolu odaların izinlerini durumlarını koruyarak
  yeniden hesaplar.
- Oda açılınca sohbetine **kontrol paneli** düşer (TempVoice benzeri):
  ✏️ Ad · 👥 Kişi sınırı · 🔒 Kilitle/Aç · 👁️ Gizle/Göster · ✅ İzin ver ·
  ⛔ Engelle (odadaysa çıkarılır) · 👑 Sahipliği al (sahip odada değilken).
  Paneli oda sahibi ve Kanalları Yönet yetkilileri kullanır.
- Ad değişikliği Discord sınırı yüzünden oda başına 10 dakikada en çok 2 kez.
- Kilit/gizlilik/izinli/engelli durumu ayrı tabloda değil, kanal izinlerinde
  tutulur; her işlemde kategori izinleri üzerine yeniden hesaplanır. İzinleri bot
  uygular (botta Rolleri Yönet gerekir); sahibe izin düzenleme yetkisi verilmez.
- Hâlâ odası olan üye tekrar girerse yeni oda açılmaz, kendi odasına götürülür.
- Yalnız botun açtığı ve `ozel_ses_odalari` tablosuna kaydettiği kanallar
  silinir. Bot kapalıyken boşalan odalar açılışta temizlenir.
- `GuildVoiceStates` intent'i gerekir; ayrıcalıklı değil, portalda ayar istemez.

### Yedekleme

```
/yedek al                           # hemen yedek al
/yedek liste                        # mevcut yedekler, boyut, tarih
/ayar ayarla anahtar:yedek.periyotSaat sayi:12
/ayar ayarla anahtar:yedek.saklanan sayi:14
```

**`/yedek` yalnız bot sahibine ve yetkili geliştiricilere açıktır** — Yönetici
yetkisi yetmez (karar `D-SAHIP-KADEMESI-2`). Gerekçe: yedek dosyası bütün sunucu
verisini taşır — talep transkriptleri, uyarı geçmişi, başvurular, XP — ve
yönetici atamak bu verinin tamamını dışarı çıkarma yetkisi vermek anlamına
gelmemeli.

| `.env` değişkeni | Kim |
| --- | --- |
| `authorUserID` | Bot sahibi — tek kimlik |
| `developerUserIDs` | Yetkili geliştiriciler — virgülle ayrılmış, boş bırakılabilir |

İkisi ayrı tutuluyor: sahip tektir ve değişmez, geliştirici listesi projeye kim
dokunuyorsa ona göre değişir. Böylece bir geliştiriciyi çıkarmak sahip kimliğine
dokunmadan yapılabiliyor. Geliştirici listesinde rakam olmayan bir parça varsa
sessizce elenir — bozuk bir satır bütün listeyi geçersiz kılmaz.

Yedeği sahip dışında biri aldığında sunucu günlüğüne kimin aldığı yazılır.

Discord tarafındaki `Administrator` kısıtı ikinci savunma olarak duruyor ama
tek başına yeterli değil: sunucu ayarlarından komut izni tek tek kişiye veya
role açılabiliyor. Asıl kapı çalışma anındaki `authorUserID` kontrolü.

İkisi de boş bırakılırsa komutu **kimse** kullanamaz. Kapalı tarafa düşmek
bilinçli: kimlik eksik diye komutun bütün yöneticilere açılması en kötü sonuç
olurdu.

> Geliştirici eklemek, o kişiye sunucunun bütün verisini dışarı çıkarma
> yetkisi vermektir. Liste kısa tutulmalı.

Yedek, dosya kopyalanarak değil sqlite `VACUUM INTO` ile alınır: bot yazarken
alınan düz kopya, yarım kalmış bir işlemi yakalayıp açılamayan dosya
üretebilir. Yedekler `app/veri/yedekler/` altında `bot-YYYYAAGG-SSDDSS.sqlite`
adıyla tutulur; adlar alfabetik sıralandığında kronolojik sıraya gelir.

Bot her açılışta bir yedek alır (uzun süre kapalı kalıp açıldığında ilk periyodu
beklemeden elde güncel bir kopya olsun diye), sonra `yedek.periyotSaat` aralığıyla
devam eder. `yedek.saklanan` sayısından eski yedekler silinir. Disk dolu veya
izin hatası botu düşürmez: loglanır, sonraki tur yeniden dener.

> Yedekler bot ile **aynı makinede** duruyor. Disk tamamen giderse yedek de
> gider; önemli bir eşik aşılırsa `app/veri/yedekler/` dizinini başka bir yere
> kopyalayan ayrı bir iş kurulmalı.

### Ayar anahtarı seçimi

`/ayar ayarla` ve `/ayar sifirla` içindeki `anahtar`, hazır seçenek listesi
değil **otomatik tamamlamadır** (`lib/ayarlar.js` → `ayarSecenekleri`).
Discord bir seçenekte en çok 25 hazır seçenek taşıyor, anahtar sayısı (şu an
25) o sınıra dayandığı için liste yazdıkça süzülen tamamlamaya taşındı. Yeni
anahtar eklemek artık ne sınır sorunu çıkarıyor ne de komutu yeniden
kaydettiriyor: seçenekler çalışma anında üretiliyor. `npm run deploy` yalnız
komutun/alt komutun kendisi değişince gerekir.

## Güncelleme notları (her commit)

Her commit'ten sonra git `post-commit` kancası (`.git/hooks/post-commit`,
depoya girmez) `app/scripts/guncelleme-notu.js`'i arka planda çalıştırır:
commit konusu ve açıklaması `・💵・güncelleme-notları` kanalına #duyuru'daki
ekonomi duyurusu biçiminde yazılır (2026-10-23): yeni not **🍌 Ekonomi
Bildirimi** rolünü etiketler; her commit `## 🍌 konu` başlığı, gövde ve altta
küçük `commit · tarih saat` satırıdır. Gövdede imza satırları atılır, 72
sütunda kırılmış satırlar birleştirilir; `-` maddeleri `•` olur, emojiyle
başlayan satır (`🏦 **Mevduat:** …`) yeni satır açar, `**kalın**` olduğu gibi
kalır. Botun bu kanalda son **6 saat** içinde açtığı bir not varsa yeni commit
ona eklenir (mesaj düzenlenir, yeniden bildirim gitmez); yoksa ya da mesaj 2000
karakteri aşacaksa yeni not açılır. Aynı commit iki kez yazılmaz. Günlük:
`app/veri/guncelleme-notu.log`. Elle: `node scripts/guncelleme-notu.js
[commit] [--dene]` (`app/` içinden; `--dene` göndermez).

Kancayı yeni bir klonda kurmak için:

```sh
cat > .git/hooks/post-commit <<'KANCA'
#!/bin/sh
cd "$(git rev-parse --show-toplevel)/app" || exit 0
nohup node scripts/guncelleme-notu.js "$(git rev-parse HEAD)" >> veri/guncelleme-notu.log 2>&1 &
exit 0
KANCA
chmod +x .git/hooks/post-commit
```

## Kurulum sırası (önerilen)

1. `/ayar ayarla anahtar:log.kanal kanal:#log` → `/ayar sistem sistem:Log sistemi acik:Evet`
2. `/ayar ayarla anahtar:basvuru.kanal kanal:#başvurular` ve `basvuru.rol`
3. `/automod kur sablon:Spam filtresi` (ve istersen küfür/etiket baskını)
4. `/youtube ekle kanal:UC... hedef:#duyuru herkesi_etiketle:Evet`
   (`herkesi_etiketle: Evet` @everyone değil **🎬 Video Bildirimi** rolünü etiketler, yalnız
   rolü seçenlere bildirim gider; rol sunucuda yoksa etiket atılmaz. Verilmezse bildirim
   etiketsiz gider; `/youtube liste` hangi aboneliğin rolü etiketlediğini gösterir)
5. Intent'leri açtıktan sonra: `karsilama.kanal` + `karsilama` sistemi
6. `npm run kanallar` → Destek kategorisi, panel, transkript ve seviye kanallarını
   açar ve ilgili ayar anahtarlarına bağlar (yeniden çalıştırılabilir: var olan
   kanalı yeniden açmaz)
7. `/talep panel` → talep açma panelini kurar

## Bilinen sınırlar

- **Canlı kabul yapılmadı.** Birim testleri (356) ve komut kaydı doğrulandı, ama
  gerçek ban atma, form doldurma, talep açma, çekilişe katılma ve video bildirimi
  denenmedi. Bu, proje kaydında `T-CANLI-KABUL` görevi olarak açık duruyor;
  `T-TALEP`, `T-CEKILIS` ve `T-SEVIYE` de kısmi kanıtla açık bırakıldı.
- **YouTube kanal kimliği** `UC...` biçiminde girilmeli. `@kullaniciadi`
  tanıtıcıları çözülmüyor; kanal sayfasının kaynağında `channel_id` aranabilir.
- **RSS** son ~15 videoyu verir ve canlı yayın/premiere bilgisi sınırlıdır
  (karar `D-YOUTUBE-RSS`). Bot 5 dakikada bir yoklar; YouTube'un RSS akışı yeni
  yüklemeyi bazen dakikalarca geç gösterir, bildirim bu kadar gecikebilir.
- **Toplu silme** 14 günden eski mesajları silemez — Discord sınırı.
- **Para/ekonomi** kapsam dışı; yalnız seviye/XP yazıldı (gerekçe:
  `docs/ekonomi.md`). UnbelievaBoat 2026-10-20'de sunucudan çıkarıldı;
  bakiyesi devralınmadı (sahibin kararı).
- **Yedekler bot ile aynı makinede.** Disk giderse yedek de gider; dış kopya
  ayrıca kurulmalı.
- **Çekiliş bitişi** en çok 15 saniye gecikebilir: çekiliş başına zamanlayıcı
  yerine tek periyodik tarama kullanılıyor (aynı kod yeniden başlatma
  kurtarmasını da yapıyor).
- **Makine saati** ölçüldüğünde Discord'dan ~6 saniye gerideydi. `/ping` bundan
  etkilenmiyor (iki Discord zaman damgası kullanılıyor) ama zamanlı işler için
  saati eşitlemek iyi olur.

## Proje kaydı

Alan modeli, kararlar ve görevler `.project/` altında (yalnız özel geliştirme deposunda; açık kaynak kopyada yer almaz):

```sh
py -3 .project/scripts/project.py context .    # görev durumu, hazır işler
py -3 .project/scripts/project.py ontology .   # türler, kayıtlar, ilişkiler
```

Kod değiştiğinde bağlı görevler kendiliğinden "yeniden incelenmeli" durumuna
düşer; `check` bunu `stale evidence` ve `domain file changed` olarak bildirir.

### Bota gelen DM'ler

Bota DM atan herkesin mesajı `#004・Moderator / ・📨・bot-dm` kanalına
(`dm.logKanal`) aktarılır: kimden geldiği (tıklanabilir etiket, bildirimsiz),
içerik, ekler (ilk resim gömüde görünür) ve kullanıcı kimliği. Kanal yalnız
yetkililere açıktır. `DirectMessages` intent'i ayrıcalıklı değildir, DM
içeriği `MessageContent` olmadan da gelir. Geçmiş DM'ler `npm run dmgecmis`
ile aktarılır (`--dene` yalnız sayar); Discord DM listesi vermediği için
betik sunucudaki üyelerin DM kanallarını tarar, sunucudan ayrılmış birinin
DM'i bulunamaz. 2026-10-10'da 200 üye tarandı, 2 kişiden 4 DM aktarıldı.
**Yanıtlama:** bot-dm kanalında bir aktarım mesajına Discord'un "Yanıtla"
özelliğiyle cevap yazılırsa bot metni (ve ekleri) o kullanıcıya DM olarak
gönderir; başarıda yanıta ✅, başarısızlıkta ❌ ve nedeni yazılır (ör. DM'leri
kapalı). `//` ile başlayan yanıtlar iletilmez, yetkililer kendi aralarında not
düşebilir. Kullanıcı kimliği aktarım gömüsünün altlığından okunur
(`events/dm-yanit.js`; `MessageContent` intent'i gerekir).

