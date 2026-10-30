import {
  InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';

import { ayarGetir, SECENEK_SINIRI } from '../../lib/ayarlar.js';
import { gomu, PINGSIZ, zaman } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { bakiye, muz } from '../../lib/ekonomi.js';
import { etkinlikFiyati } from '../../lib/etkinlik.js';
import {
  esyaEmoji, esyaGetir, esyaSatinAl, KASA_ALIM_SINIRI, KATEGORI_ADLARI, RENK_DEGISIM, RENK_FIYAT, renkAyristir, renkMetni,
  renkSatinAl, satilikEsyalar,
} from '../../lib/esyalar.js';
import {
  FIYAT_MAX, rolSatilabilirMi, satinAl, urunEkle, urunGetir, urunKaldir, urunler,
} from '../../lib/magaza.js';
import { gorevBildir } from '../../lib/gorev-bilesen.js';
import { rozetRoluVer } from '../../lib/rozet-rol.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

const ROL_ONEKI = 'rol:';

export const data = new SlashCommandBuilder()
  .setName('magaza')
  .setDescription('Muzla kasa, takviye, rozet, renk rolü ve rol satın al.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s
    .setName('liste').setDescription('Mağazadaki her şeyi gösterir.')
    .addStringOption((o) => o
      .setName('kategori').setDescription('Yalnız bir bölüm')
      .addChoices(
        { name: 'Kasalar', value: 'kasa' },
        { name: 'Takviyeler', value: 'takviye' },
        { name: 'Rozetler', value: 'rozet' },
        { name: 'Roller', value: 'rol' },
      )))
  .addSubcommand((s) => s
    .setName('al').setDescription('Mağazadan bir şey satın alır.')
    .addStringOption((o) => o
      .setName('urun').setDescription('Ne alacaksın (yazmaya başla)').setRequired(true).setAutocomplete(true))
    .addIntegerOption((o) => o
      .setName('adet').setDescription(`Yalnız kasalarda: kaç tane (1–${KASA_ALIM_SINIRI})`)
      .setMinValue(1).setMaxValue(KASA_ALIM_SINIRI)))
  .addSubcommand((s) => s
    .setName('renk').setDescription(`Kendine özel renkli rol: ilk alım ${RENK_FIYAT.toLocaleString('tr-TR')}, renk değişimi ${RENK_DEGISIM.toLocaleString('tr-TR')} muz.`)
    .addStringOption((o) => o
      .setName('renk').setDescription('Onaltılık renk: #ff8800, #3fa, 7289da').setRequired(true).setMaxLength(7)))
  .addSubcommand((s) => s
    .setName('ekle').setDescription('(Sunucuyu Yönet) Bir rolü satışa koyar ya da fiyatını değiştirir.')
    .addRoleOption((o) => o.setName('rol').setDescription('Satılacak rol').setRequired(true))
    .addIntegerOption((o) => o
      .setName('fiyat').setDescription('Muz cinsinden fiyat').setRequired(true)
      .setMinValue(1).setMaxValue(FIYAT_MAX)))
  .addSubcommand((s) => s
    .setName('kaldir').setDescription('(Sunucuyu Yönet) Bir rolü satıştan kaldırır.')
    .addRoleOption((o) => o.setName('rol').setDescription('Kaldırılacak rol').setRequired(true)));

function gizli(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral, ...PINGSIZ });
}

function botEnUst(interaction) {
  return interaction.guild.members.me?.roles.highest.position ?? 0;
}

/** Sunucu emojisini adıyla metne çevirir; yoksa null. */
function emojiBulucu(guild) {
  return (ad) => guild?.emojis?.cache?.find((e) => e.name === ad)?.toString() ?? null;
}

const fiyatMetni = (fiyat) => fiyat.toLocaleString('tr-TR');

export async function autocomplete(interaction) {
  const aranan = interaction.options.getFocused().toLocaleLowerCase('tr-TR');
  const roller = urunler(veritabani(), interaction.guildId).map((u) => {
    const rol = interaction.guild?.roles.cache.get(u.rol_id);
    return { name: `Rol: ${rol?.name ?? u.rol_id} — ${fiyatMetni(u.fiyat)} muz`, value: `${ROL_ONEKI}${u.rol_id}` };
  });
  const esyalar = satilikEsyalar().map((e) => ({
    name: `${e.yedek} ${e.ad} — ${fiyatMetni(etkinlikFiyati(veritabani(), interaction.guildId, e).fiyat)} muz`, value: e.kimlik,
  }));

  await interaction.respond(
    [...esyalar, ...roller]
      .filter((s) => !aranan || s.name.toLocaleLowerCase('tr-TR').includes(aranan))
      .slice(0, SECENEK_SINIRI)
      .map((s) => ({ ...s, name: s.name.slice(0, 100) })),
  );
}

async function liste(interaction, db) {
  const kategori = interaction.options.getString('kategori');
  const bul = emojiBulucu(interaction.guild);
  const embeds = [];

  for (const kat of ['kasa', 'takviye', 'rozet']) {
    if (kategori && kategori !== kat) continue;
    const satirlar = satilikEsyalar().filter((e) => e.kategori === kat).map((e) => {
      const { fiyat, eski, indirimli } = etkinlikFiyati(db, interaction.guildId, e);
      const fiyatYazisi = indirimli ? `~~${muz(eski)}~~ **${muz(fiyat)}** 🏷️` : muz(fiyat);
      return kat === 'rozet'
        ? `${esyaEmoji(e, bul)} **${e.ad}** — ${fiyatYazisi} · ⚒️ çalışmaya **+%${e.calisBonus}**`
        : `${esyaEmoji(e, bul)} **${e.ad}** — ${fiyatYazisi}\n${e.aciklama}`;
    });
    if (kat === 'rozet') {
      const altin = esyaGetir('rozet-altin');
      satirlar.push(`${esyaEmoji(altin, bul)} **${altin.ad}** — _yalnız Altın ve Elmas Kasa'dan_ · ⚒️ çalışmaya **+%${altin.calisBonus}**`);
      satirlar.push('', 'Her rozet `/calis` kazancına kalıcı bonus verir; bonuslar toplanır ve prestijde korunur.');
    }
    if (kat === 'kasa') {
      satirlar.push('Kasalar envantere girer; açmak için `/kasa ac`, içerik ve olasılıklar için `/kasa bilgi`. Seviye atlayınca da kasa gelir.');
    }
    if (kat === 'takviye') {
      satirlar.push(`🎨 **Özel Renk Rolü** — ${muz(RENK_FIYAT)} (renk değişimi ${muz(RENK_DEGISIM)})\nAdına renkli bir rol: \`/magaza renk\`.`);
    }
    embeds.push(gomu('bilgi', `🛒 ${KATEGORI_ADLARI[kat]}`).setDescription(satirlar.join(kat === 'rozet' ? '\n' : '\n\n')));
  }

  if (!kategori || kategori === 'rol') {
    const satis = urunler(db, interaction.guildId);
    if (satis.length > 0 || kategori === 'rol') {
      embeds.push(gomu('bilgi', '🛒 Roller').setDescription(satis.length > 0
        ? satis.map((u) => `<@&${u.rol_id}> — ${muz(u.fiyat)}`).join('\n')
        : 'Satışta rol yok. Yöneticiler `/magaza ekle` ile koyabilir.'));
    }
  }

  const sonGomu = embeds.at(-1);
  sonGomu.setFooter({ text: `Bakiyen: ${fiyatMetni(bakiye(db, interaction.guildId, interaction.user.id))} muz · Satın almak için /magaza al` });
  await interaction.reply({ embeds, ...PINGSIZ });
}

/** Satın alınan şeyin sonucunu tek satırda anlatır. */
function sonucMetni(esya, sonuc, bul) {
  if (sonuc.tur === 'muz') {
    const yerine = sonuc.yerine ? ` (${esyaGetir(sonuc.yerine).ad} zaten sendeydi, yerine muz)` : '';
    return `${muz(sonuc.miktar)} çıktı!${yerine}`;
  }
  const verilen = esyaGetir(sonuc.kimlik);
  const ad = `${esyaEmoji(verilen, bul)} **${verilen.ad}**`;
  if (verilen.tur === 'kasa') return `${ad} envanterine eklendi (artık ${sonuc.adet} tane). Açmak için \`/kasa ac\`.`;
  if (sonuc.bitis) return `${ad} etkin, ${zaman(sonuc.bitis, 'R')} bitiyor.`;
  if (verilen.tur === 'rozet') return `${ad} rozeti koleksiyonunda!`;
  return `${ad}: artık ${sonuc.adet} tane.`;
}

async function rolAl(interaction, db, rolId) {
  const rol = interaction.guild.roles.cache.get(rolId) ?? await interaction.guild.roles.fetch(rolId).catch(() => null);
  const urun = urunGetir(db, interaction.guildId, rolId);
  if (!urun || !rol) {
    await gizli(interaction, 'Bu rol satışta değil. Satıştakiler: `/magaza liste`.');
    return;
  }

  const uye = interaction.member;
  if (uye?.roles?.cache?.has(rol.id)) {
    await gizli(interaction, `<@&${rol.id}> zaten sende.`);
    return;
  }

  const uygun = rolSatilabilirMi(rol, botEnUst(interaction));
  if (!uygun.ok) {
    await gizli(interaction, `Bu rol şu an verilemiyor: ${uygun.sebep} Bir yöneticiye haber ver.`);
    return;
  }

  const sonuc = await satinAl(db, {
    guildId: interaction.guildId,
    kullaniciId: interaction.user.id,
    urun,
    rolVer: () => uye.roles.add(rol.id, 'Muz mağazasından satın alındı'),
  });

  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }

  await interaction.reply({
    content: `🛒 <@${interaction.user.id}>, <@&${rol.id}> rolünü **${muz(urun.fiyat)}** karşılığında aldı! Kalan: ${muz(sonuc.bakiye)}`,
    ...PINGSIZ,
  });
  await gorevBildir(interaction, [{ tur: 'magaza' }]);
}

async function al(interaction, db) {
  const secim = interaction.options.getString('urun', true);
  if (secim.startsWith(ROL_ONEKI) && (interaction.options.getInteger('adet') ?? 1) > 1) {
    await gizli(interaction, 'Rol bir kez alınır; adet yalnız kasalarda geçerli.');
    return;
  }
  if (secim.startsWith(ROL_ONEKI)) {
    await rolAl(interaction, db, secim.slice(ROL_ONEKI.length));
    return;
  }

  const esya = esyaGetir(secim);
  if (!esya) {
    await gizli(interaction, 'Bunu mağazada bulamadım; listeden seç (`/magaza liste`).');
    return;
  }

  const sonuc = esyaSatinAl(db, {
    guildId: interaction.guildId, kullaniciId: interaction.user.id, kimlik: secim,
    adet: interaction.options.getInteger('adet') ?? 1,
  });
  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }

  const bul = emojiBulucu(interaction.guild);
  const kac = sonuc.adet > 1 ? `${sonuc.adet} × ` : '';
  const rozetRolu = esya.tur === 'rozet'
    ? await rozetRoluVer(interaction.member, esya.kimlik, (a) => ayarGetir(db, interaction.guildId, a), 'Mağazadan rozet')
    : null;
  await interaction.reply({
    content: `🛒 <@${interaction.user.id}> satın aldı: ${kac}${sonucMetni(esya, sonuc.sonuc, bul)}${rozetRolu ? ` 🏷️ <@&${rozetRolu}>` : ''}\nÖdenen: ${muz(sonuc.odenen)} · Kalan: ${muz(sonuc.bakiye)}`,
    ...PINGSIZ,
  });
  await gorevBildir(interaction, [{ tur: 'magaza' }]);
}

async function renk(interaction, db) {
  const sayi = renkAyristir(interaction.options.getString('renk', true));
  if (sayi === null) {
    await gizli(interaction, 'Rengi anlayamadım. Örnek: `#ff8800`, `#3fa`, `7289da` (tam siyah olmaz, `#010101` kullan).');
    return;
  }

  const { guild } = interaction;
  const uye = interaction.member;
  const botUst = guild.members.me?.roles.highest;

  const sonuc = await renkSatinAl(db, {
    guildId: interaction.guildId,
    kullaniciId: interaction.user.id,
    renk: sayi,
    rolBul: (id) => guild.roles.fetch(id).catch(() => null),
    rolOlustur: async (r) => {
      const rol = await guild.roles.create({
        name: `🎨 ${interaction.user.username}`.slice(0, 100),
        colors: { primaryColor: r },
        permissions: [],
        mentionable: false,
        reason: 'Muz mağazası: özel renk rolü',
      });
      // Rengin görünmesi için üyenin diğer renkli rollerinin üstünde olmalı;
      // botun en üst rolünün hemen altı. Sıralama başarısız olsa da rol işe yarar.
      if (botUst) await rol.setPosition(Math.max(1, botUst.position - 1)).catch(() => null);
      await uye.roles.add(rol, 'Muz mağazası: özel renk rolü');
      return rol;
    },
    rolRenkle: async (rol, r) => {
      await rol.edit({ colors: { primaryColor: r }, reason: 'Muz mağazası: renk değişimi' });
      if (!uye.roles.cache.has(rol.id)) await uye.roles.add(rol, 'Muz mağazası: özel renk rolü');
    },
  });

  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }

  await interaction.reply({
    content: `🎨 <@${interaction.user.id}> ${sonuc.yeni ? 'özel renk rolünü aldı' : 'rengini değiştirdi'}: <@&${sonuc.rolId}> \`${renkMetni(sayi)}\`\nÖdenen: ${muz(sonuc.fiyat)} · Kalan: ${muz(sonuc.bakiye)}`,
    ...PINGSIZ,
  });
  await gorevBildir(interaction, [{ tur: 'magaza' }]);
}

async function ekle(interaction, db) {
  const rol = interaction.options.getRole('rol', true);
  const uygun = rolSatilabilirMi(rol, botEnUst(interaction));
  if (!uygun.ok) {
    await gizli(interaction, uygun.sebep);
    return;
  }

  const fiyat = interaction.options.getInteger('fiyat', true);
  const sonuc = urunEkle(db, { guildId: interaction.guildId, rolId: rol.id, fiyat, ekleyenId: interaction.user.id });
  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }

  await gizli(interaction, sonuc.guncellendi
    ? `<@&${rol.id}> fiyatı **${muz(fiyat)}** oldu.`
    : `<@&${rol.id}> **${muz(fiyat)}** fiyatla satışa kondu.`);
}

async function kaldir(interaction, db) {
  const rol = interaction.options.getRole('rol', true);
  await gizli(interaction, urunKaldir(db, interaction.guildId, rol.id)
    ? `<@&${rol.id}> satıştan kaldırıldı. Daha önce alanlarda rol kalır.`
    : `<@&${rol.id}> zaten satışta değildi.`);
}

export async function execute(interaction) {
  const db = veritabani();
  const alt = interaction.options.getSubcommand();

  if ((alt === 'ekle' || alt === 'kaldir')
      && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await gizli(interaction, 'Mağazayı yalnız **Sunucuyu Yönet** yetkisi olanlar düzenleyebilir.');
    return;
  }

  const islemler = {
    liste, al, renk, ekle, kaldir,
  };
  await islemler[alt](interaction, db);
}
