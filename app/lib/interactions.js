import { MessageFlags } from 'discord.js';

/**
 * InteractionCreate işleyicisini üretir.
 *
 * app.js'ten ayrı bir modül: böylece Discord'a bağlanmadan test edilebiliyor.
 *
 * @param {Map<string, {execute: Function, autocomplete?: Function, sistem?: string|null}>} commands
 * @param {{error: Function}} [logger]
 * @param {object} [secenekler]
 * @param {(guildId: string, sistem: string) => boolean} [secenekler.sistemKontrol]
 *   Komutun ait olduğu sistem o sunucuda açık mı. Verilmezse denetim yapılmaz.
 * @param {(interaction: object, command: object) => string | null} [secenekler.kanalKontrol]
 *   Komut bu kanalda çalışabilir mi: reddedilirse kullanıcıya gösterilecek metni,
 *   izinliyse null döner. Verilmezse denetim yapılmaz. Yalnız slash komutlar
 *   denetlenir; butonlar etkilenmez.
 * @param {Array<{eslesir: Function, calistir: Function, ekonomi?: boolean}>} [secenekler.bilesenler]
 *   Buton ve modal yönlendiricileri. `ekonomi: true` olanlar uzaklaştırma denetiminden geçer.
 * @param {(interaction: object) => object | null} [secenekler.uzakKontrol]
 *   Üye ekonomiden uzaklaştırıldıysa gösterilecek yanıt (içerik + butonlar), değilse null.
 *   `ekonomi` sistemindeki komutlara ve `ekonomi: true` bileşenlere uygulanır.
 */
export function createInteractionHandler(commands, logger = console, secenekler = {}) {
  const {
    sistemKontrol = null, kanalKontrol = null, uzakKontrol = null, bilesenler = [],
  } = secenekler;

  /** Uzaklaştırılmış üyeye gizli yanıt verir; verdiyse true. */
  async function uzakEngeli(interaction) {
    const yanit = uzakKontrol?.(interaction);
    if (!yanit) return false;
    await interaction.reply({ ...yanit, flags: MessageFlags.Ephemeral }).catch((e) => logger.error('Uzaklaştırma yanıtı gönderilemedi:', e.message));
    return true;
  }

  return async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
      await komutCalistir(interaction);
      return;
    }

    // Otomatik tamamlama: kullanıcı yazarken gelir, yanıtı 3 saniye içinde
    // verilmeli ve hata yanıtı gönderilemez; bu yüzden ayrı ele alınıyor.
    if (interaction.isAutocomplete?.()) {
      await tamamlamaCalistir(interaction);
      return;
    }

    // Buton, modal ve kullanıcı seçimi: başvuru onay/ret ve özel ses paneli bunlarla yürüyor.
    if (interaction.isButton?.() || interaction.isModalSubmit?.() || interaction.isUserSelectMenu?.()) {
      await bilesenCalistir(interaction);
    }
  };

  async function komutCalistir(interaction) {
    const command = commands.get(interaction.commandName);

    if (!command) {
      logger.error(`Bilinmeyen komut çağrıldı: /${interaction.commandName}`);
      await sendError(
        interaction,
        'Bu komut artık tanımlı değil. Komutların yeniden kaydedilmesi gerekiyor olabilir.',
        logger,
      );
      return;
    }

    if (command.sistem && sistemKontrol && interaction.guildId
        && !sistemKontrol(interaction.guildId, command.sistem)) {
      await sendError(
        interaction,
        `Bu komutun bağlı olduğu **${command.sistem}** sistemi bu sunucuda kapalı. `
        + 'Yönetici `/ayar sistem` ile açabilir.',
        logger,
      );
      return;
    }

    if (command.sistem === 'ekonomi' && await uzakEngeli(interaction)) return;

    const kanalMesaji = kanalKontrol ? kanalKontrol(interaction, command) : null;
    if (kanalMesaji) {
      await sendError(interaction, kanalMesaji, logger);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      // Hatayı yutmuyoruz: sunucuda loglanır, kullanıcı da sessiz bırakılmaz.
      logger.error(`/${interaction.commandName} çalışırken hata:`, error);
      await sendError(interaction, 'Komut çalıştırılırken bir hata oluştu.', logger);
    }
  }

  async function tamamlamaCalistir(interaction) {
    const command = commands.get(interaction.commandName);
    if (typeof command?.autocomplete !== 'function') return;

    try {
      await command.autocomplete(interaction);
    } catch (error) {
      // Boş liste dönmek, kullanıcıyı "yükleniyor"da bırakmaktan iyidir.
      logger.error(`/${interaction.commandName} otomatik tamamlaması hata verdi:`, error);
      await interaction.respond([]).catch(() => {});
    }
  }

  async function bilesenCalistir(interaction) {
    const yonlendirici = bilesenler.find((b) => b.eslesir(interaction));
    if (!yonlendirici) return;
    if (yonlendirici.ekonomi && await uzakEngeli(interaction)) return;

    try {
      await yonlendirici.calistir(interaction);
    } catch (error) {
      logger.error(`Bileşen ${interaction.customId} çalışırken hata:`, error);
      await sendError(interaction, 'İşlem sırasında bir hata oluştu.', logger);
    }
  }
}

async function sendError(interaction, content, logger) {
  const yanit = { content, flags: MessageFlags.Ephemeral };

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(yanit);
    } else {
      await interaction.reply(yanit);
    }
  } catch (error) {
    // Etkileşim zaman aşımına uğramış olabilir; bu ikincil hata süreci düşürmemeli.
    logger.error('Hata yanıtı gönderilemedi:', error.message);
  }
}
