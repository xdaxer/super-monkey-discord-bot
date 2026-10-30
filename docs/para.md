# Para (muz) ekonomisi tasarımı

Bu belge `T-EKONOMI`, `T-MAGAZA-ESYA`, `T-KASA`, `T-BANKA`, `T-EKONOMI-GENISLEME`
`T-EKONOMI-GENISLEME-2` ve `T-EKONOMI-GENISLEME-3` görevlerinin (`D-EKONOMI-PARA`,
`D-MAGAZA-ESYALARI-2`, `D-BANKA`, `D-EKONOMI-GENISLEME`, `D-EKONOMI-GENISLEME-2`,
`D-EKONOMI-GENISLEME-3`) tasarımıdır. Sayılar `app/lib/ekonomi.js`, `kumar.js`,
`blackjack.js`, `mines.js`, `kumar-cashback.js`, `xox.js`, `esyalar.js`, `kasalar.js`, `banka.js`, `gorevler.js`, `setler.js`, `siralamalar.js`, `takas.js`, `duello.js`, `etkinlik.js`, `kasa-gif.js`, `kumar-gif.js`, `birlestirme.js`, `meslekler.js`, `piyango.js`, `basarimlar.js`, `ekonomi-panel.js`, `hisse.js`, `kredi.js`, `boss.js`, `maymun.js`, `pazar.js` ve `prestij.js` ile birebir aynı olmak zorundadır; biri
değişirse diğeri de değişmeli. Seviye/XP tasarımı [ekonomi.md](ekonomi.md).

Birim **muz** (🍌): sunucunun BTD teması (Muz Çiftliği, maymun rolleri) ile
uyumlu. OwO'dan esinlenildi ama birebir değil: hayvan/zoo, silah, gem ve
huntbot yok; yerine rol mağazası var. Bütün sayılar sunucu başına ayrı tutulur.

Para simgesi botun **uygulama emojisi** `:muz:`: BTD6'nın oyun içi para
simgesi (iki altın para; Bloons wiki `File:BTD6 CoinIcon.png`, kare yapılmış
hali `app/varliklar/para.png`). `npm run muzemoji` ile yüklenir; sunucunun
emoji slotunu harcamaz. Bot açılışta emojiyi adıyla bulur,
bulamazsa 🍌 kullanır. Discord embed başlığında, alan adında ve alt bilgide
özel emoji göstermediği için tutarlar yalnız mesaj, açıklama ve alan değerinde
yazılır.

## Kazanma

| Kaynak | Kural |
| --- | --- |
| `/gunluk` | 200–400 rastgele taban + seri bonusu (seri günü başına +30, en çok +1.500) |
| Seri | Ardışık Türkiye günlerinde artar; bir gün atlanırsa 1'e döner |
| Günlük kasa | Her `/gunluk` ile bir 🎁 **Günlük Kasa** (satılmaz, hediye edilemez) |
| Haftalık katlama | Serinin her 7. gününde ödülün tamamı **2x** + 📦 Ahşap Kasa |
| Sohbet | Mesaj başına 1–4 muz, kişi başı 60 sn bekleme (XP ile aynı mesaj kuralı) |
| `/calis` | 15 sn'de bir, enerjiyle; mesleğe göre çalışma başına 16–120 muz + kasa ve olay şansı (aşağıda) |
| `/maymun sefer` | maymun 1/4/8 saat sefere gider, dönünce muz + XP + kasa şansı (aşağıda) |
| Seviye atlama | Yeni seviye × `ekonomi.seviyeOdulu` muz (varsayılan 100; Sv 10 → 1.000) + seviyeye göre bir kasa |

Günlük ödül ve transfer limiti **Türkiye gece yarısı** (UTC+3) sıfırlanır.
Envanterde bugünküler dışında açılmamış kasa varsa `/gunluk` yanıtı ve
Activity Cüzdan ekranı hatırlatır.
Seri bonusu 51. günde tavana ulaşır; en yüksek sıradan gün 1.900, 7'nin
katı olan günde 3.800 muz verir. Sohbet ödülü `ekonomi.mesajOdulu` ile
kapatılabilir; seviye ödülü yalnız `seviye` sistemi de açıksa işler.

## Transfer (`/gonder`)

| Kural | Değer |
| --- | --- |
| En az | 10 muz |
| Vergi | `ekonomi.vergiYuzde` (varsayılan %5, aşağı yuvarlanır); gönderen tamamını öder, alıcı net tutarı alır |
| Günlük gönderim limiti | 2.000 + 500 × seviye (Sv 0: 2.000, Sv 10: 7.000) |
| Yasak | Kendine ve botlara gönderim |

Limit, `ekonomi_hareketleri` defterindeki o günkü `gonder` kayıtlarından
hesaplanır. Vergi muzu yok eder (para çıkışı); alt hesaplarla muz toplamayı
pahalılaştırır.

## Kumar (`/kumar`)

Bahis en az **10**, en çok **seviye tavanı**: `1.000 + 500 × seviye`, üstten
`ekonomi.maksBahis` (varsayılan **25.000**) ile sınırlı (Sv 0: 1.000, Sv 10:
6.000, Sv 20: 11.000, Sv 48+: 25.000). Düelloda iki tarafın tavanının küçüğü
geçerlidir. Tutar `500`, `10.000`, `2.5k`, `3 bin`, `yarı`, `hepsi` biçiminde
yazılabilir; `hepsi`/`yarı` sınırı aşarsa sınırdan oynanır. Kişi başı iki
bahis arası en az 3 saniye. Çarpanlar bahis dahil toplam geri ödemedir ve
aşağı yuvarlanır.

**Denge (2026-10-10):** ekonomi sıfırlamasından sonraki ~19 saatte 5,9 milyon
muz kumara yatırıldı; aynı sürede bütün emek gelirleri (günlük, sohbet,
çalışma, görev, seviye) ~130 bin. Tek bahis 25.000'e kadar çıkabildiği için
bakiyeler emekle değil yazı-turayla belirleniyordu, en çok oynayan üye 15 kez
kredi çekip kumara yatırdı. Bu yüzden: bahis tavanı seviyeye bağlandı (tek
bahis birkaç günlük gelir), kasa payı ~%5'e çıkarıldı (kumar gerçek muz
çıkışı olsun), görev/başarım sayımına en az
100 muzluk bahis şartı kondu.

| Oyun | Kural | Ödeme | Beklenen geri ödeme |
| --- | --- | --- | ---: |
| Slot | 3 makara, ağırlıklı semboller | aşağıdaki tablo | %95,20 |
| Yazı-tura | Yazı/tura seç | bilirsen 1,9x | %95,00 |
| Zar | Sen 2 zar, kasa 2 zar; büyük toplam kazanır | kazanç 2x, beraberlik 0,5x | %94,37 |
| Rulet | Tek sıfırlı (0–36); 0 renk ve tek/çift bahsini kaybettirir | kırmızı/siyah/tek/çift 1,95x, sayı 35x | %94,86 / %94,59 |
| At yarışı | 5 at; seçtiğin at kazanırsa öder | ata göre (aşağıdaki tablo) | %94,50–95,20 |
| Mines | 9 kare (3×3), 1–8 mayın; kare aç, istediğin an çek | adil oranın %95'i, **en çok 9x** | ≤%95,00 (her stratejide) |
| Blackjack | Kart çek / dur / ikiye katla / böl; kurpiyer 17'de durur | blackjack 2,2x (6:5), kazanç 2x, beraberlik 1x | ≈%97–98 (temel stratejiyle; hesaplanmadı) |

Slot sembolleri (her makarada ağırlık; toplam 100):

| Sembol | Ağırlık | Üçlü | İkili (herhangi iki makara) |
| --- | ---: | ---: | ---: |
| 🍒 | 30 | 5x | 0,5x |
| 🍋 | 25 | 8x | 1x |
| 🍇 | 20 | 12x | 1,4x |
| 🍉 | 13 | 20x | 2x |
| 🔔 | 8 | 40x | 3x |
| 💎 | 3 | 150x | 5x |
| 🍌 | 1 | 777x | 10x |

Beklenen geri ödemeler testte (`test/ekonomi.test.js`) bütün sonuçlar
üzerinden tam hesaplanır; hepsi 1'in altında, yani kasa uzun vadede kazanır ve
kumar muz enflasyonunu emer.

**Katıl cashback (`lib/kumar-cashback.js`):** Katıl kademesi olan üye
(üyelik sistemi açıkken) slot, yazı-tura, zar, rulet, at, mines ve
blackjack'te (düello hariç) günlük iade alır:

> iade = en az(**günün net kumar zararı × %10**, **günün toplam bahsi × %1**)

Aşağı yuvarlanır; zarar yoksa iade yok. Örnek: tek 10.000'lik bahsi kaybeden
100 alır (1.000 değil); 50.000 çevirip 1.000 kaybeden 100 alır.

- Her oyun sonuçlanınca günün hakkı yeniden hesaplanır. Kayıpla biten oyunda
  eksik iade ödenir; kazançla biten oyunda hak küçüldüyse fazlası kazançtan
  geri alınır (en çok o kazancın %10'u). Günlük toplam iade hakkı aşmaz.
- **Neden %1 tavan:** tek tek kayıplara iade verilseydi yazı-tura/rulette
  geri ödeme %100'ü geçerdi. Yalnız net zarara %10 vermek de yetmez: günde
  tek büyük, çoğu zaman kaybettiren bahis (rulet sayı, çok mayınlı mines)
  oynayan çoğu gün %10 geri alır, ara sıra büyük kazanır ve %5 kasa payında
  kâr ederdi. %1 her oyunun kasa payının altında; hiçbir strateji iadeyle kâr
  etmez.
- Süren mines/blackjack bahsi ne zarara ne toplam bahse sayılır; gece
  yarısını geçen oyunun bahsi ertesi güne girmez.
- Defterde tür `cashback`; panelde ve haftalık kumar sıralamasında kumar
  sonucuna sayılır.

At yarışı (kazanma şansı toplam 100; her at için beklenen geri ödeme):

| At | Şans | Çarpan | Beklenen |
| --- | ---: | ---: | ---: |
| 1 Karayel | %35 | 2,7x | %94,50 |
| 2 Şimşek | %25 | 3,8x | %95,00 |
| 3 Fırtına | %20 | 4,75x | %95,00 |
| 4 Tayfun | %12 | 7,9x | %94,80 |
| 5 Yıldız | %8 | 11,9x | %95,20 |

**Hareketli slot, rulet ve at yarışı (GIF):** bahis önce tek işlemde sonuçlanıp yazılır,
ilk yanıt ("dönüyor...") hemen gider; ardından ~3 sn'lik bir GIF oynar
(`lib/kumar-gif.js`). Slotta üç makara soldan sağa sırayla durur, ortadaki
satır kazanç çizgisidir; eşleşen makaralar altın, kayıpta kırmızı çerçevelenir.
Rulette Avrupa çarkının sayı dizilimi kasa şeridi gibi kayar ve çıkan sayıda
durur. At yarışında beş kulvarda atlar dalgalı hızla koşar (önde giden
değişebilir); kazanan bitişe ilk varır ve kulvarı parlar. GIF bitince mesaj sonuç gömüsüne döner, görsel olarak son kare (PNG)
kalır. Canvas yoksa, üretim hata verirse ya da 8 sn'yi aşarsa düz sonuç
gömüsü gösterilir. Yazı-tura, zar ve blackjack animasyonsuzdur.

**Mines ayrıntıları (`/kumar mines bahis [mayin]`):** 3×3 = 9 kare, mayın
sayısı 1–8 (varsayılan 2). Bahis başta düşülür, mayın yerleri başta belirlenip
`mines_oyunlari` tablosunda tutulur. k güvenli kare açıldıktan sonraki çarpan
`0,95 × Π (9−i)/(9−m−i)` (i = 0…k−1), 2 basamağa aşağı yuvarlanır ve
**9x'i geçmez** (`MINES_MAKS_CARPAN`); hangi anda çekilirse çekilsin beklenen
geri ödeme %95'i aşmaz (tavan yalnız düşürür). Tavansız en yüksek çarpan 119,7x
idi (4–5 mayın, bütün kareler); kullanıcı "abartı, 9x'i geçmesin" dediği için
2026-10-22'de sınırlandı.

| Mayın | Çarpanlar (1. kareden itibaren) | Oyun biter |
| ---: | --- | ---: |
| 1 | 1,06 · 1,22 · 1,42 · 1,71 · 2,13 · 2,85 · 4,27 · 8,55 | 8. kare (hepsi) |
| 2 | 1,22 · 1,62 · 2,28 · 3,42 · 5,7 · **9** | 6. kare |
| 3 | 1,42 · 2,28 · 3,99 · 7,98 · **9** | 5. kare |
| 4 | 1,71 · 3,42 · 7,98 · **9** | 4. kare |
| 5 | 2,13 · 5,7 · **9** | 3. kare |
| 6 | 2,85 · **9** | 2. kare |
| 7 | 4,27 · **9** | 2. kare |
| 8 | 8,55 | 1. kare (hepsi) |

Mayına basan bahsi kaybeder; çekmek için en az bir kare açık olmalı. Çarpan
9x'e varınca ya da bütün güvenli kareler açılınca oyun kendiliğinden çekilir. Düğmelere yalnız sahibi
basabilir; kişi başı tek oyun. 5 dakikadan eski oyun, sahibi yenisini açınca
kendiliğinden çekilir (hiç kare açılmadıysa bahis iade). Bot yeniden başlarsa
yarım kalan oyunların bahsi iade edilir. Süren mines oyunu (ve XOX düellosu)
prestiji engeller.

Ödeme her oyunda `bahis × çarpan` aşağı yuvarlanır; kayan nokta hatası için
küçük bir pay eklenir (100 × 4,85 = 485, 484 değil).

**Blackjack ayrıntıları:** bahis el açılınca düşülür; el `blackjack_oyunlari`
tablosunda tutulur. Butonlara yalnız eli açan basabilir. 5 dakikadan eski bir
el, sahibi yeni el açmak isteyince kendiliğinden "dur"ulur. Bot yeniden
başlarsa yarım kalan bütün ellerin bahsi iade edilir. İkiye katlama yalnız ilk
iki kartla ve bakiye yetiyorsa yapılır.

**Bölme (2026-10-23, kullanıcı isteğiyle):** ilk iki kart aynı değerdeyse (10,
J, Q, K hepsi 10 sayılır) ve bakiye yetiyorsa el **bir kez** bölünür: aynı
bahis ikinci ele de düşülür, iki ele birer kart dağıtılır, eller sırayla
oynanır (21'e varan el kendiliğinden durur). Bölünmüş elde ikiye katlanabilir.
Bölünen asa tek kart gelir ve iki el de durur. Bölünmüş eldeki 21 blackjack
değildir (2x öder). Kurpiyer iki el bitince bir kez oynar (ikisi de patladıysa
oynamaz); her el kendi bahsiyle ödenir, defterde tek `kazanc` kaydı, cashback
ve görev toplam nete göre. Tabloda bölünmüş el `oyuncu` sütununda
`{eller, aktif}`, `bahis` sütununda toplam bahis olarak durur (açılış iadesi
toplamı geri verir). Bölme oyuncunun beklentisini ~%0,5 artırır.

## Mağaza (`/magaza`)

`/magaza liste [kategori]` her şeyi gösterir, `/magaza al urun` (yazarken
öneri çıkar) satın alır. Bütün alımlar tek işlemde: önce sınırlar denetlenir,
sonra muz düşülür, sonra eşya verilir.

### Takviyeler

| Eşya | Fiyat | Etki | Sınır |
| --- | ---: | --- | --- |
| 🧪 XP İksiri | 6.000 | 24 saat mesaj XP'si **2x** (YouTube üye bonusunun üstüne) | Süre birikir, en çok 7 gün |
| 🌴 Muz Çiftliği | 2.500 | 24 saat sohbet muzu **3x** (3–12 muz/dk) | Süre birikir, en çok 7 gün |
| 🛡️ Seri Koruyucu | 3.000 | `/gunluk` kaçırılınca kendiliğinden harcanır, seri sürer | En çok 3 tane |
| ⚡ Enerji Totemi | 200 | `/calis` enerjisini anında 100'e doldurur (alınınca hemen kullanılır, envantere girmez) | Günde 40 (Türkiye günü; 2026-10-26'ya kadar 10, kullanıcı isteğiyle artırıldı); enerji doluyken alınmaz. Fiyat gün içinde sabittir: 2026-10-24'te denenen her alımda ikiye katlanma aynı gün kullanıcı isteğiyle geri alındı |
| 🎨 Özel Renk Rolü | 25.000 | `/magaza renk #hex`: adına renkli rol; renk değişimi 2.500 | Kişi başı bir rol |

- Takviyeler `ekonomi` sistemi açıkken işler. Emojileri sunucudaki BTD
  emojilerinden gelir (`btd_alchemist`, `btd_banana_farm`, `btd_gift`); emoji
  silinirse yedek simge kullanılır.
- Seri koruyucu: kaçırılan **her gün için bir** koruyucu harcanır. Kaçırılan
  gün sayısı kadar koruyucu yoksa hiç harcanmaz ve seri 1'e döner. Çiftliğin
  başabaş noktası: günde ~3 saat sohbet eden üye (≈ 450 muz → 1.350).
- Renk rolü botun en üst rolünün hemen altına konur ki üyenin diğer renkli
  rollerini ezsin; hiçbir yetki taşımaz. Tam siyah (`#000000`) Discord'da
  "renksiz" demek, reddedilir. Rol elle silinirse sonraki alım yeni rol açar
  (ilk alım fiyatı). Discord hata verirse muz iade edilir.

### Kasalar (`/kasa`, `/envanter`)

Kasalar mağazadan (tek seferde 1–10) alınır ya da kazanılır ve **envantere**
girer; `/kasa ac` ile açılır. Tek kasa **hareketli** açılır: mesaj dört kez
düzenlenerek (0,7 / 0,8 / 1,0 / 1,3 sn) dönen bir şerit gösterilir, son karede
ödül ortada durur, sonuç nadirliğin rengiyle ve sunucunun BTD tepki emojisiyle
gösterilir; altında "Bir tane daha aç" butonu (yalnız sahibi basar). Ödül
animasyondan **önce** yazılır, mesaj silinse de kaybolmaz. `adet: 2–10`
animasyonsuz özet verir.

| Kasa | Fiyat | Satılabilir beklenen (garanti dahil) | Eşyalar dahil | Garanti |
| --- | ---: | ---: | ---: | --- |
| 🎁 Günlük | satılmaz | ≈329 muz | — | — |
| 📦 Ahşap | 1.200 | %89,7 (garantisiz %71,4) | %99,6 | 20 açılışta Destansı |
| 🧰 Demir | 4.000 | %86,2 | %94,6 | — |
| 👑 Altın | 12.000 | %89,3 (garantisiz %83,3) | %94,6 | 10 açılışta Efsanevi |
| 💎 Elmas | 30.000 | %85,9 | %87,6 | — |

"Satılabilir" = muz + kartların satış değeri (+ içinden çıkan kasanın değeri),
parlak payı (×1,04) dahil. Hepsi fiyatın altında: kasa açarak muz basılamaz;
kasa şans ve koleksiyon içindir. Seviye ve günlük ödülden gelen kasalar ise bedava.

**Denge (2026-10-24):** 10–24 Ekim defterinde (yöneticiler hariç) 611 kasa
açıldı; Ahşap'ların yalnız %23'ü, Altın'ların %6'sı fiyatını çıkardı, medyan
sonuç fiyatın %36–40'ıydı, 0 mitik ve 4 efsanevi çıktı ("kimse bir şey
çıkaramıyor"). Zar doğruydu (beklenenle uyumlu), tablo cimriydi. Bu yüzden
satın alınan kasaların beklenen değeri %63–72'den %86–90'a çıktı, Altın'daki
%30'luk nadir kart dilimi destansı/efsanevi'ye kaydı, Ahşap ve Altın'a garanti
geldi. Kasaların ~%90'ı bedava geldiği için bedava akış büyümesin diye tek
seviyeler artık Ahşap yerine Günlük Kasa verir.

**Seviye 20 sonrası (2026-10-26):** 20'den sonra seviye atlamak yavaşladığı
halde ödül düzeni aynı kalıyordu (üye talebi). 20'den sonraki tek seviyeler
de Ahşap verir. Etki küçük: 21–29 arasında 4 seviye (21, 23, 27, 29) Günlük
(~329 muz) yerine Ahşap (~816 satılabilir) verir, seviye başına ~490 muz
fazla; o gün 20+ seviyede 6 üye vardı. Demir/Altın/Elmas düzeni değişmedi.

**Garanti (`kasa_garantileri`):** Ahşap'ta üst üste 20, Altın'da 10 açılışta
hedef nadirlik (Ahşap: Destansı, Altın: Efsanevi) ya da üstü kart ya da
rozet çıkmazsa sonuncusu o nadirlikten rastgele bir kart olur (parlak şansı
yine %1). Sayaç kişi ve kasa başınadır, hedef çıkınca sıfırlanır, prestijde
silinmez. Garantiyle gelen kart sonuçta 🎯 **garanti** diye işaretlenir; tek
açılışın sonucu, çoklu açılış özeti, `/kasa bilgi` ve Activity kasa içeriği
"en geç N kasa içinde" sayacını gösterir. Uzun vadede Ahşap'ta ~16,5 açılışta
bir destansı (garantisiz ~50), Altın'da ~5,4 açılışta bir efsanevi+ düşer.
Garanti dahil beklenen `garantiliBeklenen` (`lib/kasalar.js`) ile hesaplanır.

**Hareketli açılış (GIF):** tek kasa açıldığında ödül önce veritabanına
yazılır, ilk yanıt hemen gider; ardından ~3 sn'lik bir GIF oynar (640×180,
~37 kare, ease-out quart yavaşlama, `gifenc@1.0.3` ile ~1 sn'de üretilir,
~400–550 KB, en çok 2 MB): kasanın içeriğinden kart/eşya/muz görselleri
(sunucu emojileri) sağdan sola kayar, yavaşlayarak durur, ortadaki işaretçinin
altında gerçek ödül kalır ve nadirlik renginde parlar. GIF bitince mesaj sonuç
gömüsüne döner ve GIF yerine son kareyi gösteren sabit PNG kalır (Discord
GIF'i döngüye soktuğu için sonuç "hâlâ dönüyor" görünmesin). Görsel
üretilemezse (canvas yok, hata, 8 sn zaman aşımı, 2 MB aşımı) yazılı emoji
şeridi animasyonu kullanılır.

**Kasa kaynakları:** her `/gunluk` ile bir Günlük Kasa; her seviye atlamada bir kasa (25'in katı Elmas, 10'un
katı Altın, 5'in katı Demir, kalan çift seviyeler Ahşap, tek seviyeler Günlük
Kasa, 20. seviyeden sonra tek seviyeler de Ahşap; aynı anda birden çok seviye atlanırsa her biri için); günlük serinin
her 7. gününde bir Ahşap Kasa; mağaza; başka üyenin hediyesi.

İçerikler (‰, toplam 1000):

| Ödül | Günlük | Ahşap | Demir | Altın | Elmas |
| --- | ---: | ---: | ---: | ---: | ---: |
| Muz | 600 (50–250) | 330 (400–1.000) | 220 (1.500–3.500) | 200 (5.000–10.000) | 250 (15.000–30.000) |
| ⚪ Sıradan kart | 320 | 415 | 120 | — | — |
| 🔵 Nadir kart | 60 | 185 | 352 | — | — |
| 🟣 Destansı kart | 2 | 20 | 200 | 570 | 310 |
| 🟡 Efsanevi kart | — | 1 | 30 | 120 | 300 |
| 🔴 Mitik kart | — | — | 2 | 15 | 100 |
| Muz Çiftliği | 10 | 25 | — | — | — |
| Seri Koruyucu | 8 | 20 | 30 | — | — |
| XP İksiri | — | — | 40 | 70 | 10 |
| Altın Balon rozeti | — | — | — | 15 | 30 |
| Üst kasa | — | 4 (Demir) | 6 (Altın) | 10 (Elmas) | — |

Günlük Kasa bilerek zayıf ("dandik"): her gün açmanın küçük keyfi. Hediye
edilemez ki yan hesaplarla toplanıp ana hesaba aktarılmasın.

Takviye sınırdaysa (koruyucu 3, süre 7 gün) yerine mağaza fiyatı kadar muz;
Altın Balon zaten varsa yerine 15.000 muz verilir.

### Koleksiyon kartları

63 kart, hepsi sunucudaki BTD emojileriyle. Aynı kart tekrar çıkabilir
(kopya). Kartlar sabit fiyata satılır; satış muz ekonomisine geri dönüştür.

| Nadirlik | Kartlar | Adet | Satış |
| --- | --- | ---: | ---: |
| ⚪ Sıradan | Temel kuleler (Dart, Bumerang, Bomba, Raptiye, Buz, Yapıştırıcı, Nişancı, Denizaltı, Korsan, As, Heli, Havan, Dartling) | 13 | 400 |
| 🔵 Nadir | Destek/büyü kuleleri + Beyaz, Mor, Zebra, Kurşun balon | 16 | 1.500 |
| 🟣 Destansı | 17 kahraman + Kamuflaj, Yenilenen, Güçlendirilmiş balon | 20 | 6.000 |
| 🟡 Efsanevi | 6 boss + D.D.T. | 7 | 25.000 |
| 🔴 Mitik | 6 elit boss + RGB Balon | 7 | 100.000 |

Kasa açılınca sonucun yanında nadirliğe göre sunucu tepki emojisi çıkar
(`btd_shrug`, `btd_thumbsup`, `btd_cool`, `btd_shock`, `btd_love`).

### Envanter (`/envanter`)

| Alt komut | Ne yapar |
| --- | --- |
| `goster [uye]` | OwO `zoo` düzeni: üstte kasalar/rozetler/stok, her nadirlik bir satır grubu (kart emojisi + ⁰² gibi küçük sayı, sahip olunmayan ❔⁰⁰, satır başına 7), altta **Koleksiyon Puanı** (kartların satış değeri toplamı) ve `M-1, E-2, D-3, N-0, S-5` sayımı |
| `kartlar [nadirlik] [uye]` | Kartlar; sahip olunmayanlar `❔ ???` olarak gizli |
| `sat kart [adet] [tumu]` | Kartı nadirlik fiyatından satar; `tumu` o kartın bütün kopyalarını. Listenin başındaki **🧹 Bütün kartlar** / **Bütün <nadirlik> kartlar** son kopyalar dahil toptan satar; önce adet ve tutarı gösteren onay butonu çıkar (satış onay anındaki envanterle yapılır) |
| `kopyalari-sat` | Her karttan birini bırakıp kopyaları satar |
| `hediye uye esya [adet]` | Kasa (Günlük Kasa hariç) ya da kart hediye eder; günde en çok 10 eşya |

Hediye sınırı alt hesaplarla kasa toplamayı zorlaştırır. Bütün kasa/kart
hareketleri `esya_hareketleri` defterine yazılır (açma, ödül, satış, hediye,
seviye/günlük ödülü, mağaza alımı).

### Rozetler

Koleksiyon eşyası; cüzdanda en değerlisi başta sergilenir. Her rozet bir kez
alınır. Emojiler sunucudaki BTD balon emojileri. Her rozet **`/calis`
kazancına kalıcı bonus** verir (2026-10-22: 12 günde hiç rozet satılmamıştı);
bonuslar toplanır (hepsi %63), prestijde korunur.

| Rozet | Fiyat | Çalışma | Rozet | Fiyat | Çalışma |
| --- | ---: | ---: | --- | ---: | ---: |
| Kırmızı Balon | 1.000 | +%2 | Gökkuşağı Balon | 60.000 | +%5 |
| Mavi Balon | 2.500 | +%2 | Seramik Balon | 100.000 | +%5 |
| Yeşil Balon | 5.000 | +%3 | M.O.A.B. | 250.000 | +%6 |
| Sarı Balon | 10.000 | +%3 | B.F.B. | 500.000 | +%6 |
| Pembe Balon | 20.000 | +%4 | Z.O.M.G. | 1.000.000 | +%8 |
| Siyah Balon | 35.000 | +%4 | B.A.D. | 2.500.000 | +%10 |
| Altın Balon | yalnız Altın/Elmas Kasa'dan | +%5 | | | |

Geri dönüş: günde ~1.300 muz çalışan üye için Kırmızı Balon ~40 günde, Seramik
yıllarda kendini öder; üst rozetler yine muz çıkışıdır.

**Rozet rolleri:** her rozetin bir Discord rolü var (`🎈 Kırmızı Balon` …
`🎈 B.A.D.`, balonun rengiyle, yetkisiz). Rozet mağazadan alınınca ya da
kasadan çıkınca rol de verilir; koleksiyon olduğu için üye sahip olduğu bütün
rozet rollerini taşır. Roller seviye rollerinin hemen üstünde, değerine göre
sıralıdır (en değerli en üstte, rengi görünür). Sunucu Boost seviyesi 1
olduğu için rol ikonu kullanılamıyor (seviye 2 ister). Kurulum:
`npm run rozetrol` (rolleri açar/sıralar, `rozet.rol.<ad>` ayarlarına yazar,
mevcut sahiplere dağıtır; `--dene` yazmaz, ikinci çalıştırma değişiklik yapmaz).

Üst rozetler bilerek çok pahalı: günde ~2.000 muz kazanan aktif üye için
B.A.D. yıllar sürer. Muz ekonomisinin en büyük çıkışı (sink) bunlar.

### Roller

Sunucuyu Yönet yetkilisi `/magaza ekle rol fiyat` ile rolü satışa koyar (en
çok 25 rol). @everyone, bot/entegrasyon rolleri ve botun en üst rolüne eşit ya
da üstündeki roller satılamaz. Alımda önce muz düşülür, sonra rol verilir; rol
verilemezse muz iade edilir. Sahip olunan rol ikinci kez satılmaz. Satıştan
kaldırılan rol, alanlarda kalır.

## Banka (`/banka`)

Vadeli mevduat: muz seçilen süre boyunca kilitlenir, vade dolunca **anapara +
faiz** kendiliğinden hesaba geçer (servis dakikada bir tarar; bot kapalıyken
dolan vadeler açılışta ödenir, `/banka durum` ya da `/cuzdan` açınca da hemen
ödenir).

| Vade | Faiz (vade sonunda bir kez) | 10.000 muz → |
| --- | ---: | ---: |
| 12 saat | %4 | 10.400 |
| 1,5 gün | %14 | 11.400 |
| 3,5 gün | %40 | 14.000 |
| 7 gün | %100 | 20.000 |

2026-10-23'te süreler yarıya indi, oranlar aynı kaldı (önceden 1 / 3 / 7 / 14 gün).
**Açık kredisi olan mevduat açamaz, açık mevduatı olan kredi alamaz:** kısa
vadenin günlük getirisi artık kredinin günlük maliyetini geçebildiği için
kredi çekip bankaya yatırmak kâr bırakmasın.

| Kural | Değer |
| --- | --- |
| En az mevduat | 1.000 |
| Aynı anda en çok | 5 mevduat |
| Kilitlenebilecek toplam anapara | 20.000 + 5.000 × seviye, en çok 500.000 |
| Erken bozma | Faiz yok, anaparadan %10 ceza |

Faiz yeni muz yaratır; tavan bunun enflasyona dönüşmesini sınırlar
(Sv 10 üye en çok 70.000 kilitler, 7 günde 70.000 faiz). Günlük getiri
vadeyle artar ve kısa vadeleri art arda açmak uzun vadeyi geçmez (12sa×3
%12,5 < %14; 36sa+36sa+12sa %35 < %40; 84sa×2 %96 < %100). Kumar her bahiste ~%5 kaybettirir
ama tek elde büyük kazanç sunar; banka riski sıfır, kazancı yavaş ve tavanlı.
Uzun vade daha kârlı ama muz o süre kumar ve mağazada kullanılamaz; erken bozma cezası "yatır-boz" döngüsünü kârsız yapar. Ödeme
koşullu `UPDATE` ile durum değiştirilerek yapılır; aynı mevduat iki kez
ödenemez. Deftere `mevduat` (− yatırma, + anapara dönüşü) ve `faiz` türleriyle
yazılır.

## Görevler (`/gorev`)

Her üyeye her Türkiye günü **3 günlük görev** (bir kolay, bir orta, bir zor),
her hafta (Pazartesi 00:00 TR) **2 haftalık görev** (bir orta, bir zor) düşer.
Seçim üye + dönem tohumlu ve belirlenimlidir: aynı gün aynı görevler gelir,
yeniden başlatma değiştirmez. Ödül görev biter bitmez kendiliğinden verilir
(defterde `gorev`); komut ve buton kancalarında yalnız üyeye görünen bildirim
gelir, sohbetle biten görev sessizdir (`/gorev`'de görünür). Ekonomi kapalıyken
görev ilerlemez. Üç günlük görevi bitirene **bonus Ahşap Kasa**.

| Tür | Ne zaman ilerler |
| --- | --- |
| sohbet ödülü | Sohbet muzu verildiğinde (dakikada en çok bir) |
| `/gunluk` | Günlük ödül alındığında |
| kasa aç | Her açılan kasa |
| kumar / kumar kazan | En az 100 muzluk her bahis / net kârı en az bahsin yarısı olan bahis (blackjack dahil) |
| muz gönder | Gönderilen tutar kadar |
| kart sat | Satılan kart adedi kadar |
| mağaza | Mağazadan her alım |
| yeni kart | Koleksiyona ilk kez giren kart |

| Günlük kademe | Görev | Ödül |
| --- | --- | --- |
| Kolay | 10 sohbet ödülü · `/gunluk` al · 3 kumar · 100 muz gönder | 120 muz |
| Orta | 25 sohbet ödülü · 2 kasa aç · 3 kart sat · mağazadan 1 alım | 220 muz |
| Zor | kumarda 3 kez kâr · 2 yeni kart | Ahşap Kasa |
| Zor | 5 kasa aç · 15 kumar | 350 muz |

| Haftalık | Görev | Ödül |
| --- | --- | --- |
| Orta | 150 sohbet ödülü · 40 kumar | 2.000 muz |
| Orta | 10 kasa aç | Demir Kasa |
| Zor | 7 gün `/gunluk` | 4.500 muz |
| Zor | kumarda 15 kez kâr | 4.000 muz |
| Zor | 6 yeni kart | Altın Kasa |
| Zor | 5.000 muz gönder | 3.000 muz |

Denge: günlük görevlerin üst sınırı 690 muz + bonus, beklenen ~320 muz
(`/gunluk`'ün altında); haftalık beklenen ~2.500–3.000 (bir haftalık
`/gunluk` toplamının altında).

## Set ödülleri (`/envanter setler`, `/envanter set-odul`)

Kartlar temalı setlere ayrılır (her kart tam bir temalı sete girer) ve her
nadirlik için ayrıca bir koleksiyon seti vardır. Setin her kartından en az
bir tane olunca ödül **kişi başı her set için bir kez** alınır ("Ödülü al"
düğmesi ya da `set-odul`); `set_oduller` tablosunda tutulur, kart sonradan
satılsa da geri alınmaz. Muz `set-odul` türüyle, kasa eşya defterine yazılır.

| Set | Kart | Ödül |
| --- | ---: | --- |
| Temel Kuleler | 10 | 2.000 muz + Ahşap |
| Askeri Kuleler | 7 | 1.000 muz + Ahşap |
| Destek Maymunları | 8 | 3.000 muz + Demir |
| Balonlar (RGB dahil) | 8 | 20.000 muz + Elmas |
| Kahramanlar | 17 | 15.000 muz + Altın |
| Bosslar | 7 | 30.000 muz + Elmas |
| Elit Bosslar | 6 | 100.000 muz + 2 Elmas |
| Sıradan Koleksiyonu | 13 | 1.500 muz + Ahşap |
| Nadir Koleksiyonu | 16 | 5.000 muz + Demir |
| Destansı Koleksiyonu | 20 | 20.000 muz + Altın |
| Efsanevi Koleksiyonu | 7 | 20.000 muz + Altın |
| Mitik Koleksiyonu | 7 | 150.000 muz + 3 Elmas |

Ödül değeri (muz + kasa mağaza fiyatı) setin kart satış değerinin ~%18–58'i:
kolay setlerde yüksek, zor setlerde düşük. Bosslar ile Efsanevi Koleksiyonu
aynı 7 karttır, ikisi ayrı ayrı alınır (Efsanevi'nin oranı bu yüzden düşük).

## Sıralamalar (`/zenginler tur:`)

| Tür | Neye göre |
| --- | --- |
| `muz` (varsayılan) | Bakiye |
| `toplam` | Bakiye + bankadaki kilitli anapara |
| `seviye` | Toplam XP (`/seviye` sırasıyla aynı); seviye XP'den yazılır |
| `koleksiyon` | Koleksiyon puanı (kartların satış değeri), yanında farklı kart sayısı |
| `seri` | Günlük seri (son kayıtlı değer; koruyucu sahibi haksız düşmesin diye süzülmez) |
| `prestij` | Prestij seviyesi |
| `kumar` | Bu haftanın (Pazartesi 00:00 TR) net kumar kazancı, yalnız pozitifler |

İlk 10, madalyalar; kullanıcı ilk 10'da değilse altta kendi sırası; kimse
etiketlenmez. Bot sahibi ve geliştiriciler (`.env` → `authorUserID`,
`developerUserIDs`) hiçbir türde listelenmez, sıra saymaz; `/cuzdan` ve
`/profil`'deki zenginlik sırası da onları saymaz (kendilerinde sıra yok).
Kumar kazancı defterde `karsi_id` boş `bahis`/`kazanc`/`iade`
kayıtlarının toplamıdır: kumar ve blackjack karşı taraf yazmaz, kasa/eşya
kazancı kasa/eşya kimliğini, düello rakibi taşır. Bu yüzden kasa ödülleri ve
düello (üyeler arası) kumar sıralamasına girmez.

## Takas (`/takas teklif`)

İki üye arasında kart/kasa (Günlük Kasa hariç) ve muz takası: `uye`, `ver` /
`ver_adet`, `iste` / `iste_adet`, `muz_ver`, `muz_iste` (her taraf en az bir
kalem; kalemde en çok 100 adet). Teklif kanala gider, karşı taraf
**Kabul/Reddet**, teklif eden **Geri çek**; 10 dakika sonra geçersiz. Kişi
başı en çok 3 açık teklif; kendine ve botlara yok. Eşyalar teklif anında
kilitlenmez: **kabul anında tek işlemde** iki tarafın da hâlâ sahip olduğu
doğrulanır, bir adım tutmazsa hiçbir şey değişmez ve teklif açık kalır. Muz
kısmı `/gonder` kurallarına tabidir (en az 10, vergi, gönderenin günlük
limitine sayılır); takas bu kuralların dışında bir yol değildir. **Yönetici
ile üye arasında takas ve hediye yoktur** (2026-10-24; teklif açılmaz,
önceden açılmış teklif kabul edilmez); yöneticiler kendi aralarında
takaslaşabilir. Sebep: yönetici geliri ×5 ve prestij 10 çarpanlı; 11 Ekim'de
100.000 değerindeki Elit Bloonarius 1.500'lük bir kartla bir üyeye geçip
satıldı. Teklifler
`takas_teklifleri` tablosunda; eşya hareketleri `takas-ver`/`takas-al`, muz
`gonder`/`al` olarak yazılır.

## Topluluk pazarı (Activity → Pazar, `lib/pazar.js`)

Steam Topluluk Pazarı gibi: üyeler kartlarını (normal ve parlak) **birim
fiyatla** ilana koyar, başkaları ilandan istediği kadar adet alır. Yalnız
Activity'de; slash komutu yok.

- **Emanet:** ilana konan kopyalar envanterden düşer (`pazar-ilan`), ilanda
  durur; kaldırınca kalanı geri döner (`pazar-iptal`). Çalışmaya ya da sefere
  kilitli kopya ilana konamaz (`esyaDus`).
- **Fiyat:** birim fiyat kartın sistem satış değeri ile onun **10 katı**
  arasında (Quincy 6.000–60.000, parlak Quincy 30.000–300.000). Taban, kartı
  alt hesaplara hediye sınırını aşarak bedavaya taşımayı; tavan, muzu
  `/gonder` kurallarının dışında taşımayı zorlaştırır.
- **Kesinti:** satıştan **%10** düşülür (aşağı yuvarlanır); alıcı fiyatın
  tamamını öder, satıcıya kalan geçer. Fark yok edilen muzdur (panelde
  "Topluluk pazarı kesintisi"). Defter türü iki tarafta da `pazar`, karşı
  taraf öteki üyedir; alıcının eşya hareketi `pazar-al`.
- **Haber:** kart satılınca satıcıya bot DM atar (kart, alan, adet × fiyat,
  eline geçen ve kesinti, ilanda kalan). DM kapalıysa sessizce düşer; satış
  yine geçerlidir.
- **Sınırlar:** kişi başı en çok 20 açık ilan, ilan başı en çok 100 kopya;
  kendi ilanı alınamaz. **Yönetici ile üye arasında pazar alışverişi yoktur**
  (takas ve hediyedeki kuralla aynı); yöneticiler birbirinin ilanını alabilir.
- **Ekran:** vitrin (ilanı ya da son 7 günde satışı olan kartlar; en düşük
  fiyat, satıştaki adet, 24 saatlik satış; arama, nadirlik, sıralama) ve son
  satışlar; kart sayfasında ilanlar ucuzdan pahalıya, 30 günlük ortalama fiyat
  ve adet grafiği, son satışlar. Satış formu alıcının ödeyeceği ile satıcıya
  geçecek tutarı birlikte gösterir; biri yazılınca öteki hesaplanır. Öneri: en
  düşük ilanın 1 altı (tabandan aşağı değil). Envanterdeki kart penceresinden
  pazara geçilir.
- **Alım istekleri** (Steam'deki satın alma talebi): üye "bu karttan tanesi
  en çok F muza, N tane" der; pazarda ilanı olmayan kart da istenebilir.
  Bakiyede F × N olmalı. Önce F'ye ya da altına açık ilanlar ucuzdan
  pahalıya, **ilanın fiyatından** alınır; kalan adet için F × kalan
  **emanete** alınır (defterde `pazar`, karşı taraf `alim-<id>`). Kart sahibi
  isteğe **hemen satar** (en yüksek istekten aşağı, isteğin fiyatından,
  kesinti düşülerek; ödeme emanetten). Yeni ilanın fiyatına ya da üstüne
  istek varsa kopyalar önce o isteklere satılır, kalanı ilanda bekler.
  Kaldırılan isteğin kalan emaneti iade edilir. İstek sınırı ilan sınırıyla
  aynıdır; fiyat aralığı ve yönetici–üye kapısı ilanlarla aynı. Karşılanan
  isteğin sahibine DM gider. Kart sayfası istekleri fiyat basamağına göre
  (alıcı adı olmadan) gösterir. Panelde emanetteki muz `pazar` kategorisinde
  geçici olarak yok edilen görünür; istek kapanınca iade basılan olarak döner
  (arz ile tutarlı).
- **Ayarlar** (`pazar.acik`, `pazar.kesintiYuzde`, `pazar.tavanCarpani`,
  `pazar.ilanSiniri`; varsayılan açık, 10, 10, 20): kapalıyken ilan, istek ve
  satın alma durur; ilan ve istek kaldırmak serbesttir.
- **Yönetim (Activity → Yönetim → Pazar):** ayarlar; dönemli özet (hacim,
  kesinti, satıcı/alıcı, açık ilan ve değeri, açık istek ve emaneti, geri
  alınanlar), en çok satan kartlar, en çok kazanan/harcayan üyeler, 2+ kez
  alışveriş eden satıcı–alıcı çiftleri ve sistem değerinin 5 katı üstündeki
  satışlar (şüphe işaretleri); bütün ilanlar, istekler ve satışlar (durum /
  dönem, üye, kart süzgeci). İşlemler: ilan fiyatını ve adedini düzenle (adet
  yalnız azalır, fark satıcıya döner), ilanı kaldır (kartlar iade ya da el
  koyma), isteği kaldır (emanet iade), **satışı geri al** (alıcıya ödediği
  döner, satıcıdan eline geçen alınır, kartlar satıcıya döner, kesinti geri
  basılır; alıcıda kart ya da satıcıda muz kalmadıysa hiçbir şey değişmez).
  Her işlem `pazar_yonetim_gunlugu`ne yazılır ve etkilenen üyelere DM gider.
  Geri alınan satış fiyat geçmişinden, vitrinden ve son satışlardan düşer.
- Tablolar: `pazar_ilanlari` (durum `acik`/`bitti`/`iptal`/`kaldirildi`,
  kalan ve ilk adet), `alim_istekleri` (aynı durumlar), `pazar_satislari`
  (birim fiyat, kesinti, `istek_id`, `geri_alan`/`geri_zaman`),
  `pazar_yonetim_gunlugu`.

## Düello (`/duello`)

`/duello uye bahis oyun [secim]`: `zar` (ikişer zar, büyük toplam kazanır,
eşitlik berabere), `yazitura` (meydan okuyan seçer, boşsa rastgele) ya da
`at` (iki at: meydan okuyan 1., rakip 2. kulvarda; yarı yarıya, beraberlik
yok). At yarışında kabulden sonra ~3,5 sn'lik GIF oynar (kulvarlarda
oyuncuların görünen adları), ardından sonuç gömüsü son kareyle gösterilir;
GIF üretilemezse düz sonuca düşülür.

**XOX düellosu (`oyun: xox`):** kabulde iki bahis de düşülür ve meydan okuma
mesajı 3×3 düğmeli tahtaya döner (`lib/xox.js`, tablo `xox_oyunlari`). X ve O
kurayla dağıtılır, X başlar. Her hamle için **60 sn** var; sırası gelen süreyi
aşarsa hükmen kaybeder. Oyunculardan biri "Pes et"e basarsa rakibi kazanır.
Çizgiyi tamamlayan havuzu %5 kasa payı kesilmiş alır; tahta dolar ve çizgi
yoksa berabere: iki tarafa iade, pay yok. Bot yeniden başlarsa yarım kalan
oyunlarda iki tarafa da bahsi iade edilir. Kazanç kaydı diğer düellolar gibi
`karsi_id` = kaybeden taşır (düello başarımları sayar).
Bahis kumarla aynı sınırlar. Meydan okuyanın bahsi meydan okuma anında
emanete alınır, rakibinki kabulde; rakibin bakiyesi yetmezse hiçbir şey
değişmez. Ret, geri çekme, 2 dakikalık süre aşımı ve bot açılışında bekleyen
meydan okumalar meydan okuyana iade edilir. Kazanan iki bahsin toplamından
**%5 kasa payı** kesilmiş tutarı alır (100 + 100 → 190; pay muz çıkışıdır);
beraberlikte pay alınmaz, ikisine iade. Kendine ve botlara yok; kişi başı en
çok 1 bekleyen meydan okuma.

**Davet bildirimi (2026-10-23):** Activity'den açılan meydan okuma, rakibi
etiketleyerek ve Kabul/Reddet düğmeleriyle `ekonomi.kanallar`'ın ilk kanalına,
liste boşsa öne çıkanlar kanalına (`ekonomi.akisKanal`) gider. Rakibin
Activity'si `GET /api/davetler`'i 8 sn'de bir yoklar (sekme görünürken); yeni
davette **açılır pencere** (meydan okuyan, oyun, bahis, kalan süre; "Düelloya
git" ve "Reddet") ve kısa bir **bildirim sesi** çıkar. Tarayıcı, kullanıcı
Activity'ye bir kez dokunmadan ses çalmaya izin vermez. Görülen davetler
cihazda hatırlanır, aynı davet ikinci kez pencere açmaz.

**Boss ve hisse bildirimi (2026-10-24):** Activity `GET /api/olaylar`'ı 15 sn'de
bir yoklar (sekme görünürken; `web/rotalar/olaylar.js`, pencere
`activity/src/components/OlayPenceresi.jsx`). Yeni olayda **açılır pencere** ve
olaya özgü **ses** çıkar:
- **Boss geldi:** aktif boss (ad, Elit, kaçmasına kalan süre; "Savaşa git"). O
  sırada Boss ekranındaysan pencere açılmaz.
- **Boss yenildi / kaçtı:** son 24 saatte sonuçlanan savaşa katıldıysan kendi
  ödemen: yenildiyse muz, kasalar, sıra, hasar ve son vuruş (konfetiyle);
  kaçtıysa 300 muz teselli. Tutarlar ödemeyle aynı kuraldan
  (`lib/boss.js` `odemeHesapla`) gelir. Son vuruşu Activity'de yapan sonucu Boss
  ekranında gördüğünden pencere açılmaz.
- **Hisse haberi:** şu an elinde tuttuğun bir hisseye son 1 saatte gelen haber
  (metin, fiyata etkisi, adedin, güncel fiyat; "Borsaya git" o şirketi açar).

Görülen olaylar cihazda hatırlanır (son 100), aynı olay ikinci kez pencere
açmaz. Pencereler sırayla gelir.

## Profil kartı (`/profil [uye]`)

1000×450 PNG kart: yuvarlak avatar (seviye rolü renginde çerçeve), ad, seviye
rolü, seviye, XP sırası ve ilerleme çubuğu; muz bakiyesi, zenginlik sırası,
bankada kilitli, günlük seri; koleksiyon `x/63`, puan ve nadirlik başına
sayaçlar; en değerli 6 kart (nadirlik çerçeveli, `×adet`); rozetler (en
değerlisi önce, en çok 13). Kart/rozet görselleri sunucu emojileri; inemeyen
görsel yerine nadirlik renginde daire. Yanıt ertelenir (`deferReply`); görsel
üretilemezse aynı bilgiler embed olarak gelir.

## Etkinlik modu (`/ekonomi-etkinlik`, yalnız Yönetici)

`baslat tur sure [duyuru_kanali]` · `durum` · `bitir tur`. Süre 10 dakika –
7 gün; aynı anda farklı türler etkin olabilir, aynı tür tekrar başlatılırsa
süresi yeniden kurulur. Başlatınca duyuru embed'i (kimse etiketlenmez).

| Tür | Etkisi |
| --- | --- |
| `muz-2x` | `/gunluk` muzu ve sohbet muzu 2 kat (kasalar aynı) |
| `xp-2x` | Mesaj XP'si 2 kat |
| `kasa-indirim` | Mağaza kasaları %25 indirimli: 900 / 3.000 / 9.000 / 22.500 |
| `seviye-kasa` | Seviye kasası bir üst sınıf (Günlük→Ahşap→Demir→Altın→Elmas) |

Takviyelerle çarpılarak birleşir: `muz-2x` + Muz Çiftliği sohbette 6x;
`xp-2x` + XP İksiri 4x (XP zaten 60 sn beklemeyle sınırlı). Etkin
etkinlikler `/gunluk`, `/cuzdan` ve `/magaza liste` kasalarında (üstü çizili
eski fiyatla) görünür.

**Geçmiş (`etkinlik_gecmisi`, 2026-10-24):** her başlatma bir satır; etkin
türü yeniden başlatmak son satırın bitişini uzatır, `bitir` bitişi o ana
çeker ve "erken bitti" işaretler. `durum` son 10 etkinliği, Activity →
Yönetim → Etkinlikler son 20'yi gösterir; ekonomi paneli döneme değen
etkinlikleri listeler ki arzdaki sıçramalar etkinlikle karşılaştırılabilsin.
Eklenmeden önce tablo tür başına yalnız son etkinliği tuttuğundan eski
etkinlikler ölçülemiyordu; geçiş o an tablodaki satırları ilk kayıt yaptı.

## Parlak kartlar ve birleştirme

**Parlak (✨):** kasadan çıkan her kart %1 ihtimalle parlak gelir; aynı kartın
parlak sürümü envanterde ayrı eşyadır (`parlak:kart-quincy`) ve **satış değeri
5 katıdır**. Kasa sonucunda "✨ PARLAK!" vurgusu, GIF'te altın çerçeve ve
parıltı çıkar. Envanter ızgarasında sayının yanında ✨ görünür; `/envanter
kartlar` parlak sürümü ayrı satırda gösterir. Koleksiyon puanı ve sıralama
parlakları 5 katıyla sayar. **Setler ve başarımlar** kartın normal ya da
parlak sürümüyle sağlanır. Satış, hediye, takas, toptan satış parlakları da
kapsar. Parlak payı kasa beklenen değerini %4 artırır (0,99 + 0,01 × 5);
satılabilir beklenen / fiyat: Ahşap %68,0, Demir %70,0, Altın %64,7, Elmas
%73,9, Günlük Kasa ≈ 329 muz — hepsi fiyatın altında.

**Birleştirme (`/envanter birlestir kart [adet]`):** aynı kartın 5 normal
kopyası → bir üst nadirlikten rastgele 1 kart (Mitik birleştirilemez; parlak
birleştirilemez ve birleştirmeden parlak çıkmaz; tek komutta en çok 50).
"Bütün uygun kopyalar" her karttan 1 bırakıp kalanları 5'li gruplarla tek
işlemde birleştirir. Defterde `birlestir`.

| Birleştirme | 5 kopyanın değeri | Çıkan kart | Oran |
| --- | ---: | ---: | ---: |
| Sıradan → Nadir | 2.000 | 1.500 | 1,33 |
| Nadir → Destansı | 7.500 | 6.000 | 1,25 |
| Destansı → Efsanevi | 30.000 | 25.000 | 1,20 |
| Efsanevi → Mitik | 125.000 | 100.000 | 1,25 |

Birleştirmek kopyaları satmaktan biraz kötüdür: muz yaratmaz, fazla kopyayı
koleksiyon ilerlemesine çevirir.

## Çalışma ve meslekler (`/calis`)

Ekonominin **asıl emek geliri** (2026-10-22: kumarın önüne geçsin diye). OwO
`hunt` gibi kısa iş: kişi başı **15 sn** bekleme (OwO hunt ile aynı). Günlük
tavanı **enerji** koyar (`calismalar.enerji`, tembel dolum):

| Kural | Değer |
| --- | --- |
| Enerji | en çok 100; 36 sn'de 1 dolar (boştan **1 saatte** dolu; 2026-10-23'e kadar 5 saat); hiç çalışmamış üye dolu başlar (`lib/enerji.js`) |
| Bir çalışmanın bedeli | 10 × (1 − direnç) × (1 − Dayanıklılık) enerji; yetmezse çalışılmaz (hiçbir şey yazılmaz) |
| Bonus kasa | çalışma başına %0,4 Ahşap, %0,05 Demir (Şans yolu çarpar) |
| Olay | çalışma başına %12 (+ Şans yolu) — aşağıda |

Meslek seviyeyle açılır; varsayılan en yüksek açık meslek, `/calis meslek:<ad>`
ile açık bir meslek seçilir (`Otomatik` ile geri dönülür); `/calis bilgi:true`
enerjiyi, maymunu ve tabloyu gösterir. Her çalışmada mesleğe özgü bir olay
metni çıkar. Kazanç **çalışma başına**:

| Meslek | Seviye | Muz / çalışma |
| --- | ---: | ---: |
| Dart Maymunu | 0 | 16–24 |
| Bumerang Maymunu | 3 | 20–30 |
| Bomba Atıcı | 5 | 26–38 |
| Ninja Maymun | 10 | 34–50 |
| Büyücü Maymun | 15 | 44–64 |
| Medyum Maymun | 25 | 56–80 |
| Simyacı Maymun | 40 | 70–100 |
| Süper Maymun | 50 | 84–120 |

### Çalışan maymun ve direnç (`lib/maymun.js`)

`/calis maymun:<kart>` (Activity: Çalış kartı → maymun) envanterdeki bir
**maymun kartını** (kule ya da kahraman; balon ve bosslar değil) çalışmaya
kilitler. Kilitli kopya **satılamaz, hediye/takas edilemez, birleştirilemez**
(`envanter.esyaDus` kilitli kopyayı düşmez; toptan satış onu atlar). Kart elden
çıkınca (prestij) kilit kendiliğinden kalkar. Matematik OwO'nun savaş
istatistikleridir (Discord-OwO-Bot `battle/util/animalUtil.js`,
`WeaponInterface.resToPercent`):

- R = 25 + 2 × maymun seviyesi × oran; **direnç = 0,8 × R / (100 + R)**
  (maymunsuz %16; %80'e yaklaşır, geçmez).
- Oran nadirlikten: Sıradan 2, Nadir 3, Destansı 5; parlak +1.
- Maymun çalışma başına 1 XP alır; bir sonraki seviye (seviye⁴ + 1.000) / 100 XP
  (OwO `lvl⁴ + 1000`, 100'e bölünmüş). Sv 5 ≈ 42, Sv 10 ≈ 239, Sv 15 ≈ 1.411,
  Sv 20 ≈ 5.809 çalışma. Deneyim kart başınadır (`maymun_deneyim`), kart
  satılsa ya da prestijde silinse de kalır.

| Maymun | Sv 1 | Sv 10 | Sv 20 | Saatte çalışma (Sv 20) | Günde en çok (Sv 20) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Yok | %16 | %16 | %16 | ~12 | ~297 |
| Sıradan | %18 | %31,5 | %41 | ~17 | ~423 |
| Nadir | %18,9 | %36,8 | %47,3 | ~19 | ~474 |
| Destansı | %20,7 | %44,4 | %55,4 | ~22 | ~560 |
| Parlak destansı | %21,6 | %47,3 | %58,1 | ~24 | ~596 |

(Dayanıklılık yolu bunları ayrıca %6–38 artırır.)

**Kazanç çarpanları:** `muz-2x` etkinliği 2 kat (kasa değişmez); prestij, Katıl
ve yönetici çarpanı; **rozetler** sahip olunan her rozetin `calisBonus`u kadar
(toplam yüzde, aşağıda); kilitli maymunun **Kazanç yolu**. Defterde `calis`.

**Denge (2026-10-23, 1 saatlik dolum):** maymunsuz saatte ~12 çalışma; olaylar
dahil Sv 5 üye saatte ~420, Sv 25 üye ~890 muz; dolu barla başlanan 1 saatlik
oturum bunun iki katı (~24 çalışma). En iyi maymun (Sv 20 destansı, Kazanç 5)
saatte ~2.500'e çıkar. 5 saatlik dolumla gün boyu ~40 çalışma yapılıyordu;
oturum hissi için dolum kısaltıldı, karşılığında yükseltme yolları (maymun
başına 5-2-0 ≈ 106.500 muz) ve Enerji Totemi yeni muz çıkışlarıdır.
2026-10-23'te totem 200 muz ve günde 10 kez oldu (kullanıcı isteği); ertesi
gün `/calis` geliri günde ~2,6 binden 95,5 bine çıktı (yöneticiler hariç;
totem alan 11 üye 18,9 bin harcayıp aynı sürede 152 bin kazandı, ~8 kat).
2026-10-24'te totem fiyatının gün içinde katlanması (200, 400, 800 …) denendi,
aynı gün kullanıcı isteğiyle geri alındı: fiyat sabit 200, sınır günde 10.
2026-10-26'da sınır kullanıcı isteğiyle günde 40'a çıktı.
Totem geliri `/ekonomi-panel` ile izlenmeye devam etmeli.

### Çalışma olayları (`lib/calis-olay.js`)

Her çalışmada **%12** (+ kilitli maymunun Şans yolu, en çok +18 puan) ihtimalle
bir olay çıkar. Olay muzu o çalışmanın kazancının katıdır (çarpanlar dahil),
defterde `calis` / karşı kimlik `olay-<kimlik>`; borçluysa kredi payı kesilir.

| Olay | Ağırlık | Etki |
| --- | ---: | --- |
| ⭐ Usta Maymun | 25 | kazanç bir kez daha (2 kat) |
| 🍌 Muz Molası | 20 | +20 enerji |
| 📚 Antrenman | 15 | kilitli maymuna +5 XP (maymunsuza çıkmaz) |
| 🎁 Kayıp Kasa | 10 | Ahşap Kasa |
| 🎈 Kaçak M.O.A.B. | 15 | **seçimli:** Vur → %40 ihtimalle 3 kat; Kenardan dürt → garanti 1 kat |
| ✨ Altın Balon | 15 | **seçimli:** Kovala → 15 enerji, %50 ihtimalle 5 kat; Bırak → hiçbir şey |

Seçimli olay düğmelerle gelir (Discord: `calisolay:<seçim>:<üye>`; Activity:
Çalış kartı) ve **2 dakikada** seçilmezse kaçar (`calis_olaylari`, kişi başı
bir). Bekleyen seçim varken yalnız anlık olay çıkar. Beklenen değer çalışma
başına ~%10 ek muz, ~0,5 enerji ve ~%1,2 Ahşap Kasa.

### Ustabaşı yoklaması (`lib/calis-yoklama.js`)

Makro ve autoclicker'a karşı (2026-10-28, kullanıcı isteği). Çalış düğmesi art
arda basılsın diye yerinden kaymaz; sabit noktaya tıklayan bir autoclicker üye
başında olmadan çalışabiliyordu. Yoklama çıkınca Activity'de kapatılamayan bir
pencere 6 maymundan (meslekler, karışık sırada) istenenini sorar; doğru seçilene
kadar `POST /api/calis` çalışmaz (hata değil, `calisti: false`). Doğru cevabı
yalnız sunucu bilir; bekleyen yoklama `calis_yoklamalari`ndadır, bot yeniden
başlasa da düşmez.

| Kural | Değer |
| --- | --- |
| Sıra | her **30–60** başarılı çalışmada bir (rastgele; `calismalar.yoklama_kalan`) |
| Aynı nokta | son **12** çalışmada düğmenin hep aynı pikseline (ya da hep klavyeyle) basıldıysa hemen |
| Betik tıkı | tarayıcı tıkı `isTrusted: false` ise hemen |
| Hızlı cevap | yoklama açıldıktan sonra 500 ms'den hızlı cevap yanlış sayılır |
| Yanlış cevap | yeni yoklama; ardışık yanlışa göre **30 sn, 2 dk, 10 dk, 30 dk** sonra cevaplanabilir; doğru cevap sırayı sıfırlar |

Pencere açılınca seçenekler 700 ms tıklanmaz ve seçenek dışına yapılan tıklar
(`bos_tik`) cevapla birlikte kaydedilir. Yönetim → Yoklama son 7 günü kişi
başı gösterir. **Şüpheli:** en az 3 yanlış cevap, betik tıkı ya da 15 boşa tık.
Aynı nokta tek başına şüphe değildir: fareyi düğmede bırakıp tıklayan insan da
aynı piksele basar. Uzun süre cevapsız kalan yoklama "takılı" görünür. Ceza
yalnız uzaklaştırma ile verilir (yöneticinin kararı); yoklama kimseyi kendisi
uzaklaştırmaz.

### Yükseltme yolları (`/maymun yukselt`, `lib/maymun.js`)

BTD6 kuleleri gibi üç yol; bir yol 5. kademeye, ikinci yol en çok 2. kademeye
çıkar, üçüncüsü kapalı kalır (**5-2-0**). Kademe maymunun seviyesini ve muz
ister; yükseltme kart kimliğine yazılır (`maymun_deneyim.yukseltme`, "5-2-0"),
deneyim gibi prestijde korunur. Etki çalışırken kilitli maymundan, seferde
gönderilen maymundan gelir. Defterde `yukseltme` (yok edilen muz).

| Kademe | Maymun Sv | Bedel | 💰 Kazanç | 🛡️ Dayanıklılık | 🍀 Şans |
| ---: | ---: | ---: | --- | --- | --- |
| 1 | 2 | 1.500 | +%8 | %6 | olay +3 puan, kasa ×1,5 |
| 2 | 4 | 4.000 | +%16 | %12 | olay +6 puan, kasa ×2 |
| 3 | 6 | 10.000 | +%25 | %20 | olay +9 puan, kasa ×3 |
| 4 | 8 | 25.000 | +%35 | %28 | olay +13 puan, kasa ×4 |
| 5 | 10 | 60.000 | +%50 | %38 | olay +18 puan, kasa ×5 |

- Kazanç: çalışma ve sefer muzu. Dayanıklılık: çalışmanın enerji bedeli ve sefer
  süresi o kadar azalır. Şans: olay şansı ve bonus/sefer kasası olasılığı.

### Seferler (`/maymun sefer`, `lib/sefer.js`)

Envanterdeki bir maymun sefere gönderilir; dönünce (`/maymun topla`, Activity:
Maymunlar) muz, XP ve küçük ihtimalle kasa getirir. Boştayken gelir: saat başı
getirisi çalışmanın altındadır, uzun sefer saat başı daha az verir.

| Sefer | Süre | Verim | Ahşap | Demir |
| --- | ---: | ---: | ---: | ---: |
| 🥾 Kısa devriye | 1 sa | 1,0 | %2 | %0,2 |
| 🌴 Orman seferi | 4 sa | 0,85 | %8 | %1 |
| 🎈 Büyük balon avı | 8 sa | 0,7 | %15 | %2 |

- Muz = 40 × saat × verim × nadirlik (Sıradan 1, Nadir 1,25, Destansı 1,6;
  parlak ×1,2) × (1 + %4 × (maymun Sv − 1)) × (1 + Kazanç). XP = saat × 4.
  Süre × (1 − Dayanıklılık). Muz ve XP gönderirken hesaplanır; prestij, Katıl
  ve yönetici çarpanı, borç kesintisi ve kasa zarı (× Şans) toplarken. Defterde
  `sefer`.
- Aynı anda sefer: Sv 0'da 1, Sv 10'da 2, Sv 25'te 3. Seferdeki her maymun bir
  kopya kilitler (satılamaz, takas/hediye/birleştirme dışı); çalışan maymunun
  tek kopyası sefere gidemez. `/maymun geri` ödülsüz geri çağırır. Prestij
  dönmemiş seferleri kartlarla birlikte siler.
- Örnek: Sıradan Sv 1 maymun 8 saatte ~224 muz; Destansı Sv 10, Kazanç 5 ~730.

## Maymun çiftlikleri (Activity → Çiftlik, `lib/ciftlik.js`)

2026-10-23'te kullanıcı isteğiyle eklendi, aynı gece BTD6 düzenine geçti.
Pasif gelir alanı: oyuncu haritadaki arsalara Muz Çiftliği kurar; çiftlik
**saniye başına** muz üretip deposunda biriktirir, oyuncu gelip toplar. Menüde
"YENİ" etiketiyle durur; slash komutu yoktur.

Yönetici denemesinden sonra 2026-10-24'te herkese açıldı.

**Görünüm:** diğer panellerle aynı yazı tabanlı düzen (2026-10-24, kullanıcı
isteği; BTD6 haritalı denemeden vazgeçildi). Sayfada şunlar var:
- üstte çiftlik sayısı, muz/sn üretim, depolardaki muz (saniye saniye artar)
  ve "Hepsini topla";
- solda 8 arsalık liste (portre, depo çubuğu, yollar);
- sağda seçili arsanın kartı: depo, Topla, Sat ve Maymunlar ekranındaki gibi
  üç yükseltme yolu kartı.

Kule portreleri ve yükseltme simgeleri Bloons wiki'den (`activity/public/ciftlik/kule`, `simge`).

**Kilit ve arsalar:** **Sv 5**'in altında kilit kartı ve ilerleme çubuğu görünür. Bütün
işlemler sunucuda da Sv 5 ister. Haritada 8 arsa vardır:

| Arsa | 1 | 2 | 3 | 4 | 5 | 6 | 7 | Üye |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Seviye | 5 | 8 | 12 | 16 | 22 | 30 | 40 | 5 |
| Bedel | 3.000 | 8.000 | 15.000 | 25.000 | 40.000 | 60.000 | 85.000 | 5.000 |

Üye arsası YouTube Katıl üyelerine (`sistem.uyelik` açık, bir kademe rolü)
özeldir. Üyelik biterse o çiftlik durur: toplanamaz, yükseltilemez, ama satılabilir.

**Üretim:** yükseltilmemiş çiftlik saniyede **0,008** muz üretir (saatte 28,8),
deposu **12 saatlik** üretimi tutar. Depo dolunca üretim durur.

**Yükseltme yolları** (BTD6 kuralı: bir yol 5'e, ikincisi en çok 2'ye çıkar,
üçüncüsü kapalı kalır). Kademe değerleri o kademedeki toplam etkidir:

| Kademe | Üretim (üst) | Depo (orta) | Pazar (alt) |
| ---: | --- | --- | --- |
| 1 | Artan Üretim ×1,3 · 1.500 | Uzun Ömürlü Muzlar: depo 24 sa · 1.200 | EZ Toplama ×1,15 · 1.500 |
| 2 | Büyük Üretim ×1,6 · 3.500 | Değerli Muzlar ×1,3, 24 sa · 3.000 | Muz Kurtarma ×1,35, satış %90 · 3.500 |
| 3 | Muz Plantasyonu ×2,6 · 9.000 | Maymun Bankası ×2,2, 36 sa · 8.000 | Pazar Yeri ×3, depo ×⅔ · 9.000 |
| 4 | Muz Araştırma Tesisi ×4,5 · 24.000 | IMF Kredisi ×3,6, 48 sa · 22.000 | Merkez Pazar ×5, depo ×½ · 25.000 |
| 5 | Muz Merkezi ×8 · 60.000 | Maymunomi ×6,5, 72 sa · 55.000 | Maymun Wall Street ×9, depo ×⅓ · 65.000 |

- hız = 0,008 × yolların çarpanlarının çarpımı;
  depo = (Depo yolunun saati ya da 12) × (Pazar 3+ katsayısı).
- **Denge:**
  - 5-2-0 ×10,4 (24 sa depo); 2-5-0 ×10,4 (72 sa); 2-0-5 ×14,4 ama 4 saatlik depo.
  - Pazar yolu çok kazandırır ama sık uğramayı ister; Depo yolu seyrek uğrayana.
  - Beşinci kademe bir çiftlik yaklaşık 105K'lık yatırımla saatte ~300 muz verir.
- **Yükseltme ve satış:** önce birikmiş toplanır (yeni hız geriye işlemez).
- **Satış:** harcananın (kurma + yükseltmeler) **%70**'i, Muz Kurtarma ile **%90**'ı
  geri döner. Arsa boşalır; kur-sat ile muz basılamaz.
- **Toplama:** birikmişin tam kısmı yatar, kesir sonraki toplamaya kalır.
  Katıl ve yönetici çarpanı **uygulanmaz**. **Prestij çarpanı üretim hızını
  çarpar** (2026-10-26'dan beri; Prestij 5 → hız ×2). Depo saati aynı kalır, muz
  kapasitesi hızla büyür. Borçluysa payı borca gider.
- **Prestij:** çiftlikler satılır; satış değeri (%70 / %90) ve depodaki muz
  prestijden sonraki yeni cüzdana geçer (defterde `prestij-<arsa>`). Duran üye
  arsasının deposu geçmez, satış değeri geçer.
- **Defter:** `ciftlik` türüyle yazılır. Kurma (`kur-<arsa>`) ve yükseltme
  (`yukselt-<arsa>`) −; hasat (`hasat-<arsa>`), satış (`sat-<arsa>`), prestij
  devri (`prestij-<arsa>`) ve geçiş iadesi (`iade-<arsa>`) +.
- **Tablo:** `ciftlikler` (guild, üye, arsa, yollar '5-2-0', harcanan,
  son_toplama, kurulus; `seviye` eski sistemden kalma, hep 1).
- **API:** `GET /api/ciftlik`, `POST /api/ciftlik/kur` (`{arsa}`),
  `/yukselt` (`{arsa, yol}`), `/topla` (`{arsa?}`), `/sat` (`{arsa}`).
- **Geçiş (2026-10-23):** eski 10 seviyeli sistemde yükseltmeye harcanan muz
  `scripts/ciftlik-gecis.js` ile sahibine iade edildi (1 çiftlik, 11.000 muz).
  Çiftlikler 0-0-0 olarak kaldı.

## Haftalık piyango (`/piyango`)

`/piyango bilet [adet]`, `/piyango durum`. Bilet 500 muz, kişi başı haftada en
çok 40 (2026-10-23'e kadar 20). Çekiliş her **Pazar 21:00 TR**; bilet sayısıyla ağırlıklı tek kazanan
havuzun tamamını alır. Havuz = bilet gelirinin %90'ı + 5.000 muz taban
(gelirin %10'u muz çıkışı). Bilet satılmayan haftada kazanan ve taban yoktur,
ikramiye devreder (en çok 20.000). Yöneticiler (bot sahibi ve geliştiriciler,
`.env` → `authorUserID`, `developerUserIDs`) bilet alabilir, biletleri havuzu
büyütür ama kazanan seçilmez; olasılık gösterimi de onların biletlerini saymaz.
Yalnız yöneticilerin bilet aldığı hafta kazanansız kalır, havuz devreder. Çekiliş kaydı + seçim + ödeme tek işlemde,
bir kez; bot kapalıyken geçen çekiliş açılışta yapılır (en çok 8 hafta geri).
Ekonomi kapalıyken bilet satılmaz ama biletli haftalar yine çekilir. Sonuç
`piyango.kanal` ayarındaki kanala kazanan etiketlenerek duyurulur (ayar yoksa
duyuru yok). Defterde `piyango` (`karsi_id` = `piyango-<çekiliş ms>`).

## Başarımlar (`/basarim`)

30 başarım (🥉 bronz 1, 🥈 gümüş 2, 🥇 altın 3 puan; toplam 63), hepsi kancasız:
mevcut durumdan ve defterlerden hesaplanır. Kontrol `/basarim`, `/profil` ve
`/cuzdan` açılınca yapılır; ilk kez sağlanan başarım kaydedilir, ödülü bir kez
verilir (defterde `basarim`) ve gizli mesajla bildirilir. Geri alınmaz.

| Kategori | Başarımlar (ölçüt → ödül) |
| --- | --- |
| Koleksiyon | 15 / 30 / 63 farklı kart → 500 / 3.000 + Ahşap / 30.000 + Elmas · İlk mitik → 5.000 + Demir · Tüm kahramanlar → 4.000 + Demir · 1 / 5 set → 1.000 / 4.000 + Demir |
| Kasa ve ticaret | 10 / 100 / 500 kasa aç → 500 / 3.000 + Ahşap / 12.000 + Altın · 50 kart sat → 1.000 · 1 / 10 takas → 300 / 2.000 + Ahşap |
| Servet ve banka | 50 bin / 1M / 10M muz → 1.000 / 10.000 + Altın / 50.000 + Elmas · Mevduat tamamla → 500 · 7 günlük (%100) mevduat → 3.000 + Ahşap |
| Kumar ve düello | 25 / 100 / 500 kumar (en az 100 muzluk bahis) → 500 / 2.500 + Ahşap / 8.000 + Demir · Tek ödemede 10.000+ → 3.000 + Ahşap · 10 / 50 düello kazan → 2.500 + Ahşap / 10.000 + Demir |
| Süreklilik | 7 / 30 / 100 gün seri → 500 / 3.000 + Demir / 15.000 + Altın · Seviye 10 / 25 / 50 → 500 / 3.000 + Ahşap / 12.000 + Altın |

## Ekonomi paneli ve kanal sınırı

**`/ekonomi-panel` (yalnız Yönetici, gizli yanıt, hiçbir şey yazmaz):**
`ozet [bugun|7g|30g] [yoneticiler_dahil]` toplam arz (bakiyeler + kilitli anapara), muzu olan üye
sayısı, **basılan** (günlük, sohbet, seviye, görev, set, başarım, çalışma,
faiz, kart satışı, kasa/eşya ödülü, kasanın kumar zararı, yöneticinin
verdiği) ve **yok edilen** muz (mağaza, pazar kesintisi, transfer vergisi, düello kasa payı,
kasanın kumar kârı, erken bozma cezası, piyango kesintisi, yöneticinin
aldığı), net enflasyon ve arzdaki % değişim, açılan kasa, satılan kart, en
çok kazanan 5 üye. `kullanici uye`: son 15 defter hareketi. Üyeler arası
aktarım ve mevduat ikisine de girmez. Ayrıca iki bölüm: **yönetici
gönderimleri** (sahip ve geliştiricilerden üyelere `gonder`; yönetici geliri ×5
olduğundan fiilen basılan muz; yöneticiler arası sayılmaz) ve **takaslar**
(dönemde kabul edilenlerin sayısı ve değeri; değer = kart satış değeri, kasa
mağaza fiyatı, muz; en dengesiz 5 takas, yönetici taraf olanlar 🛠️ ile).
Activity Yönetim ekranında da aynı iki kart görünür.

**Yöneticiler hariç (2026-10-24, varsayılan):** özet sahip ve geliştiricilerin
hesaplarını saymaz (arz, basılan/yok edilen, kasa/kart, kazananlar, kumar
oyunları): ×5 gelirleri ve bakiyeleri (o gün arzın %29'u) üye ekonomisini
şişiriyordu. Üye ile yönetici arasındaki muz (gönderim, düello) "Yönetici"
kategorisine düşer: yöneticiden gelen basılan, yöneticiye giden yok edilen.
`yoneticiler_dahil: true` (Activity'de "Yöneticileri dahil et") eski görünümü
verir. Yönetici gönderimleri ve takaslar bölümleri iki görünümde de aynıdır.

**Kumar oyunları:** oyun başına bahis sayısı, yatırılan, ödenen (kazanç +
iade), gerçekleşen geri ödeme ve oyuncu sayısı. Oyun 2026-10-24'ten beri
defterin `oyun` sütununa yazılır (slot, yazitura, zar, rulet, at, mines,
blackjack; düello satırlarında düello oyunu); öncesi "Kayıt öncesi" satırında
toplanır. Düello ve Katıl iadesi dahil değildir. **Dönemdeki etkinlikler**
de ayrı bölümde listelenir.

**Hareket dökümü (Activity → Yönetim → Hareketler):** `ekonomi_hareketleri`
defterinin tamamı tek listede (`GET /api/yonetim/hareketler`, yalnız
Yönetici). Süzgeçler: dönem (bugün / 7 gün / 30 gün / tümü), yön (giriş /
çıkış), tür (grup başlığına basınca bütün grup: Emek, Kumar ve düello,
Transfer, Mağaza ve eşya, Finans, Diğer), üye (satırdaki üyeye basınca da
süzülür), en az miktar, "yöneticileri gizle". Sıralama: en yeni, en eski, en
büyük hareket (mutlak), en büyük giriş, en büyük çıkış. Sayfa başına 50 kayıt;
üstte süzgeçteki toplam giriş, çıkış ve net. Karşı taraf okunur yazılır (üye,
eşya/kasa adı, "Kredi #7", "Boss #2" …). Kumarda oyun türü defterde
2026-10-24'e kadar tutulmadığı için eski satırlar "Bahis/Kazanç" olarak, yeniler "Bahis · Slot" gibi oyun adıyla görünür. **Canlı akış:** liste 1.
sayfadayken ve sekme görünürken 5 saniyede bir sessizce yenilenir; yeni gelen
satırlar 4 saniye vurgulanır. Başlıktaki "Canlı" düğmesiyle durdurulur.

**Mağaza satışları (Activity → Yönetim → Satışlar):** defterdeki `magaza`
çıkışlarından (`GET /api/yonetim/satislar`, yalnız Yönetici): toplam harcanan,
satın alma ve adet, alıcı sayısı, kişi başı; ürünler (eşya, kasa, satılık
rol, özel renk rolü) harcamaya göre, her birinin adedi ve alıcı sayısı; en
çok harcayan 20 üye; tek tek satın almalar (sayfa başına 50). Süzgeç: dönem
(varsayılan 30 gün), ürün (ürüne basınca), üye, yöneticileri gizle. Rol
verilemeyip aynı anda iade edilen alımlar düşülür; kasa adedi
`esya_hareketleri`'ndeki `satin-al` satırından gelir.
Diğer sayfalarda satırlar okurken kaymasın diye akış durur.

**Arayüz kullanımı (Activity → Yönetim → Kullanım):** üyelerin Activity'de
geçirdiği süre (`GET /api/yonetim/kullanim`, yalnız Yönetici; üyeler kendi
sürelerini hiçbir yerde görmez). Arayüz, sekme görünürken ve son 5 dakikada
dokunma/tıklama/tuş varken dakikada bir `POST /api/nabiz` atar (sekme
gizlenirken de son bir nabız). Süreyi sunucu ölçer (`lib/arayuz-sure.js`):
iki nabız arası 150 sn'yi geçmezse aradaki süre o oturuma ve o anki ekrana
yazılır, geçerse yeni oturum başlar; sık nabız gerçek süreden fazla yazdıramaz.
Tablolar: `arayuz_oturumlari` (oturum başı/sonu, süre) ve `arayuz_sureleri`
(Türkiye günü × ekran). Panelde dönem (bugün / 7 gün / 30 gün / tümü):
toplam süre, kişi başı, oturum sayısı ve ortalaması, en uzun oturum, şu an
arayüzde olanlar, ekranlara ve günlere göre süre, üye listesi (toplam,
oturum, en uzun, en çok kaldığı ekran, son görülme; en çok 100 üye).

**Kanal sınırı:** `ekonomi.kanallar` doluysa ekonomi komutları yalnız bu
kanallarda (ve thread'lerinde) çalışır, başka yerde gizli uyarı gelir; boşsa
(varsayılan) her yerde. `/ayar kanal-ekle` / `kanal-cikar` ile yönetilir (en
çok 10). Muaf: `/ekonomi-yonet`, `/ekonomi-etkinlik`, `/ekonomi-panel`;
butonlar (kasa, blackjack, takas, düello) etkilenmez.

## Hisse piyasası (`/hisse`)

6 BTD temalı şirket; fiyatlar **5 dakikada bir** servisle güncellenir (bot
kapalıyken en çok 48 saat telafi edilir). 2026-10-23'e kadar saatlikti; bir
saatte birkaç alım-satım yapılabilsin diye hızlandı. Fiyat satırları 3 gün
saklanır.

| Sembol | Şirket | Başlangıç değeri | Aylık büyüme | 5 dk oynaklık | Saatlik (≈ ×3,5) | Derinlik |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| MUZC | Muz Çiftliği A.Ş. | 200 | %3 | %0,8 | %2,8 | 200K |
| MAYK | Maymun Köyü Holding | 500 | %4 | %1,1 | %3,8 | 500K |
| DART | Dart Savunma | 300 | %5 | %1,5 | %5,2 | 300K |
| BALN | Balon Patlatma Sanayi | 150 | %5 | %1,8 | %6,2 | 200K |
| SIML | Simya Laboratuvarları | 400 | %6 | %2,2 | %7,6 | 300K |
| SMTK | Süper Maymun Teknoloji | 1.000 | %8 | %3 | %10,4 | 750K |

**Model (2026-10-23, BIST'e benzesin diye):**
- **Değer çizgisi:** her şirketin adil değeri aylık büyür (başlangıç
  2026-10-23 12:00 TR). Fiyat bu çizginin etrafında ortalamaya dönen log-normal
  yürüyüş yapar (adım başı %1 dönüş, sapmanın yarılanması ~6 saat); taban ve
  tavan çizginin 0,3–3 katı. Sapma durağan olduğu için **uzun vadede tutan
  kazanır**: beklenen getiri çizginin büyümesi, riskli (oynak) şirkette daha
  yüksek. Kısa vadede beklenen getiri ~0'dır, %1 komisyon kısa al-satı
  cezalandırır. Saatlik hareket komisyonun birkaç katı olduğundan gün içi
  al-sat da anlamlıdır ama risklidir.
- **Ortak piyasa:** her adımda bütün şirketler ortak bir piyasa şokunu paylaşır
  (adım getirileri arası korelasyon ~0,6): borsa endeks gibi birlikte iner, çıkar.
  Ekranda **MAYMUN 100** endeksi: fiyat / başlangıç değeri oranlarının eşit
  ağırlıklı ortalaması × 10.000, 24 saatlik değişimiyle.
- **Haber:** her adımda %1 ihtimalle (gündüz saatte ~%11) bir şirkete haber
  şoku (±%8–20); **Türkiye saatiyle 00:00–08:00 arası haber çıkmaz.**
  `hisse.kanal` ayarlıysa oraya duyurulur; hisseyi elinde tutanların
  Activity'sinde pencere ve sesle bildirilir ("Boss ve hisse bildirimi").
- **Emir etkisi:** alım fiyatı yukarı, satım aşağı iter. Log-fiyat değişimi =
  işlem tutarı / derinlik, tek emirde log-fiyatta en çok ±0,25 (fiyatta
  +%28 / −%22). 10.000 muzluk emir MUZC'yi ~%5, SMTK'yi ~%1,3 oynatır;
  50.000 muzluk emir MUZC'de sınıra dayanır. Derinlikler 2026-10-23'te 20 kat
  azaltıldı (kullanıcı isteği: önceki hâlde ortalama ~6.000 muzluk emir
  fiyatı %0,15 oynatıyordu). Emir kaymanın ortasından dolar (ortalama
  fiyat): al-hemen-sat komisyon kadar kaybettirir, etki doğrusal olduğundan
  emri bölmek de kazandırmaz. Etki o adımın fiyatına yazılır, sonraki adımlar
  oradan devam eder; ekran önizlemede ortalama dolumu ve fiyat etkisini gösterir.
- `/hisse liste`: bütün şirketler **tek resimde borsa panosu** (şirket
  emojisi, fiyat, 24 sa değişim, 12 saatlik mini grafik; görsel
  üretilemezse yazılı liste). `/hisse grafik sembol`: 12 saatlik büyük
  çizgi grafik (PNG, şirket ikonuyla). `/hisse al sembol adet|tutar`,
  `/hisse sat sembol adet|hepsi`, `/hisse portfoy [uye]` (adet, ortalama
  maliyet, güncel değer, kâr/zarar).
- Al/sat **%1 komisyon** (muz çıkışı); şirket başına kişi başı en çok 10.000
  adet; iki işlem arası 30 sn. İşlemden önce fiyat güncellenir, servis
  gecikse de eski fiyattan işlem olmaz. Defterde `hisse` (karsi_id sembol).
- Panel: hisse alım/satımı nötr (muz hisseye döner); portföydeki tutar arza dahil.

## Kredi (`/kredi`)

`/kredi al miktar vade`, `/kredi ode [miktar|hepsi]`, `/kredi durum`.

| Vade | Faiz (vade sonunda bir kez) |
| --- | ---: |
| 3 gün | %25 |
| 7 gün | %60 |
| 14 gün | %130 |

- **Sv 3'ten itibaren** (yeni hesap bedava kumar parası çekip borcu bırakamasın).
- Sınır: 5.000 + 2.000 × seviye (en çok 200.000), en az 1.000; aynı anda tek
  aktif kredi. Erken ödemede faiz geçen güne orantılıdır.
- Açık mevduatı olan kredi alamaz, açık kredisi olan mevduat açamaz
  (2026-10-23, mevduat süreleri yarıya inince): kredi alıp bankaya yatırmak
  kâr bırakmaz.
- **Vadesi geçen borç:** servis cüzdandan tahsil eder; yetmezse kalan borç
  olarak durur, her gecikme günü anaparanın %1'i ceza (en çok %20) ve sonraki
  her gelirin (günlük, sohbet, `/calis`, görev) **%50'si** kendiliğinden borca
  gider. Borçlu kumar oynayamaz, düello açamaz, muz gönderemez, takasa muz
  koyamaz; yeni kredi alamaz. `/cuzdan` borç satırını gösterir.
- Defterde `kredi`; panelde açık anapara geçici basım, faiz ve ceza yok edilen.

## Boss savaşı (`/boss`)

Her **Cumartesi 20:00 TR** `boss.kanal` kanalına bir BTD bossu çıkar
(Bloonarius, Lych, Vortex, Dreadbloon, Phayze, Blastapopoulos; %15 Elit).
Kanal ayarlı değilse boss çıkmaz. Boss 48 saat kalır; bot kapalıyken kaçan
çıkış 12 saat içinde açılışta telafi edilir.

- Can: `max(3.000, beklenen katılımcı × 600)` × boss çarpanı (1,0–1,5) × Elit
  1,6. Beklenen katılımcı = son 3 sonuçlanmış bossun ortalama katılımcısı
  (hiç boss yoksa son 7 günde ekonomi hareketi olan üyenin %30'u), en az 5;
  `boss_savaslari.beklenen`'e yazılır.
- **Denge (2026-10-22):** ilk iki boss eski formülle (aktif üye × 1.200)
  158.400 / 153.600 canla çıktı; 110 / 80 aktif üyeden yalnız 24 / 27'si
  saldırdı (kişi başı ~2,5 saldırı, ~575 hasar, toplam ~15 bin) ve ikisi de
  canının %90'ı dururken kaçtı. Yeni formülde katılımcı başına 600–900 can
  (Elit 960–1.440) düşer; 1 saatlik beklemeyle ortalama katılımcı ~4 saldırı,
  ~900 hasar yapar: normal boss çoğu hafta yenilir, Elit sıkı katılım ister.
- Saldırı (⚔️ butonu ya da `/boss saldir`): üye başına **1 saatte bir**. Hasar =
  (100 + kart gücü) × (0,85–1,15), %10 kritik (2x). Kart gücü en değerli 5
  kartın nadirliğine göre (10 / 25 / 60 / 120 / 250; parlak 2 kat).
- Yenilirse katılan herkese **1.000 + 2 × kendi hasarı** muz (2026-10-23;
  eski hasar payı havuzu, katılımcı × 2.500, az geliyordu). Başkalarının
  hasarından bağımsızdır; Elit daha çok can = daha çok hasar demektir. Üstüne
  herkese Ahşap Kasa, ilk 3'e Altın (Elit'te 1.'ye Elmas), son vuruşa +2.500 muz
  ve Demir Kasa. 48 saatte yenilmezse boss kaçar, katılanlara 300 muz teselli.
  Boss çıkınca ve sonuçlanınca Activity pencere ve sesle bildirir (katılana
  kendi ödülü ya da tesellisi; "Boss ve hisse bildirimi").
- Örnek: ortalama katılımcı (~4 saldırı, ~900 hasar) ~2.800 muz; 48 saatte her
  saat vuran (~48 saldırı, ~11 bin hasar) ~23 bin. Ödeme tek işlemde, bir kez.
  Defterde `boss`.
- `/boss durum`; Yönetici için `/boss cagir [boss] [elit]` (hemen boss çıkarır).

## Prestij (`/prestij`)

`/prestij bilgi` seviyeni, çarpanını, eşiğe ilerlemeni ve neyin sıfırlanacağını
gösterir; `/prestij yap` **onay butonuyla** (geri dönüşsüz, tek işlem) yapar.

- **Bedel yok, eşik var:** son prestijinden (hiç yapmadıysan baştan) beri
  **100.000 × (mevcut prestij + 1)** muz **emek geliri** kazanmış olmak gerekir
  — 100K, 200K … 1M; en çok 10 prestij. Emek geliri = defterde `gunluk`,
  `mesaj`, `calis`, `gorev`, `sefer` (çarpanın uygulandığı gelirler). Kumar,
  satış, faiz, kasa, boss, çiftlik, başarım, yönetici muzu sayılmaz.
- **Çarpan:** prestij başına **+%20 muz kazancı** (en çok ×3): `/gunluk`,
  sohbet muzu, `/calis`, görev muzu, sefer muzu ve **maymun çiftliklerinin
  üretim hızı**. Muz Çiftliği ve 2x etkinlikle çarpılır. Kumar, satış, faiz,
  kasa/set ödülleri, düello, piyango ve boss etkilenmez.
- **Ödül kasası:** her prestijde bir kasa — Prestij 1–4 🧰 Demir, 5–9 👑 Altın,
  10 💎 Elmas. Sıfırlamadan sonra verilir (eşya defterinde `prestij`).
- **Sıfırlananlar:** cüzdan, kartlar (normal + parlak), kasalar, Seri
  Koruyucu, set ödülü kaydı (setler yeniden kazanılır), dönmemiş seferler.
- **Muza çevrilenler:** maymun çiftlikleri satılır; satış değeri (%70, Muz
  Kurtarma ile %90) ve depodaki muz yeni cüzdana geçer.
- **Korunanlar:** seviye/XP ve seviye rolleri, rozetler ve rozet rolleri, özel
  renk rolü, başarımlar, görev ilerlemesi, prestij seviyesi, maymun deneyimleri ve yükseltme yolları,
  **günlük seri ve etkin takviyeler** (XP İksiri, Muz Çiftliği; 2026-10-22'den
  beri, kullanıcı isteğiyle).
- **Engeller:** aktif mevduat, açık kredi, elde hisse, açık blackjack eli,
  süren mines oyunu, bekleyen düello, süren XOX — önce kapatılmalı.
  Çekilmemiş piyango bileti engel değildir (2026-10-23'ten beri, kullanıcı
  isteğiyle): bilet geçerli kalır, kazanılan ikramiye yeni cüzdana yazılır.
- **Denge (2026-10-26):** eski kural 100K × (n+1) bedel alıp üstüne cüzdanı,
  kartları ve çiftlikleri siliyor, karşılığında yalnız emek gelirine +%10
  veriyordu. 19–26 Ekim defterinde sunucunun bütün emek geliri haftada ~1,19M
  iken tek haftada çiftliklere 1,49M yatırılmıştı; sıradan aktif üye (haftada
  20–50K emek) yalnız bedeli 20–50 haftada çıkarabiliyordu, en çok kazanan
  bile 3–4 haftada. Bu yüzden bedel kaldırıldı (sıfırlamanın kendisi bedel),
  çiftlik silinmek yerine muza çevrilir, çarpan +%20'ye çıktı ve çiftliğe de
  uygulanır, her prestij bir kasa verir. Eşik/çarpan tek sabitten ayarlanır
  (`ESIK_TABAN`, `CARPAN_YUZDE`).
- Görünürlük: `/cuzdan` prestij satırı, `/zenginler tur:prestij`, profil
  kartında ⭐×n, kanalda kutlama. İsteğe bağlı rol: `npm run prestijrol`
  ("🌟 Prestij n", `prestij.rol.<n>`). Defterde `prestij` (yok edilen cüzdan
  muzu; 2026-10-26'dan önceki kayıtlarda `bedel` de vardır).

## Promosyon kodları (`/promo`, `lib/promo.js`)

Yönetici **Activity → Yönetim → Promo kodları**'ndan kod oluşturur (yayında,
duyuruda dağıtılır). Üye kodu Activity ana ekranındaki **Promosyon kodu**
kartından ya da `/promo kod:` ile girer.

- **Kod:** 3–24 karakter (harf, rakam, tire); büyük-küçük harf ve Türkçe harf
  farkı yok (`muz yayın` = `MUZYAYIN`). Aynı kod ikinci kez oluşturulamaz.
- **Ödül:** 1–1.000.000 muz; her üye bir kodu **bir kez** kullanır.
- **Süre:** 30 dk – 7 gün (varsayılan 1 saat); **kullanım sınırı** isteğe
  bağlı (ilk N kişi). Yönetici kodu erken bitirebilir; verilen ödül geri alınmaz.
- Defterde `promo` (yoktan basılan muz; panelde "Promosyon kodu").
  Ekonomiden uzaklaştırılan üye kullanamaz.
- Yeni hesaplar da kullanabilir: yan hesapla kod toplayıp aktarmak gece
  denetimine (aşağıda) takılır; büyük ödüllü kodlarda kullanım sınırı konmalı.

## Ekonomiden uzaklaştırma (`lib/ekonomi-uzak.js`)

Yan hesapla ödül kasıp aktarma gibi kötüye kullanımda yönetici üyeyi
**Activity → Yönetim → Uzaklaştırma** sekmesinden ekonomiden uzaklaştırır
(sebep zorunlu, en çok 500 karakter; üye sebebi görür). Sunucudan çıkmış hesap
kimlikle uzaklaştırılabilir; bot sahibi ve geliştiriciler uzaklaştırılamaz.

- **Discord:** `ekonomi` sistemindeki her komut ve ekonomi butonları
  (kasa, düello, XOX, mines, takas, set, boss, prestij, çalışma…) yerine
  sebebi ve **Destek talebi aç** butonunu gösteren gizli bir yanıt gelir
  (`lib/interactions.js`, `ekonomi: true` bileşenler).
- **Activity:** `sistemsiz` olmayan her rota 403 + `kod: 'ekonomi-uzak'`
  döner (`web/sunucu.js`); arayüz kapanmayan bir pencere açar (sebep, tarih,
  talep aç butonu, arkadaki uygulama `inert`). Engel sunucuda olduğu için
  pencere kapansa da işlem yapılamaz. Talep `POST /api/talep/ac` ile açılır.
- **Kazanç:** sohbet muzu, mesaj ve ses XP'si verilmez (`xpVer`); piyango
  çekilişinde seçilmez.
- **Aktarım:** `/gonder`, hediye, takas (teklif ve kabul) ve pazar (ilan
  alma, istek eşleşmesi) iki yönde de reddedilir.
- **Sıralamalar:** `/zenginler` türleri ve `/seviye` sıralamasında görünmez.
- Bakiye ve envanter **dondurulur**, silinmez; uzaklaştırma kaldırılınca
  olduğu gibi döner. Tablo `ekonomi_uzaklastirmalari`.
- Yönetim sekmesindeki **Pencereyi önizle** pencereyi yöneticinin önüne
  düşürür (kapatılabilir, talep açmaz).
- **Gece otomatik denetimi** (`lib/supheli.js`, `servisler/supheli.js`):
  her gece 00:00 (TR) bir önceki günün aktarımları taranır. Bir çift şu üç
  koşulun hepsini taşırsa **iki taraf da** uzaklaştırılır (yetkili: bot):
  1. verenden alana net akan değer ≥ **5.000 muz**. Değer = muz (gönder,
     takasın muz kısmı, düello/XOX bahisleri, pazar) + eşya (takas, hediye,
     pazar; kart satış değeri, kasa mağaza fiyatı). Gidip gelen birbirini götürür.
  2. veren ekonomide yeni: ilk hareketi pencere başından en çok **7 gün** önce.
  3. veren sohbette yok gibi: **50**'den az XP'li mesaj.
  Uzun süredir oynayan üyeler arasındaki takas ve düellolar kurala girmez.
  Taranan gün `supheli_taramalari`na yazılır (aynı gün iki kez taranmaz; bot
  gece kapalıysa açılışta taranır). Sonuç talep rapor kanalına
  (`talep.raporKanal`) düşer. Yanlış uzaklaştırma panelden kaldırılır.
  Kuru çalıştırma (10–26 Ekim): yalnız 22 ve 24 Ekim'de bir çift çıktı
  (~70 ardışık kaybedilen 1.000'lik düello, 5 Altın + 2 Elmas Kasa ve RGB Balon
  kartının ucuz kartlara takası); geçmişe uygulanmadı.
- İlk uygulama (2026-10-27): bir çift elle uzaklaştırıldı (yeni hesapla
  karşılıklı takas ve düelloyla başarım kasılıp ~32 bin değerinde muz, kart ve
  kasa diğer hesaba aktarılmıştı). Üyenin itirazı üzerine aynı gün
  kaldırıldı: yazılı bir kural yoktu, kazanç geri alınmadı.

## Yönetici muz çarpanı

Bot sahibi ve yetkili geliştiriciler (`.env` → `authorUserID`,
`developerUserIDs`) emek gelirlerinde **×5** ek çarpan alır
(`lib/yonetici-carpan.js`). Prestij ve Katıl çarpanıyla aynı yerlere
(/gunluk, sohbet muzu, /calis, görev muzu) çarpılarak uygulanır; kumar,
satış, faiz, kasa, set ödülü, düello ve piyango çarpansızdır. /cuzdan,
/gunluk ve /calis çarpanı gösterir. 2026-10-10'da sahip ve geliştiricinin
prestiji doğrudan 10'a çıkarıldı (o zamanki bedel ve sıfırlama uygulanmadı; önceki
hâl `veri/yedekler/prestij-oncesi-20261010.sqlite`). Aynı sebeple yönetici
ile üye arasında takas ve hediye kapalıdır (`yoneticiUyeArasi`); muz
gönderimi açık ama panelde ayrı sayılır.

## Katıl (YouTube üyelik) muz bonusu

`sistem.uyelik` açıkken YouTube **Katıl** üyesi, kademesine göre prestijle aynı
gelirlerde (`/gunluk`, sohbet muzu, `/calis`, görev muzu) fazla muz alır.
Prestij, Muz Çiftliği ve 2x etkinlikle **çarpılarak** birleşir
(ör. Prestij 2 × kademe 4 = 1,4 × 1,5 = ×2,1). Kumar, satış, faiz, kasa/set
ödülleri, düello, piyango ve boss etkilenmez.

| Kademe | Rol (bu sunucu) | Varsayılan bonus |
|---|---|---|
| 1 | YouTube Member: Dingil Maymun😋 | +%10 |
| 2 | YouTube Member: Mühendis Maymun😎 | +%20 |
| 3 | YouTube Member: ÇİVİ FABRİKASI🤫 | +%35 |
| 4 | YouTube Member: KARA GÜNEŞ TANRISI!😱 | +%50 |
| 5–6 | (YouTube 6 seviyeye izin verir; boş) | +%75 / +%100 |

- Ayarlar: `uyelik.kademe.<n>.rol` ve `uyelik.kademe.<n>.muzBonusYuzde`
  (0–200). Birden çok kademe rolü olan üye en yüksek bonusu alır; toplanmaz.
  Genel "YouTube Member" rolü kademe sayılmaz.
- `npm run uyelik` boş kademe rollerini entegrasyon rollerinin oluşturulma
  sırasıyla doldurur; elle yazılmış eşlemeyi ezmez.
- Gelir yerleri üye nesnesi taşımadığından üyelik rolleri `uyelik_rolleri`
  tablosuna aynalanır (rol olayı + açılışta tam eşitleme, `lib/uyelik-carpan.js`).
- Görünürlük: `/gunluk` ve `/calis` sonucunda 💜 satırı, `/cuzdan`'da
  "Katıl üyeliği" alanı.

## Defter ve bütünlük

- Bakiye yalnız `ekle` / `dus` ile değişir. `dus` koşullu `UPDATE … WHERE
  bakiye >= ?` kullanır; yetmiyorsa hiçbir satır değişmez. Tablo da
  `CHECK (bakiye >= 0)` taşır.
- Her değişim aynı işlemde (SAVEPOINT) `ekonomi_hareketleri`ne yazılır: tür
  (`gunluk`, `mesaj`, `seviye`, `gonder`, `al`, `bahis`, `kazanc`, `iade`,
  `magaza`, `satis`, `pazar`, `mevduat`, `faiz`, `yonetici`), işaretli miktar, sonraki
  bakiye, karşı taraf.
- `/ekonomi-yonet ver|al|sifirla` yalnız **Yönetici** yetkisine açık (varsayılan
  komut izni ve komut içi denetim). `ver` muzu kimseden kesmeden basar; bütün
  düzeltmeler `yonetici` türüyle ve yöneticinin kimliğiyle deftere yazılır.
- Mağaza alımları `magaza` türüyle, karşı taraf olarak eşya kimliği ya da rol
  kimliğiyle yazılır. Eşyalar `envanter`, takviye süreleri `etkiler`, renk
  rolleri `ozel_roller` tablosunda.

## Sistem kapalıyken

`sistem.ekonomi` kapalıyken bütün ekonomi komutları reddedilir, sohbet ve
seviye ödülü ve kasası verilmez, takviyeler işlemez (süreleri yine akar),
blackjack ve kasa butonları çalışmaz. Bakiyeler ve eşyalar silinmez.
