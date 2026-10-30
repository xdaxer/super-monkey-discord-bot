import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  MessageFlags, PermissionFlagsBits,
} from 'discord.js';

import { ayarGetir, sistemAcikMi } from './ayarlar.js';
import { gomu, PINGSIZ, zaman } from './bicim.js';
import { veritabani } from './db.js';
import { botYetkisiKontrol } from './izin.js';
import {
  acikTalep, acilisMetni, kanalAdi, kanaldanTalep, kapatabilirMi, kapatButonAyristir,
  kapatButonId, PANEL_BUTON, talepEkle, talepGetir, talepKapat, transkriptMetni,
} from './talep.js';

/** Transkripte alınacak en fazla mesaj; uzun yazışmayı kırpar, botu düşürmez. */
export const TRANSKRIPT_SINIRI = 500;

export function panelButonu() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(PANEL_BUTON).setLabel('Talep Aç').setEmoji('🎫')
      .setStyle(ButtonStyle.Primary),
  );
}

export function kapatButonu(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(kapatButonId(id)).setLabel('Talebi Kapat').setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
  );
}

export function panelGomusu() {
  return gomu('bilgi', '🎫 Destek talebi')
    .setDescription(
      'Yetkililere özel olarak ulaşmak için aşağıdaki butona bas.\n\n'
      + 'Sana özel bir kanal açılır; orada yalnız sen ve yetkililer yazabilir. '
      + 'İşin bitince kanalı kapatabilirsin, yazışma kaydı saklanır.',
    )
    .addFields({ name: 'Not', value: 'Aynı anda yalnız bir açık talebin olabilir.' });
}

/**
 * Talep kanalını açar ve karşılama mesajını gönderir. `guild` ve `user`
 * hem butondan (interaction) hem Activity'den (web) gelir.
 *
 * @returns {Promise<{ok: true, kanal: object, id: number} | {ok: false, sebep: string}>}
 */
async function talepKanaliAc({ guild, user }, db) {
  const guildId = guild.id;
  const kategoriId = ayarGetir(db, guildId, 'talep.kategori');
  const yetkiliRol = ayarGetir(db, guildId, 'talep.rol');

  const botUye = guild.members.me;
  const yetki = botYetkisiKontrol(botUye, PermissionFlagsBits.ManageChannels);
  if (!yetki.ok) return { ok: false, sebep: yetki.sebep };

  // Kanal görünürlüğü: herkese kapalı, açana ve yetkili role açık.
  const izinler = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles,
      ],
    },
    {
      id: botUye.id,
      allow: [
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels,
      ],
    },
  ];

  if (yetkiliRol) {
    izinler.push({
      id: yetkiliRol,
      allow: [
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles,
      ],
    });
  }

  // Kanal adında numara geçiyor; numarayı almak için kaydı önce yazıp
  // kanal açılamazsa siliyoruz, yoksa ad ile kayıt numarası ayrışır.
  const id = talepEkle(db, {
    guildId, kanalId: `beklemede-${user.id}-${Date.now()}`,
    kullaniciId: user.id, konu: 'Destek talebi',
  });

  const kanal = await guild.channels.create({
    name: kanalAdi(user.username, id),
    type: ChannelType.GuildText,
    parent: kategoriId ?? null,
    permissionOverwrites: izinler,
    reason: `Talep #${id} — ${user.tag}`,
  }).catch(() => null);

  if (!kanal) {
    db.prepare('DELETE FROM talepler WHERE id = ?').run(id);
    return {
      ok: false,
      sebep: 'Talep kanalı açılamadı. Botun **Kanalları Yönet** yetkisini ve '
        + '`talep.kategori` ayarını kontrol et.',
    };
  }

  db.prepare('UPDATE talepler SET kanal_id = ? WHERE id = ?').run(kanal.id, id);

  await kanal.send({
    content: acilisMetni(ayarGetir(db, guildId, 'talep.mesaj'), { kullaniciId: user.id }),
    embeds: [gomu('bilgi', `Talep #${id}`).addFields(
      { name: 'Açan', value: `<@${user.id}>`, inline: true },
      { name: 'Açılış', value: zaman(Date.now(), 'R'), inline: true },
    )],
    components: [kapatButonu(id)],
    allowedMentions: { users: [user.id], roles: yetkiliRol ? [yetkiliRol] : [] },
  }).catch(() => null);

  return { ok: true, kanal, id };
}

/**
 * Activity'den talep açar (ekonomiden uzaklaştırılan üyenin penceresi).
 * Açık talebi varsa yenisini açmaz, onu döner.
 * @returns {Promise<{ok: true, kanalId: string, id: number, mevcut: boolean} | {ok: false, sebep: string}>}
 */
export async function webdenTalepAc(db, { guild, user }) {
  if (!guild || !user) return { ok: false, sebep: 'Sunucuya ulaşılamadı; biraz sonra yeniden dene.' };
  if (!sistemAcikMi(db, guild.id, 'talep')) return { ok: false, sebep: 'Talep sistemi bu sunucuda kapalı.' };
  const mevcut = acikTalep(db, guild.id, user.id);
  if (mevcut) return { ok: true, kanalId: mevcut.kanal_id, id: mevcut.id, mevcut: true };
  const sonuc = await talepKanaliAc({ guild, user }, db);
  return sonuc.ok ? { ok: true, kanalId: sonuc.kanal.id, id: sonuc.id, mevcut: false } : sonuc;
}

async function panelBasildi(interaction) {
  const db = veritabani();
  const guildId = interaction.guildId;

  if (!sistemAcikMi(db, guildId, 'talep')) {
    await interaction.reply({
      content: 'Talep sistemi bu sunucuda kapalı.', flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const mevcut = acikTalep(db, guildId, interaction.user.id);
  if (mevcut) {
    await interaction.reply({
      content: `Zaten açık bir talebin var: <#${mevcut.kanal_id}>. Önce onu kapat.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sonuc = await talepKanaliAc({ guild: interaction.guild, user: interaction.user }, db);
  await interaction.editReply(
    sonuc.ok ? `🎫 Talebin açıldı: ${sonuc.kanal} (**#${sonuc.id}**)` : sonuc.sebep,
  );
}

/**
 * Kanalın yazışmasını eskiden yeniye toplar.
 * @returns {Promise<object[]>}
 */
export async function yazismayiTopla(kanal, sinir = TRANSKRIPT_SINIRI) {
  const toplanan = [];
  let once;

  while (toplanan.length < sinir) {
    const limit = Math.min(100, sinir - toplanan.length);
    const yigin = await kanal.messages.fetch(once ? { limit, before: once } : { limit });
    const mesajlar = [...(yigin?.values?.() ?? yigin ?? [])];
    if (mesajlar.length === 0) break;

    toplanan.push(...mesajlar);
    once = mesajlar[mesajlar.length - 1].id;
    if (mesajlar.length < limit) break;
  }

  // fetch yeniden eskiye verir; transkript okunur olsun diye ters çeviriyoruz.
  return toplanan.reverse();
}

/**
 * Talebi kapatır: kaydı günceller, transkripti log kanalına bırakır, kanalı siler.
 *
 * @returns {Promise<{ok: true, transkript: boolean} | {ok: false, sebep: string}>}
 */
export async function talebiKapat(interaction, talep, db = veritabani()) {
  const guildId = interaction.guildId;

  const yazildi = talepKapat(db, talep.id, interaction.user.id);
  if (!yazildi) return { ok: false, sebep: `**#${talep.id}** zaten kapatılmış.` };

  const guncel = talepGetir(db, talep.id);
  const kanal = interaction.channel?.id === talep.kanal_id
    ? interaction.channel
    : await interaction.guild.channels.fetch(talep.kanal_id).catch(() => null);

  let transkriptGitti = false;
  const logKanalId = ayarGetir(db, guildId, 'talep.logKanal');

  if (logKanalId && kanal) {
    const logKanal = await interaction.client.channels.fetch(logKanalId).catch(() => null);

    if (logKanal?.isTextBased?.()) {
      const mesajlar = await yazismayiTopla(kanal).catch(() => []);
      const metin = transkriptMetni(guncel, mesajlar, { sunucuAdi: interaction.guild.name });
      const dosya = new AttachmentBuilder(Buffer.from(metin, 'utf-8'), {
        name: `talep-${talep.id}.txt`,
      });

      transkriptGitti = await logKanal.send({
        embeds: [gomu('notr', `Talep #${talep.id} kapandı`).addFields(
          { name: 'Açan', value: `<@${guncel.kullanici_id}>`, inline: true },
          { name: 'Kapatan', value: `<@${guncel.kapatan_id}>`, inline: true },
          { name: 'Mesaj', value: String(mesajlar.length), inline: true },
        )],
        files: [dosya],
        ...PINGSIZ,
      }).then(() => true, () => false);
    }
  }

  await kanal?.delete(`Talep #${talep.id} kapatıldı`).catch(() => null);

  return { ok: true, transkript: transkriptGitti };
}

async function kapatBasildi(interaction) {
  const db = veritabani();
  const id = kapatButonAyristir(interaction.customId);
  const talep = talepGetir(db, id);

  if (!talep || talep.guild_id !== String(interaction.guildId)) {
    await interaction.reply({
      content: `**#${id}** numaralı talep bulunamadı.`, flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const izin = kapatabilirMi(
    interaction.member, talep, ayarGetir(db, interaction.guildId, 'talep.rol'),
    interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) ?? false,
  );
  if (!izin.ok) {
    await interaction.reply({ content: izin.sebep, flags: MessageFlags.Ephemeral });
    return;
  }

  // Kanal silineceği için önce yanıtlıyoruz; yoksa etkileşim yanıtsız kalır.
  await interaction.reply({ content: '🔒 Talep kapatılıyor, transkript alınıyor...' })
    .catch(() => null);

  const sonuc = await talebiKapat(interaction, talep, db);
  if (!sonuc.ok) {
    await interaction.followUp({ content: sonuc.sebep, flags: MessageFlags.Ephemeral })
      .catch(() => null);
  }
}

/** interactions.js'e verilecek bileşen yönlendiricileri. */
export function talepBilesenleri() {
  return [
    {
      eslesir: (i) => i.isButton?.() && i.customId === PANEL_BUTON,
      calistir: panelBasildi,
    },
    {
      eslesir: (i) => i.isButton?.() && kapatButonAyristir(i.customId) !== null,
      calistir: kapatBasildi,
    },
  ];
}

export { kanaldanTalep };
