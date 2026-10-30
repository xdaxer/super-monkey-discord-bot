import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { SECENEK_SINIRI } from '../../lib/ayarlar.js';
import { alanlaraBol, gomu, PINGSIZ } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { muz, SERI_KORUYUCU } from '../../lib/ekonomi.js';
import { envanter as envanterOku, serbestEnvanter } from '../../lib/envanter.js';
import { esyaGetir, rozetler } from '../../lib/esyalar.js';
import { kartIzgarasi, puanSatiri } from '../../lib/envanter-gorunum.js';
import { gorevBildir } from '../../lib/gorev-bilesen.js';
import {
  BIRLESTIRME_ADEDI, BIRLESTIRME_SINIRI, birlestir as birlestirKartlar, birlestirilebilirMi, toptanBirlestir,
  toptanBirlestirOnizleme, ustNadirlik,
} from '../../lib/birlestirme.js';
import { emojiCozucu, satisOnayButonlari } from '../../lib/kasa-bilesen.js';
import {
  HEDIYE_GUNLUK, hediyeEdilirMi, hediyeEt, KARTLAR, kartDegeri, kartGetir, kartMi, kartSat, KASA_KIMLIKLERI,
  koleksiyon, kopyalariSat, NADIRLIK_SIRASI, NADIRLIKLER, parlakKimlik, TOPTAN_HEPSI, toptanAyristir, toptanOnizleme,
} from '../../lib/kasalar.js';
import { odulAlindiMetni, setGorunumu } from '../../lib/set-bilesen.js';
import { odulMetni, setDurumlari, setOduluAl } from '../../lib/setler.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

export const data = new SlashCommandBuilder()
  .setName('envanter')
  .setDescription('Kasaların, kartların ve eşyaların.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s
    .setName('goster').setDescription('Envanter özeti: kasalar, koleksiyon, rozetler.')
    .addUserOption((o) => o.setName('uye').setDescription('Kimin (boşsa kendin)')))
  .addSubcommand((s) => s
    .setName('kartlar').setDescription('Kart koleksiyonunu listeler.')
    .addStringOption((o) => o
      .setName('nadirlik').setDescription('Yalnız bir nadirlik')
      .addChoices(...NADIRLIK_SIRASI.map((n) => ({ name: `${NADIRLIKLER[n].simge} ${NADIRLIKLER[n].ad}`, value: n }))))
    .addUserOption((o) => o.setName('uye').setDescription('Kimin (boşsa kendin)')))
  .addSubcommand((s) => s
    .setName('sat').setDescription('Kart satar: tek kart, bir nadirliğin hepsi ya da bütün kartlar.')
    .addStringOption((o) => o
      .setName('kart').setDescription('Hangi kart — ya da listenin başındaki "Bütün kartlar"').setRequired(true).setAutocomplete(true))
    .addIntegerOption((o) => o.setName('adet').setDescription('Kaç tane (varsayılan 1)').setMinValue(1).setMaxValue(1000))
    .addBooleanOption((o) => o.setName('tumu').setDescription('Bu kartın bütün kopyalarını sat')))
  .addSubcommand((s) => s
    .setName('kopyalari-sat').setDescription('Her karttan birer tane bırakıp kopyaların hepsini satar.'))
  .addSubcommand((s) => s
    .setName('birlestir').setDescription(`Aynı kartın ${BIRLESTIRME_ADEDI} kopyasını bir üst nadirlikten rastgele 1 karta çevirir.`)
    .addStringOption((o) => o
      .setName('kart').setDescription('Hangi kart — ya da listenin başındaki "Bütün uygun kopyalar"').setRequired(true).setAutocomplete(true))
    .addIntegerOption((o) => o
      .setName('adet').setDescription('Kaç kez birleştirilsin (varsayılan 1)').setMinValue(1).setMaxValue(BIRLESTIRME_SINIRI)))
  .addSubcommand((s) => s
    .setName('hediye').setDescription(`Kasa ya da kart hediye eder (günde en çok ${HEDIYE_GUNLUK}).`)
    .addUserOption((o) => o.setName('uye').setDescription('Kime').setRequired(true))
    .addStringOption((o) => o.setName('esya').setDescription('Ne').setRequired(true).setAutocomplete(true))
    .addIntegerOption((o) => o.setName('adet').setDescription('Kaç tane (varsayılan 1)').setMinValue(1).setMaxValue(HEDIYE_GUNLUK)))
  .addSubcommand((s) => s
    .setName('setler').setDescription('Koleksiyon setlerinin ilerlemesi ve tamamlanan setlerin ödülleri.'))
  .addSubcommand((s) => s
    .setName('set-odul').setDescription('Tamamladığın bir setin ödülünü al (her set için bir kez).')
    .addStringOption((o) => o.setName('set').setDescription('Hangi set').setRequired(true).setAutocomplete(true)));

const gizli = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral, ...PINGSIZ });

/** Envanterdeki kart/kasa adı (otomatik tamamlama ve mesajlar için). */
function nesneAdi(kimlik) {
  return kartGetir(kimlik)?.ad ?? esyaGetir(kimlik)?.ad ?? kimlik;
}

export async function autocomplete(interaction) {
  const odak = interaction.options.getFocused(true);
  const aranan = String(odak.value ?? '').toLocaleLowerCase('tr-TR');

  // Set ödülünde yalnız şimdi alınabilen (tamam, ödülü alınmamış) setler listelenir.
  if (odak.name === 'set') {
    const alinabilir = setDurumlari(veritabani(), interaction.guildId, interaction.user.id)
      .filter((d) => d.alinabilir)
      .map((d) => ({ name: `${d.set.simge} ${d.set.ad} — ${odulMetni(d.set.odul)}`.slice(0, 100), value: d.set.kimlik }))
      .filter((s) => !aranan || s.name.toLocaleLowerCase('tr-TR').includes(aranan))
      .slice(0, SECENEK_SINIRI);
    await interaction.respond(alinabilir);
    return;
  }

  // Çalışmaya kilitli maymun kopyası satış/hediye önerilerinde sayılmaz.
  const sahip = serbestEnvanter(veritabani(), interaction.guildId, interaction.user.id);
  const birlestirme = odak.name === 'kart' && interaction.options.getSubcommand(false) === 'birlestir';
  const uygun = birlestirme ? (kimlik) => birlestirilebilirMi(kimlik) && (sahip[kimlik] ?? 0) >= BIRLESTIRME_ADEDI
    : odak.name === 'kart' ? kartMi : hediyeEdilirMi;

  // Satışta listenin başı toptan seçenekler: bütün kartlar ve nadirlik başına.
  const toptan = [];
  if (birlestirme) {
    const o = toptanBirlestirOnizleme(sahip);
    if (o.birlestirme > 0) {
      toptan.push({
        name: `🧩 Bütün uygun kopyalar — ${o.birlestirme} birleştirme (${o.harcanan} kopya), her karttan 1 kalır`,
        value: TOPTAN_HEPSI,
      });
    }
  } else if (odak.name === 'kart') {
    const tum = toptanOnizleme(sahip);
    if (tum.adet > 0) toptan.push({ name: `🧹 Bütün kartlar — ${tum.adet} kart, ${tum.tutar.toLocaleString('tr-TR')} muz`, value: TOPTAN_HEPSI });
    for (const n of NADIRLIK_SIRASI) {
      const o = toptanOnizleme(sahip, n);
      if (o.adet > 0) {
        toptan.push({
          name: `🧹 Bütün ${NADIRLIKLER[n].simge} ${NADIRLIKLER[n].ad} kartlar — ${o.adet} kart, ${o.tutar.toLocaleString('tr-TR')} muz`,
          value: `${TOPTAN_HEPSI}:${n}`,
        });
      }
    }
  }

  const secenekler = [...toptan, ...Object.entries(sahip)
    .filter(([kimlik]) => uygun(kimlik))
    .map(([kimlik, n]) => {
      const kart = kartGetir(kimlik);
      const etiket = kart
        ? `${NADIRLIKLER[kart.nadirlik].simge} ${kart.ad} ×${n} — ${kartDegeri(kart).toLocaleString('tr-TR')} muz/adet`
        : `${esyaGetir(kimlik).yedek} ${nesneAdi(kimlik)} ×${n}`;
      return { name: etiket.slice(0, 100), value: kimlik };
    })]
    .filter((s) => !aranan || s.name.toLocaleLowerCase('tr-TR').includes(aranan))
    .slice(0, SECENEK_SINIRI);

  await interaction.respond(secenekler);
}

async function goster(interaction, db) {
  const hedef = interaction.options.getUser('uye') ?? interaction.user;
  const sahip = envanterOku(db, interaction.guildId, hedef.id);
  const emoji = emojiCozucu(interaction.guild);
  const kol = koleksiyon(db, interaction.guildId, hedef.id);
  const { puan, metin } = puanSatiri(sahip);

  const kasalar = KASA_KIMLIKLERI.map((k) => `${esyaGetir(k).yedek}×**${sahip[k] ?? 0}**`).join('  ');
  const sahipRozetler = rozetler(db, interaction.guildId, hedef.id).reverse();
  const rozetSatiri = sahipRozetler.length > 0 ? sahipRozetler.map(emoji).join('') : '—';
  const koruyucu = sahip[SERI_KORUYUCU] ? `  🛡️×**${sahip[SERI_KORUYUCU]}**` : '';
  const ad = interaction.guild?.members?.cache?.get(hedef.id)?.displayName ?? hedef.globalName ?? hedef.username;

  // OwO zoo düzeni: başlık, nadirlik satırları, altta puan ve sayım.
  const embed = gomu('bilgi')
    .setAuthor({ name: `${ad} · envanter`, iconURL: hedef.displayAvatarURL?.() ?? undefined })
    .setDescription([
      `🌴 🍌 🐒 **${ad} koleksiyonu** 🐒 🍌 🌴`,
      `${kasalar}${koruyucu}`,
      `🎈 ${rozetSatiri}`,
      '',
      kartIzgarasi(sahip, emoji),
      '',
      `**Koleksiyon Puanı: __${puan.toLocaleString('tr-TR')}__**`,
      `⠀⠀**${metin}** · ${kol.farkli}/${kol.toplam} farklı`,
    ].join('\n'))
    .setFooter({ text: '/kasa ac · /envanter kartlar · /envanter kopyalari-sat' });

  await interaction.reply({ embeds: [embed] });
}

async function kartlar(interaction, db) {
  const hedef = interaction.options.getUser('uye') ?? interaction.user;
  const secilen = interaction.options.getString('nadirlik');
  const sahip = envanterOku(db, interaction.guildId, hedef.id);
  const emoji = emojiCozucu(interaction.guild);

  const alanlar = [];
  for (const nadirlik of NADIRLIK_SIRASI) {
    if (secilen && secilen !== nadirlik) continue;
    const n = NADIRLIKLER[nadirlik];
    const kademe = KARTLAR.filter((k) => k.nadirlik === nadirlik);
    // Sahip olunmayan kartlar ❔ ile gizli: ne kaldığı görünsün ama sürpriz bozulmasın.
    // Parlak sürüm ayrı satırdır (✨ adın başında); normal kopya yoksa yalnız o satır görünür.
    const satirlar = kademe.flatMap((k) => {
      const parlak = kartGetir(parlakKimlik(k.kimlik));
      const sayilar = [sahip[k.kimlik] ?? 0, sahip[parlak.kimlik] ?? 0];
      if (sayilar[0] + sayilar[1] === 0) return ['❔ ???'];
      return [
        ...(sayilar[0] > 0 ? [`${emoji(k)} ${k.ad}${sayilar[0] > 1 ? ` ×${sayilar[0]}` : ''}`] : []),
        ...(sayilar[1] > 0 ? [`${emoji(parlak)} ${parlak.ad}${sayilar[1] > 1 ? ` ×${sayilar[1]}` : ''} · ${muz(kartDegeri(parlak))}/adet`] : []),
      ];
    });
    const sayi = kademe.filter((k) => sahip[k.kimlik] || sahip[parlakKimlik(k.kimlik)]).length;
    alanlar.push(...alanlaraBol(`${n.simge} ${n.ad} — ${sayi}/${kademe.length} · ${muz(n.deger)}/adet`, satirlar));
  }

  const kol = koleksiyon(db, interaction.guildId, hedef.id);
  const embed = gomu('bilgi', `🃏 ${hedef.username} — kart koleksiyonu ${kol.farkli}/${kol.toplam}`)
    .addFields(alanlar.slice(0, 25))
    .setFooter({ text: 'Kopyaları satmak için /envanter kopyalari-sat' });
  await interaction.reply({ embeds: [embed] });
}

async function sat(interaction, db) {
  const kimlik = interaction.options.getString('kart', true);
  const kullaniciId = interaction.user.id;

  // Toptan satış koleksiyonu siler: önce ne gideceği gösterilip onay istenir.
  const toptan = toptanAyristir(kimlik);
  if (toptan) {
    const o = toptanOnizleme(serbestEnvanter(db, interaction.guildId, kullaniciId), toptan.nadirlik);
    if (o.adet === 0) {
      await gizli(interaction, 'Satılacak kartın yok.');
      return;
    }
    const kapsam = toptan.nadirlik
      ? `bütün ${NADIRLIKLER[toptan.nadirlik].simge} **${NADIRLIKLER[toptan.nadirlik].ad}** kartlarını`
      : '**bütün kartlarını**';
    await interaction.reply({
      content: `⚠️ ${kapsam} satmak üzeresin: **${o.adet} kart → +${muz(o.tutar)}**.\nHer karttan son kopya da gider, koleksiyonundan silinir. Emin misin?\n-# Yalnız kopyaları satmak için \`/envanter kopyalari-sat\`.`,
      components: [satisOnayButonlari(toptan.nadirlik, kullaniciId)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const tumu = interaction.options.getBoolean('tumu') ?? false;
  const adet = tumu
    ? Math.max(1, serbestEnvanter(db, interaction.guildId, kullaniciId)[kimlik] ?? 0)
    : interaction.options.getInteger('adet') ?? 1;
  const sonuc = kartSat(db, {
    guildId: interaction.guildId, kullaniciId, kimlik, adet,
  });
  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }
  const emoji = emojiCozucu(interaction.guild);
  await gizli(interaction, `${emoji(sonuc.kart)} ${sonuc.adet} × **${sonuc.kart.ad}** satıldı: +${muz(sonuc.tutar)} · Bakiye: ${muz(sonuc.bakiye)}`);
  await gorevBildir(interaction, [{ tur: 'kart-sat', miktar: sonuc.adet }]);
}

async function kopyalar(interaction, db) {
  const sonuc = kopyalariSat(db, { guildId: interaction.guildId, kullaniciId: interaction.user.id });
  await gizli(interaction, sonuc.adet > 0
    ? `🃏 ${sonuc.adet} kopya kart satıldı: **+${muz(sonuc.tutar)}**. Her karttan biri koleksiyonunda kaldı.`
    : 'Satılacak kopya kartın yok.');
  await gorevBildir(interaction, [{ tur: 'kart-sat', miktar: sonuc.adet }]);
}

/** Birleştirme sonuçlarını satırlara döker: aynı kart tekrarlıysa ×n ile toplanır. */
function birlestirmeSatirlari(sonuclar, emoji) {
  const gruplar = new Map();
  for (const s of sonuclar) {
    const g = gruplar.get(s.kart.kimlik) ?? { kart: s.kart, adet: 0, yeni: false };
    g.adet += 1;
    g.yeni ||= s.yeniKart;
    gruplar.set(s.kart.kimlik, g);
  }
  return [...gruplar.values()].map((g) => {
    const n = NADIRLIKLER[g.kart.nadirlik];
    return `${n.simge} ${emoji(g.kart)} **${g.kart.ad}**${g.adet > 1 ? ` ×${g.adet}` : ''}${g.yeni ? ' · 🆕 **YENİ**' : ''}`;
  });
}

async function birlestir(interaction, db) {
  const kimlik = interaction.options.getString('kart', true);
  const kullaniciId = interaction.user.id;
  const emoji = emojiCozucu(interaction.guild);
  const toptan = kimlik === TOPTAN_HEPSI;

  const sonuc = toptan
    ? (toptanBirlestirOnizleme(envanterOku(db, interaction.guildId, kullaniciId)).birlestirme > 0
      ? toptanBirlestir(db, { guildId: interaction.guildId, kullaniciId })
      : { ok: false, sebep: `Birleştirilecek kopyan yok: her karttan 1 kopya kalacak şekilde ${BIRLESTIRME_ADEDI}'li grup gerekir.` })
    : birlestirKartlar(db, {
      guildId: interaction.guildId, kullaniciId, kimlik, adet: interaction.options.getInteger('adet') ?? 1,
    });
  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }

  const satirlar = birlestirmeSatirlari(sonuc.sonuclar, emoji);
  const kaynak = toptan
    ? `**${sonuc.harcanan} kopya**`
    : `${sonuc.harcanan} × ${emoji(sonuc.kaynak)} **${sonuc.kaynak.ad}**`;
  const ust = toptan ? '' : ` (${NADIRLIKLER[ustNadirlik(sonuc.kaynak.nadirlik)].simge} ${NADIRLIKLER[ustNadirlik(sonuc.kaynak.nadirlik)].ad})`;
  await gizli(interaction, `🧩 ${kaynak} birleştirildi${ust}:\n${satirlar.join('\n')}`.slice(0, 2000));
  if (sonuc.yeniKart > 0) await gorevBildir(interaction, [{ tur: 'kart-yeni', miktar: sonuc.yeniKart }]);
}

async function hediye(interaction, db) {
  const alici = interaction.options.getUser('uye', true);
  if (alici.bot) {
    await gizli(interaction, 'Botlara hediye veremezsin.');
    return;
  }
  const kimlik = interaction.options.getString('esya', true);
  const sonuc = hediyeEt(db, {
    guildId: interaction.guildId,
    gonderenId: interaction.user.id,
    aliciId: alici.id,
    kimlik,
    adet: interaction.options.getInteger('adet') ?? 1,
  });
  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }

  const nesne = kartGetir(kimlik) ?? esyaGetir(kimlik);
  await interaction.reply({
    content: `🎁 <@${interaction.user.id}> → <@${alici.id}>: ${sonuc.adet} × ${emojiCozucu(interaction.guild)(nesne)} **${nesneAdi(kimlik)}**`,
    allowedMentions: { users: [alici.id] },
  });
}

async function setler(interaction, db) {
  const ad = interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username;
  await interaction.reply({
    ...setGorunumu(db, { guildId: interaction.guildId, kullanici: interaction.user, ad }),
    ...PINGSIZ,
  });
}

async function setOdul(interaction, db) {
  const sonuc = setOduluAl(db, {
    guildId: interaction.guildId,
    kullaniciId: interaction.user.id,
    setKimligi: interaction.options.getString('set', true),
  });
  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }
  await interaction.reply({ content: odulAlindiMetni(sonuc), ...PINGSIZ });
}

export async function execute(interaction) {
  const db = veritabani();
  const islemler = {
    goster, kartlar, sat, 'kopyalari-sat': kopyalar, birlestir, hediye, setler, 'set-odul': setOdul,
  };
  await islemler[interaction.options.getSubcommand()](interaction, db);
}
