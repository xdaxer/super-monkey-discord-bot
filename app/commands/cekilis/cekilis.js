import {
  InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';

import { ayarGetir } from '../../lib/ayarlar.js';
import { gomu, PINGSIZ, sureAyristir, sureBicimle, zaman } from '../../lib/bicim.js';
import {
  acikCekilisler, cekilisEkle, cekilisGetir, DURUMLAR, EN_COK_KAZANAN,
  gecerliMi, iptalEt, katilimSayisi, kazananMetni, mesajBagla, sonuclandir, uzat, yenidenCek,
} from '../../lib/cekilis.js';
import { cekilisGomusu, katilButonu } from '../../lib/cekilis-bilesen.js';
import { veritabani } from '../../lib/db.js';
import { kanalYetkisiKontrol } from '../../lib/izin.js';

export const sistem = 'cekilis';
export const modul = 'cekilis';

export const data = new SlashCommandBuilder()
  .setName('cekilis')
  .setDescription('Çekiliş açar, uzatır, bitirir ve yeniden kazanan çeker.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommand((s) => s
    .setName('baslat').setDescription('Yeni bir çekiliş açar.')
    .addStringOption((o) => o
      .setName('odul').setDescription('Ne çekiliyor').setRequired(true).setMaxLength(200))
    .addStringOption((o) => o
      .setName('sure').setDescription('Süre: 30dk, 2sa, 3g gibi').setRequired(true))
    .addIntegerOption((o) => o
      .setName('kazanan').setDescription('Kaç kişi kazansın (varsayılan 1)')
      .setMinValue(1).setMaxValue(EN_COK_KAZANAN))
    .addChannelOption((o) => o
      .setName('kanal').setDescription('Hangi kanalda (boşsa ayarlı çekiliş kanalı)')))
  .addSubcommand((s) => s
    .setName('uzat').setDescription('Açık bir çekilişin bitişini ileri alır.')
    .addIntegerOption((o) => o
      .setName('no').setDescription('Çekiliş numarası').setRequired(true).setMinValue(1))
    .addStringOption((o) => o
      .setName('sure').setDescription('Ne kadar uzasın: 5dk, 1sa, 2g gibi').setRequired(true)))
  .addSubcommand((s) => s
    .setName('bitir').setDescription('Açık bir çekilişi erken sonuçlandırır.')
    .addIntegerOption((o) => o
      .setName('no').setDescription('Çekiliş numarası').setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s
    .setName('iptal').setDescription('Açık bir çekilişi kazanan çekmeden iptal eder.')
    .addIntegerOption((o) => o
      .setName('no').setDescription('Çekiliş numarası').setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s
    .setName('yeniden').setDescription('Biten çekilişten yeni kazanan çeker.')
    .addIntegerOption((o) => o
      .setName('no').setDescription('Çekiliş numarası').setRequired(true).setMinValue(1))
    .addIntegerOption((o) => o
      .setName('adet').setDescription('Kaç yeni kazanan (varsayılan 1)')
      .setMinValue(1).setMaxValue(EN_COK_KAZANAN)))
  .addSubcommand((s) => s
    .setName('liste').setDescription('Bu sunucudaki açık çekilişleri gösterir.'));

/** Çekilişin yayınlanacağı kanalı çözer: komut seçeneği, yoksa ayar. */
async function hedefKanal(interaction) {
  const secilen = interaction.options.getChannel('kanal');
  const kanalId = secilen?.id ?? ayarGetir(veritabani(), interaction.guildId, 'cekilis.kanal');

  if (!kanalId) {
    return {
      ok: false,
      sebep: 'Çekiliş kanalı ayarlı değil: `/ayar ayarla anahtar:cekilis.kanal kanal:#kanal` '
        + 'ya da `kanal:` seçeneğiyle kanal ver.',
    };
  }

  const kanal = secilen ?? await interaction.guild.channels.fetch(kanalId).catch(() => null);
  if (!kanal?.isTextBased?.()) {
    return { ok: false, sebep: `Çekiliş kanalı (\`${kanalId}\`) bulunamadı veya metin kanalı değil.` };
  }

  const yetki = kanalYetkisiKontrol(
    kanal, interaction.guild.members.me,
    PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
  );
  if (!yetki.ok) return { ok: false, sebep: yetki.sebep };

  return { ok: true, kanal };
}

/** Numarayı çözer ve çekilişin bu sunucuya ait olduğunu doğrular. */
function sunucununCekilisi(db, guildId, no) {
  const cekilis = cekilisGetir(db, no);
  if (!cekilis || cekilis.guild_id !== String(guildId)) {
    return { ok: false, sebep: `**#${no}** numaralı çekiliş bu sunucuda bulunamadı.` };
  }
  return { ok: true, cekilis };
}

/**
 * Açık çekilişin mesajını kayıttaki güncel hâliyle yeniler.
 * @returns {Promise<boolean>} mesaj düzenlendi mi
 */
async function mesajiTazele(guild, cekilis, adet) {
  if (!cekilis.mesaj_id) return false;
  const kanal = await guild.channels.fetch(cekilis.kanal_id).catch(() => null);
  const mesaj = await kanal?.messages?.fetch(cekilis.mesaj_id).catch(() => null);
  if (!mesaj) return false;

  return mesaj.edit({
    embeds: [cekilisGomusu(cekilis, adet)],
    components: [katilButonu(cekilis.id, adet)],
    ...PINGSIZ,
  }).then(() => true, () => false);
}

export async function execute(interaction) {
  const db = veritabani();
  const guildId = interaction.guildId;
  const alt = interaction.options.getSubcommand();

  if (alt === 'baslat') {
    const odul = interaction.options.getString('odul');
    const sureMs = sureAyristir(interaction.options.getString('sure'));
    const kazananSayisi = interaction.options.getInteger('kazanan') ?? 1;

    const gecerli = gecerliMi({ sureMs, kazananSayisi, odul });
    if (!gecerli.ok) {
      await interaction.reply({ content: gecerli.sebep, flags: MessageFlags.Ephemeral });
      return;
    }

    const hedef = await hedefKanal(interaction);
    if (!hedef.ok) {
      await interaction.reply({ content: hedef.sebep, flags: MessageFlags.Ephemeral });
      return;
    }

    const bitis = Date.now() + sureMs;
    const id = cekilisEkle(db, {
      guildId, kanalId: hedef.kanal.id, odul, kazananSayisi, bitis,
      olusturanId: interaction.user.id,
    });

    const cekilis = cekilisGetir(db, id);
    const mesaj = await hedef.kanal.send({
      embeds: [cekilisGomusu(cekilis, 0)],
      components: [katilButonu(id, 0)],
      ...PINGSIZ,
    }).catch(() => null);

    if (!mesaj) {
      // Mesaj gidemediyse kayıtta açık bir çekiliş bırakmıyoruz; yoksa
      // kimsenin göremediği bir çekiliş süresi dolunca sessizce çekilirdi.
      iptalEt(db, id);
      await interaction.reply({
        content: 'Çekiliş mesajı gönderilemedi, çekiliş açılmadı.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    mesajBagla(db, id, mesaj.id);
    await interaction.reply({
      content: `🎁 Çekiliş **#${id}** açıldı: ${hedef.kanal} — ${sureBicimle(sureMs)} sonra, `
        + `${kazananSayisi} kazanan.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (alt === 'uzat') {
    const no = interaction.options.getInteger('no');
    const ekMs = sureAyristir(interaction.options.getString('sure'));

    const bulunan = sunucununCekilisi(db, guildId, no);
    if (!bulunan.ok) {
      await interaction.reply({ content: bulunan.sebep, flags: MessageFlags.Ephemeral });
      return;
    }

    const sonuc = uzat(db, no, ekMs);
    if (!sonuc.ok) {
      const sebep = {
        'gecersiz-sure': 'Süre anlaşılmadı. Örnek: `5dk`, `1sa`, `2g`.',
        kapali: `**#${no}** zaten kapanmış (${bulunan.cekilis.durum}); uzatılamaz.`,
        'cok-uzun': 'Uzatılınca bitiş şimdiden en çok 30 gün sonra olabilir.',
        bulunamadi: `**#${no}** bulunamadı.`,
      }[sonuc.sebep] ?? 'Uzatılamadı.';
      await interaction.reply({ content: sebep, flags: MessageFlags.Ephemeral });
      return;
    }

    // Mesaj düzenlemesi Discord'un 3 saniyelik yanıt süresini aşabilir.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guncel = cekilisGetir(db, no);
    const tazelendi = await mesajiTazele(interaction.guild, guncel, katilimSayisi(db, no));
    await interaction.editReply({
      content: `⏳ **#${no}** ${sureBicimle(ekMs)} uzatıldı: yeni bitiş ${zaman(sonuc.bitis, 'F')} `
        + `(${zaman(sonuc.bitis, 'R')}).`
        + (tazelendi ? '' : '\n⚠️ Çekiliş mesajı güncellenemedi; mesajdaki bitiş eski kalmış olabilir.'),
    });
    return;
  }

  if (alt === 'bitir' || alt === 'iptal') {
    const no = interaction.options.getInteger('no');
    const bulunan = sunucununCekilisi(db, guildId, no);
    if (!bulunan.ok) {
      await interaction.reply({ content: bulunan.sebep, flags: MessageFlags.Ephemeral });
      return;
    }

    if (bulunan.cekilis.durum !== DURUMLAR.acik) {
      await interaction.reply({
        content: `**#${no}** zaten kapanmış (${bulunan.cekilis.durum}).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (alt === 'iptal') {
      iptalEt(db, no);
      await interaction.reply({
        content: `**#${no}** iptal edildi; kazanan çekilmedi.`, flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Bitişi şimdiye çekiyoruz; sonuçlandırmayı servis turu yapar, böylece
    // mesaj güncelleme ve duyuru tek yerden geçer.
    db.prepare('UPDATE cekilisler SET bitis = ? WHERE id = ?').run(Date.now(), no);
    await interaction.reply({
      content: `**#${no}** erken bitiriliyor; sonuç birazdan kanala düşecek.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (alt === 'yeniden') {
    const no = interaction.options.getInteger('no');
    const adet = interaction.options.getInteger('adet') ?? 1;

    const bulunan = sunucununCekilisi(db, guildId, no);
    if (!bulunan.ok) {
      await interaction.reply({ content: bulunan.sebep, flags: MessageFlags.Ephemeral });
      return;
    }

    const sonuc = yenidenCek(db, no, { adet });
    if (!sonuc.ok) {
      const sebep = {
        sonuclanmamis: `**#${no}** henüz sonuçlanmadı; önce \`/cekilis bitir\` kullan.`,
        'aday-yok': `**#${no}** için yeni kazanan çekilecek katılımcı kalmadı.`,
        bulunamadi: `**#${no}** bulunamadı.`,
      }[sonuc.sebep] ?? 'Yeniden çekilemedi.';
      await interaction.reply({ content: sebep, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      content: `🎉 **${bulunan.cekilis.odul}** için yeni kazanan: ${kazananMetni(sonuc.kazananlar)}`,
      allowedMentions: { users: sonuc.kazananlar },
    });
    return;
  }

  const acik = acikCekilisler(db, guildId);
  if (acik.length === 0) {
    await interaction.reply({
      content: 'Açık çekiliş yok.', flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const embed = gomu('bilgi', 'Açık çekilişler').setDescription(
    acik.map((c) => `**#${c.id}** — ${c.odul} · <#${c.kanal_id}> · ${zaman(c.bitis, 'R')} `
      + `· ${katilimSayisi(db, c.id)} katılım`).join('\n'),
  );

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, ...PINGSIZ });
}

export { sonuclandir };
