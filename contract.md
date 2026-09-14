# contract.md — Mesaj Müqaviləsi

> Backend (`server/`) ilə frontend (`web/`) arasındakı **yeganə** razılaşma.
> Bu faylı dəyişmək = hər iki tərəfi dəyişmək. Dəyişiklik komandaya elan edilməlidir.
>
> **Versiya:** 1.2 · **Tarix:** 2026-09-14
>
> v1.2: cevher hattı + su atma prosesi (`motor` `interlock` `bunker` `tank`
> `vana` `bant` `vsd` `css` `basma` `uretim` qrupları) · `ws?mod=` təlim rejimi ·
> `init.gorevler` · `tick.engel` · `motor.*.ariza` (dayandı ≠ arıza).
>
> v1.1 dəyişikliyi: `qol.*.yon`, `arin.*`, `qaz.ch4_ort.*`, `qaz.o2.*`,
> `fan.*.guc` etiketləri; `ws?sema=` parametri; HTTP API bölməsi;
> `skor.dagilim`; ⛔ native dialog qadağası.

---

## 1. Bağlantı

```
ws://localhost:8000/ws?sema=ocak1&mod=guided&senaryo=S01
```

| Parametr | Dəyər | Qeyd |
|---|---|---|
| `sema` | `ocak1` · `ocak2` · … | şəbəkə tərifi |
| `mod` | `guided` \| `hints` \| `independent` \| `exam` | təlim rejimi |
| `senaryo` | `S01`…`S05` | başlanğıc ssenarisi |

⚠️ **`exam` rejimində server `init.gorevler`-i BOŞ göndərir** — yol göstərmə
istemciyə heç çatmır. Digər rejimlərdə addımlar və ipuçları gəlir.

⚠️ **`sema` parametri məcburidir.** Ekranda göstərilən sxem ilə simulyasiya edilən
şəbəkə **eyni olmalıdır**. Verilməzsə `ocak1` işlədilir. Sxem dəyişəndə arayüz
bağlantını bağlayıb yenidən açır.

Bağlanan kimi server **bir dəfə** `init` mesajı göndərir, sonra hər saniyə `tick` göndərir.

### HTTP API
| Yol | Nə qaytarır |
|---|---|
| `GET /api/senaryolar` | `[{id, ad, sure_sn}]` |
| `GET /api/semalar` | `[{id, ad, dugum, kol}]` |
| `GET /api/sebeke/{id}` | şəbəkə tərifi — **arayüz sxemi bundan üretir** |
| `POST /api/sebeke/_dogrula` | şəbəkəni **real fizika mühərrikində** həll edir → `{ok, yontem, iterasyon, denge, kirchhoff2, fan_debi, fan_basinc, fan_guc, uyarilar[], kollar[]}` |
| `POST /api/sebeke/{id}` | şəbəkəni saxlayır → `{ok, id}` |

Statik fayllar `Cache-Control: no-store` ilə verilir — geliştirmə zamanı
brauzer köhnə `js/css` oxumasın deyə.

---

## 2. Etiket adlandırma qaydası (tag naming)

```
<sistem>.<obyekt>.<olcu>
```

| Sistem | Nümunə etiket | Vahid |
|---|---|---|
| `fan` | `fan.ana_1.rpm` | dev/dəq |
| | `fan.ana_1.debi` | m³/s |
| | `fan.ana_1.basinc` | Pa |
| | `fan.ana_1.guc` | kW |
| | `fan.ana_1.durum` | `isliyir` \| `dayandi` \| `ariza` |
| `qol` | `qol.B05.debi` | m³/s (mütləq dəyər) |
| | `qol.B05.hiz` | m/s |
| | `qol.B05.yon` | **+1 / −1** — axın istiqaməti (ox simvolu bunu işlədir) |
| `arin` | `arin.ARIN_2.debi` | m³/s |
| | `arin.ARIN_2.hiz` | m/s |
| **`motor`** | `motor.CR01.durum` | `isliyir` \| `dayandi` \| `ariza` |
| | `motor.CR01.akim` | A |
| | `motor.CR01.yuk` | % (nominala görə) |
| | `motor.CR01.ariza` | **1/0** — alarmlar buna baxır |
| | `motor.CR01.trip` | arıza səbəbi (mətn) |
| | `motor.CR01.calisiyor` | 1/0 |
| **`interlock`** | `interlock.CR01.izin` | 1/0 — indi başladıla bilər? |
| | `interlock.CR01.sebep` | izin yoxsa səbəb (mətn) |
| **`bunker`** | `bunker.BN01.seviyye` · `.ton` | % · t |
| **`tank`** | `tank.TK01.seviyye` | % |
| **`vana`** | `vana.HV01.acilim` · `.durum` | % · `acik`\|`bagli`\|`hereket` |
| **`bant`** | `bant.CV01.yuk` | t/h |
| **`vsd`** | `vsd.FE01.hiz` | % |
| **`css`** | `css.CR01.acilim` | mm |
| **`basma`** | `basma.debi` · `.basinc` | L/s · bar |
| **`uretim`** | `uretim.vardiya.ton` | t |
| `qapi` | `qapi.QAPI_1.durum` | `acik` \| `bagli` |
| `tenzim` | `tenzim.T1.acilim` | % (0–100) |
| `qaz` | `qaz.ch4.ARIN_1` | % — **tavan sensoru** (təbəqələşmə daxil) |
| | `qaz.ch4_ort.ARIN_1` | % — qol ortalaması (referans) |
| | `qaz.o2.ARIN_1` | % |
| `sump` | `sump.S1.seviyye` | % (0–100) |
| `nasos` | `nasos.P1.durum` | `isliyir` \| `dayandi` \| `ariza` |
| | `nasos.P1.akim` | A |
| `konveyer` | `konveyer.K1.yuk` | % |
| | `konveyer.K1.akim` | A |
| | `konveyer.K1.durum` | `isliyir` \| `dayandi` \| `ariza` |

**Qaydalar:**
- Yalnız `a-z`, `0-9`, `_`, `.` — böyük hərf yalnız obyekt adında (`ARIN_1`, `QAPI_1`)
- Etiket adı **heç vaxt dəyişmir**. Yeni ölçü lazımdırsa yeni etiket əlavə olunur
- Cari şəbəkədə cəmi **91 etiket** var. Siyahını almaq üçün:
  `python -c "import sys;sys.path.insert(0,'engine');from sim import Simulasyon;print(sorted(Simulasyon.olustur().deyerler()))"`

---

## 3. Server → Client

### 3.1 `init` — bağlantı açılanda bir dəfə

```json
{
  "tip": "init",
  "sema": "ocak1",
  "senaryo": { "id": "S01", "ad": "Hava kapısı kısmen kapalı", "sure_sn": 600 },
  "etiketler": {
    "qaz.ch4.ARIN_1": { "vahid": "%", "min": 0, "max": 5,
                        "normal": [0, 1.0], "p2": 1.5, "p1": 2.0 },
    "qol.B05.debi":   { "vahid": "m3/s", "min": 0, "max": 60,
                        "normal": [25, 45], "p2": 20, "p1": 15 }
  }
}
```

`normal` = ISA-101 analoq göstərici zolağındakı normal iş aralığı.
`p1` / `p2` = alarm həddləri (P1 kritik, P2 yüksək).

### 3.2 `tick` — hər saniyə

```json
{
  "tip": "tick",
  "t": 145,
  "deyerler": {
    "fan.ana_1.rpm": 980,
    "fan.ana_1.durum": "isliyir",
    "qol.B05.debi": 12.4,
    "qaz.ch4.ARIN_1": 1.62,
    "sump.S1.seviyye": 68
  },
  "alarmlar": [
    {
      "id": "A017",
      "etiket": "qaz.ch4.ARIN_1",
      "prioritet": 1,
      "mesaj": "CH4 yüksek — ARIN 1",
      "vaxt": 142,
      "tesdiqlendi": false,
      "aktiv": true
    }
  ]
}
```

- `t` — ssenari başlayandan keçən saniyə
- `deyerler` — **yalnız dəyişənlər** göndərilir (ilk `tick`-də hamısı)
- `alarmlar` — **tam siyahı** (aktiv + təsdiqlənməmiş). Hər alarm `alan` sahəsi
  daşıyır (`hava` `gaz` `cevher` `su`) — naviqasiya rozetləri bundan sayılır
- `engel` — son rədd edilən əmrin səbəbi (interlock). Arayüz alarm bandında göstərir

### 3.3 `kocluk` — AI Koç izahı

```json
{
  "tip": "kocluk",
  "t": 150,
  "seviyye": "uyari",
  "baslik": "Hava kapısı kısmen kapalı",
  "izah": "3. kolda direnç 2.4 kat arttı. Bu nedenle ARIN 1'e giden hava 38% düştü ve CH4 yükseliyor.",
  "tovsiye": "QAPI_1 durumunu kontrol edin ve tam açık konuma getirin.",
  "kaynak": "fizik"
}
```

- `seviyye`: `bilgi` \| `uyari` \| `kritik`
- `kaynak`: `fizik` (deterministik şablon) \| `llm` (mətn gözəlləşdirilib)
- ⚠️ `kaynak: "fizik"` **default-dur**. LLM yoxdursa da bu mesaj gəlir

### 3.4 `bitti` — ssenari sonu + nəticə

```json
{
  "tip": "bitti",
  "t": 600,
  "sebep": "sure_doldu",
  "skor": {
    "toplam": 72,
    "alarm_saatlik": 8.4,
    "flood_sayisi": 1,
    "ort_ack_gecikme_sn": 23,
    "dogru_mudahale": 4,
    "yanlis_mudahale": 1,
    "kacirilan_mudahale": 2,
    "stabilizasyon_sn": 187,
    "dagilim": {
      "mudahale_45": 22.5, "onay_20": 12.3, "alarm_yuku_15": 13.8,
      "flood_10": 5, "stabilizasyon_10": 7.9, "ceza": -3
    }
  },
  "olaylar": [
    { "t": 42,  "tip": "ariza",   "ad": "QAPI_1 kısmen kapandı" },
    { "t": 58,  "tip": "alarm",   "ad": "CH4 P2 — ARIN 1" },
    { "t": 81,  "tip": "ack",     "ad": "A017 tesdiqləndi" },
    { "t": 96,  "tip": "emr",     "ad": "QAPI_1 → acik", "dogru": true },
    { "t": 229, "tip": "stabil",  "ad": "CH4 normal aralıqda" }
  ],
  "optimal": [
    { "t": 58, "ad": "QAPI_1 kontrolü" },
    { "t": 65, "ad": "QAPI_1 → acik" }
  ]
}
```

`sebep`: `sure_doldu` \| `basarili` \| `kritik_hata` \| `kullanici_durdurdu`
`olaylar` + `optimal` → **AAR (debrief) ekranı** bunlardan çəkilir.
`dagilim` → balın hansı komponentdən gəldiyini göstərir (cəmi 100, `ceza` mənfi).

---

## 4. Client → Server

### 4.1 `emr` — avadanlığa əmr

```json
{ "tip": "emr", "hedef": "qapi.QAPI_1", "emr": "ac" }
```

| Hədəf növü | Mümkün `emr` |
|---|---|
| `fan.*` | `basla`, `dayandir` |
| `motor.*` | `basla`, `dayandir`, **`sifirla`** (arıza reset) |
| `vana.*` | `ac`, `bagla`, `ayarla` (+`deyer` 0–100) |
| `vsd.FE01` | `ayarla` (+`deyer` 0–100 %) |
| `css.CR01` | `ayarla` (+`deyer` 80–200 mm) |
| `qapi.*` | `ac`, `bagla` |
| `tenzim.*` | `ayarla` (+ `deyer`: 0–100) |
| `nasos.*` | `basla`, `dayandir` |
| `konveyer.*` | `basla`, `dayandir` |

Dəyər lazım olanda:
```json
{ "tip": "emr", "hedef": "tenzim.T1", "emr": "ayarla", "deyer": 60 }
```

### 4.2 `ack` — alarm təsdiqi

```json
{ "tip": "ack", "alarm_id": "A017" }
```
Hamısını təsdiqləmək üçün: `{ "tip": "ack", "alarm_id": "*" }`

### 4.3 `senaryo` — ssenari idarəsi

```json
{ "tip": "senaryo", "emr": "basla", "id": "S01" }
```
`emr`: `basla` \| `durdur` \| `sifirla`

⚠️ `sifirla` **demo günü üçün kritikdir** — 3 saniyəyə başlanğıc vəziyyətə qaytarır.

---

## 5. Xəta cavabı

```json
{ "tip": "xeta", "kod": "GECERSIZ_EMR",
  "mesaj": "qapi.QAPI_9 movcud deyil" }
```

Kodlar: `GECERSIZ_EMR`, `BILINMEYEN_HEDEF`, `SENARYO_AKTIF_DEYIL`, `ICAZE_YOX`

---

## 6. Alarm prioritetləri (ISA-18.2)

| Prioritet | Rəng (`sema.css`) | Mənası | Nümunə |
|---|---|---|---|
| **1** | `--p1` `#FF2B2B` | Kritik — dərhal müdaxilə | CH₄ ≥ %2.0, ana fan dayandı |
| **2** | `--p2` `#FF9800` | Yüksək — tez müdaxilə | CH₄ ≥ %1.5, hava hızı düşük |
| **3** | `--p3` `#FFE000` | Aşağı — məlumat | CH₄ ≥ %1.0, sump ≥ %75 |
| **4** | `--p4` `#FF35C8` | Sensor nasazlığı | Ölçü gəlmir / şübhəli data |

**Qayda:** bu **doymuş** rənglər interfeysdə **başqa heç yerdə** istifadə olunmur.
Hava xidməti rəngləri (təmiz/dönüş/arın) bilərəkdən **solğundur** — bax `CLAUDE.md` §9.

---

## 6b. ⛔ Native dialog QADAĞANDIR

`confirm()` · `prompt()` · `alert()` **işlətməyin.**

Gömülü brauzerlərdə bunlar **bloklanır** — dialoq görünmədən `false`/`null`
qaytarır, əmr səssizcə itir, istifadəçi səbəbini görmür. (Bu, real olaraq
baş verdi və bütün klikləri işləməz hala gətirmişdi.)

Üstəlik **real SCADA onsuz da native dialoq işlətmir** — *faceplate* açır.

| Əvəzinə | Harada |
|---|---|
| Faceplate paneli (`#fp`) | `web/app.js` → `fpAc()` / `fpYenile()` |
| Doğrulama panelində bildiriş | `web/editor.js` → `bildir()` |
| İki addımlı təsdiq düyməsi | `web/editor.js` → "Yeni" düyməsi |

---

## 7. Frontend üçün mock data

Backend hazır olmadan frontend işləsin deyə:

```
web/mock/init_ornek.json     ← init mesajı
web/mock/tick_ornek.json     ← 300 saniyəlik nümunə axın (S01 ssenarisi)
web/mock/sebeke_ocak1.json   ← şəbəkə tərifi (arayüz sxemi bundan üretir)
```

Yenidən üretmək: `python engine/mock_uret.py`
**Bu data uydurma deyil — fizika mühərrikindən çıxır.**

Frontend-də `MOCK` bayrağı **porta görə avtomatikdir**:
`5500` → mock · `8000` → canlı WebSocket.
**Faz 4-də (birləşmə günü) `false` edilir — başqa heç nə dəyişmir.**

---

## 8. Dəyişiklik qaydası

1. Bu faylı dəyiş
2. Versiyanı artır (1.0 → 1.1)
3. Komandaya elan et
4. Frontend və backend eyni gün uyğunlaşdırılsın

**Bu faylı dəyişmədən mesaj formatını dəyişmək qadağandır.**
