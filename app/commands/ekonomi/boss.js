import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { ayarGetir } from '../../lib/ayarlar.js';
import { gomu, zaman } from '../../lib/bicim.js';
import {
  aktifBoss, BOSSLAR, bossCikar, bossGorunumu, kisiDurumu, sonrakiCikis, sonrakiSaldiri,
} from '../../lib/boss.js';
import { canCubugu, saldiriAkisi } from '../../lib/boss-bilesen.js';
import { veritabani } from '../../lib/db.js';
import { emojiCozucu } from '../../lib/kasa-bilesen.js';
import { bossMesajiGonder } from '../../servisler/boss.js';
import { yoneticiMi } from './ekonomi-yonet.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

export const data = new SlashCommandBuilder()
  .setName('boss')
  .setDescription('Haftalık boss savaşı: saldır, durumu gör. Her Cumartesi 20:00 yeni boss çıkar.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s.setName('saldir').setDescription('Bosssa saldırır (her 2 saatte bir).'))
  .addSubcommand((s) => s.setName('durum').setDescription('Mevcut boss, canı, senin hasarın ve sıran.'))
  .addSubcommand((s) => s
    .setName('cagir').setDescription('(Yönetici) Hemen bir boss çıkarır (test / etkinlik).')
    .addStringOption((o) => o
      .setName('boss').setDescription('Hangi boss (boşsa rastgele)')
      .addChoices(...BOSSLAR.map((b) => ({ name: b.ad, value: b.kimlik }))))
    .addBooleanOption((o) => o.setName('elit').setDescription('Elit sürüm (boşsa %15 şansla rastgele)')));

const gizli = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

async function durum(interaction, db) {
  const guildId = interaction.guildId;
  const savas = aktifBoss(db, guildId);
  if (!savas) {
    await gizli(interaction, `Şu an aktif bir boss yok. Sıradaki boss: ${zaman(sonrakiCikis(), 'F')} (${zaman(sonrakiCikis(), 'R')}).`);
    return;
  }
  const emoji = emojiCozucu(interaction.guild);
  const g = bossGorunumu(savas.boss, savas.elit === 1);
  const kisi = kisiDurumu(db, savas.id, interaction.user.id);
  const sonraki = sonrakiSaldiri(kisi.sonSaldiri);
  const hazir = sonraki <= Date.now();

  const embed = gomu(savas.elit ? 'uyari' : 'hata', `${savas.elit ? 'ELİT ' : ''}Boss: ${g.ad}`)
    .setDescription([
      `${emoji(g)} \`${canCubugu(savas.can, savas.max_can)}\``,
      `⏳ Kalan süre: ${zaman(savas.bitis, 'R')}`,
    ].join('\n'))
    .addFields(
      { name: 'Senin hasarın', value: kisi.hasar > 0 ? kisi.hasar.toLocaleString('tr-TR') : '_Henüz saldırmadın._', inline: true },
      { name: 'Sıran', value: kisi.sira ? `${kisi.sira}. / ${kisi.katilimci}` : '—', inline: true },
      { name: 'Sonraki saldırı', value: hazir ? '✅ Hazır, `/boss saldir`' : zaman(sonraki, 'R'), inline: true },
    );
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}

async function cagir(interaction, db) {
  // Çift denetim: komut herkese açık, bu alt komut yalnız Yönetici.
  if (!yoneticiMi(interaction)) {
    await gizli(interaction, '⛔ Bu komutu yalnız **Yönetici** yetkisi olanlar kullanabilir.');
    return;
  }
  const guildId = interaction.guildId;
  const kanalId = ayarGetir(db, guildId, 'boss.kanal');
  if (!kanalId) {
    await gizli(interaction, 'Önce boss kanalını ayarla: `/ayar ayarla anahtar:boss.kanal kanal:#…`');
    return;
  }
  const savas = bossCikar(db, {
    guildId,
    kimlik: interaction.options.getString('boss'),
    elit: interaction.options.getBoolean('elit'),
  });
  if (!savas) {
    await gizli(interaction, 'Zaten aktif bir boss var; önce o bitmeli.');
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const mesaj = await bossMesajiGonder(interaction.client, db, guildId, savas, kanalId);
  await interaction.editReply(mesaj
    ? `⚔️ Boss çağrıldı: ${mesaj.url}`
    : 'Boss mesajı gönderilemedi (kanal erişimini kontrol et); boss geri alındı.');
}

export async function execute(interaction, db = veritabani()) {
  const islemler = { saldir: saldiriAkisi, durum, cagir };
  await islemler[interaction.options.getSubcommand()](interaction, db);
}
