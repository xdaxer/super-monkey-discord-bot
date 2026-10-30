import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import { talepEkle, talepGetir } from '../lib/talep.js';
import {
  ayikla, belgeler, bolumSec, CIKTI_SEMASI, ENGEL_YANITI, sizintiVarMi, ciktiAyristir, istemMetni, MODEL, modelSor, raporEkle, raporGomuVerisi,
  raporlariGetir, TALEP_YANIT_SINIRI, telafiGecikmesi, TELAFI_SINIRI_MS, yanitlanmaliMi, yanitMetni,
  yanitSay, yanitSayisi, yazarRolu, yazismaMetni, YETKILI_SESSIZLIK_MS, BEKLEME_MS,
} from '../lib/talep-yz.js';

const SAHIP = '111';
const T0 = 1_800_000_000_000;
const mesaj = (id, content, { bot = false, zaman = T0 } = {}) => ({
  author: { id, bot, username: bot ? 'Süper Maymun' : `k${id}` }, content, createdTimestamp: zaman,
});
const cikti = (veri) => JSON.stringify({
  yanit: 'Selam!', anlasildi: true, rapor: { var: false, tur: 'diger', baslik: '', ozet: '' }, ...veri,
});

describe('talep yapay zekâ: ne zaman yanıtlar', () => {
  it('yazarları sınıflar', () => {
    assert.equal(yazarRolu(mesaj(SAHIP, 'a'), SAHIP), 'ÜYE');
    assert.equal(yazarRolu(mesaj('9', 'a', { bot: true }), SAHIP), 'BOT');
    assert.equal(yazarRolu(mesaj('222', 'a'), SAHIP), 'YETKİLİ');
  });

  it('son mesaj üyenin değilse yanıtlamaz', () => {
    assert.equal(yanitlanmaliMi([mesaj(SAHIP, 'a'), mesaj('9', 'b', { bot: true })], { sahipId: SAHIP, simdi: T0 }).ok, false);
    assert.equal(yanitlanmaliMi([], { sahipId: SAHIP, simdi: T0 }).ok, false);
    assert.equal(yanitlanmaliMi([mesaj(SAHIP, 'a')], { sahipId: SAHIP, simdi: T0 }).ok, true);
  });

  it('yetkili yakın zamanda yazdıysa susar, eskiyse devam eder', () => {
    const yakin = [mesaj('222', 'bakıyorum', { zaman: T0 }), mesaj(SAHIP, 'tamam', { zaman: T0 + 1 })];
    assert.equal(yanitlanmaliMi(yakin, { sahipId: SAHIP, simdi: T0 + 60_000 }).ok, false);
    assert.equal(yanitlanmaliMi(yakin, { sahipId: SAHIP, simdi: T0 + YETKILI_SESSIZLIK_MS + 1 }).ok, true);
  });

  it('yanıt sınırı doluysa susar', () => {
    assert.equal(yanitlanmaliMi([mesaj(SAHIP, 'a')], { sahipId: SAHIP, yanitSayisi: TALEP_YANIT_SINIRI, simdi: T0 }).ok, false);
  });
});

describe('talep yapay zekâ: yeniden başlatma', () => {
  it('açılışta cevapsız talep kalan süre dolunca yanıtlanır', () => {
    assert.equal(telafiGecikmesi([mesaj(SAHIP, 'a', { zaman: T0 })], SAHIP, T0 + 10_000), BEKLEME_MS - 10_000);
    assert.equal(telafiGecikmesi([mesaj(SAHIP, 'a', { zaman: T0 })], SAHIP, T0 + 3_600_000), 5_000);
  });

  it('cevaplanmış, boş ya da çok eski talep telafi edilmez', () => {
    assert.equal(telafiGecikmesi([mesaj('9', 'yanıt', { bot: true })], SAHIP, T0), null);
    assert.equal(telafiGecikmesi([mesaj('222', 'yetkili')], SAHIP, T0), null);
    assert.equal(telafiGecikmesi([], SAHIP, T0), null);
    assert.equal(telafiGecikmesi([mesaj(SAHIP, 'a', { zaman: T0 })], SAHIP, T0 + TELAFI_SINIRI_MS + 1), null);
  });

  it('yanıt sayısı veritabanında', () => {
    const db = acVeritabani(':memory:');
    assert.equal(yanitSayisi(db, 5), 0);
    yanitSay(db, 5);
    yanitSay(db, 5);
    assert.equal(yanitSayisi(db, 5), 2);
    assert.equal(yanitSayisi(db, 6), 0);
  });
});

describe('talep yapay zekâ: çıktı', () => {
  it('anlaşılan öneri rapor olur', () => {
    const s = ciktiAyristir(cikti({ rapor: { var: true, tur: 'oneri', baslik: 'Kasa indirimi', ozet: 'Kasalara indirim istiyor.' } }));
    assert.deepEqual(s.rapor, { tur: 'oneri', baslik: 'Kasa indirimi', ozet: 'Kasalara indirim istiyor.' });
    assert.equal(s.anlasildi, true);
  });

  it('anlaşılmayan mesajda rapor yok; kısmen anlaşılanda anlaşılan kısım raporlanır', () => {
    const yok = ciktiAyristir(cikti({ yanit: 'Tam anlayamadım.', anlasildi: false }));
    assert.equal(yok.rapor, null);
    assert.equal(yok.yanit, 'Tam anlayamadım.');
    const kismi = ciktiAyristir(cikti({ anlasildi: false, rapor: { var: true, tur: 'oneri', baslik: 'x', ozet: 'y' } }));
    assert.equal(kismi.anlasildi, false);
    assert.equal(kismi.rapor.tur, 'oneri');
  });

  it('bozuk, boş ya da bilinmeyen türlü çıktı', () => {
    assert.equal(ciktiAyristir('json değil'), null);
    assert.equal(ciktiAyristir(cikti({ yanit: '  ' })), null);
    assert.equal(ciktiAyristir(cikti({ rapor: { var: true, tur: 'uydurma', baslik: 'x', ozet: 'y' } })).rapor, null);
    assert.equal(ciktiAyristir(cikti({ rapor: { var: true, tur: 'oneri', baslik: '', ozet: 'y' } })).rapor, null);
  });

  it('yanıt kırpılır ve otomatik notu taşır', () => {
    assert.ok(ciktiAyristir(cikti({ yanit: 'a'.repeat(5_000) })).yanit.length <= 1_800);
    assert.match(yanitMetni('Selam'), /^Selam\n-# 🤖 Otomatik yanıt/);
    assert.ok(yanitMetni('a'.repeat(1_800)).length <= 2_000);
  });

  it('şema türleri ve istem', () => {
    assert.deepEqual(CIKTI_SEMASI.properties.rapor.properties.tur.enum, ['oneri', 'hata', 'sikayet', 'soru', 'diger']);
    const yazisma = yazismaMetni([
      mesaj('9', 'Merhaba!', { bot: true }), { ...mesaj(SAHIP, ''), attachments: new Map([['1', { contentType: 'image/png' }]]) },
    ], SAHIP);
    assert.match(yazisma, /\[BOT\] Süper Maymun: Merhaba!/);
    assert.match(yazisma, /\[ÜYE\] k111: \[ek: görsel\]/);
    const istem = istemMetni({ talep: { id: 4 }, yazisma, oncekiRaporlar: [{ tur: 'oneri', baslik: 'A', ozet: 'B' }] });
    assert.match(istem, /Talep #4/);
    assert.match(istem, /- \[oneri\] A: B/);
  });

  it('belgeler okunuyor; işletim ve yönetici iç bilgisi modele gitmiyor', () => {
    const b = belgeler();
    assert.match(b, /<belge ad="para.md">/);
    assert.match(b, /### Ekonomi \(muz\) ve kumar/);
    for (const yasak of ['Sürekli çalıştırma', '.nvm', '/home/', '.env', 'Yönetici muz çarpanı', 'Defter ve bütünlük', 'yönetici geliri']) {
      assert.ok(!b.includes(yasak), yasak);
    }
  });

  it('bölüm seçimi: dahil alt başlıklarıyla, hariç kendi alt başlıklarıyla', () => {
    const md = '# A\nx\n## B\nb\n### B1\nb1\n```sh\n# yorum\n```\n## C\nc\n### C1\nc1\n## D\nd';
    assert.equal(bolumSec(md, { dahil: ['## B'] }), '## B\nb\n### B1\nb1\n```sh\n# yorum\n```');
    assert.equal(bolumSec(md, { haric: ['## C'] }), '# A\nx\n## B\nb\n### B1\nb1\n```sh\n# yorum\n```\n## D\nd');
    assert.equal(ayikla('Yöneticiler (`.env` → `authorUserID`, `developerUserIDs`) bilet alabilir'), 'Yöneticiler bilet alabilir');
  });

  it('sızıntı denetimi', () => {
    for (const kotu of ['e-posta: ornek.kisi@gmail.com', '/home/kullanici/bot', 'dizin /tmp/talep-yz', 'Linux 6.14.0-37-generic',
      'app/.env dosyası', '192.168.1.10', 'system-reminder', 'Primary working directory']) {
      assert.ok(sizintiVarMi(kotu), kotu);
    }
    for (const iyi of ['Günlük ödül gece yarısı sıfırlanır.', '/gunluk ile alabilirsin', 'Kasa %25 indirimli', 'v1.2 sürümü']) {
      assert.ok(!sizintiVarMi(iyi), iyi);
    }
  });
});

describe('talep yapay zekâ: model ve rapor', () => {
  it('Haiku çağrısı: claude -p, araçsız, yapılandırılmış çıktı', async () => {
    let giden;
    const calistir = (cikti) => async (argumanlar, istem, secenek) => { giden = { argumanlar, istem, secenek }; return JSON.stringify(cikti); };
    const s = await modelSor('istem', { calistir: calistir({ is_error: false, structured_output: JSON.parse(cikti({})) }) });
    assert.equal(s.yanit, 'Selam!');
    const a = giden.argumanlar;
    assert.equal(a[a.indexOf('--model') + 1], MODEL);
    assert.equal(MODEL, 'haiku');
    assert.equal(a[a.indexOf('--tools') + 1], '');
    assert.ok(a.includes('--strict-mcp-config') && a.includes('--no-session-persistence') && a.includes('-p'));
    assert.deepEqual(JSON.parse(a[a.indexOf('--json-schema') + 1]), CIKTI_SEMASI);
    assert.equal(giden.istem, 'istem');
    assert.match(readFileSync(a[a.indexOf('--system-prompt-file') + 1], 'utf8'), /Süper Maymun.*destek asistanısın/);
    assert.equal(await modelSor('x', { calistir: calistir({ is_error: true }) }), null);
    const sizan = await modelSor('x', { calistir: calistir({ is_error: false, structured_output: JSON.parse(cikti({ yanit: 'E-posta: a.b@gmail.com' })) }) });
    assert.equal(sizan.yanit, ENGEL_YANITI);
    assert.equal(sizan.rapor.baslik, 'Otomatik yanıt engellendi');
    assert.equal(await modelSor('x', { calistir: calistir({ is_error: false }) }), null);
  });

  it('rapor kaydı ve gömüsü', () => {
    const db = acVeritabani(':memory:');
    const id = talepEkle(db, { guildId: 'g', kanalId: 'k', kullaniciId: SAHIP, konu: 'Destek talebi' });
    const talep = talepGetir(db, id);
    raporEkle(db, { talep, rapor: { tur: 'hata', baslik: 'Kasa açılmıyor', ozet: 'Kasa açınca hata alıyor.' }, mesajId: 'm1' });
    assert.deepEqual(raporlariGetir(db, id).map((r) => ({ ...r })), [{ tur: 'hata', baslik: 'Kasa açılmıyor', ozet: 'Kasa açınca hata alıyor.' }]);
    const g = raporGomuVerisi({ talep, rapor: { tur: 'hata', baslik: 'Kasa açılmıyor', ozet: 'x' }, mesajUrl: 'https://d/1' });
    assert.equal(g.title, '🐛 Hata bildirimi: Kasa açılmıyor');
    assert.equal(g.fields[0].value, `<@${SAHIP}>`);
    assert.equal(g.fields.length, 3);
  });
});
