# RemoteOps — Demo Skripti ve Jüri Cevap Kartı

**Şanlıurfa · 30 Eylül – 4 Ekim 2026** · *güncelleme: 14.09.2026*
Bu belge masada açık dursun. En az **20 kez** prova edilmeli.

---

## 0. Masaya oturmadan önce (5 dakika)

- [ ] İnternet YOKMUŞ gibi çalışılacak — YZ Koç zaten şablon modunda (`kaynak: fizik`)
- [ ] `basla.bat` çift tıklandı **veya** `python -m uvicorn server.main:app --port 8000`
- [ ] Tarayıcı `http://localhost:8000/` açık, **tam ekran (F11)**
- [ ] **Tema koyu** seçili (projeksiyonda okunur). Aydınlık salonda `◐ Tema` ile açık temaya geçin
- [ ] **Sıfırla** düğmesi test edildi (anında çalışır, onay sormaz)
- [ ] Bir ekipmana tıklayıp **faceplate** açıldığı doğrulandı
- [ ] Yedek: demo videosu masaüstünde, ikinci tarayıcı sekmesi hazır

---

## 1. Doksan saniyelik demo

> **Kural:** konuşurken tıklama, tıklarken konuşma. Jüri ekrana bakmalı.

### 0:00–0:15 — Açılış (ekran normal rejimde)

> "Bu bir maden kontrol odası ekranı. Üstte alan navigasyonu, altta her zaman
> görünen alarm bandı ve durum çubuğu — yerleşim **ISO 11064 / ISA-101**'e göre.
> Şemada **yeşilimsi hat temiz hava, koyu sarı hat dönüş havası**; oklar
> **MSHA 30 CFR 75.372**'nin zorunlu kıldığı akış yönünü gösteriyor.
> Yuvarlak balonlar **ISA-5.1** ölçüm etiketleri: AT gaz, FT debi, PT basınç.
>
> Ve dikkat edin: **hiçbir alarm rengi yok** — çünkü her şey normal.
> Doygun kırmızı, turuncu ve sarı bu ekranda **yalnızca alarm** için ayrılmıştır."

*(Değerleri göster: CH₄ %0.55 / %0.70 / %0.40 · hava 39.9 / 37.6 / 35.7 m³/s ·
fan 117.6 m³/s, 1858 Pa, 291 kW · altta SUMP %50, P1 çalışıyor, konveyör 160 A)*

### 0:15–0:35 — Arıza (t=45'te otomatik)

> "Şimdi vardiya değişiminde bir hava kapısı tam kapatılmadı."

*(QAPI 1 "AÇIK" oluyor. Fan debisi 118 → 148 m³/s **artıyor**.)*

> **"Dikkat edin: fan debisi ARTTI."** Acemi operatör bunu iyi bir haber sanır.
> Ama ayaklara giden hava **düştü** — 39.9'dan 20.2'ye. Hava, ayaklara uğramadan
> dönüş yoluna kaçıyor. Buna kısa devre denir ve **imzası tam olarak budur:
> toplam debi artarken ayak debisi düşer.**"

### 0:35–0:55 — Sonuç ve Koç

*(CH₄ tırmanıyor, alarmlar sırayla: P3 sarı → P2 turuncu → P1 kırmızı.
ARIN 2 kutusu kırmızı çerçeveleniyor.)*

> "Metan yükseliyor. Ve şuna bakın —"

*(AI Koç panelini göster)*

> "Koç, bir dil modelinin tahmini değil. Açıklama **fizik kalıntısından** çıkıyor:
> kapı direnci 5000'den 0.05'e düştü, kapıdan 84 m³/s kaçıyor, ayak hava hızı
> 5.31'den 2.70 m/s'ye indi. **2 m/s'nin altında metan tavanda tabakalaşır** —
> tavan sensörü ortalamadan yüksek okur. Bu cümlelerin her rakamı hesaplanmıştır.
> **İnternet olmasa da çalışır.**"

### 0:55–1:15 — Müdahale (faceplate)

*(QAPI 1'e tıkla — **faceplate** açılır)*

> "Operatör ekipmana tıklıyor ve karşısına faceplate çıkıyor: etiket, durum,
> canlı ölçümler, komut düğmesi — ve **komutun sonucu ne olur** uyarısı.
> Gerçek SCADA tam olarak böyle çalışır; hiçbir kontrol odası tarayıcının
> kendi onay kutusunu kullanmaz."

*(KAPAT'a bas → hava geri döner, CH₄ düşer, renkler kaybolur)*

### 1:15–1:30 — Değerlendirme

*(Senaryoyu durdur → AAR ekranı açılır)*

> "Ve en önemli kısım: bu bir eğitim aracı değil, bir **ölçme** aracı.
> ANSI/ISA-18.2'ye göre puanlanıyor: saatlik alarm yükü, alarm flood,
> onay gecikmesi, doğru müdahale, stabilizasyon süresi.
> Bu operatör 92 aldı. **Hiçbir şey yapmayan operatör 36 alır.**"

---

## 2. Varsa ikinci demo: S03 — "Normalleşmiş sapma" ⭐

**Bu senaryoyu mutlaka anlatın, göstermeye vakit yoksa bile.**

> "Üçüncü senaryomuz Amasra 2022 bilirkişi raporuna dayanıyor. Rapor şunu tespit
> ediyor: merkezi gaz izleme sistemi verilerine göre metan **mükerreren %1.5 ve
> %2'nin üzerinde** kalmış. Yani sensör vardı, veri vardı, alarm vardı.
> Eksik olan sensör değildi — **karar zinciriydi.**
>
> Bu senaryoda metan saatlerce %1.5–2 arasında gezinir. Alarm tekrar tekrar çalar.
> Kolay yol: ACK'e basıp devam etmek. Sistem tam olarak bunu ölçer.
>
> Sonuç: sadece ACK'e basan operatör **40** alıyor. Müdahale eden **84**.
> Çünkü **alarmı onaylamak, müdahale etmek değildir.**"

---

## 2b. Yedek demo: Şema Editörü *(vakit kalırsa — çok etkili)*

*(Üst şeritten **Şema Editörü**)*

> "Her madenin şeması farklıdır. Biz her müşteri için ayrı yazılım yazmıyoruz.
> Kullanıcı kendi ocağını burada çiziyor — düğüm koy, kol çiz, tip seç."

*(Birkaç düğüm ve kol ekle — galeri, arın, kuyu+fan)*

> "**Doğrula** dediğimde bu ağ, simülatörün kullandığı **gerçek fizik motorunda**
> çözülüyor. Bakın: hangi yöntemin kullanıldığını, Kirchhoff-1 ve Kirchhoff-2
> kalıntılarını, toplam debiyi ve **mühendislik uyarılarını** söylüyor —
> mesela burada arın hava hızı 8 m/s sınırını aşmış."

*(Kaydet → Simülatörde Aç)*

> "Kaydettim ve simülatörde açıldı. Şema otomatik üretildi — hiç SVG çizmedik,
> hiç eşleme dosyası yazmadık. **Yeni şirket = iki dosya, sıfır kod.**"

---

## 3. Jüri Cevap Kartı

| Soru | Cevap |
|---|---|
| **"Fiziğiniz doğru mu?"** | Üç katman: (1) Kirchhoff 1 ve 2 → 10⁻¹⁴ hassasiyet. (2) Tamamen bağımsız Newton-Raphson çözücü ile karşılaştırma → **%0.0001 fark**. (3) NIOSH MFIRE protokolü — `docs/dogrulama.md` |
| **"Neden gerçek prosesi kontrol etmiyorsunuz?"** | "Uçuş simülatörü uçağı uçurmaz, pilotu yetiştirir." Ayrıca OT güvenliği: Purdue Level 3.5 / iDMZ, sertifikasyon olmadan canlı bağlantı sorumsuzluktur. Canlı entegrasyon **Faz 2**'dir. |
| **"Emerson Mimic zaten bunu 68 ülkede yapıyor."** | Mimic DCS ekosistemine bağlıdır ve model bir mühendislik projesidir (tipik OTS **~1 milyon $, ~1 yıl**). Biz vendor-nötrüz ve hedefimiz tesis devreye alma değil, **155.000 işçinin yıllık 16 saatlik zorunlu tekrar eğitimi**. |
| **"AI'ınız Honeywell/AVEVA copilot'undan farkı ne?"** | Onlarınki metin açıklamasıdır ve canlı tesis içindir. Bizimki **fizik kalıntısından** çıkar (ölçülen − ΔP=R·Q²'nin beklediği), sayısal neden verir ve **yetkinlik puanına** bağlanır. |
| **"Nature'da bu iş yapılmış (MAPE %2.87)."** | Evet — ve yazarlar kendi sınırlarını yazmışlar: *"limited interpretability"*, gelecek iş olarak *physics-informed NN*. Biz tahmin yarışına girmiyoruz; **açıklama ve ölçme** katmanını kuruyoruz. |
| **"Ventsim varken fiziğiniz niye?"** | Ventsim bir **tasarım** aracıdır; insan-karar döngüsü yoktur. Biz MFIRE'a karşı doğrulanıyoruz. |
| **"Ignition Maker ücretsiz."** | Doğru — bu yüzden üniversite bizim ana pazarımız değil. Pazarımız **İSG/MYK uyumluluğu**: madencilikte 8 meslekte MYK belgesi zorunlu, çok tehlikeli sınıfta yılda 16 saat eğitim zorunlu. |
| **"Bu bir dijital ikiz mi?"** | Hayır. İkiz somut bir fiziksel varlığa bağlıdır. Bu bir **fizik tabanlı eğitim simülatörüdür**. |
| **"Kazaları ne kadar azaltır?"** | **Henüz bilmiyoruz, verimiz yok.** Ölçtüğümüz şey operatör yetkinliğidir: doğru müdahale, onay gecikmesi, stabilizasyon süresi. Kaza etkisi pilot uygulamadan sonra ölçülebilir. |
| **"Her şirket için ayrı yazılım mı?"** | Hayır. **SVG şema + JSON eşleme + aynı motor.** Yeni şirket = 2 dosya, sıfır kod. |
| **"Arayüzü nereden aldınız, hazır mı?"** | Hazır değil, **araştırmaya göre** yazıldı: MSHA 30 CFR 75.372 (zorunlu harita içeriği), ISA-5.1 (ölçüm balonları), ISA-101/ISO 11064 (ekran zonlaması), ISA-18.2 (alarm renkleri). Şema, şebeke tanımından **otomatik üretiliyor**. |
| **"Maden haritasında dönüş havası kırmızıdır, sizde neden değil?"** | Çünkü ISA-18.2 kırmızıyı **P1 alarma** ayırır. İkisini aynı ekranda kullanırsanız operatör normal dönüş yolunu alarm sanır. Biz hava servisini **solgun** tonlarla gösteriyoruz ve lejantta bunu yazıyoruz. |
| **"Çözücünüz her ağda çalışır mı?"** | Hayır — ve bunu **ölçüyoruz**. Kapalı hava kapısı (R=5000) ile kuyu (R=0.003) yan yana olunca oran ~10⁶ olur, Hardy-Cross sessizce yakınsamayabilir (ölçtük: 32.6 Pa Kirchhoff-2 kalıntısı). Sistem bunu tespit edip **Newton-Raphson**'a geçiyor (kalıntı 3.6e-13 Pa). |
| **"Kaç kişi kullandı?"** | Henüz kimse — prototip aşamasındayız. Pilot hedefimiz TTK Akademi; zaten 4 katlı yapay eğitim ocakları var, bizimki yıllık tekrar eğitimini ve ölçmeyi dijitalleştirir. |

---

## 4. Asla söylemeyin

- ❌ "AI anomali tespiti bizde ilk" → Honeywell ve AVEVA'da var
- ❌ "Canlı saha verisi kaydı sadece bizde" → Emerson Mimic, Yokogawa Mirror Plant
- ❌ "Rakipler yüz binlerce dolar" → kaynaksız. Doğru rakam: **tipik OTS ~1 M$**
- ❌ "Dijital ikiz"
- ❌ "Kazaları %X azaltır"
- ❌ "ABB 800xA uyumlu"
- ❌ "En iyi / ilk / tek / tam"

> **Altın kural:** bu sıfatları sil, yerine **rakam + ölçüm yöntemi** koy.

---

## 5. Panik planı

| Olursa | Yap |
|---|---|
| Ekran donuyor | **Sıfırla** düğmesi (anında, onay sormaz) |
| Değişiklik görünmüyor | **Ctrl+F5** (sunucuda no-cache var ama garanti olsun) |
| Faceplate açılmıyor | Sayfayı yenile; ekipmanın **üstüne** tıkla, etiketine değil |
| Sunucu çöküyor | Terminalde yukarı ok + Enter (uvicorn yeniden) — 5 saniye |
| Hiçbiri olmuyor | Yedek videoyu aç, anlatmaya devam et, özür dileme |
| Bilmediğin soru | **"Bilmiyoruz, ölçmedik."** Uydurma. Jüri dürüstlüğü ayırt eder, uydurmayı da. |
