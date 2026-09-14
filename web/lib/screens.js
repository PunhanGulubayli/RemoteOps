/* RemoteOps — Proses ekranlari
 *
 * Her ekran gercek bir P&ID yerlesimidir ve SU BILGILERI TASIR:
 *   ad        — ekranin adi
 *   ozet      — "burasi neyi kontrol ediyor" (egitim amacli, her zaman gorunur)
 *   akis      — proses akisinin tek cumlelik ozeti
 *   ekipman[] — her ekipmanin NE IS YAPTIGI (kullanici ogrenmeli)
 *   ciz()     — SVG + baglanti + tiklama uretir
 */
'use strict';

(function () {
  const { Cizim } = window.HMI;

  /* ============================================================ CEVHER HATTI */
  function cevherHatti() {
    const b = new Cizim();
    const W = 1240, H = 700;

    b.not(24, 30, 'ALAN 30 — CEVHER HAZIRLAMA HATTI', 'et-baslik');
    b.not(24, 50, 'ROM bunkeri → apron besleyici → çene kırıcı → bant → surge bunkeri → bant → skip',
          'et-not');

    // --- ROM bunkeri + besleyici ---
    b.bunker(90, 96, 150, 128, 'BN01', 'ROM BUNKERİ', 'bunker.BN01.seviyye');
    b.oluk(165, 258, 165, 288);
    b.besleyici(178, 300, 'FE01', 'APRON BESLEYİCİ');
    b.oluk(250, 318, 300, 352);

    // --- kirici ---
    b.kirici(360, 392, 'CR01', 'ÇENE KIRICI 1100×800');
    b.oluk(360, 422, 400, 462);

    // --- CV01 bant -> surge bunkeri ---
    b.konveyor(420, 478, 700, 372, 'CV01', 'BANT 01 — kırıcı çıkışı', 'bant.CV01.yuk');
    b.oluk(700, 356, 760, 300);

    // --- surge bunkeri ---
    b.bunker(742, 216, 138, 112, 'BN02', 'SURGE BUNKERİ', 'bunker.BN02.seviyye');
    b.oluk(811, 362, 811, 396);

    // --- CV02 bant -> skip ---
    b.konveyor(824, 414, 1108, 300, 'CV02', 'BANT 02 — skip besleme', 'bant.CV02.yuk');
    b.not(1092, 262, 'SKİP / KUYU', 'et-eq');
    b.boru('M1112,292 L1160,292 L1160,150', 'cevher',
           { kalinlik: 11, ok: [[1140, 292, 0], [1160, 210, -90]] });

    // --- olcumler ---
    b.olcum(165, 160, 60, 402, 'LT', 'bunker.BN01.seviyye', 'ROM SEVİYE', '%', { ondalik: 0 });
    b.olcum(218, 306, 176, 176, 'SC', 'vsd.FE01.hiz', 'BESLEYİCİ HIZ', '%', { ondalik: 0 });
    b.olcum(306, 392, 210, 540, 'IT', 'motor.CR01.akim', 'KIRICI AKIM', 'A', { ondalik: 0 });
    b.olcum(560, 426, 470, 596, 'WT', 'bant.CV01.yuk', 'BANT 01 YÜK', 't/h', { ondalik: 0 });
    b.olcum(811, 272, 952, 150, 'LT', 'bunker.BN02.seviyye', 'SURGE SEVİYE', '%', { ondalik: 0 });
    b.olcum(966, 358, 1040, 520, 'WT', 'bant.CV02.yuk', 'BANT 02 YÜK', 't/h', { ondalik: 0 });

    b.deger(24, 600, 'uretim.vardiya.ton', 'VARDİYA ÜRETİMİ', 't', 1);
    b.deger(24, 638, 'css.CR01.acilim', 'KIRICI CSS', 'mm', 0);

    const r = b.bitir(W, H);
    r.click['eq_CR01'].ekstra = 'css';
    r.click['eq_FE01'].ekstra = 'vsd';
    return r;
  }

  /* ============================================================ SU ATMA */
  function suAtma() {
    const b = new Cizim();
    const W = 1240, H = 700;

    b.not(24, 30, 'ALAN 40 — OCAK SUYU TAHLİYE SİSTEMİ', 'et-baslik');
    b.not(24, 50, 'Ocak suyu → çökeltme tankı → motorlu vana → sump → pompalar → yüzeye basma',
          'et-not');

    // --- ocaktan gelen su ---
    b.not(60, 128, 'OCAKTAN GELEN SU', 'et-alt');
    b.boru('M62,150 L200,150 L200,196', 'su', { kalinlik: 10, id: 'giris',
           ok: [[130, 150, 0], [200, 176, 90]] });

    // --- cokeltme tanki ---
    b.tank(140, 200, 128, 132, 'TK01', 'ÇÖKELTME TANKI', 'tank.TK01.seviyye');
    b.boru('M204,340 L204,392 L330,392', 'su', { kalinlik: 10,
           ok: [[204, 366, 90], [280, 392, 0]] });

    // --- motorlu vana ---
    b.vana(330, 392, 'HV01', 'SUMP BESLEME VANASI', 0);
    b.boru('M348,392 L470,392 L470,438', 'su', { kalinlik: 10,
           ok: [[420, 392, 0], [470, 420, 90]] });

    // --- sump ---
    b.sump(408, 442, 168, 96, 'S1', 'SUMP HAVUZU', 'sump.S1.seviyye');
    b.boru('M492,538 L492,572 L660,572 L660,468', 'su', { kalinlik: 9,
           ok: [[580, 572, 0]] });
    b.boru('M492,538 L492,572 L860,572 L860,468', 'su', { kalinlik: 9, akis: false });

    // --- pompalar ---
    b.pompa(660, 444, 'P1', 'SUMP POMPASI 1');
    b.pompa(860, 444, 'P2', 'SUMP POMPASI 2');
    b.boru('M677,428 L760,428 L760,300 L1060,300', 'su', { kalinlik: 10,
           ok: [[760, 360, -90], [960, 300, 0]] });
    b.boru('M877,428 L940,428 L940,300', 'su', { kalinlik: 9, akis: false });
    b.not(1064, 292, 'YÜZEYE BASMA', 'et-eq');
    b.not(1064, 308, 'Ø250 çelik boru · +300 m', 'et-alt');

    // --- olcumler ---
    b.olcum(204, 266, 84, 214, 'LT', 'tank.TK01.seviyye', 'TANK SEVİYE', '%', { ondalik: 0 });
    b.olcum(330, 392, 330, 250, 'ZT', 'vana.HV01.acilim', 'VANA AÇILIM', '%', { ondalik: 0 });
    b.olcum(492, 490, 330, 598, 'LT', 'sump.S1.seviyye', 'SUMP SEVİYE', '%', { ondalik: 0 });
    b.olcum(660, 444, 640, 624, 'IT', 'motor.P1.akim', 'P1 AKIM', 'A', { ondalik: 0 });
    b.olcum(860, 444, 858, 624, 'IT', 'motor.P2.akim', 'P2 AKIM', 'A', { ondalik: 0 });
    b.olcum(1000, 300, 1064, 150, 'FT', 'basma.debi', 'BASMA DEBİSİ', 'L/s', { ondalik: 1 });
    b.olcum(900, 300, 900, 150, 'PT', 'basma.basinc', 'BASMA BASINCI', 'bar', { ondalik: 1 });

    return b.bitir(W, H);
  }

  /* ============================================================ EKRAN TANIMLARI */
  const EKRANLAR = {
    genel: {
      ad: 'GENEL BAKIŞ',
      alan: 'TESİS',
      ozet: 'Ocağın üç ana prosesinin özet durumu. Buradan hangi alanda sorun ' +
            'olduğunu görüp ilgili ekrana geçersiniz.',
      akis: 'Havalandırma · Cevher hazırlama · Su tahliyesi',
      tip: 'ozet',
      ekipman: [],
    },

    hava: {
      ad: 'HAVALANDIRMA',
      alan: 'ALAN 10',
      ozet: 'Ocağa temiz hava basan ve kirli havayı dışarı atan şebeke. ' +
            'Arınlara yeterli hava gitmezse metan seyrelmez ve birikir — ' +
            'yeraltı madenciliğinde en kritik sistem budur.',
      akis: 'Giriş kuyusu → ana yollar → arınlar → dönüş yolu → çıkış kuyusu (ana fan)',
      tip: 'sebeke',
      ekipman: [
        ['ANA FAN', 'Tüm ocağı havalandıran emici fan. Durursa hava akışı ' +
                    'saniyeler içinde sıfıra iner.'],
        ['HAVA KAPISI', 'Havayı istenen yola zorlar. Açık kalırsa hava arınlara ' +
                        'uğramadan kısa devre yapar — fan debisi ARTAR ama arın havası DÜŞER.'],
        ['TENZİM (regülatör)', 'Bir kolun direncini ayarlayarak hava dağılımını ' +
                               'değiştirir. Kısılırsa o arın hava kaybeder, diğerleri kazanır.'],
        ['ARIN', 'Üretim yapılan yer. Metan buradan çıkar; yeterli hava ile seyreltilir.'],
      ],
    },

    cevher: {
      ad: 'CEVHER HATTI',
      alan: 'ALAN 30',
      ozet: 'Çıkarılan cevheri kırıp yüzeye taşınacak boyuta getiren hat. ' +
            'Ekipmanlar birbirine INTERLOCK ile bağlıdır: yanlış sırada ' +
            'başlatılamaz, çünkü malzeme yığılır ve bant kopar.',
      akis: 'ROM bunkeri → besleyici → kırıcı → bant 01 → surge bunkeri → bant 02 → skip',
      tip: 'proses', ciz: cevherHatti,
      ekipman: [
        ['BN01 — ROM bunkeri', 'Ocaktan gelen ham cevherin biriktiği bunker. ' +
                               'Boşalırsa besleyici çalışamaz.'],
        ['FE01 — Apron besleyici', 'Bunkerden kırıcıya kontrollü malzeme verir. ' +
                                   'Hızı (VSD) ile debi ayarlanır.'],
        ['CR01 — Çene kırıcı', 'İri cevheri kırar. Motor akımı yükü gösterir; ' +
                               'aşırı beslenirse tıkanır (choke) ve trip eder.'],
        ['CV01 / CV02 — Bantlar', 'Malzemeyi taşır. Alıcı bunker dolarsa ' +
                                  'bant durdurulmalıdır, yoksa taşar.'],
        ['BN02 — Surge bunkeri', 'Kırıcı ile skip arasında tampon. ' +
                                 'Doluysa üst hat beslenemez.'],
      ],
      baslatmaSirasi: ['CV02', 'CV01', 'CR01', 'FE01'],
      durdurmaSirasi: ['FE01', 'CR01', 'CV01', 'CV02'],
    },

    su: {
      ad: 'SU ATMA',
      alan: 'ALAN 40',
      ozet: 'Ocağa sızan suyu toplayıp yüzeye basan sistem. Sump taşarsa ' +
            'alt katlar su altında kalır ve üretim durur.',
      akis: 'Ocak suyu → TK01 çökeltme → HV01 vana → S1 sump → P1/P2 pompalar → yüzey',
      tip: 'proses', ciz: suAtma,
      ekipman: [
        ['TK01 — Çökeltme tankı', 'Suyun katı taneciklerini çöktürür; ' +
                                  'pompaların aşınmasını önler.'],
        ['HV01 — Motorlu vana', 'Tanktan sumpa geçişi kontrol eder. ' +
                                'Kapalıyken pompalar basamaz.'],
        ['S1 — Sump havuzu', 'Pompaların emdiği havuz. Seviye çok düşerse ' +
                             'pompa kuru çalışır ve zarar görür.'],
        ['P1 / P2 — Sump pompaları', 'Suyu yüzeye basar. Tek pompa giriş debisini ' +
                                     'karşılamazsa ikincisi devreye alınmalıdır.'],
      ],
    },

    alarm: {
      ad: 'ALARMLAR',
      alan: 'ISA-18.2',
      ozet: 'Tüm aktif alarmlar ve alarm sistemi performansı. ANSI/ISA-18.2 ' +
            'operatör başına saatte 6 alarmı üst sınır kabul eder.',
      akis: 'Alarm onaylamak, müdahale etmek DEĞİLDİR.',
      tip: 'alarm', ekipman: [],
    },

    trend: {
      ad: 'TRENDLER',
      alan: 'GEÇMİŞ',
      ozet: 'Seçilen ölçümlerin zaman içindeki değişimi. Eşik çizgileri ' +
            'kesikli gösterilir; bir değerin YÖNÜ, anlık değerinden önemlidir.',
      akis: '', tip: 'trend', ekipman: [],
    },
  };

  window.HMI.EKRANLAR = EKRANLAR;
})();
