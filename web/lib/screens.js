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

  /* ============================================================ CEVHER HATTI
     Yerlesim kurali: malzeme SOLDAN SAGA akar, ekipman tek bir bantta dizilir,
     her ekipmanin degerleri TAM ALTINDA duran kompakt kartta gosterilir.
     Uzun kesik cizgiler yok — goz akisi takip edebilsin. */
  function cevherHatti() {
    const b = new Cizim();
    const W = 1280, H = 660;
    const Y = 250;                     // ekipman bandi
    const KY = 430;                    // kart bandi

    b.not(26, 34, 'ALAN 30 — CEVHER HAZIRLAMA HATTI', 'et-baslik');
    b.not(26, 54, 'Malzeme akışı:  soldan sağa', 'et-not');

    /* ---- akis omurgasi: kesintisiz turuncu bant ---- */
    b.boru('M150,240 L150,300 L300,300 L300,318 L420,318 L440,318', 'cevher',
           { kalinlik: 15, ok: [[150, 272, 90], [240, 300, 0], [396, 318, 0]] });
    b.boru('M440,350 L470,392 L520,392', 'cevher', { kalinlik: 13, akis: false });
    b.boru('M900,300 L900,268', 'cevher', { kalinlik: 13, ok: [[900, 284, -90]] });
    b.boru('M1128,236 L1180,236 L1180,150', 'cevher',
           { kalinlik: 14, ok: [[1158, 236, 0], [1180, 190, -90]] });

    /* ---- 1. ROM bunkeri ---- */
    b.bunker(76, 108, 148, 132, 'BN01', 'ROM BUNKERİ', 'bunker.BN01.seviyye');
    b.kart(60, KY, 'BN01', 'ROM BUNKERİ', [
      ['bunker.BN01.seviyye', 'SEVİYE', '%', 0],
      ['bunker.BN01.ton', 'MİKTAR', 't', 0]], { hat: [150, 288] });

    /* ---- 2. apron besleyici ---- */
    b.besleyici(300, 300, 'FE01', 'APRON BESLEYİCİ');
    b.kart(232, KY, 'FE01', 'APRON BESLEYİCİ', [
      ['vsd.FE01.hiz', 'VSD HIZI', '%', 0],
      ['motor.FE01.akim', 'AKIM', 'A', 1]], { hat: [300, 346] });

    /* ---- 3. cene kirici ---- */
    b.kirici(500, Y + 70, 'CR01', 'ÇENE KIRICI 1100×800');
    b.kart(404, KY, 'CR01', 'ÇENE KIRICI', [
      ['motor.CR01.akim', 'AKIM', 'A', 1],
      ['motor.CR01.yuk', 'YÜK', '%', 0],
      ['css.CR01.acilim', 'CSS', 'mm', 0]], { hat: [500, 380] });

    /* ---- 4. CV01 bant ---- */
    b.konveyor(560, 372, 812, 292, 'CV01', 'kırıcı çıkış bandı', 'bant.CV01.yuk');
    b.kart(596, KY, 'CV01', 'BANT 01', [
      ['bant.CV01.yuk', 'YÜK', 't/h', 0],
      ['motor.CV01.akim', 'AKIM', 'A', 1]], { hat: [686, 400] });

    /* ---- 5. surge bunkeri ---- */
    b.bunker(836, 128, 128, 108, 'BN02', 'SURGE BUNKERİ', 'bunker.BN02.seviyye');
    b.kart(788, KY, 'BN02', 'SURGE BUNKERİ', [
      ['bunker.BN02.seviyye', 'SEVİYE', '%', 0],
      ['bunker.BN02.ton', 'MİKTAR', 't', 0]], { hat: [900, 292] });

    /* ---- 6. CV02 bant ---- */
    b.konveyor(940, 328, 1128, 268, 'CV02', 'skip besleme bandı', 'bant.CV02.yuk');
    b.kart(980, KY, 'CV02', 'BANT 02', [
      ['bant.CV02.yuk', 'YÜK', 't/h', 0],
      ['motor.CV02.akim', 'AKIM', 'A', 1]], { hat: [1034, 380] });

    /* ---- 7. skip ---- */
    b.not(1150, 146, 'SKİP / KUYU', 'et-eq');
    b.not(1150, 162, 'yüzeye taşıma', 'et-alt');
    b.kart(1148, KY, 'ÜRETİM', 'VARDİYA', [
      ['uretim.vardiya.ton', 'TOPLAM', 't', 1]], { genislik: 118 });

    return b.bitir(W, H);
  }

  /* ============================================================ SU ATMA */
  function suAtma() {
    const b = new Cizim();
    const W = 1280, H = 660;
    const KY = 452;

    b.not(26, 34, 'ALAN 40 — OCAK SUYU TAHLİYE SİSTEMİ', 'et-baslik');
    b.not(26, 54, 'Su akışı:  ocaktan → yüzeye', 'et-not');

    /* ---- ocaktan gelen su ---- */
    b.not(56, 128, 'OCAKTAN GELEN SU', 'et-alt');
    b.boru('M60,148 L150,148 L150,186', 'su', { kalinlik: 12,
           ok: [[110, 148, 0], [150, 170, 90]] });

    /* ---- cokeltme tanki ---- */
    b.tank(86, 190, 128, 124, 'TK01', 'ÇÖKELTME TANKI', 'tank.TK01.seviyye');
    b.kart(64, KY, 'TK01', 'ÇÖKELTME TANKI', [
      ['tank.TK01.seviyye', 'SEVİYE', '%', 0]], { hat: [150, 330] });
    b.boru('M150,322 L150,372 L330,372', 'su', { kalinlik: 12,
           ok: [[150, 350, 90], [270, 372, 0]] });

    /* ---- motorlu vana ---- */
    b.vana(360, 372, 'HV01', 'SUMP BESLEME VANASI');
    b.kart(292, KY, 'HV01', 'BESLEME VANASI', [
      ['vana.HV01.acilim', 'AÇILIM', '%', 0]], { hat: [360, 420] });
    b.boru('M382,372 L470,372 L470,406', 'su', { kalinlik: 12,
           ok: [[430, 372, 0], [470, 392, 90]] });

    /* ---- sump ---- */
    b.sump(410, 410, 180, 96, 'S1', 'SUMP HAVUZU', 'sump.S1.seviyye');
    b.kart(408, KY + 96, 'S1', 'SUMP HAVUZU', [
      ['sump.S1.seviyye', 'SEVİYE', '%', 0],
      ['sump.S1.hacim', 'HACİM', 'm³', 1]], { genislik: 150 });
    b.boru('M500,506 L500,540 L700,540 L700,318', 'su', { kalinlik: 11,
           ok: [[610, 540, 0], [700, 420, -90]] });
    b.boru('M500,506 L500,540 L920,540 L920,318', 'su', { kalinlik: 11, akis: false });

    /* ---- pompalar ---- */
    b.pompa(700, 296, 'P1', 'SUMP POMPASI 1');
    b.kart(628, 128, 'P1', 'SUMP POMPASI 1', [
      ['motor.P1.akim', 'AKIM', 'A', 1]], { hat: [700, 256] });
    b.pompa(920, 296, 'P2', 'SUMP POMPASI 2');
    b.kart(848, 128, 'P2', 'SUMP POMPASI 2', [
      ['motor.P2.akim', 'AKIM', 'A', 1]], { hat: [920, 256] });

    /* ---- basma hatti ---- */
    b.boru('M718,280 L780,280 L780,222 L1060,222', 'su', { kalinlik: 12,
           ok: [[780, 250, -90], [980, 222, 0]] });
    b.boru('M938,280 L1000,280 L1000,222', 'su', { kalinlik: 11, akis: false });
    b.not(1068, 214, 'YÜZEYE BASMA', 'et-eq');
    b.not(1068, 230, 'Ø250 çelik boru · +300 m', 'et-alt');
    b.kart(1068, 258, 'BASMA', 'YÜZEYE', [
      ['basma.debi', 'DEBİ', 'L/s', 1],
      ['basma.basinc', 'BASINÇ', 'bar', 1]], { genislik: 150 });

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
