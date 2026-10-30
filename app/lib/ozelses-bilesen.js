import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, PermissionFlagsBits,
  TextInputBuilder, TextInputStyle, UserSelectMenuBuilder,
} from 'discord.js';

import { gomu, PINGSIZ, sureBicimle } from './bicim.js';
import { veritabani } from './db.js';
import { botYetkisiKontrol } from './izin.js';
import {
  AD_SINIRI, adSinirlayici, durumOku, izinListesi, limitAyristir, listeyeTasi, odaGetir,
  paneliKullanabilirMi, sahiplikAlinabilirMi, sahipYaz,
} from './ozelses.js';

/** customId öneki; kanal kimliği gerekmez, panel odanın kendi sohbetinde durur. */
const ONEK = 'ozelses:';
const ID = {
  ad: `${ONEK}ad`,
  limit: `${ONEK}limit`,
  kilit: `${ONEK}kilit`,
  gizle: `${ONEK}gizle`,
  izin: `${ONEK}izin`,
  engel: `${ONEK}engel`,
  sahip: `${ONEK}sahip`,
  adModal: `${ONEK}modal:ad`,
  limitModal: `${ONEK}modal:limit`,
  izinSec: `${ONEK}sec:izin`,
  engelSec: `${ONEK}sec:engel`,
};

/** Tek seferde izin verilebilen/engellenebilen en fazla kişi. */
export const SECIM_SINIRI = 10;

const adSiniri = adSinirlayici();

const tus = (id, etiket, emoji, stil = ButtonStyle.Secondary) => new ButtonBuilder()
  .setCustomId(id).setLabel(etiket).setEmoji(emoji).setStyle(stil);

/** Odanın sohbetine düşen kontrol paneli. */
export function panelMesaji(sahipId) {
  const embed = gomu('bilgi', '🔊 Oda kontrol paneli')
    .setDescription(
      `Bu oda <@${sahipId}> kullanıcısına ait. Aşağıdaki tuşlarla odayı ayarlayabilirsin.\n\n`
      + '✏️ **Ad** · 👥 **Kişi sınırı** · 🔒 **Kilitle/Aç**: yalnız izinliler girebilir\n'
      + '👁️ **Gizle/Göster** · ✅ **İzin ver** · ⛔ **Engelle**: odadaysa çıkarılır\n'
      + '👑 **Sahipliği al**: sahip odada değilken odadaki biri alabilir\n\n'
      + 'Oda boşalınca kendiliğinden silinir.',
    );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        tus(ID.ad, 'Ad', '✏️'),
        tus(ID.limit, 'Kişi sınırı', '👥'),
        tus(ID.kilit, 'Kilitle/Aç', '🔒'),
        tus(ID.gizle, 'Gizle/Göster', '👁️'),
      ),
      new ActionRowBuilder().addComponents(
        tus(ID.izin, 'İzin ver', '✅', ButtonStyle.Success),
        tus(ID.engel, 'Engelle', '⛔', ButtonStyle.Danger),
        tus(ID.sahip, 'Sahipliği al', '👑', ButtonStyle.Primary),
      ),
    ],
    ...PINGSIZ,
  };
}

const gizliYanit = (interaction, content) => (interaction.deferred || interaction.replied
  ? interaction.editReply({ content, ...PINGSIZ })
  : interaction.reply({ content, flags: MessageFlags.Ephemeral, ...PINGSIZ }));

/** Etkileşimin odasını ve kullananın yetkisini çözer; uygun değilse yanıtlayıp null döner. */
async function odaCoz(interaction, { sahiplikIcin = false } = {}) {
  const kayit = odaGetir(veritabani(), interaction.channelId);
  const kanal = interaction.channel;
  if (!kayit || !kanal) {
    await gizliYanit(interaction, 'Bu panel artık bir özel odaya ait değil.');
    return null;
  }

  if (!sahiplikIcin) {
    const yetkili = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ?? false;
    if (!paneliKullanabilirMi(kayit, interaction.user.id, yetkili)) {
      await gizliYanit(interaction, `Bu paneli yalnız oda sahibi <@${kayit.sahip_id}> kullanabilir.`);
      return null;
    }
  }

  return { kayit, kanal };
}

const ustIzinleri = (kanal) => [...(kanal.parent?.permissionOverwrites.cache.values() ?? [])]
  .map((iz) => ({ id: iz.id, type: iz.type, allow: iz.allow.bitfield, deny: iz.deny.bitfield }));

const kanalIzinleri = (kanal) => [...kanal.permissionOverwrites.cache.values()]
  .map((iz) => ({ id: iz.id, type: iz.type, allow: iz.allow.bitfield, deny: iz.deny.bitfield }));

/** Odanın mevcut durumu. */
function durum(kanal, sahipId) {
  return durumOku(kanalIzinleri(kanal), {
    everyoneId: kanal.guild.id, sahipId, botId: kanal.guild.members.me.id,
  });
}

/**
 * Yeni durumu kategori izinleri üzerine baştan hesaplayıp uygular.
 * @returns {Promise<{ok: true} | {ok: false, sebep: string}>}
 */
async function izinleriUygula(kanal, sahipId, yeniDurum) {
  const botUye = kanal.guild.members.me;
  // İzin üzerine yazmalarını değiştirmek Rolleri Yönet ister.
  const yetki = botYetkisiKontrol(botUye, PermissionFlagsBits.ManageRoles);
  if (!yetki.ok) return yetki;

  await kanal.permissionOverwrites.set(izinListesi({
    ustIzinler: ustIzinleri(kanal),
    sahipId,
    botId: botUye.id,
    everyoneId: kanal.guild.id,
    botYetkileri: (kanal.parent ?? kanal).permissionsFor(botUye)?.bitfield ?? null,
    durum: yeniDurum,
  }), 'Özel ses odası paneli');
  return { ok: true };
}

/**
 * Odanın izinlerini mevcut durumu koruyarak güncel kurallarla yeniden yazar.
 * Açılışta dolu odalara uygulanır: izin kuralı değişince (ör. ses etkinliği
 * eklendi) açık odalar da düzelir.
 */
export async function odaIzinleriniYenile(kanal, sahipId) {
  return izinleriUygula(kanal, sahipId, durum(kanal, sahipId));
}

async function adBasildi(interaction) {
  if (!await odaCoz(interaction)) return;
  await interaction.showModal(new ModalBuilder()
    .setCustomId(ID.adModal).setTitle('Oda adı')
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId('ad').setLabel('Yeni ad').setStyle(TextInputStyle.Short)
      .setMinLength(1).setMaxLength(AD_SINIRI).setRequired(true)
      .setValue(interaction.channel.name.slice(0, AD_SINIRI)))));
}

async function adGonderildi(interaction) {
  const oda = await odaCoz(interaction);
  if (!oda) return;

  const ad = interaction.fields.getTextInputValue('ad').trim().slice(0, AD_SINIRI);
  if (!ad) {
    await gizliYanit(interaction, 'Ad boş olamaz.');
    return;
  }

  const hak = adSiniri.dene(oda.kanal.id);
  if (!hak.ok) {
    await gizliYanit(
      interaction,
      'Discord oda adını 10 dakikada en çok 2 kez değiştirtiyor. '
      + `**${sureBicimle(hak.kalanMs)}** sonra tekrar dene.`,
    );
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await oda.kanal.setName(ad, `Özel ses odası: ${interaction.user.id}`);
  await gizliYanit(interaction, `✏️ Oda adı **${ad}** oldu.`);
}

async function limitBasildi(interaction) {
  if (!await odaCoz(interaction)) return;
  await interaction.showModal(new ModalBuilder()
    .setCustomId(ID.limitModal).setTitle('Kişi sınırı')
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId('limit').setLabel('Kaç kişi girebilsin? (0 = sınırsız)')
      .setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(2).setRequired(true)
      .setValue(String(interaction.channel.userLimit ?? 0)))));
}

async function limitGonderildi(interaction) {
  const oda = await odaCoz(interaction);
  if (!oda) return;

  const sonuc = limitAyristir(interaction.fields.getTextInputValue('limit'));
  if (!sonuc.ok) {
    await gizliYanit(interaction, sonuc.sebep);
    return;
  }

  await oda.kanal.setUserLimit(sonuc.deger, `Özel ses odası: ${interaction.user.id}`);
  await gizliYanit(
    interaction,
    sonuc.deger === 0 ? '👥 Kişi sınırı kaldırıldı.' : `👥 Kişi sınırı **${sonuc.deger}** oldu.`,
  );
}

/** Kilit veya gizlilik anahtarını çevirir. */
function anahtarCevir(alan, acikMetin, kapaliMetin) {
  return async (interaction) => {
    const oda = await odaCoz(interaction);
    if (!oda) return;

    const simdiki = durum(oda.kanal, oda.kayit.sahip_id);
    const yeni = { ...simdiki, [alan]: !simdiki[alan] };
    const sonuc = await izinleriUygula(oda.kanal, oda.kayit.sahip_id, yeni);
    await gizliYanit(interaction, sonuc.ok ? (yeni[alan] ? acikMetin : kapaliMetin) : sonuc.sebep);
  };
}

function secimSor(hedefId, soru) {
  return async (interaction) => {
    if (!await odaCoz(interaction)) return;
    await interaction.reply({
      content: soru,
      components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder()
        .setCustomId(hedefId).setMinValues(1).setMaxValues(SECIM_SINIRI))],
      flags: MessageFlags.Ephemeral,
    });
  };
}

async function izinSecildi(interaction) {
  const oda = await odaCoz(interaction);
  if (!oda) return;

  const ids = interaction.values.filter((id) => id !== oda.kayit.sahip_id);
  const yeni = listeyeTasi(durum(oda.kanal, oda.kayit.sahip_id), ids, 'izinliler');
  const sonuc = await izinleriUygula(oda.kanal, oda.kayit.sahip_id, yeni);
  await interaction.update({
    content: sonuc.ok ? `✅ İzin verildi: ${ids.map((id) => `<@${id}>`).join(', ') || '—'}` : sonuc.sebep,
    components: [],
  });
}

async function engelSecildi(interaction) {
  const oda = await odaCoz(interaction);
  if (!oda) return;

  const botId = interaction.guild.members.me.id;
  const ids = interaction.values.filter((id) => id !== oda.kayit.sahip_id && id !== botId);
  if (ids.length === 0) {
    await interaction.update({ content: 'Oda sahibini veya botu engelleyemezsin.', components: [] });
    return;
  }

  const yeni = listeyeTasi(durum(oda.kanal, oda.kayit.sahip_id), ids, 'engelliler');
  const sonuc = await izinleriUygula(oda.kanal, oda.kayit.sahip_id, yeni);
  if (!sonuc.ok) {
    await interaction.update({ content: sonuc.sebep, components: [] });
    return;
  }

  // Engellenen odadaysa çıkarılır; yoksa kilit ancak bir sonraki girişte işlerdi.
  for (const id of ids) {
    const uye = oda.kanal.members.get(id);
    if (uye) await uye.voice.disconnect('Özel ses odasından engellendi').catch(() => null);
  }

  await interaction.update({
    content: `⛔ Engellendi: ${ids.map((id) => `<@${id}>`).join(', ')}`,
    components: [],
  });
}

async function sahipBasildi(interaction) {
  const oda = await odaCoz(interaction, { sahiplikIcin: true });
  if (!oda) return;

  if (!sahiplikAlinabilirMi(oda.kayit, interaction.user.id, oda.kanal.members.keys())) {
    await gizliYanit(
      interaction,
      String(oda.kayit.sahip_id) === interaction.user.id
        ? 'Oda zaten senin.'
        : 'Sahipliği yalnız sahip odada değilken, odadaki biri alabilir.',
    );
    return;
  }

  // Durum eski sahiple okunur (onun izni izinli sayılmasın), yeni sahiple yazılır.
  const simdiki = durum(oda.kanal, oda.kayit.sahip_id);
  const sonuc = await izinleriUygula(oda.kanal, interaction.user.id, simdiki);
  if (!sonuc.ok) {
    await gizliYanit(interaction, sonuc.sebep);
    return;
  }

  sahipYaz(veritabani(), oda.kanal.id, interaction.user.id);
  await interaction.reply({ content: `👑 Odanın yeni sahibi <@${interaction.user.id}>.`, ...PINGSIZ });
}

const yonlendir = (tur, id, calistir) => ({
  eslesir: (i) => i[tur]?.() && i.customId === id,
  calistir,
});

export function ozelsesBilesenleri() {
  return [
    yonlendir('isButton', ID.ad, adBasildi),
    yonlendir('isButton', ID.limit, limitBasildi),
    yonlendir('isButton', ID.kilit, anahtarCevir(
      'kilitli',
      '🔒 Oda kilitlendi: yalnız izin verdiklerin girebilir.',
      '🔓 Kilit açıldı: herkes girebilir.',
    )),
    yonlendir('isButton', ID.gizle, anahtarCevir(
      'gizli',
      '👁️ Oda gizlendi: yalnız izin verdiklerin görebilir.',
      '👁️ Oda yeniden görünür.',
    )),
    yonlendir('isButton', ID.izin, secimSor(ID.izinSec, 'Kimlere izin verilsin? (kilitli/gizliyken de girebilirler)')),
    yonlendir('isButton', ID.engel, secimSor(ID.engelSec, 'Kimler engellensin? (odadaysa çıkarılır)')),
    yonlendir('isButton', ID.sahip, sahipBasildi),
    yonlendir('isModalSubmit', ID.adModal, adGonderildi),
    yonlendir('isModalSubmit', ID.limitModal, limitGonderildi),
    yonlendir('isUserSelectMenu', ID.izinSec, izinSecildi),
    yonlendir('isUserSelectMenu', ID.engelSec, engelSecildi),
  ];
}
