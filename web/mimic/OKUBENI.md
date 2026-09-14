# ⚠️ ARŞİV — kullanılmıyor

Bu klasördeki `ocak1.svg` ve `ocak1.map.json`, projenin **Faz 2**'sinde elle
çizilmiş şemasıdır.

**Faz 8'de tamamen değiştirildi:** şema artık şebeke tanımından
(`data/sebeke_*.json`) `web/sema_ciz.js` tarafından **otomatik üretiliyor**.

Dosyalar referans olarak duruyor; hiçbir kod bunları okumuyor.
Tag isimleri de eskidir — **örnek olarak kullanmayın**, `contract.md`'ye bakın.

## "Şirketin kendi mimiği" yolu (Yol B)
`web/app.js` içindeki `etiketAl()` hem `baglanti` hem `etiket` alanını kabul eder,
yani eşleme formatı desteklidir. Ancak **özel SVG yükleme yolu henüz yazılmadı** —
bu bir yol haritası maddesidir, bitmiş özellik değildir. Böyle sunmayın.
