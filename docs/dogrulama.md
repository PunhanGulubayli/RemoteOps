# RemoteOps — Fizik Doğrulama Raporu

**Tarih:** 2026-09-14 · **Sürüm:** 1.0
**Ağ:** `data/sebeke_ocak1.json` — 12 düğüm, 20 kol, 9 bağımsız döngü

---

## 0. Bu rapor neden var

Jüri soracak: **"Fiziğiniz doğru mu, nereden biliyorsunuz?"**

"Test yazdık" yeterli bir cevap değildir. Bu raporda üç bağımsız doğrulama katmanı var:

| Katman | Ne kanıtlar | Durum |
|---|---|---|
| **A. Korunum yasaları** | Çözüm Kirchhoff 1 ve 2'yi sağlıyor mu | ✅ Tamam |
| **B. Bağımsız çözücü** | Sayısal uygulama hatası var mı | ✅ Tamam |
| **C. Dış referans (NIOSH MFIRE)** | Model, kabul görmüş bir araçla aynı sonucu veriyor mu | ⬜ Takım yapacak |

---

## 1. Model neye dayanıyor

| Büyüklük | Denklem |
|---|---|
| Kol basınç kaybı | **Atkinson kare kanunu:** `ΔP = R · Q · \|Q\|` |
| Ağ çözümü | **Hardy-Cross** döngü düzeltmesi: `ΔQ = −Σ H / Σ \|dH/dQ\|` |
| Fan karakteristiği | `P_fan = p₀ − k · Q²` (p₀ = 3000 Pa, k = 0.0826) |
| Direnç | `R = k_f · Per · L / A³` (Atkinson formülü) |
| Metan taşınımı | `dC/dt = (C_ss − C)/τ`, `τ = V/Q` (advection zaman sabiti) |
| Tabakalaşma | `tabaka = 1 + 1.2 · max(0, (2.0 − v)/2.0)` — v < 2 m/s'de tavanda birikme |

> ⚠️ **Darcy-Weisbach değil.** Maden havalandırmasında standart Atkinson denklemidir.
> ⚠️ **Sadece Fick difüzyonu değil.** Advection + kaldırma kuvveti birlikte.

---

## 2. Katman A — Korunum yasaları

`python engine/test_network.py` → **26/26 geçti**

| Kontrol | Sonuç |
|---|---|
| Döngü sayısı = Kol − Düğüm + 1 | 9 = 20 − 12 + 1 ✅ |
| **Kirchhoff 1** (düğüm kütle dengesi) | **9.59 × 10⁻¹⁴ m³/s** (makine hassasiyeti) |
| **Kirchhoff 2** (döngü basınç dengesi) | **1.36 × 10⁻⁴ Pa** |
| Yakınsama | **14 iterasyon** |

### Fiziksel makullük (normal rejim)
| Büyüklük | Değer | Beklenen aralık |
|---|---|---|
| Ocak toplam debisi | **117.6 m³/s** | 50–250 ✅ |
| Fan basıncı | **1858 Pa** | 500–4000 ✅ |
| Fan gücü | **291 kW** | 50–800 ✅ |
| Kuyu hızı | 6.00 m/s | < 15 ✅ |
| Ayak hızları | 5.31 / 5.01 / 5.10 m/s | 0.5–8 (yönetmelik) ✅ |
| CH₄ (ARIN 1/2/3) | %0.55 / %0.70 / %0.40 | < %1.0 ✅ |

---

## 3. Katman B — Bağımsız çözücü karşılaştırması ⭐

**En güçlü iç kanıt budur.** Aynı denklem takımı, **ortak kod paylaşmayan iki
tamamen farklı sayısal yöntemle** çözüldü:

| | Yöntem A | Yöntem B |
|---|---|---|
| Dosya | `engine/network.py` | `engine/dogrulama.py` |
| Yaklaşım | **Hardy-Cross** | **Newton-Raphson** |
| Bilinmeyen | Döngü debileri | Düğüm basınçları |
| Çözüm | Ardışık döngü düzeltmesi | Global Jacobian + Gauss eliminasyonu |

`python engine/dogrulama.py`

| Senaryo | En büyük kol farkı |
|---|---|
| Normal rejim | **0.000%** |
| QAPI_1 açık (kısa devre) | **0.000%** |
| TENZIM T1 %30 (regülatör kısık) | **0.000%** |
| B04 tavan çökmesi (direnç ×50) | **0.000%** |
| **Tüm senaryolarda en büyük fark** | **0.0001%** |

**Ne kanıtlar:** çözücünün sayısal uygulaması doğrudur. İki bağımsız yöntemin
aynı hatayı yapma olasılığı pratik olarak yoktur.

**Ne kanıtlamaz:** modelin *gerçek bir ocağı* temsil ettiğini. Onun için Katman C gerekir.

---

## 3b. Hibrit çözücü — neden gerekti

Kullanıcı kendi ağını çizdiğinde **kapalı bir hava kapısı** (R = 5000) ile
**kuyu** (R = 0.003) yan yana gelir. Direnç oranı ~10⁶ — ağ *sert* (stiff) olur.

Ölçülen: Hardy-Cross bu ağda 600 iterasyonda **yakınsamadı**.
Kirchhoff-1 sağlandı (1.2 × 10⁻¹³ m³/s — döngü düzeltmesi düğüm dengesini
zaten korur) ama **Kirchhoff-2 kalıntısı 32.6 Pa** kaldı. Yani sonuç sessizce yanlıştı.

**Çözüm:** `Sebeke.coz()` artık hibrittir.
1. Hardy-Cross çalışır.
2. Kirchhoff-2 kalıntısı > 0.5 Pa ise **Newton-Raphson**'a geçer.
3. Kullanılan yöntem `_yontem` alanında raporlanır.

| Ağ | Yöntem | Kirchhoff-2 |
|---|---|---|
| `ocak1` (normal) | hardy-cross | 1.4 × 10⁻⁴ Pa |
| Editörde çizilen sert ağ | newton-raphson | 3.6 × 10⁻¹³ Pa |

> Jüriye: *"Hardy-Cross standarttır, ama sert ağlarda sessizce yakınsamayabilir.
> Biz bunu ölçüyor ve tespit edince yöntem değiştiriyoruz."* — Bu cevap,
> "Hardy-Cross kullanıyoruz" demekten çok daha güçlüdür.

**Not:** `engine/dogrulama.py` içindeki Newton-Raphson, `network.py` içindekiyle
**kod paylaşmaz**. Çapraz doğrulamanın anlamı iki uygulamanın bağımsız olmasıdır.

---

## 4. Katman C — NIOSH MFIRE karşılaştırması ⬜ YAPILACAK

### Neden MFIRE
- **Ücretsiz ve açık kaynak** (kaynak kodu dahil) — bütçe gerekmez
- NIOSH Pittsburgh Mining Research Division tarafından bakımı yapılıyor
- **NIOSH Safety Research Coal Mine'da gerçek yangın testleriyle doğrulanmış**
- Maden havalandırma ağı analizinde kabul görmüş referans

İndirme: `cdc.gov/niosh/mining/tools/mfire.html`

### Protokol (sorumlu: Üye 1 + Üye 5)

1. **Ağı dışa aktar:** `python engine/mfire_disa_aktar.py` → `docs/sebeke_kol_tablosu.csv`
2. MFIRE'da aynı ağı kur: 12 düğüm, 20 kol, aynı `R` değerleri, aynı fan eğrisi
3. Her iki aracı **normal rejimde** çöz
4. Kol bazında debileri karşılaştır, aşağıdaki tabloyu doldur
5. Aynısını **QAPI_1 açık** senaryosu için tekrarla

### Doldurulacak tablo

| Kol | Ad | RemoteOps Q (m³/s) | MFIRE Q (m³/s) | Fark % |
|---|---|---|---|---|
| B01 | Giriş kuyusu | 117.60 | | |
| B02 | Ana yol – doğu | 67.67 | | |
| B03 | Ana yol – batı | 46.50 | | |
| B05 | **ARIN 1** | 39.85 | | |
| B08 | **ARIN 2** | 37.57 | | |
| B11 | **ARIN 3** | 35.69 | | |
| B13 | Ana dönüş yolu | 114.17 | | |
| B14 | Çıkış kuyusu + fan | 117.60 | | |

**Kabul ölçütü: < %5 fark.**

> Fark %5'i aşarsa bu bir başarısızlık değildir — nedenini (şok kayıpları,
> doğal havalandırma basıncı, farklı k faktörü varsayımı) yazın. Jüri,
> farkı **açıklayabilen** takımı, farkı olmayan takımdan ayırt edemez;
> açıklayamayanı ise hemen fark eder.

---

## 5. Ne iddia edebiliriz, ne edemeyiz

| ✅ Söylenebilir | ❌ Söylenemez |
|---|---|
| "Çözüm Kirchhoff 1 ve 2'yi 10⁻¹⁴ hassasiyetle sağlıyor" | "Gerçek bir ocağın debilerini tahmin ediyoruz" |
| "İki bağımsız sayısal yöntem %0.0001 farkla aynı sonucu veriyor" | "Kestirimci bakım yapıyoruz" |
| "Davranış doğrulanmıştır: kısa devrede fan debisi artar, ayak debisi düşer" | "Kazaları %X azaltır" |
| "Ağ, NIOSH MFIRE ile karşılaştırılmıştır" *(Katman C bitince)* | "Bu bir dijital ikizdir" |

**Anahtar cümle:**
> *"Bizim sadakatimiz sayısal değil, davranışsaldır — ancak davranışın kendisi
> ölçülebilir şekilde doğrulanmıştır."*

---

## 6. Performans

| Ölçü | Değer | Not |
|---|---|---|
| Simülasyon adımı | **0.43 ms/tick** | 1 Hz bütçesinin ~%0.04'ü |
| Hardy-Cross yakınsaması | 14 iterasyon | tolerans 1e-5 |
| Telemetri gecikmesi | sunucu logunda p50/p95 | `[telemetri]` satırı |

> Sunumdaki **"<30 ms"** ifadesi **telemetri gecikmesidir**, fizik adımı değildir.
> İkisini karıştırmayın; jüri sorarsa ölçüm yöntemini gösterin.

---

## 7. Tekrar üretme

```bash
python engine/test_network.py    # Katman A — 26 kontrol
python engine/dogrulama.py       # Katman B — bağımsız çözücü
python server/test_e2e.py        # Uçtan uca — senaryo + koç + puanlama
```
