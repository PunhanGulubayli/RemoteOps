# RemoteOps — Layihə Konteksti (CLAUDE.md)

> Bu fayl layihənin **tək həqiqət mənbəyidir**. Yeni bir Claude Code sessiyası,
> yeni komanda üzvü və ya kənar adam bu faylı oxuyanda layihəni tam başa düşməlidir.
> **Hər faz bitəndə §3 STATUS bölməsi yenilənməlidir.**

**Son yenilənmə:** 2026-09-14 · Faz 0–6 tam, Faz 7 qismən, Faz 8 tam
**Vəziyyət:** 26/26 fizika · 28/28 uçdan-uca · müstəqil həlledici fərqi 0.0001%

---

## 1. Layihə nədir

RemoteOps — madencilik üçün **brauzer əsaslı SCADA/HMI təlim simulyatorudur**.

İstifadəçi virtual bir maden ocağının idarəetmə otağında oturur:
ventilyasiya, qaz izləmə, su atma (drenaj) və konveyer sistemlərini idarə edir,
nasazlıqlara və alarmlara reaksiya verir, sonda performansına görə qiymətləndirilir.

### ⛔ ƏN VACİB SƏRHƏD
**Bu sistem real ocağı/zavodu İDARƏ ETMİR.**
Məqsəd yalnız insanın işi öyrənməsi və səriştəsinin ölçülməsidir.
Canlı SCADA və ya OT şəbəkəsinə bağlantı **YOXDUR və planlaşdırılmır**.

> Analogiya: uçuş simulyatoru təyyarəni uçurmur — pilotu yetişdirir.

Bu sərhəd təsadüfi deyil, **qərardır**: OT təhlükəsizliyi (Purdue Level 3.5 / iDMZ),
sertifikasiya və hüquqi məsuliyyət olmadan canlı bağlantı məsuliyyətsizlik olardı.

---

## 2. Kontekst

| | |
|---|---|
| Yarışma | TEKNOFEST 2026 Maden Teknolojileri Yarışması |
| Mərhələ | **Finalçı** |
| Final tarixi | **30 sentyabr – 4 oktyabr 2026**, Şanlıurfa |
| Komanda | **EonLedger** (5 nəfər + danışman) |
| Takım ID | 947015 · Başvuru ID: 5221746 |
| Yürütücü | Türk Altın İşletmeleri A.Ş. |

**Yarışmanın 3 teması:** (1) cevher işleme və kaynak yönetimi, (2) otonom və YZ sistemleri,
(3) **iş güvenliği və sürdürülebilirlik** ← RemoteOps buraya oturur.

⚠️ Sunumda üst başlıq **"eğitim platformu" olmamalıdır**. Belə olmalıdır:
**"Maden operasyonel güvenlik ve yetkinlik sistemi (eğitim modülü dahil)"**

⚠️ **Ziddiyyət xəbərdarlığı:** `RemoteOps.pdf` §2-də "gerçek saha verisini doğrudan
kullanabilme" və "operasyonel zeka çözümü" yazılıb. Bu, indiki skopla ziddiyyət təşkil edir.
Finalda açıq deyin: *"Skopu daralttık. Canlı entegrasyon Faz 2'dir; Faz 1 eğitim ve
yetkinlik ölçümüdür."* Bu, zəiflik deyil — **mühəndis yetkinliyi** kimi oxunur.

---

## 3. STATUS — nə edilib, nə ediləcək

### ✅ Edilib
- Ön qiymətləndirmə raporu (`RemoteOps.pdf`) və yarı final sunumu təhvil verilib
- Rəqib + bazar araşdırması tamamlanıb (bax §11, §12)
- Texniki qərarlar dondurulub (bax §4)
- **Faz 0:** `CLAUDE.md`, `contract.md` v1.0, `.gitignore`, `README.md`, qovluq strukturu
- **Faz 1:** `data/sebeke_ocak1.json` (12 düyün, 20 qol, 9 döngü) +
  `engine/network.py` (Hardy-Cross həlledici) + `engine/test_network.py`
  → **26/26 test keçir.** Düyün balansı 9.6e-14, yığılma 14 iterasiya
  → Normal rejim: 117.6 m³/s, fan 1858 Pa / 291 kW, arın sürətləri 5.0–5.3 m/s
  → CH₄ normal: ARIN_1 %0.55, ARIN_2 %0.70, ARIN_3 %0.40

- **Faz 2:** `web/index.html` + `web/app.js` + `web/mock/*.json`
  (`engine/mock_uret.py` ilə üretilir — **uydurma deyil, fizika mühərrikindən çıxır**)
  → Brauzerdə **işlək ekran**: alarm siyahısı + ACK, ISA-18.2 KPI-ları,
    trend qrafiki (hədd xətləri ilə), AI Koç paneli, AAR pəncərəsi
  → Doğrulandı: ARIN 3 rəngsiz (normal), ARIN 1 sarı (P3), ARIN 2 qırmızı (P1)
  → Simulyasiya sürəti: **0.43 ms/tick** (1 Hz büdcəsinin ~0.04%-i)
  ⚠️ Bu fazdakı əl ilə çəkilmiş `web/mimic/ocak1.svg` + `map.json` **Faz 8-də
     əvəz olundu** (avtomatik generasiya). Fayllar arxiv olaraq qalır, işlədilmir.

- **Faz 3+4+5+6:** `server/main.py` (FastAPI + WebSocket, 1 Hz döngü, CSV qeyd),
  `server/senaryo.py` (YAML ssenari motoru + ISA-18.2 balı),
  `server/koc.py` (fizika-qalığı əsaslı XAI koç, 5 qayda),
  `scenarios/S01|S02|S03.yaml`, `server/test_e2e.py`
  → **28/28 uçdan-uca test keçir**
  → Bal ayırd edir: S01 yaxşı **92** / pis **36**; S03 yaxşı **84** / yalnız-ACK **40**
  → Canlı brauzerdə doğrulandı: nasazlıq enjeksiyonu → koç mesajı → operator əmri → AAR **99/100**
- **Faz 7 (qismən):** `engine/dogrulama.py` — **müstəqil Newton-Raphson çözücü**
  Hardy-Cross ilə müqayisə: **4 ssenaridə ən böyük fərq 0.0001%**
  `docs/dogrulama.md` (3 qatlı doğrulama raporu), `engine/mfire_disa_aktar.py`

- **Faz 8 — Çox sxem + Sxem Redaktoru** ⭐
  `web/sema_ciz.js` — şəbəkədən **avtomatik proses diaqramı** generasiyası
  (ISA-5.1 alət balonları AT/FT/PT, fan pərləri, taralı hava qapısı,
  tənzimləyici orifis simvolu, arın bloku, kəsit sahəsinə mütənasib yol
  qalınlığı, sürətə bağlı axın oxu animasiyası)
  `web/editor.html` + `web/editor.js` — istifadəçi öz ocağını çəkir
  `server/main.py` — `/api/semalar`, `/api/sebeke/{id}` GET+POST,
  `/api/sebeke/_dogrula` (**real fizika mühərrikində** həll edir)
  → Doğrulandı: 8 düyün / 11 qol şəbəkə çəkildi → doğrulandı → saxlandı →
    simulyatorda canlı işlədi (fan 145.4 m³/s, CH₄ %0.32)

- **Faz 9 — Kontrol otağı arayüzü + faceplate** ⭐
  `web/sema.css` (iki tema), `web/index.html` (naviqasiya bandı · alan başlığı ·
  alarm bandı · status çubuğu · **faceplate**), `sema_ciz.js` v2
  (ISA-5.1 balonları, MSHA axın oxları, lejant, **yardımcı sistemler bandı**:
  sump + 2 nasos + konveyer)
  → **2 real baq tapıldı və düzəldildi:** native `confirm/prompt` bloklanması
    (bax §9) və brauzer önbelleği (bax §9)
  → Doğrulandı: faceplate-dən P2 nasosu başladıldı (88 A); TENZIM 1 → %30 →
    ARIN 3 debisi 35.7→21.0, ARIN 1 39.9→42.8 m³/s (hava yenidən paylandı)

### 🔄 İndi
- **Faz 7 (qalan):** NIOSH MFIRE müqayisəsi, slaydlar, demo məşqi

### ⬜ Ediləcək
Bax pipeline (§16).

- **Sənəd təmizliyi (14.09):** `CLAUDE.md` §3/§5/§6/§14/§16/§17, `contract.md` v1.1,
  `README.md`, `docs/demo_skripti.md` **koda uyğunlaşdırıldı**.
  Düzəldilən əsas xəta: §6-dakı etiket adları kodla uyuşmurdu
  (`fan.ana_1.status` → `.durum`, `qol.03` → `qol.B03`, `qaz.ch4_arin_3` → `qaz.ch4.ARIN_3`,
  `sump.01` → `sump.S1`). Yeni sessiya onlara görə kod yazsaydı, səhv olardı.

### 📌 Açıq məsələlər
- [x] ~~Ventilyasiya şəbəkəsi~~ → `data/sebeke_ocak1.json` hazırdır
- [ ] Ssenarilərin maden mühəndisi tərəfindən doğrulanması (universitet müəllimi)
- [ ] MFIRE validasiya cədvəli → protokol hazır (`docs/dogrulama.md` §4),
      cədvəl `docs/sebeke_kol_tablosu.csv` — MFIRE-da doldurulmalı
- [ ] 90 saniyəlik demo skripti + 20 dəfə məşq
- [ ] Sunum slaydları (26 sentyabra qədər)
- [ ] `RemoteOps.pdf` mənbə [5] (Sandvik) səhv linkə gedir — düzəldilməli
- [ ] Sunumda "Darcy-Weisbach" → "Atkinson" düzəlişi

---

## 4. Dondurulmuş texniki qərarlar (mübahisə etməyin)

| Mövzu | Qərar | Səbəb |
|---|---|---|
| Backend | Python 3.11+ / FastAPI / WebSocket | — |
| **Şəbəkə həlledicisi** | **Hibrid: Hardy-Cross → yığılmazsa Newton-Raphson** | **14.09-da əlavə olundu.** Bağlı hava qapısı (R=5000) yanında quyu (R=0.003) olanda müqavimət nisbəti ~10⁶ olur; Hardy-Cross belə *sərt* şəbəkələrdə Kirchhoff-1-i ödəyir, Kirchhoff-2-ni ödəmir (ölçüldü: 32.6 Pa qalıq). Sistem bunu aşkarlayıb Newton-Raphson-a keçir (qalıq 3.6e-13 Pa). İşlənən metod `_yontem`-də göstərilir |
| **Sxem** | **Şəbəkədən avtomatik generasiya** (`sema_ciz.js`) | Əl ilə SVG + `map.json` yazmaq tələbi aradan qalxdı. Şirkət öz mimikini vermək istəsə köhnə yol da işləyir |
| Frontend | ~~React + Vite~~ → **build-siz vanilla JS + SVG** | **14.09-da dəyişdi.** Səbəb: demo oflayn işləməlidir; `node_modules` / build xətası riski sıfıra endi. Fayl birbaşa açılır, asılılıq yoxdur. Kod eyni modul quruluşunu saxlayır — istənilsə sonra React-a bükülə bilər |
| Baza | **SQLite** (PostgreSQL YOX) | Bir fayldır, sıfır quraşdırma. Sonra dəyişmək 1 saatlıq iş |
| Hesablama tezliyi | **1 Hz** (saniyədə 1 addım) | Kifayətdir |
| "<30ms" iddiası | **Telemetriya gecikməsi**, fizika addımı deyil | Yanlış anlaşılmasın |
| İnterfeys dili | **Türkçe** | Yarışma türkcədir |
| Fiziki PLC | **ALINMIR.** Lazım olsa OpenPLC (soft-PLC) | Tədarük + debug riski |
| AI | Deterministik nüvə + LLM yalnız "danışan qat" | Oflayn işləməlidir |

---

## 5. Arxitektura

```
[ MÜHƏRRİK ]  →  [ SERVER ]  →  [ EKRAN ]
  fizika          FastAPI +      vanilla JS + SVG
  hesablayır      WebSocket      (sxem avtomatik üretilir)
  (engine/)       (server/)      (web/)
                      |
                      v
                  [ QEYD ] -> CSV -> təkrar oynatma (replay)
                  data/kayitlar/*.csv
```

**Qızıl qayda:** Mühərrik ekranı bilmir. Ekran fizikanı bilmir.
Aralarında yalnız `contract.md`-dəki JSON var.

### Repo strukturu
```
RemoteOps/
├── CLAUDE.md              <- bu fayl (tək həqiqət mənbəyi)
├── contract.md            <- mesaj müqaviləsi (ƏN VACİB)
├── README.md · basla.bat  <- işə salma
│
├── engine/                                            [Üzv 1]
│   ├── network.py          Hardy-Cross + Newton-Raphson hibrid həlledici
│   ├── sim.py              qaz + su + konveyer + alarm + tick
│   ├── test_network.py     26 fizika yoxlaması
│   ├── dogrulama.py        MÜSTƏQİL çözücü çarpaz yoxlaması
│   ├── mock_uret.py        frontend üçün mock data üretir
│   └── mfire_disa_aktar.py MFIRE müqayisə cədvəli
│
├── server/                                            [Üzv 2]
│   ├── main.py             FastAPI + WebSocket + API + no-cache
│   ├── senaryo.py          YAML ssenari motoru + ISA-18.2 balı
│   ├── koc.py              fizika-qalığı əsaslı XAI koç (5 qayda)
│   └── test_e2e.py         28 uçdan-uca yoxlama
│
├── web/                                               [Üzv 3 + 4]
│   ├── index.html          simulyator ekranı + faceplate
│   ├── app.js              telemetriya · render · faceplate · AAR
│   ├── sema_ciz.js         OTOMATİK proses sxemi üreteci
│   ├── sema.css            iki tema (koyu / acik)
│   ├── editor.html/js      sxem redaktoru
│   ├── mock/               mock data (fizikadan üretilir)
│   └── mimic/              ⚠️ ARXİV — Faz 2-nin əl ilə SVG-si, işlədilmir
│
├── scenarios/  S01.yaml · S02.yaml · S03.yaml         [Üzv 5]
├── data/       sebeke_ocak1.json · sebeke_ocak2.json · kayitlar/*.csv
└── docs/       dogrulama.md · demo_skripti.md · sebeke_kol_tablosu.csv  [Üzv 5]
```

**Sərt qayda:** heç kim başqasının qovluğunda fayl dəyişmir.
Dəyişiklik lazımdırsa — deyir, sahibi edir.

---

## 6. Mesaj müqaviləsi (contract)

Backend ilə frontend arasındakı **yeganə** razılaşma. Tam detal: `contract.md`.

⚠️ **Etiket adları koddan çıxarılıb, uydurma deyil.** Dəyişdirmək istəyirsinizsə
əvvəlcə `contract.md`-ni dəyişin, sonra hər iki tərəfi.

```json
{
  "tip": "tick",
  "t": 145,
  "deyerler": {
    "fan.ana_1.debi": 117.6,
    "fan.ana_1.basinc": 1858,
    "fan.ana_1.durum": "isliyir",
    "qol.B05.debi": 39.85,
    "qol.B05.yon": 1,
    "arin.ARIN_2.debi": 37.6,
    "arin.ARIN_2.hiz": 5.01,
    "qaz.ch4.ARIN_2": 0.70,
    "qapi.QAPI_1.durum": "bagli",
    "tenzim.T1.acilim": 100,
    "sump.S1.seviyye": 50.0,
    "nasos.P1.durum": "isliyir",
    "konveyer.K1.akim": 159.8
  },
  "alarmlar": [
    { "id": "A017", "etiket": "qaz.ch4.ARIN_2", "prioritet": 1,
      "mesaj": "CH4 KRITIK - ARIN 2 (>%2.0)", "vaxt": 142,
      "tesdiqlendi": false, "aktiv": true }
  ]
}
```

### Etiket qrupları (cəmi 91 etiket)
| Qrup | Say | Format | Nümunə |
|---|---|---|---|
| `fan` | 5 | `fan.<id>.<olcu>` | `fan.ana_1.debi` · `.basinc` · `.guc` · `.rpm` · `.durum` |
| `qol` | 60 | `qol.<kolId>.<olcu>` | `qol.B05.debi` · `.hiz` · **`.yon`** (±1, ox istiqaməti) |
| `arin` | 6 | `arin.<ARIN_n>.<olcu>` | `arin.ARIN_2.debi` · `.hiz` |
| `qaz` | 9 | `qaz.<gaz>.<ARIN_n>` | `qaz.ch4.ARIN_2` (**tavan sensoru**) · `qaz.ch4_ort.*` (ortalama) · `qaz.o2.*` |
| `qapi` | 2 | `qapi.<id>.durum` | `acik` \| `bagli` |
| `tenzim` | 1 | `tenzim.<id>.acilim` | 0–100 % |
| `sump` | 1 | `sump.S1.seviyye` | 0–100 % |
| `nasos` | 4 | `nasos.<id>.<olcu>` | `.durum` · `.akim` |
| `konveyer` | 3 | `konveyer.K1.<olcu>` | `.akim` · `.yuk` · `.durum` |

**Durum dəyərləri:** `isliyir` · `dayandi` · `ariza` · `acik` · `bagli`

### Mesaj tipləri
| İstiqamət | Tip | Nə vaxt |
|---|---|---|
| Server → Klient | `init` | bağlantı açılanda bir dəfə (etiket meta-datası + eşiklər) |
| | `tick` | hər saniyə (dəyərlər + alarm siyahısı) |
| | `kocluk` | AI Koç bir sapma aşkarlayanda |
| | `bitti` | ssenari sonu (bal + olay xətti + optimal xətt) |
| | `onay` / `xeta` | əmr cavabı |
| Klient → Server | `emr` | `{hedef, emr, deyer?}` |
| | `ack` | `{alarm_id}` (`"*"` = hamısı) |
| | `senaryo` | `{emr: basla\|durdur\|sifirla, id?}` |

### HTTP API
| Yol | Nə |
|---|---|
| `GET /` | simulyator ekranı |
| `GET /api/senaryolar` | ssenari siyahısı |
| `GET /api/semalar` | mövcud şəbəkələr |
| `GET /api/sebeke/{id}` | şəbəkə tərifi (**arayüz sxemi bundan üretir**) |
| `POST /api/sebeke/_dogrula` | **real fizika mühərrikində həll et** (redaktor üçün) |
| `POST /api/sebeke/{id}` | şəbəkəni saxla |
| `WS /ws?sema={id}` | telemetriya. ⚠️ `sema` parametri **məcburidir** — ekrandakı sxem və simulyasiya eyni şəbəkə olmalıdır |

---

## 7. Fizika

| Sistem | Metod |
|---|---|
| Ventilyasiya | **Atkinson kvadrat qanunu: ΔP = R·Q²** + **Hardy-Cross** iterasiyası |
| Qaz (CH₄) | Qol boyu **advection + diffusion + buoyancy** (tavan təbəqələşməsi) |
| Su atma | Sadə tank/səviyyə diferensial tənliyi |
| Konveyer | Yük, mühərrik cərəyanı, tıxanma |

### ⚠️ Terminologiya (jüridə maden mühəndisi olacaq)
- ❌ **Darcy-Weisbach** yazmayın → ✅ **Atkinson tənliyi** (mədəndə etalon budur)
- ❌ Təkcə **Fick difuziyası** yazmayın → ✅ **advection–diffusion + buoyancy**
  (metan havadan yüngüldür, tavanda təbəqələşir — Amasra-da baş verən budur)

### Validasiya
**NIOSH MFIRE** (pulsuz, açıq qaynaq, NIOSH real yanğın testləri ilə doğrulanıb)
ilə eyni şəbəkə həll edilib **qol-qol müqayisə** olunur. Hədəf: **<5% fərq**.

---

## 8. Ssenarilər və qiymətləndirmə

### 3 əsas ssenari
1. **Hava qapısı qismən bağlı qalır** → arına hava düşür → CH₄ qalxır *(sadə, öyrədici)*
2. **Ana fan dayanır** → şəbəkə çökür → təxliyə ardıcıllığı *(dramatik, demo üçün)*
3. **"Normallaşmış sapma"** → CH₄ saatlarla 1.5–2% arasında gəzir, alarm təkrar çalır,
   istifadəçi ACK edib davam edir → sistem ölçür: **nə vaxt dayanmağa qərar verdi?**
   *(ən orijinal — Amasra bilirkişi raporuna əsaslanır)*

### Qiymətləndirmə metrikləri (ISA-18.2 / EEMUA 191)
| Metrik | Hədəf / tərif |
|---|---|
| Operator başına saatda alarm | < 6 |
| Alarm flood | 10 dəqiqədə > 10 alarm |
| ACK gecikməsi | ölçülür |
| Düzgün müdaxilə ardıcıllığı | ölçülür |
| Stabilləşdirmə müddəti | ölçülür |

**AAR (debrief) ekranı:** istifadəçinin xətti vs optimal xətt + hər sapmaya fiziki səbəb.

---

## 9. İnterfeys — real kontrol otağı ekranı

Arayüz **araşdırma əsasında** quruldu, təxminlə deyil.

### Dayanaqlar

| Mənbə | Nəticə |
|---|---|
| **MSHA 30 CFR 75.372** (maden ventilyasiya xəritəsi) | Xəritədə **məcburi**: havalandırma nəzarətləri (qapı, regulator, baraj/stopping, overcast, seal), **axın istiqaməti oxları**, debi miqdarları, fanlar, ölçmə nöqtələri və **LEJANT** |
| Mədən xəritə ənənəsi | Təmiz hava və dönüş havası **ayrı rəngdə** göstərilir (ənənəvi: təmiz=yaşıl, dönüş=qırmızı) |
| **ANSI/ISA-101**, NUREG-0700, ISO 11064 | Sabit **naviqasiya bandı**, **alan başlığı**, **həmişə görünən alarm bandı**, **status çubuğu**; ISA/ISO standart simvolları; 7:1 kontrast |
| **ANSI/ISA-18.2** | Doymuş qırmızı/narıncı/sarı/macenta **yalnız alarm** üçün |
| Ignition Symbol Factory | Sənaye HMI-larında ~4000 SVG simvol — istinad nöqtəsi |

### ⚠️ Həll olunan ziddiyyət
Mədən ənənəsi dönüş havasına **qırmızı** deyir; ISA-18.2 qırmızını **P1 alarma** ayırır.
**Həll:** hava xidməti **solğun (desature)** tonlarla — təmiz #3E8E7E (teal),
dönüş #A07A46 (oker), arın #7E6FA8 (bənövşəyi). Doymuş alarm rəngləri heç bir
normal vəziyyətdə işlənmir. **Lejant bunu açıq yazır.**

### Ekran anatomiyası
```
┌ üst şerit ── marka · şema seçici · tema · editör · sıfırla ────────┐
├ navigasyon bandı ── Genel│Havalandırma│Gaz│Su│Taşıma│Tanı ─────────┤
├ alan başlığı ── "ÖRNEK YERALTI OCAK-1"  ·  senaryo  ·  süre ───────┤
│ PROSES ŞEMASI                          │ ALARM LİSTESİ            │
│  (otomatik üretilen mimik)             │ YZ KOÇ                   │
│                                        │ TREND                    │
├ ALARM BANDI ── her zaman görünür, en yüksek öncelikli alarm ───────┤
├ durum çubuğu ── kullanıcı · bağlantı · ISA-18.2 KPI · saat ────────┤
```

### İki tema
- `tema-koyu` — **varsayılan**. Klasik kontrol otağı (karanlık oda, projeksiyon)
- `tema-acik` — ANSI/ISA-101 High Performance HMI (aydınlık oda)
- Tema düyməsi ilə keçilir, `localStorage`-də saxlanılır

### ⛔ Native dialog İŞLƏTMƏYİN (tapılmış real baq)

`confirm()` / `prompt()` / `alert()` **gömülü brauzerlərdə bloklanır** —
dialoq görünmədən `false` / `null` qaytarır. Nəticə: operator klikləyir,
**heç nə olmur**, səbəbi də görünmür.

Onsuz da **real SCADA native dialoq işlətmir** — *faceplate* açır.

**Həll:** `#fp` faceplate paneli (`web/index.html` + `app.js` → `fpAc/fpYenile`):
avadanlığın yanında açılır, etiket + durum + canlı ölçmələr + əmr düyməsi
+ **nəticə xəbərdarlığı** göstərir (məs. *"Hava qapısı açılırsa hava arınlara
uğramadan qısa devre yapar"*). Tənzimləyici üçün sürüşdürücü.
`Esc` və ya kənara klik bağlayır.

Redaktorda da eyni: `alert/confirm` yerinə doğrulama panelində bildiriş.

### ⛔ Önbellek (tapılmış real baq)
Brauzer köhnə `js/css`-i keşdən oxuyurdu, dəyişikliklər görünmürdü.
`server/main.py`-də `onbellek_kapali` middleware ilə statik fayllara
`Cache-Control: no-store`. **Dəyişiklik görünmürsə əvvəlcə bunu yoxlayın.**

### Çizim elementləri (`web/sema_ciz.js`)
| Element | Necə çəkilir |
|---|---|
| Galeri | İki qatlı kanal; qalınlıq **kəsit sahəsinə mütənasib**; xidmət rəngi |
| Axın oxu | Dolu üçbucaq (MSHA məcburi); `qol.*.yon` mənfi olanda **180° çevrilir** |
| Ana fan | Gövdə + flanş + 6 pərli çarx + motor; işləyəndə **pərlər fırlanır** |
| Hava qapısı | Yola dik çərçivə + menteşəli yarpaq; açıq olanda **62° dönür** |
| Tənzimləyici | Ayarlanabilir orifis (qarşılıqlı üçbucaq) |
| Arın | Taralı istehsal bloku |
| Kuyu ağzı | Headframe üçbucağı |
| Ölçmə | **ISA-5.1 balonu** (AT/FT/PT/HC + nömrə) + dəyər qutusu + vahid + etiket |
| Lejant | Sağ-üst, MSHA tələbi |
| **Yardımcı sistemler bandı** | Şemanın altında ayrı şerit: **SUMP** (səviyyə dolğulu tank + LT balonu), **P1/P2 santrifüj pompalar** (salyangoz gövdə + motor + kaide), **KONVEYÖR** (tambur + eğik bant + tahrik + IT balonu). Hamısı tıklanabilir. Gerçek kontrol odası ekranında **bütün ekipman şemanın üzerindedir** |

⚠️ Bu xüsusiyyəti **"mimic" adlandırmayın** — Emerson-un məhsul adıdır.
"Şema Editörü" / "Şema Üreteci" deyin.

### Hər şirkət üçün fərqli interfeys — İKİ YOL

**Yol A — Şema Editörü** *(yeni istifadəçi, demo)*
`web/editor.html` → düyün qoy, qol çək, tip seç → **Doğrula** (real fizika
mühərriki) → **Kaydet**. SVG **avtomatik** yaranır; nə SVG çəkilir, nə JSON yazılır.
Müqavimət Atkinson düsturu ilə hesablanır: `R = k·Per·L/A³`.

**Yol B — Şirkətin öz mimiki** *(real müştəri)*
Öz SVG-si + bağlantı faylı. `app.js` hər iki sahə adını qəbul edir
(`baglanti` və ya `etiket`).

➡️ Hər iki halda **mühərrik dəyişmir**.

---

## 10. Data haradan gəlir

| Səviyyə | Mənbə | Status |
|---|---|---|
| 0 | **Sintetik** — mühərrikin özü istehsal edir | 🟢 Əsas mənbə, icazə lazım deyil |
| 1 | NIOSH MFIRE nümunə şəbəkələri, McPherson dərsliyi | 🟢 Pulsuz |
| 2 | Rəsmi bilirkişi raporları (Amasra 2022 və s.) → **ssenari strukturu** | 🟢 Pulsuz |
| 2 | Maden İSG Yönetmeliği → **həddlər və "düzgün cavab"** | 🟢 Pulsuz |
| 3 | Universitet: maden mühəndisliyi müəllimi ilə 1 saat | 🟡 1 həftə |
| 4 | Şirkətdən **CSV ixracı** (anonim, oflayn) | 🟠 1–2 ay |
| 5 | Canlı OPC UA | 🔴 **İndi unudun** |

**Vacib:** şirkət datası gözləmirik. Lazım olan 3 şey — şəbəkə planı + yönetmelik həddləri +
rəsmi raporlar — pulsuzdur və 3 günə tapılır.

**Dizayn qərarı:** simulyasiya və real CSV data **eyni replay borusundan** keçir →
real data gələndə kod dəyişmir. Bunu jüriyə deyin, ciddi mühəndislik qərarıdır.

---

## 11. Rəqib mövqeyi

| Kateqoriya | Kim | Qiymətləndirmə |
|---|---|---|
| Mobil maşın simulyatorları | Immersive Technologies (Komatsu, 2019), ThoroughTec (Cat), 5DT, Tecknotrove, VISTA | Yalnız kamyon/delici operatoru. **Bizim sahə deyil** |
| Proses OTS | Emerson **DeltaV Mimic** (1200+ sayt, 68 ölkə), Yokogawa OmegaLand / Mirror Plant, Siemens SIMIT, ANDRITZ IDEAS, **ABB 800xA Simulator**, Metso Geminex | **Əsl rəqib.** Amma tipik layihə **~$700k–$1M, ~1 il** — məhsul deyil, layihədir |
| Ventilyasiya mühəndisliyi | Ventsim (Howden/Chart), **NIOSH MFIRE (pulsuz)** | Dizayn aləti, operator təlimi yoxdur. MFIRE bizim **validasiya etalonumuzdur** |
| Pulsuz DIY | **Ignition Maker (pulsuz)**, FUXA, Rapid SCADA, OpenPLC, Factory I/O | Mədən ssenarisi və qiymətləndirmə yoxdur |
| AI copilot | Honeywell Intelligent Assistant (2/2025), AVEVA AI Assistant | Canlı zavod üçün, təlim döngəsi yoxdur |
| Akademiya | Nature Sci Rep (12/2025): DT + LSTM-Attention, MAPE 2.87%, 27% enerji azalması | **AI proqnoz yarışına girməyin.** Onların açıq boşluğu: *"limited interpretability"*, gələcək iş: *physics-informed NN* ← **bizim açılışımız budur** |
| Türkiyə | TTK Akademi (4 mərtəbəli süni təlim ocağı var), Simsoft, HAVELSAN, Enocta/Eduves | TTK **rəqib deyil — pilot tərəfdaşdır** |

### Bizim real fərqimiz (yalnız bunları danışın)
1. **Alıcı boşluğu:** mədəndə sabit tesis / idarəetmə otağı operatoru, **məhsul formatında**
2. **Qiymət arxitekturası:** $1M / 1 illik OTS layihəsi 155.000 işçinin illik 16 saatlıq
   məcburi təlimi üçün nəzərdə tutulmayıb
3. **Physics-informed + izah edilə bilən AI** — state-of-art-ın öz etiraf etdiyi boşluq
4. **ISA-18.2 alarm səriştə skorlaması** — standart var, təlim var, **simulyator yoxdur**
5. **MYK + İSG uyğun, auditə hazır səriştə qeydi** (komanda adı: EonLedger — uyğun gəlir)
6. **Türkiyəyə xas hadisə kitabxanası** — rəsmi raporlardan. Xarici rəqib edə bilməz

### ⛔ BUNLARI İDDİA ETMƏ (yoxlanılıb, yanlışdır)
- "AI anomali təsbiti bizdə ilkdir" → Honeywell + AVEVA-da var
- "Real saha verisi qeydi yalnız bizdədir" → Emerson Mimic, Yokogawa Mirror Plant var
- "Rəqiblər yüz minlərlə dollardır" → mənbəsiz. Doğru rəqəm: **tipik OTS ~$1M**
- "Universitetlərə ucuz SCADA gətiririk" → **Ignition Maker Edition pulsuzdur**
- **"Dijital ikiz"** → ikiz konkret fiziki obyektə bağlıdır. Bu, **təlim simulyatorudur**
- "Qəzaları X% azaldır" → hələ datamız yoxdur
- "ABB 800xA uyumlu / sertifikalı" → hüquqi risk

**Qayda:** "ən yaxşı / ilk / yeganə / tam" sözlərini sil → **rəqəm + ölçmə metodu** qoy.

---

## 12. Bazar faktları (sunum üçün)

| Fakt | Rəqəm |
|---|---|
| Türkiyədə madencilik birbaşa istihdam | **~155.000** |
| Maden ruhsatı (2024 sonu) | 14.276 (9.873 işletme, 7.652 işletme izinli) |
| Çox təhlükəli sinif İSG təlimi | **İldə ən az 16 saat, HƏR İL** (məcburi) |
| MYK Mesleki Yeterlilik Belgesi | Madencilikdə **8 meslekdə məcburi** (9.04.2021, RG 31449) |
| Maden mühəndisliyi illik kontenjan | **~316–381** ⚠️ universitet kanalı kiçikdir |
| Tipik OTS layihəsi | **~$1M, ~1 il** (FCC vahidi ~$700k) |
| OTS bazarı (2025) | ~$14.1 mlrd, CAGR ~6.7% |
| Ventilyasiya = mədən enerjisinin | **40–50%**; VOD ilə 27–50% qənaət |
| ISA-18.2 alarm həddi | operator/saat **< 6**; flood = 10 dəq-də >10 |

➡️ **TAM = 155.000 işçi × 16 saat/il**, universitet deyil.

### Amasra 2022 bilirkişi raporu (problem ifadəmizin əsası)
- *"Yetersiz ve etkisiz havalandırma sistemi, olayın oluşmasında en temel faktördür."*
- Mərkəzi qaz izləmə sistemi verilərinə görə metan **mükərrər və israrlı şəkildə
  %1.5 və %2-nin üzərində** qalmış, zaman-zaman alt patlama həddini aşmışdır
- Metan drenajı TTK ocaqlarında **tətbiq edilmirdi**
- Denetimlərdə tövsiyələr verilmiş, **yaptırım tətbiq olunmamışdır**
- Teknik personel yetersizliği qeyd edilib; TTK **%100 kusurlu** bulunub

➡️ **Nəticə:** sensor var idi, veri var idi, alarm var idi — **insan qərar zənciri işləmədi.**
Problem ifadəmiz budur, "nitelikli operatör eksikliği" deyil.
*(Faciəni istismar etməyin, rəqəm verməyin — yalnız raporun texniki bulgusuna istinad edin.)*

---

## 13. AI Koç — necə qurulur

1. **Nüvə deterministikdir.** İzah fiziki qalıqdan çıxır:
   `ölçülən dəyər − (ΔP=R·Q² -nin gözlədiyi dəyər)`
   Nümunə çıxış: *"3. kolda direnç 2.4x arttı → hava kapısı kısmen kapalı →
   7. ayağa hava %38 düştü → CH4 yükseliyor."*
   Bu, **şablonla** yazılır, model tələb etmir.
2. **LLM yalnız "danışan qat"** — bu faktı axıcı türkcə cümləyə çevirir.
3. **Oflayn fallback məcburidir** — model cavab verməsə şablon mətn göstərilir.
4. LSTM / dərin öyrənmə **əsas iddia deyil**, ikinci dərəcəlidir.

---

## 14. Komanda rolları

| # | Rol | Qovluq |
|---|---|---|
| 1 | Fizika mühərriki (Hardy-Cross, qaz, su) | `engine/` |
| 2 | Backend + WS + ssenari motoru + replay | `server/` |
| 3 | Frontend A: sxem üreteci + redaktor | `web/sema_ciz.js`, `web/sema.css`, `web/editor.*` |
| 4 | Frontend B: telemetriya, alarm, faceplate, AAR | `web/app.js`, `web/index.html` |
| 5 | Ssenari + skorlama + validasiya + slaydlar | `scenarios/`, `docs/` |

**Hər axşam 15 dəqiqəlik status:** hər kəs 2 cümlə — nə bitdi, nə mane olur.

---

## 15. Demo günü qaydaları (pozmayın)

- ✅ **Hər şey OFLAYN işləməlidir** — Şanlıurfa-da internet olmaya bilər.
  AI Koç şablon rejimi **default** olsun, LLM opsional
- ✅ **"Reset" düyməsi** — 3 saniyəyə başlanğıc vəziyyətə dönsün
- ✅ **İşləməyən düymə qoymayın** — silin. Jüri təsadüfi klikləyəcək
- ✅ **90 saniyəlik demo skripti** yazılsın və 20 dəfə məşq edilsin
- ✅ **Video yedəyi** noutbukda saxlanılsın (sunum faylına link qoymaq qadağandır)
- 🛑 **26 sentyabr = feature freeze.** Son 4 gün yalnız test + məşq + slayd

---

## 16. Pipeline — 8 faz

| Faz | Nə | Çıxış | Vaxt |
|---|---|---|---|
| **0** | Təməl: repo, `contract.md`, rollar, alətlər | Hamı paralel işləyə bilir | 1 gün |
| **1** | Ventilyasiya şəbəkəsi + Hardy-Cross həlli | Konsolda şəbəkə həll olunur | 2 gün |
| **2** | SVG sxem + JSON map + mock data ilə canlı ekran | Ekran işləyir (fizika olmadan) | 2 gün |
| **3** | Server + WebSocket + qaz/su/konveyer modelləri | Real telemetriya axır | 2 gün |
| **4** | **BİRLƏŞMƏ** — mock söndürülür, mühərrik qoşulur | Uçdan-uca işləyən sistem | 1 gün |
| **5** | Ssenari motoru (YAML) + 3 ssenari | Nasazlıq enjeksiyonu işləyir | 2 gün |
| **6** | Skorlama (ISA-18.2) + AAR ekranı + AI Koç | Bal verilir, izah olunur | 2 gün |
| **7** | MFIRE validasiyası + slaydlar + demo məşqi | Final paketi | 4 gün |
| **8** | Çox sxem + sxem redaktoru | İstifadəçi öz ocağını çəkir | — |
| **9** | Kontrol otağı arayüzü + faceplate | Real SCADA görünüşü | — |

**Vəziyyət (14 sentyabr):**

| Faz | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔄 | ✅ | ✅ |

Faz 8 və 9 planda yox idi — istifadəçi tələbi ilə əlavə olundu və bitdi.
**Qalan yeganə iş Faz 7-dir.** Feature freeze: **26 sentyabr**.

---

## 17. Necə işə salınır

**Ən asan:** `basla.bat`-a iki dəfə klik — server qalxır, brauzer özü açılır.

**Terminaldan:**
```bash
pip install fastapi "uvicorn[standard]" pyyaml
python -m uvicorn server.main:app --port 8000
```
| Ünvan | Nə |
|---|---|
| http://localhost:8000/ | simulyator |
| http://localhost:8000/editor.html | sxem redaktoru |
| `?sema=ocak2` | fərqli şəbəkə aç |

**Yalnız arayüz** (backend olmadan, mock data ilə):
```bash
python -m http.server 5500 --directory web
```

**Testlər:**
```bash
python engine/test_network.py    # fizika — 26 yoxlama
python engine/dogrulama.py       # müstəqil çözücü çarpaz yoxlaması
python server/test_e2e.py        # uçdan-uca — 28 yoxlama
python engine/mock_uret.py       # mock datanı yenidən üret
```

### ⚠️ Tipik problemlər
| Əlamət | Səbəb | Həll |
|---|---|---|
| Boş səhifə | `index.html`-i birbaşa açmısınız — `fetch()` CORS-a görə işləmir | Mütləq server ilə açın |
| Dəyişiklik görünmür | Brauzer önbelleği | `server/main.py`-də no-cache var; yoxdursa **Ctrl+F5** |
| Klikləyirəm, heç nə olmur | Köhnə `confirm()` kodu | Faceplate açılmalıdır (bax §9) |
| Port məşğuldur | Əvvəlki server hələ işləyir | `netstat -ano \| findstr :8000` → `taskkill /F /PID <pid>` |
| Ekran və data uyuşmur | `?sema=` ilə `ws?sema=` fərqlidir | Sxem seçicisindən dəyişin, bağlantı özü yenilənir |

---

## 18. Bu faylı necə yeniləmək

Hər faz bitəndə:
1. §3 STATUS bölməsini yenilə (edilib / indi / ediləcək)
2. Yeni qərar verilibsə §4-ə əlavə et
3. Açıq məsələ bağlanıbsa §3-dəki checkbox-u işarələ
4. "Son yenilənmə" tarixini dəyiş

### ⚠️ Sənəd ≠ kod olmasın
Bu faylda yazılan hər texniki detal koddan yoxlanmalıdır. Bir dəfə
**etiket adları sənəddə səhv qalmışdı** — yeni sessiya onlara görə kod yazsaydı
sükutla sınacaqdı. Şübhələnəndə koddan çıxarın:

```bash
# gerçək etiket siyahısı
python -c "import sys;sys.path.insert(0,'engine');from sim import Simulasyon;print(sorted(Simulasyon.olustur().deyerler()))"
# gerçək API endpointləri
grep -oE '@app\.(get|post|websocket)\("[^"]*"' server/main.py
# hər şey hələ yaşıldır?
python engine/test_network.py && python engine/dogrulama.py && python server/test_e2e.py
```

### Sənəd xəritəsi
| Fayl | Nə üçün | Kim oxuyur |
|---|---|---|
| `CLAUDE.md` | **Tək həqiqət mənbəyi** — kontekst, qərarlar, status | Hər kəs, ilk növbədə |
| `contract.md` | Mesaj müqaviləsi + API | Backend ↔ frontend |
| `README.md` | İşə salma + testlər | Yeni gələn |
| `docs/dogrulama.md` | Fizikanın 3 qatlı sübutu | Jüri sualı gələndə |
| `docs/demo_skripti.md` | 90 saniyəlik demo + jüri cavab kartı | Şanlıurfa-da masada |
| `web/mimic/OKUBENI.md` | ⚠️ arxiv xəbərdarlığı | Səhvən ora baxan |

**Yeni sessiya başlayanda:** əvvəlcə bu faylı oxu → sonra `contract.md` → sonra işə başla.
