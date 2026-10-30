// Bir kerelik geçiş (2026-10-23): çiftlikler 10 seviyeden üç yollu sisteme
// geçti. Eski sistemde yükseltmeye harcanan muz sahibine iade edilir, çiftlik
// yükseltilmemiş kalır. Tekrar çalışırsa hiçbir şey yapmaz.
//
// Kullanım: node scripts/ciftlik-gecis.js

import { eskiSeviyeleriIadeEt } from '../lib/ciftlik.js';
import { veritabani } from '../lib/db.js';

const iadeler = eskiSeviyeleriIadeEt(veritabani());
for (const i of iadeler) console.log(`${i.kullaniciId} arsa ${i.arsa + 1}: ${i.iade} muz iade`);
console.log(`${iadeler.length} çiftlik iade edildi.`);
