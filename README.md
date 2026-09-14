# RemoteOps

**Maden SCADA/HMI eğitim simülatörü** — TEKNOFEST 2026 Maden Teknolojileri Yarışması
· Takım **EonLedger**

Kullanıcı sanal bir maden ocağının kontrol odasında oturur: havalandırma, gaz izleme,
su atma ve konveyör sistemlerini yönetir, arızalara ve alarmlara tepki verir,
sonunda **ANSI/ISA-18.2**'ye göre puanlanır.

> ⛔ **Sınır:** bu sistem gerçek bir ocağı **kontrol etmez**. Amaç yalnızca
> öğrenme ve yetkinlik ölçümüdür. Canlı SCADA/OT bağlantısı **yoktur**.

📖 **Önce [`CLAUDE.md`](CLAUDE.md) okunmalıdır** — projenin tek gerçek kaynağı.
Sonra [`contract.md`](contract.md) (mesaj sözleşmesi).

---

## Çalıştırma

**En kolay:** `basla.bat` dosyasına çift tıklayın.

**Terminalden:**
```bash
pip install fastapi "uvicorn[standard]" pyyaml
python -m uvicorn server.main:app --port 8000
```

| Adres | Ne |
|---|---|
| <http://localhost:8000/> | Simülatör |
| <http://localhost:8000/editor.html> | Şema editörü — kendi ocağınızı çizin |
| `?sema=ocak2` | Farklı şebeke aç |

Sadece arayüz (backend olmadan, mock veri ile):
```bash
python -m http.server 5500 --directory web
```

⚠️ `index.html`'e doğrudan çift tıklamayın — `fetch()` CORS nedeniyle çalışmaz.

---

## Testler

| Komut | Ne yoklar | Durum |
|---|---|---|
| `python engine/test_network.py` | Fizik · Kirchhoff 1-2 · senaryo tepkisi | **26/26** |
| `python engine/dogrulama.py` | Hardy-Cross ↔ bağımsız Newton-Raphson | fark **%0.0001** |
| `python server/test_e2e.py` | Senaryo + koç + puanlama zinciri | **28/28** |
| `python engine/mock_uret.py` | Mock veriyi yeniden üretir | — |

Doğrulama raporu: [`docs/dogrulama.md`](docs/dogrulama.md)
Demo scripti + jüri cevap kartı: [`docs/demo_skripti.md`](docs/demo_skripti.md)

---

## Klasörler

| Klasör | Ne | Sahip |
|---|---|---|
| `engine/` | Fizik: Hardy-Cross + Newton-Raphson hibrit çözücü, gaz, su, konveyör | Üye 1 |
| `server/` | FastAPI + WebSocket, senaryo motoru, YZ koç, puanlama | Üye 2 |
| `web/` | Kontrol odası arayüzü, otomatik şema üreteci, şema editörü | Üye 3 + 4 |
| `scenarios/` | YAML senaryolar (S01 · S02 · S03) | Üye 5 |
| `data/` | Şebeke tanımları + CSV kayıtlar | — |
| `docs/` | Doğrulama, demo scripti, MFIRE tablosu | Üye 5 |

**Sert kural:** kimse başkasının klasöründe dosya değiştirmez.

---

## Öne çıkanlar

- **Hibrit çözücü** — Hardy-Cross; ağ *sert* ise (kapalı hava kapısı R=5000 ile
  kuyu R=0.003 yan yana, oran ~10⁶) otomatik **Newton-Raphson**'a geçer.
  Kullanılan yöntem raporlanır.
- **Otomatik şema üreteci** — şebeke tanımından proses mimiği üretilir.
  Elle SVG çizmek veya eşleme dosyası yazmak gerekmez.
- **Şema editörü** — kullanıcı kendi ocağını çizer, **gerçek fizik motorunda**
  doğrulanır, kaydedilir, simülatörde açılır.
- **Fizik tabanlı YZ Koç** — açıklama dil modelinden değil, `ölçülen − ΔP=R·Q²`
  kalıntısından çıkar. **İnternet olmadan da çalışır.**
- **ISA-18.2 puanlama** — alarm/saat, alarm flood, onay gecikmesi, doğru müdahale,
  stabilizasyon süresi. *Alarmı onaylamak müdahale sayılmaz.*
- **İki tema** — koyu (klasik kontrol odası) ve açık (ANSI/ISA-101 HPHMI).

---

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| Boş sayfa | Sunucu ile açın, dosyaya çift tıklamayın |
| Değişiklik görünmüyor | Sunucuda no-cache var; yoksa **Ctrl+F5** |
| Tıklıyorum, bir şey olmuyor | Faceplate açılmalı. Native `confirm()` **kullanmayın** — bloklanıyor |
| Port meşgul | `netstat -ano \| findstr :8000` → `taskkill /F /PID <pid>` |
