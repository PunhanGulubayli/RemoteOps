/* RemoteOps — Eğitim asistanı
 *
 * Dört mod (kullanıcı seçer):
 *   guided      — her adımı sırayla gösterir, ekipmanı işaretler
 *   hints       — görevi söyler; "İpucu" düğmesi bir sonraki adımı açar
 *   independent — sadece görev başlığı; yönlendirme yok
 *   exam        — hiçbir yönlendirme yok (sunucu adımları göndermez)
 *
 * Adım tamamlanması CANLI DEĞERDEN okunur — komut gönderildi diye değil,
 * proses gerçekten o duruma geldiyse tamamlanır. (Gerçek yetkinlik ölçümü budur.)
 */
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);

  const MODLAR = {
    guided: { ad: 'Rehberli', aciklama: 'Her adım sırayla gösterilir' },
    hints: { ad: 'İpuçlu', aciklama: 'Kendiniz yapın, takılırsanız ipucu alın' },
    independent: { ad: 'Bağımsız', aciklama: 'Sadece görev verilir, yönlendirme yok' },
    exam: { ad: 'Sınav', aciklama: 'Gerçek operatör deneyimi — hiç yardım yok' },
  };

  let mod = 'guided';
  let gorevler = [];
  let aktifGorev = 0;
  let acikIpucu = -1;          // hints modunda acilan son adim
  let vurgula = () => {};
  let ekranaGec = () => {};

  function kur(opt) {
    vurgula = opt.vurgula || (() => {});
    ekranaGec = opt.ekranaGec || (() => {});
    mod = (localStorage.getItem('egitim_mod') || 'guided');
    if (!MODLAR[mod]) mod = 'guided';

    const sec = $('mod-sec');
    sec.innerHTML = Object.entries(MODLAR)
      .map(([k, v]) => `<option value="${k}">${v.ad}</option>`).join('');
    sec.value = mod;
    sec.onchange = () => {
      mod = sec.value;
      localStorage.setItem('egitim_mod', mod);
      acikIpucu = -1;
      if (opt.modDegisti) opt.modDegisti(mod);
      ciz();
    };
    ciz();
  }

  const modu = () => mod;

  function gorevleriAyarla(liste) {
    gorevler = liste || [];
    aktifGorev = 0;
    acikIpucu = -1;
    ciz();
  }

  /** Bir kosul canli degerlerde saglaniyor mu? */
  function kosulTamam(k, d) {
    if (!k) return false;
    const v = d[k.etiket];
    if (v === undefined) return false;
    if (k.deger !== undefined) return String(v) === String(k.deger);
    if (k.ust !== undefined) return Number(v) >= k.ust;
    if (k.alt !== undefined) return Number(v) <= k.alt;
    return false;
  }

  /** Her tick cagrilir: ilerlemeyi canli degerden hesaplar */
  function guncelle(d) {
    if (!gorevler.length) return;
    for (const g of gorevler) {
      (g.adimlar || []).forEach(a => { a._ok = kosulTamam(a.tamam, d); });
      g._ok = (g.adimlar || []).every(a => a._ok);
    }
    const ilk = gorevler.findIndex(g => !g._ok);
    const yeni = ilk === -1 ? gorevler.length - 1 : ilk;
    if (yeni !== aktifGorev) { aktifGorev = yeni; acikIpucu = -1; }
    ciz();
  }

  function ciz() {
    const kutu = $('egitim-govde');
    const g = gorevler[aktifGorev];

    if (mod === 'exam') {
      kutu.innerHTML = `<div class="eg-sinav">
        <b>SINAV MODU</b>
        <p>Vardiya sizin. Yönlendirme yok — tesisi alarm listesinden ve
        proses ekranlarından takip edin, gerekli müdahaleyi kendiniz belirleyin.</p>
        <p class="eg-kucuk">Performansınız ANSI/ISA-18.2 ölçütlerine göre
        kayıt altına alınıyor.</p></div>`;
      vurgula(null);
      return;
    }

    if (!g) {
      kutu.innerHTML = '<div class="eg-bos">Aktif görev yok. Sistemi izleyin.</div>';
      vurgula(null);
      return;
    }

    const bitti = gorevler.filter(x => x._ok).length;
    let h = `<div class="eg-ilerleme">
        <span>GÖREV ${aktifGorev + 1} / ${gorevler.length}</span>
        <div class="eg-bar"><i style="width:${bitti / gorevler.length * 100}%"></i></div>
      </div>
      <div class="eg-baslik">${g.ad}</div>
      <div class="eg-aciklama">${g.aciklama || ''}</div>`;

    if (g.ekran) h += `<button class="eg-gec" data-ekran="${g.ekran}">
        → ${g.ekran_ad || g.ekran.toUpperCase()} ekranına git</button>`;

    if (mod === 'independent') {
      h += `<div class="eg-kucuk">Bağımsız mod: adımları kendiniz belirleyeceksiniz.</div>`;
    } else {
      const adimlar = g.adimlar || [];
      const siradaki = adimlar.findIndex(a => !a._ok);
      h += '<ol class="eg-adimlar">';
      adimlar.forEach((a, i) => {
        const durum = a._ok ? 'ok' : (i === siradaki ? 'aktif' : 'bekleyen');
        const gizli = mod === 'hints' && !a._ok && i > acikIpucu;
        h += `<li class="${durum}">`;
        if (gizli) {
          h += i === siradaki
            ? `<span class="eg-gizli">Adım ${i + 1} — kendiniz deneyin</span>
               <button class="eg-ipucu" data-i="${i}">İpucu göster</button>`
            : `<span class="eg-gizli">Adım ${i + 1}</span>`;
        } else {
          h += `<span>${a.metin}</span>`;
          if (a.ipucu && (mod === 'guided' || i <= acikIpucu))
            h += `<div class="eg-neden">${a.ipucu}</div>`;
        }
        h += '</li>';
      });
      h += '</ol>';

      // guided modda siradaki ekipmani vurgula
      if (mod === 'guided' && siradaki >= 0 && adimlar[siradaki].hedef)
        vurgula(adimlar[siradaki].hedef);
      else vurgula(null);
    }

    if (g._ok) h += '<div class="eg-tamam">✓ Bu görev tamamlandı</div>';
    kutu.innerHTML = h;

    kutu.querySelectorAll('.eg-ipucu').forEach(b => b.onclick = () => {
      acikIpucu = Number(b.dataset.i); ciz();
    });
    kutu.querySelectorAll('.eg-gec').forEach(b => b.onclick = () => ekranaGec(b.dataset.ekran));
  }

  window.HMI.Egitim = { kur, modu, gorevleriAyarla, guncelle, MODLAR };
})();
