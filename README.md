# RemoteOps

**Maden proses kontrol simülatörü** — TEKNOFEST 2026 Maden Teknolojileri Yarışması
· Takım **EonLedger**

Kullanıcı bir yeraltı madeninin kontrol odasında oturur ve üç prosesi yönetir:
**havalandırma**, **cevher hazırlama hattı** ve **su tahliyesi**.
Arızalara ve alarmlara müdahale eder, sonunda **ANSI/ISA-18.2**'ye göre puanlanır.

> ⛔ **Sınır:** bu sistem gerçek bir ocağı **kontrol etmez**. Amaç öğrenme ve
> yetkinlik ölçümüdür. Canlı SCADA/OT bağlantısı **yoktur**.

📖 Önce [`CLAUDE.md`](CLAUDE.md) — projenin tek gerçek kaynağı.
Sonra [`contract.md`](contract.md) — mesaj sözleşmesi + API.

---

## Çalıştırma

```bash
pip install fastapi "uvicorn[standard]" pyyaml
python -m uvicorn server.main:app --port 8000
```
veya `basla.bat` dosyasına çift tıklayın.

| Adres | Ne |
|---|---|
| <http://localhost:8000/> | Simülatör |
| `?senaryo=S04` | Belirli senaryo ile aç |
| `?sema=ocak2` | Farklı şebeke |
| <http://localhost:8000/editor.html> | Şema editörü — kendi ocağınızı çizin |

⚠️ `index.html`'e doğrudan çift tıklamayın — `fetch()` CORS nedeniyle çalışmaz.

---

## Ekranlar

| Ekran | Alan | İçerik |
|---|---|---|
| **Genel Bakış** | TESİS | üç prosesin özet durumu |
| **Havalandırma** | ALAN 10 | şebeke tanımından **otomatik üretilen** ventilasyon şeması |
| **Cevher Hattı** | ALAN 30 | BN01 bunker → FE01 besleyici → CR01 kırıcı → CV01 → BN02 → CV02 → skip |
| **Su Atma** | ALAN 40 | TK01 tank → HV01 vana → S1 sump → P1/P2 pompalar → yüzey |
| **Alarmlar** | ISA-18.2 | tam liste + alarm performans göstergeleri |
| **Trendler** | GEÇMİŞ | eşik çizgileriyle zaman serisi |

Şemadaki **herhangi bir ekipmana tıklayın** → faceplate açılır: durum, canlı
ölçümler, **çalışma izni (interlock)**, komut ve komutun sonucu.

---

## Eğitim modları

| Mod | Davranış |
|---|---|
| **Rehberli** | Her adım sırayla gösterilir, ekipman ekranda işaretlenir |
| **İpuçlu** | Görev verilir; "İpucu" düğmesi bir sonraki adımı açar |
| **Bağımsız** | Sadece görev; adımları siz belirlersiniz |
| **Sınav** | Hiç yönlendirme yok — sunucu adımları göndermez |

Adım tamamlanması **canlı değerden** okunur: komut gönderildi diye değil,
proses gerçekten o duruma geldiyse tamamlanır.

---

## Gerçek endüstriyel davranış

Bunlar görsel süs değil, **mantıktır**:

- **Başlatma sırası akıştan geriye:** CV02 → CV01 → CR01 → FE01.
  Yanlış sırada interlock izin vermez (gerçek tesiste malzeme yığılır, bant kopar).
- **Durdurma sırası akış yönünde:** FE01 → CR01 → CV01 → CV02 (hat boşalsın).
- **Trip ≠ durdurma.** Trip eden motor kendiliğinden çalışmaz; **RESET** gerekir.
- **Pompa kuru çalışma koruması:** sump seviyesi düşükse pompa başlatılamaz.
- **Bunker yüksek seviye:** BN02 dolduğunda CV01 interlock ile durur.
- **Kırıcı choke:** aşırı beslenirse hazne dolar, motor akımı yükselir, trip eder.

---

## Testler

| Komut | Ne yoklar | Durum |
|---|---|---|
| `python engine/test_network.py` | Fizik · Kirchhoff 1-2 · senaryo tepkisi | **26/26** |
| `python engine/dogrulama.py` | Hardy-Cross ↔ bağımsız Newton-Raphson | fark **%0.0001** |
| `python server/test_e2e.py` | Interlock · trip/reset · senaryo · koç · puanlama | **39/39** |

Doğrulama raporu: [`docs/dogrulama.md`](docs/dogrulama.md)
Demo scripti + jüri cevap kartı: [`docs/demo_skripti.md`](docs/demo_skripti.md)

---

## Klasörler

| Klasör | Ne | Sahip |
|---|---|---|
| `engine/` | `network.py` şebeke çözücü · `proses.py` cevher+su · `sim.py` birleştirici | Üye 1 |
| `server/` | FastAPI + WebSocket · senaryo motoru · YZ koç · ISA-18.2 puanlama | Üye 2 |
| `web/lib/` | `sym.js` ISA-5.1 sembolleri · `screens.js` P&ID · `faceplate.js` · `training.js` | Üye 3 |
| `web/` | `app.js` denetleyici · `hmi.css` tema · `editor.*` şema editörü | Üye 4 |
| `scenarios/` | S01–S05 YAML senaryolar (görev adımlarıyla) | Üye 5 |
| `data/` · `docs/` | Şebeke tanımları · CSV kayıtlar · doğrulama | — |

**Sert kural:** kimse başkasının klasöründe dosya değiştirmez.

---

## Öne çıkanlar

- **Hibrit çözücü** — Hardy-Cross; ağ *sert* ise otomatik **Newton-Raphson**'a geçer
  (kapalı hava kapısı R=5000 ile kuyu R=0.003 yan yana → oran ~10⁶).
- **Otomatik şema üreteci** — ventilasyon şeması şebeke tanımından üretilir;
  elle SVG çizmek veya eşleme dosyası yazmak gerekmez.
- **Şema editörü** — kullanıcı kendi ocağını çizer, **gerçek fizik motorunda**
  doğrulanır, kaydedilir, simülatörde açılır.
- **Fizik tabanlı YZ Koç** — açıklama dil modelinden değil, `ölçülen − ΔP=R·Q²`
  kalıntısından çıkar. **İnternet olmadan da çalışır.**
- **ISA-18.2 puanlama** — *alarmı onaylamak, müdahale etmek değildir.*

---

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| Boş sayfa | Sunucu ile açın, dosyaya çift tıklamayın |
| Değişiklik görünmüyor | Sunucuda no-cache var; yoksa **Ctrl+F5** |
| Tıklıyorum, bir şey olmuyor | Faceplate açılmalı. Native `confirm()` **kullanmayın** — bloklanıyor |
| "INTERLOCK" hatası | Hata değil — yanlış sırada başlatıyorsunuz. Faceplate sebebi yazar |
| Port meşgul | `netstat -ano \| findstr :8000` → `taskkill /F /PID <pid>` |
