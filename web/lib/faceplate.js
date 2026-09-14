/* RemoteOps — Ekipman faceplate'i
 *
 * Gercek SCADA'da operator ekipmana tiklar ve faceplate acilir:
 * durum · canli olcumler · INTERLOCK/PERMISSIVE · komut · sonuc uyarisi.
 *
 * ⛔ native confirm()/prompt() KULLANILMAZ — gomulu tarayicilarda bloke olur
 *    (dialog gostermeden false/null doner) ve komut sessizce kaybolur.
 */
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);

  /* Ekipman tipine gore hangi olcumler gosterilecek */
  const OLCUM = {
    motor: (ad) => [
      [`motor.${ad}.akim`, 'Motor akımı', 'A', 1],
      [`motor.${ad}.yuk`, 'Yük', '%', 0],
    ],
    kirici: (ad) => [
      [`motor.${ad}.akim`, 'Motor akımı', 'A', 1],
      [`motor.${ad}.yuk`, 'Yük', '%', 0],
      ['css.CR01.acilim', 'CSS açıklığı', 'mm', 0],
      ['bant.CV01.yuk', 'Çıkış debisi', 't/h', 0],
    ],
    besleyici: (ad) => [
      [`motor.${ad}.akim`, 'Motor akımı', 'A', 1],
      ['vsd.FE01.hiz', 'VSD hızı', '%', 0],
      ['bunker.BN01.seviyye', 'BN01 seviyesi', '%', 0],
    ],
    vana: (ad) => [
      [`vana.${ad}.acilim`, 'Açılım', '%', 0],
    ],
    fan: (ad) => [
      [`fan.${ad}.debi`, 'Debi', 'm³/s', 1],
      [`fan.${ad}.basinc`, 'Basınç', 'Pa', 0],
      [`fan.${ad}.guc`, 'Güç', 'kW', 0],
    ],
    qapi: () => [],
    tenzim: (ad) => [[`tenzim.${ad}.acilim`, 'Açılım', '%', 0]],
  };

  /* Komut sonucu uyarilari — operator NE OLACAGINI bilerek bassin */
  const UYARI = {
    'fan:dayandir': 'Ana fan durursa tüm ocakta hava akışı durur ve metan birikmeye başlar. ' +
                    'Bu, acil durum prosedürü gerektirir.',
    'qapi:ac': 'Hava kapısı açılırsa hava arınlara uğramadan dönüş yoluna kısa devre yapar. ' +
               'Fan debisi ARTAR ama arın havası DÜŞER.',
    'motor:dayandir': 'Hattı durdururken akış yönünde sıra izlenmelidir (önce besleyici). ' +
                      'Aksi halde bantta malzeme kalır.',
    'vana:bagla': 'Vana kapanırsa sumpa su gelmez ve pompalar kuru çalışma riskine girer.',
  };

  const AYAR = {
    vsd: { hedef: 'vsd.FE01', etiket: 'vsd.FE01.hiz', ad: 'Besleyici hızı (VSD)',
           birim: '%', min: 0, max: 100, adim: 5 },
    css: { hedef: 'css.CR01', etiket: 'css.CR01.acilim', ad: 'Kırıcı CSS açıklığı',
           birim: 'mm', min: 80, max: 200, adim: 5 },
    tenzim: { etiket: null, ad: 'Regülatör açılımı', birim: '%', min: 0, max: 100, adim: 5 },
    vana: { etiket: null, ad: 'Vana açılımı', birim: '%', min: 0, max: 100, adim: 5 },
  };

  let aktif = null;              // {hedef, tip, ad, ekstra}
  let gonder = () => {};
  let veri = () => ({});
  let alarmPri = () => 0;
  let interlock = () => null;

  function kur(opt) {
    gonder = opt.gonder; veri = opt.veri;
    alarmPri = opt.alarmPri || (() => 0);
    interlock = opt.interlock || (() => null);
    $('fp-kapat').onclick = kapat;
    document.addEventListener('keydown', e => { if (e.key === 'Escape') kapat(); });
  }

  function ac(cfg, node) {
    aktif = cfg;
    const fp = $('fp');
    fp.hidden = false;
    // konum: ekipmanin yaninda, ekran disina tasmadan
    const r = node.getBoundingClientRect();
    const g = fp.getBoundingClientRect();
    let x = r.right + 14, y = r.top - 20;
    if (x + g.width > innerWidth - 10) x = r.left - g.width - 14;
    fp.style.left = Math.max(10, Math.min(x, innerWidth - g.width - 10)) + 'px';
    fp.style.top = Math.max(10, Math.min(y, innerHeight - g.height - 10)) + 'px';
    yenile();
  }

  function kapat() { aktif = null; $('fp').hidden = true; }
  const acikMi = () => !!aktif;

  function yenile() {
    if (!aktif) return;
    const d = veri();
    const [tipKok, ad] = aktif.hedef.split('.');
    const durum = String(d[`${aktif.hedef}.durum`] ?? d[`${aktif.hedef}.acilim`] ?? '—');

    $('fp-ad').textContent = aktif.ad;
    $('fp-etiket').textContent = aktif.hedef;

    const rozet = $('fp-durum');
    rozet.textContent = durum.toUpperCase();
    rozet.className = 'fp-rozet ' +
      (durum === 'ariza' ? 'ariza' : durum === 'isliyir' || durum === 'acik' ? 'calisiyor' : 'durdu');

    // --- olcumler ---
    const ol = (OLCUM[aktif.tip] || OLCUM.motor)(ad);
    $('fp-olcum').innerHTML = ol.map(([et, lbl, br, ond]) => {
      const v = d[et];
      if (v === undefined) return '';
      const p = alarmPri(et);
      return `<div class="fp-satir${p ? ' alarm p' + p : ''}"><span>${lbl}</span>
        <b>${typeof v === 'number' ? v.toFixed(ond) : v} <i>${br}</i></b></div>`;
    }).join('');

    // --- arıza sebebi ---
    const trip = d[`motor.${ad}.trip`];
    const ts = $('fp-trip');
    if (durum === 'ariza' && trip && trip !== '-') {
      ts.hidden = false;
      ts.textContent = 'ARIZA SEBEBİ: ' + trip;
    } else ts.hidden = true;

    // --- interlock / permissive ---
    const il = interlock(ad);
    const ilEl = $('fp-interlock');
    if (il && il.sebep) {
      ilEl.hidden = false;
      ilEl.className = 'fp-interlock bloke';
      ilEl.innerHTML = `<b>⊘ İZİN YOK</b><br>${il.sebep}`;
    } else if (il) {
      ilEl.hidden = false;
      ilEl.className = 'fp-interlock izin';
      ilEl.innerHTML = '<b>✓ Çalışma izni var</b>';
    } else ilEl.hidden = true;

    // --- ayarlanabilir deger ---
    const ayarKod = aktif.ekstra || (aktif.tip === 'vana' ? 'vana' :
                                     aktif.tip === 'tenzim' ? 'tenzim' : null);
    const gr = $('fp-giris');
    if (ayarKod) {
      const A = { ...AYAR[ayarKod] };
      if (!A.etiket) A.etiket = `${aktif.hedef}.acilim`;
      if (!A.hedef) A.hedef = aktif.hedef;
      gr.hidden = false;
      $('fp-giris-ad').textContent = A.ad;
      $('fp-giris-birim').textContent = A.birim;
      const s = $('fp-slider');
      s.min = A.min; s.max = A.max; s.step = A.adim;
      if (document.activeElement !== s) s.value = Number(d[A.etiket]) || A.min;
      $('fp-giris-v').textContent = s.value;
      s.oninput = () => { $('fp-giris-v').textContent = s.value; };
      $('fp-uygula').onclick = () => {
        gonder({ tip: 'emr', hedef: A.hedef, emr: 'ayarla', deyer: Number(s.value) });
      };
    } else gr.hidden = true;

    // --- komut dugmeleri ---
    const btn = [];
    if (durum === 'ariza') {
      btn.push(['sifirla', 'ARIZA RESET', 'birincil']);
    } else if (tipKok === 'vana') {
      btn.push(durum === 'acik' ? ['bagla', 'KAPAT', 'tehlikeli'] : ['ac', 'AÇ', 'birincil']);
    } else if (tipKok === 'qapi') {
      btn.push(durum === 'acik' ? ['bagla', 'KAPAT', 'birincil'] : ['ac', 'AÇ', 'tehlikeli']);
    } else if (tipKok === 'motor' || tipKok === 'fan') {
      btn.push(durum === 'isliyir' ? ['dayandir', 'DURDUR', 'tehlikeli']
                                   : ['basla', 'BAŞLAT', 'birincil']);
    }
    $('fp-emir').innerHTML = btn.length
      ? btn.map(([e, l, s]) => `<button class="${s}" data-e="${e}">${l}</button>`).join('')
      : '<span class="fp-bos">Bu durumda komut yok.</span>';

    // --- sonuc uyarisi ---
    const u = $('fp-uyari');
    const anahtar = btn.length ? `${tipKok}:${btn[0][0]}` : '';
    const mesaj = UYARI[anahtar] || '';
    u.hidden = !mesaj;
    u.textContent = mesaj;

    $('fp-emir').querySelectorAll('button').forEach(bt => bt.onclick = () => {
      gonder({ tip: 'emr', hedef: aktif.hedef, emr: bt.dataset.e });
      if (bt.dataset.e !== 'sifirla') kapat();
    });
  }

  window.HMI.Faceplate = { kur, ac, kapat, yenile, acikMi };
})();
