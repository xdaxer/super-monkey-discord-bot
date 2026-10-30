/**
 * Bütün alan rotaları. Her dosya kendi alanının sahibidir ve `rotalar` dizisi
 * dışa aktarır (biçim: web/sunucu.js başındaki açıklama).
 */

import { rotalar as boss } from './boss.js';
import { rotalar as ciftlik } from './ciftlik.js';
import { rotalar as cuzdan } from './cuzdan.js';
import { rotalar as finans } from './finans.js';
import { rotalar as genel } from './genel.js';
import { rotalar as kumar } from './kumar.js';
import { rotalar as magaza } from './magaza.js';
import { rotalar as maymun } from './maymun.js';
import { rotalar as olaylar } from './olaylar.js';
import { rotalar as pazar } from './pazar.js';
import { rotalar as sosyal } from './sosyal.js';
import { rotalar as yonetim } from './yonetim.js';

export const tumRotalar = [...genel, ...cuzdan, ...maymun, ...ciftlik, ...kumar, ...magaza, ...pazar, ...finans, ...boss, ...olaylar, ...sosyal, ...yonetim];
