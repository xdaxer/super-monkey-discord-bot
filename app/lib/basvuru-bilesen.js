import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits,
} from 'discord.js';

import { ayarGetir } from './ayarlar.js';
import {
  basvuruEkle, basvuruGetir, basvuruKarar, butonAyristir, DURUMLAR, mesajBagla, SORULAR,
} from './basvuru.js';
import { etiketsiz, gomu, PINGSIZ, zaman } from './bicim.js';
import { veritabani } from './db.js';

const MODAL_ID = 'basvuru:form';

export function kararButonlari(id, devreDisi = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`basvuru:onay:${id}`).setLabel('Onayla')
      .setStyle(ButtonStyle.Success).setDisabled(devreDisi),
    new ButtonBuilder()
      .setCustomId(`basvuru:ret:${id}`).setLabel('Reddet')
      .setStyle(ButtonStyle.Danger).setDisabled(devreDisi),
  );
}

export function basvuruGomusu(id, kullanici, cevaplar, durum = DURUMLAR.beklemede) {
  const renk = { beklemede: 'bilgi', onay: 'basari', ret: 'hata' }[durum] ?? 'notr';
  const baslik = {
    beklemede: `Başvuru #${id} — inceleme bekliyor`,
    onay: `Başvuru #${id} — onaylandı`,
    ret: `Başvuru #${id} — reddedildi`,
  }[durum];

  const embed = gomu(renk, baslik)
    .addFields({ name: 'Başvuran', value: `<@${kullanici.id}> (\`${kullanici.id}\`)` });

  for (const soru of SORULAR) {
    const cevap = cevaplar[soru.id];
    embed.addFields({
      name: soru.etiket,
      value: cevap ? etiketsiz(cevap).slice(0, 1024) : '_boş bırakıldı_',
    });
  }

  return embed;
}

/** İnceleyici yetkisi: ayarlanan rol veya Sunucuyu Yönet yetkisi. */
export function inceleyebilirMi(member, inceleyiciRolId) {
  if (member.permissions?.has?.(PermissionFlagsBits.ManageGuild)) return true;
  if (!inceleyiciRolId) return false;
  return Boolean(member.roles?.cache?.has?.(inceleyiciRolId));
}

async function modalGonderildi(interaction) {
  const db = veritabani();
  const guildId = interaction.guildId;

  const cevaplar = Object.fromEntries(
    SORULAR.map((soru) => [soru.id, interaction.fields.getTextInputValue(soru.id) ?? '']),
  );

  const kanalId = ayarGetir(db, guildId, 'basvuru.kanal');
  const kanal = await interaction.client.channels.fetch(kanalId).catch(() => null);

  if (!kanal?.isTextBased?.()) {
    await interaction.reply({
      content: 'Başvuru inceleme kanalına ulaşılamadı. Yöneticiye haber ver.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const id = basvuruEkle(db, {
    guildId, kullaniciId: interaction.user.id, form: 'varsayilan', cevaplar,
  });

  const mesaj = await kanal.send({
    embeds: [basvuruGomusu(id, interaction.user, cevaplar)],
    components: [kararButonlari(id)],
    ...PINGSIZ,
  }).catch(() => null);

  if (mesaj) mesajBagla(db, guildId, id, mesaj.id);

  await interaction.reply({
    content: `Başvurun alındı (**#${id}**). İnceleme sonucunu bekle.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function butonBasildi(interaction) {
  const db = veritabani();
  const guildId = interaction.guildId;
  const { eylem, id } = butonAyristir(interaction.customId);

  const inceleyiciRol = ayarGetir(db, guildId, 'basvuru.rol');
  if (!inceleyebilirMi(interaction.member, inceleyiciRol)) {
    await interaction.reply({
      content: '⛔ Başvuruları yalnız yetkili rol inceleyebilir.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const basvuru = basvuruGetir(db, guildId, id);
  if (!basvuru) {
    await interaction.reply({
      content: `**#${id}** numaralı başvuru bulunamadı.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const durum = eylem === 'onay' ? DURUMLAR.onay : DURUMLAR.ret;
  const yazildi = basvuruKarar(db, {
    guildId, id, durum, kararVerenId: interaction.user.id,
  });

  if (!yazildi) {
    await interaction.reply({
      content: `**#${id}** zaten sonuçlanmış (${basvuru.durum}). İkinci karar yazılmadı.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Onaylandıysa ve rol ayarlanmışsa başvurana rolü ver.
  let rolNotu = '';
  if (durum === DURUMLAR.onay) {
    const rolId = ayarGetir(db, guildId, 'basvuru.onayRolu');
    if (rolId) {
      const uye = await interaction.guild.members.fetch(basvuru.kullanici_id).catch(() => null);
      if (uye) {
        const verildi = await uye.roles.add(rolId, `Başvuru #${id} onaylandı`).then(
          () => true, () => false,
        );
        rolNotu = verildi ? ' Rol verildi.' : ' Rol verilemedi (yetki veya hiyerarşi).';
      } else {
        rolNotu = ' Kullanıcı sunucuda olmadığı için rol verilemedi.';
      }
    }
  }

  const kullanici = await interaction.client.users.fetch(basvuru.kullanici_id).catch(() => ({
    id: basvuru.kullanici_id,
  }));

  const embed = basvuruGomusu(id, kullanici, basvuru.cevaplar, durum)
    .addFields({
      name: 'Karar',
      value: `<@${interaction.user.id}> · ${zaman(Date.now(), 'R')}`,
    });

  await interaction.update({
    embeds: [embed],
    components: [kararButonlari(id, true)],
  }).catch(() => null);

  await interaction.followUp({
    content: `**#${id}** ${durum === DURUMLAR.onay ? 'onaylandı' : 'reddedildi'}.${rolNotu}`,
    flags: MessageFlags.Ephemeral,
  }).catch(() => null);
}

/** interactions.js'e verilecek bileşen yönlendiricileri. */
export function basvuruBilesenleri() {
  return [
    {
      eslesir: (i) => i.isModalSubmit?.() && i.customId === MODAL_ID,
      calistir: modalGonderildi,
    },
    {
      eslesir: (i) => i.isButton?.() && butonAyristir(i.customId) !== null,
      calistir: butonBasildi,
    },
  ];
}
