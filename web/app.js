/* RemoteOps — Kontrol odası arayüzü (ana denetleyici)
 *
 * Sorumluluk: telemetri al → ekranı çiz → değerleri bağla → komut gönder.
 * Proses bilgisi lib/screens.js, semboller lib/sym.js, ekipman paneli
 * lib/faceplate.js, eğitim akışı lib/training.js içindedir.
 */
'use strict';

const $ = (id) => document.getElementById(id);
const { EKRANLAR, Faceplate, Egitim } = window.HMI;

const PRI = { 1: '--p1', 2: '--p2', 3: '--p3', 4: '--p4' };
const TREND_N = 300;

/* ───────────────────────────────── durum */
let ws = null;
let ekran = 'genel';
let sema = new URLSearchParams(location.search).get('sema') || 'ocak1';
let senaryo = new URLSearchParams(location.search).get('senaryo') || 'S01';
let bind = {}, tikla = {};
let deger = {}, alarmlar = [], meta = {};
let trend = {}, trendEt = null;
let akisFaz = {};
let hedefEkipman = null;
let toplamAlarm = 0, floodSayisi = 0, alarmZaman = [], gorulen = new Set();
let ackGecikme = [];
let sonSenaryo = {};

const rnk = (p) => getComputedStyle(document.body).getPropertyValue(PRI[p]).trim();

/* ───────────────────────────────── navigasyon */
const IKON = {
  genel: 'M12 3 2 11h3v10h6v-6h2v6h6V11h3z',
  hava: 'M3 8h11a3 3 0 1 0-3-3h2a1 1 0 1 1 1 1H3zm0 4h16a3 3 0 1 1-3 3h2a1 1 0 1 0 1-1H3zm0 4h9a2.5 2.5 0 1 1-2.5 2.5h2a.5.5 0 1 0 .5-.5H3z',
  cevher: 'M4 15h16a4 4 0 0 1 0 6H4a4 4 0 0 1 0-6m2 2a1 1 0 1 0 1 1 1 1 0 0 0-1-1m12 0a1 1 0 1 0 1 1 1 1 0 0 0-1-1M7 3h8l3 8H9z',
  su: 'M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13',
  alarm: 'M12 2a7 7 0 0 0-7 7v5l-2 3v1h18v-1l-2-3V9a7 7 0 0 0-7-7m0 20a3 3 0 0 0 3-3H9a3 3 0 0 0 3 3',
  trend: 'M3 17l6-6 4 4 8-8v5h2V3h-9v2h5l-6 6-4-4-8 8z',
};

function seritCiz() {
  $('serit').innerHTML = Object.entries(EKRANLAR).map(([k, e]) => {
    const n = alarmlar.filter(a => a.aktiv && a.alan === (k === 'hava' ? 'hava' : k)).length;
    return `<button data-e="${k}" class="${k === ekran ? 'aktif' : ''}">
      <svg viewBox="0 0 24 24"><path d="${IKON[k] || IKON.genel}"/></svg>${e.ad}
      ${n ? `<span class="rozet">${n}</span>` : ''}</button>`;
  }).join('');
  $('serit').querySelectorAll('button').forEach(b =>
    b.onclick = () => ekranaGec(b.dataset.e));
}

function ekranaGec(k) {
  if (!EKRANLAR[k]) return;
  ekran = k;
  Faceplate.kapat();
  const e = EKRANLAR[k];
  $('alan-kod').textContent = e.alan;
  $('alan-ad').textContent = e.ad;
  bilgiCiz(e);
  seritCiz();
  ekranCiz(e);
  ciz();
}

function bilgiCiz(e) {
  $('bilgi-baslik').textContent = `${e.alan} — ${e.ad}`;
  $('bilgi-ozet').textContent = e.ozet || '';
  $('bilgi-akis').textContent = e.akis ? 'AKIŞ:  ' + e.akis : '';
  $('bilgi-ekipman').innerHTML = (e.ekipman || [])
    .map(([a, t]) => `<dt>${a}</dt><dd>${t}</dd>`).join('')
    || '<dd class="sessiz">Bu ekranda ekipman yok.</dd>';
}

/* ───────────────────────────────── ekran çizimi */
function ekranCiz(e) {
  const p = $('proses');
  bind = {}; tikla = {}; akisFaz = {};

  if (e.tip === 'proses') {
    const r = e.ciz();
    p.innerHTML = r.svg; bind = r.bind; tikla = r.click;

  } else if (e.tip === 'sebeke') {
    // havalandırma şeması şebeke tanımından OTOMATİK üretilir
    if (!window._sebekeTanim) { p.innerHTML = '<div class="sessiz" style="padding:20px">Şebeke yükleniyor…</div>'; return; }
    const r = window.RemoteOpsSema.semaUret(window._sebekeTanim);
    p.innerHTML = r.svg;
    bind = r.baglanti;
    for (const k in r.tiklanabilir) {
      const c = r.tiklanabilir[k];
      const [t, ad] = c.hedef.split('.');
      tikla[k] = { hedef: c.hedef, ad: c.etiket,
                   tip: t === 'fan' ? 'fan' : t === 'qapi' ? 'qapi' : 'tenzim' };
    }

  } else if (e.tip === 'ozet') {
    p.innerHTML = ozetEkran();

  } else if (e.tip === 'alarm') {
    p.innerHTML = alarmEkran();

  } else if (e.tip === 'trend') {
    p.innerHTML = trendEkran();
    const s = $('trend-sec');
    s.innerHTML = Object.keys(meta).map(k =>
      `<option value="${k}">${k} (${meta[k].vahid || ''})</option>`).join('');
    trendEt = trendEt && meta[trendEt] ? trendEt : Object.keys(meta)[0];
    s.value = trendEt;
    s.onchange = () => { trendEt = s.value; trendCiz(); };
  }

  tikBagla();
}

function tikBagla() {
  for (const id in tikla) {
    const node = $(id);
    if (!node) continue;
    node.addEventListener('click', ev => { ev.stopPropagation(); Faceplate.ac(tikla[id], node); });
  }
  $('proses').onclick = ev => { if (!ev.target.closest('.tik')) Faceplate.kapat(); };
}

/* ───────────────────────────────── genel bakış */
function kutucuk(baslik, satirlar) {
  return `<div class="ob-kart"><h3>${baslik}</h3>${satirlar.map(([a, e, b, o]) =>
    `<div class="ob-satir"><span>${a}</span>
     <b data-v="${e}" data-o="${o ?? 1}">—</b><i>${b}</i></div>`).join('')}</div>`;
}

function ozetEkran() {
  return `<div class="ozet">
    ${kutucuk('HAVALANDIRMA — ALAN 10', [
      ['Ocak debisi', 'fan.ana_1.debi', 'm³/s', 1],
      ['Fan basıncı', 'fan.ana_1.basinc', 'Pa', 0],
      ['Fan gücü', 'fan.ana_1.guc', 'kW', 0],
      ['ARIN 1 CH₄', 'qaz.ch4.ARIN_1', '%', 2],
      ['ARIN 2 CH₄', 'qaz.ch4.ARIN_2', '%', 2],
      ['ARIN 3 CH₄', 'qaz.ch4.ARIN_3', '%', 2]])}
    ${kutucuk('CEVHER HATTI — ALAN 30', [
      ['ROM bunkeri', 'bunker.BN01.seviyye', '%', 0],
      ['Kırıcı akımı', 'motor.CR01.akim', 'A', 0],
      ['Bant 01 yükü', 'bant.CV01.yuk', 't/h', 0],
      ['Surge bunkeri', 'bunker.BN02.seviyye', '%', 0],
      ['Bant 02 yükü', 'bant.CV02.yuk', 't/h', 0],
      ['Vardiya üretimi', 'uretim.vardiya.ton', 't', 1]])}
    ${kutucuk('SU ATMA — ALAN 40', [
      ['Çökeltme tankı', 'tank.TK01.seviyye', '%', 0],
      ['Vana açılımı', 'vana.HV01.acilim', '%', 0],
      ['Sump seviyesi', 'sump.S1.seviyye', '%', 0],
      ['P1 akımı', 'motor.P1.akim', 'A', 0],
      ['P2 akımı', 'motor.P2.akim', 'A', 0],
      ['Basma debisi', 'basma.debi', 'L/s', 1]])}
    <style>
      .ozet{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));
        gap:10px;padding:14px;width:100%;align-content:start;overflow:auto}
      .ob-kart{background:var(--panel);border:1px solid var(--kenar);padding:10px 12px}
      .ob-kart h3{margin:0 0 8px;font-size:10.5px;letter-spacing:1px;color:var(--dim)}
      .ob-satir{display:flex;align-items:baseline;gap:8px;padding:4px 0;
        border-bottom:1px solid var(--cizgi);font-size:12.5px}
      .ob-satir span{flex:1;color:var(--dim)}
      .ob-satir b{font-size:16px;font-variant-numeric:tabular-nums}
      .ob-satir i{font-style:normal;font-size:10px;color:var(--soluk);width:34px}
    </style></div>`;
}

function alarmEkran() {
  return `<div class="alarm-ekran" id="alarm-ekran">
    <style>
      .alarm-ekran{padding:14px;width:100%;overflow:auto}
      .ae-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
        gap:10px;margin-bottom:14px}
      .ae-kutu{background:var(--panel);border:1px solid var(--kenar);padding:10px 12px}
      .ae-kutu span{font-size:10px;letter-spacing:.8px;color:var(--soluk)}
      .ae-kutu b{display:block;font-size:26px;font-variant-numeric:tabular-nums}
      .ae-kutu.asildi b{color:var(--p1)}
      table.ae{width:100%;border-collapse:collapse;font-size:12.5px}
      table.ae th{text-align:left;font-size:9.5px;letter-spacing:.8px;color:var(--soluk);
        border-bottom:1px solid var(--kenar);padding:4px 6px}
      table.ae td{padding:5px 6px;border-bottom:1px solid var(--cizgi)}
    </style></div>`;
}

function trendEkran() {
  return `<div class="trend-ekran">
    <select id="trend-sec"></select>
    <canvas id="trend-cizim" width="1200" height="420"></canvas>
    <div class="tr-not" id="trend-not"></div>
    <style>
      .trend-ekran{padding:14px;width:100%;display:flex;flex-direction:column;gap:10px}
      .trend-ekran select{max-width:360px}
      .trend-ekran canvas{width:100%;flex:1;background:var(--kutu);
        border:1px solid var(--kenar)}
      .tr-not{font-size:11.5px;color:var(--soluk)}
    </style></div>`;
}

/* ───────────────────────────────── değer bağlama */
function alarmPri(etiket) {
  let en = 0;
  for (const a of alarmlar)
    if (a.etiket === etiket && a.aktiv) en = en ? Math.min(en, a.prioritet) : a.prioritet;
  return en;
}

function ciz() {
  // SVG / DOM bağlantıları
  for (const id in bind) {
    const c = bind[id], node = $(id);
    if (!node) continue;
    const et = c.baglanti || c.etiket;
    const v = deger[et];
    if (v === undefined) continue;
    const p = alarmPri(et);

    switch (c.tip) {
      case 'deger':
        node.textContent = (typeof v === 'number' ? v.toFixed(c.ondalik ?? 1) : v)
                           + (c.sonek || '');
        node.style.fill = p ? rnk(p) : '';
        break;
      case 'durum': {
        const s = String(v);
        node.textContent = s.toUpperCase();
        node.style.fill = s === 'ariza' ? rnk(1) : p ? rnk(p) : '';
        break;
      }
      case 'govde': {
        const s = String(v);
        const dolu = ['isliyir', 'acik', 'bagli'].includes(s) &&
                     !(c.dolu_durumlar && !c.dolu_durumlar.includes(s));
        node.style.fill = s === 'ariza' ? rnk(1)
          : p ? rnk(p)
          : (s === 'isliyir' ? 'var(--eq-dolu)' : 'var(--eq-bos)');
        break;
      }
      case 'vana': {
        const o = Math.max(0, Math.min(1, Number(v) / 100));
        node.style.fill = p ? rnk(p)
          : o > .95 ? 'var(--eq-dolu)' : o < .05 ? 'var(--eq-bos)' : 'var(--eq-ic)';
        node.style.opacity = String(.45 + .55 * (o > .05 ? 1 : .4));
        break;
      }
      case 'seviye': {
        const o = Math.max(0, Math.min(1, Number(v) / 100));
        node.setAttribute('height', (c.h * o).toFixed(1));
        node.setAttribute('y', (c.y + c.h * (1 - o)).toFixed(1));
        node.style.fill = p ? rnk(p) : '';
        break;
      }
      case 'oran': {
        const o = Math.max(0, Math.min(1, Number(v) / (c.max || 100)));
        node.setAttribute('width', (c.uzunluk * o).toFixed(1));
        break;
      }
      case 'balon': case 'kutu':
        node.style.stroke = p ? rnk(p) : '';
        node.style.strokeWidth = p ? '2.6' : '';
        break;
      case 'blok':
        node.style.stroke = p ? rnk(p) : '';
        node.style.strokeWidth = p ? '3' : '';
        break;
      case 'donme':
        node.classList.toggle('doner', String(v) === 'isliyir');
        break;
      case 'kapi_yaprak': {
        const b = node.getBBox();
        node.setAttribute('transform', String(v) === 'acik'
          ? `rotate(62 ${(b.x + b.width / 2).toFixed(1)} ${(b.y + b.height / 2).toFixed(1)})` : '');
        break;
      }
      case 'ok':
        if (Number(v) < 0) {
          const b = node.getBBox();
          node.setAttribute('transform',
            `rotate(180 ${(b.x + b.width / 2).toFixed(1)} ${(b.y + b.height / 2).toFixed(1)})`);
        } else node.removeAttribute('transform');
        break;
      case 'akis': {
        const h = Number(v) || 0;
        akisFaz[id] = ((akisFaz[id] || 0) + h * 3.4) % 29;
        node.setAttribute('stroke-dashoffset', (-akisFaz[id]).toFixed(1));
        node.style.opacity = h < .12 ? '0' : String(Math.min(.85, .22 + h * .15));
        break;
      }
    }
  }

  // genel bakış kutucukları (HTML)
  document.querySelectorAll('[data-v]').forEach(el => {
    const v = deger[el.dataset.v];
    if (v === undefined) return;
    el.textContent = typeof v === 'number' ? v.toFixed(Number(el.dataset.o)) : v;
    const p = alarmPri(el.dataset.v);
    el.style.color = p ? rnk(p) : '';
  });

  if (ekran === 'alarm') alarmEkranCiz();
  if (ekran === 'trend') trendCiz();
  hedefVurgula();
}

/* ───────────────────────────────── guided modda ekipman işaretleme */
function hedefVurgula(id) {
  if (id !== undefined) hedefEkipman = id;
  document.querySelectorAll('.hedefli').forEach(n => n.classList.remove('hedefli'));
  if (!hedefEkipman) return;
  const n = $(`eq_${hedefEkipman}`) || $(`sim_${hedefEkipman}`);
  if (n) n.classList.add('hedefli');
}

/* ───────────────────────────────── alarmlar */
function alarmIstatistik(t) {
  for (const a of alarmlar) {
    if (!gorulen.has(a.id)) { gorulen.add(a.id); toplamAlarm++; alarmZaman.push(a.vaxt); }
  }
  const pen = alarmZaman.filter(v => v > t - 600).length;
  if (pen > 10 && !alarmIstatistik._f) { floodSayisi++; alarmIstatistik._f = true; }
  else if (pen <= 10) alarmIstatistik._f = false;
}

function alarmListesi(hepsi = false) {
  const liste = hepsi ? alarmlar : alarmlar.slice(0, 40);
  if (!liste.length) return '';
  return liste.map(a => `<tr class="${!a.tesdiqlendi && a.aktiv ? 'tesdiqsiz' : ''}${
    !a.aktiv ? ' pasif' : ''}">
    <td><span class="pri p${a.prioritet}">${a.prioritet}</span></td>
    <td>${a.mesaj}${a.aktiv ? '' : ' <i>(normale döndü)</i>'}
        <div class="alan-etiket">${(a.alan || '').toUpperCase()}</div></td>
    <td class="zaman">${sureBicim(a.vaxt)}</td>
    <td>${a.tesdiqlendi ? '' :
      `<button data-ack="${a.id}" style="padding:1px 7px;font-size:11px">Onayla</button>`}</td>
  </tr>`).join('');
}

function ackBagla(kok) {
  kok.querySelectorAll('[data-ack]').forEach(b =>
    b.onclick = () => gonder({ tip: 'ack', alarm_id: b.dataset.ack }));
}

function yanAlarmCiz() {
  const g = $('alarm-govde');
  g.innerHTML = alarmlar.length ? alarmListesi()
    : '<tr><td class="sessiz" style="padding:8px 4px">Aktif alarm yok.</td></tr>';
  ackBagla(g);
  $('alarm-sayi').textContent = alarmlar.filter(a => a.aktiv).length;
}

function alarmEkranCiz() {
  const el = $('alarm-ekran');
  if (!el) return;
  const t = Math.max(deger._t || 1, 1);
  const pen = Math.min(600, Math.max(60, t));
  const saat = alarmZaman.filter(v => v > t - pen).length * (3600 / pen);
  const onaysiz = alarmlar.filter(a => !a.tesdiqlendi).length;
  const ortAck = ackGecikme.length
    ? Math.round(ackGecikme.reduce((a, b) => a + b, 0) / ackGecikme.length) : null;

  el.innerHTML = el.querySelector('style').outerHTML + `
    <div class="ae-kpi">
      <div class="ae-kutu ${saat > 6 ? 'asildi' : ''}"><span>ALARM / SAAT</span>
        <b>${saat.toFixed(1)}</b><span>ISA-18.2 hedef &lt; 6</span></div>
      <div class="ae-kutu ${floodSayisi ? 'asildi' : ''}"><span>ALARM FLOOD</span>
        <b>${floodSayisi}</b><span>10 dk'da &gt; 10 alarm</span></div>
      <div class="ae-kutu ${onaysiz > 2 ? 'asildi' : ''}"><span>ONAYLANMAMIŞ</span>
        <b>${onaysiz}</b><span>bekleyen</span></div>
      <div class="ae-kutu"><span>ORT. ONAY GECİKMESİ</span>
        <b>${ortAck === null ? '—' : ortAck}</b><span>saniye</span></div>
      <div class="ae-kutu"><span>TOPLAM ALARM</span>
        <b>${toplamAlarm}</b><span>vardiya</span></div>
    </div>
    <table class="ae"><thead><tr><th>P</th><th>MESAJ</th><th>ZAMAN</th><th></th></tr></thead>
    <tbody>${alarmListesi(true) ||
      '<tr><td colspan="4" class="sessiz">Aktif alarm yok.</td></tr>'}</tbody></table>`;
  ackBagla(el);
}

function bandCiz() {
  const band = $('band');
  const akt = alarmlar.filter(a => a.aktiv)
    .sort((a, b) => a.prioritet - b.prioritet || a.vaxt - b.vaxt);
  band.className = 'band' + (akt.length ? ' p' + akt[0].prioritet : ' sakin');
  const pri = $('band-pri');
  if (!akt.length) {
    pri.hidden = true;
    $('band-mesaj').textContent = 'Aktif alarm yok.';
    $('band-zaman').textContent = '';
    return;
  }
  const a = akt[0];
  pri.hidden = false; pri.className = 'pri p' + a.prioritet; pri.textContent = a.prioritet;
  $('band-mesaj').textContent = a.mesaj +
    (akt.length > 1 ? `   (+${akt.length - 1} aktif alarm daha)` : '');
  $('band-zaman').textContent = sureBicim(a.vaxt);
}

/* ───────────────────────────────── trend */
function trendCiz() {
  const c = $('trend-cizim');
  if (!c || !trendEt) return;
  const x = c.getContext('2d'), v = trend[trendEt] || [], m = meta[trendEt] || {};
  x.clearRect(0, 0, c.width, c.height);
  const st = getComputedStyle(document.body);
  x.fillStyle = st.getPropertyValue('--kutu'); x.fillRect(0, 0, c.width, c.height);
  $('trend-not').textContent = v.length
    ? `${trendEt} · son ${v.length} sn · şu an ${v[v.length - 1]} ${m.vahid || ''}` : '';
  if (v.length < 2) return;

  const lo = m.min ?? Math.min(...v), hi = m.max ?? Math.max(...v);
  const Y = (n) => c.height - ((n - lo) / (hi - lo || 1)) * (c.height - 24) - 12;

  if (m.normal) {
    x.fillStyle = st.getPropertyValue('--panel3');
    x.fillRect(0, Y(m.normal[1]), c.width, Y(m.normal[0]) - Y(m.normal[1]));
  }
  for (const [k, p] of [['p3', 3], ['p2', 2], ['p1', 1]]) {
    if (m[k] == null) continue;
    x.strokeStyle = st.getPropertyValue(PRI[p]); x.lineWidth = 1; x.setLineDash([6, 5]);
    x.beginPath(); x.moveTo(0, Y(m[k])); x.lineTo(c.width, Y(m[k])); x.stroke();
  }
  x.setLineDash([]);
  x.strokeStyle = st.getPropertyValue('--yazi'); x.lineWidth = 2; x.beginPath();
  v.forEach((n, i) => {
    const px = (i / (TREND_N - 1)) * c.width;
    i ? x.lineTo(px, Y(n)) : x.moveTo(px, Y(n));
  });
  x.stroke();
}

/* ───────────────────────────────── mesajlar */
function mesaj(m) {
  if (!m) return;
  if (m.tip === 'init') return init(m);
  if (m.tip === 'tick') return tick(m);
  if (m.tip === 'kocluk') return koc(m);
  if (m.tip === 'bitti') return aar(m);
  if (m.tip === 'xeta') return engel(m.mesaj);
}

function init(m) {
  meta = m.etiketler || {};
  sonSenaryo = m.senaryo || {};
  $('senaryo-ad').textContent = sonSenaryo.ad || '';
  toplamAlarm = 0; floodSayisi = 0; alarmZaman = []; gorulen = new Set();
  ackGecikme = []; trend = {}; alarmlar = []; deger = {};
  Object.keys(meta).forEach(k => trend[k] = []);
  trendEt = meta['qaz.ch4.ARIN_2'] ? 'qaz.ch4.ARIN_2' : Object.keys(meta)[0];
  Egitim.gorevleriAyarla(m.gorevler || []);
  if (sonSenaryo.ekran && EKRANLAR[sonSenaryo.ekran]) ekranaGec(sonSenaryo.ekran);
  else ekranaGec(ekran);
}

function tick(m) {
  Object.assign(deger, m.deyerler);
  deger._t = m.t;
  alarmlar = m.alarmlar || [];
  $('sure').textContent = sureBicim(m.t);
  for (const e in trend) {
    const v = deger[e];
    if (typeof v === 'number') {
      trend[e].push(v);
      if (trend[e].length > TREND_N) trend[e].shift();
    }
  }
  alarmIstatistik(m.t);
  ciz(); yanAlarmCiz(); bandCiz(); kpiCiz(m.t);
  Faceplate.yenile();
  Egitim.guncelle(deger);
  if (m.engel) engel(m.engel);
}

function kpiCiz(t) {
  const pen = Math.min(600, Math.max(60, t));
  const saat = alarmZaman.filter(v => v > t - pen).length * (3600 / pen);
  $('kpi-saat').textContent = saat.toFixed(1);
  $('d-alarm').classList.toggle('asildi', saat > 6);
  $('kpi-flood').textContent = floodSayisi;
  $('d-flood').classList.toggle('asildi', floodSayisi > 0);
  $('kpi-onaysiz').textContent = alarmlar.filter(a => !a.tesdiqlendi).length;
  $('kpi-uretim').textContent = (deger['uretim.vardiya.ton'] ?? 0).toFixed
    ? deger['uretim.vardiya.ton'].toFixed(0) : '0';
}

function koc(m) {
  $('koc').className = 'kart ' + (m.seviyye || '');
  $('koc-govde').innerHTML =
    `<div class="baslik">${m.baslik || ''}</div><div class="izah">${m.izah || ''}</div>` +
    (m.tovsiye ? `<div class="tovsiye"><b>Öneri:</b> ${m.tovsiye}</div>` : '') +
    `<div class="kaynak">kaynak: ${m.kaynak === 'llm' ? 'dil modeli' : 'fizik motoru'}</div>`;
}

/** İnterlock reddi / komut hatası — alarm bandında kısa süre göster */
let engelZaman = 0;
function engel(mesaj) {
  if (!mesaj || mesaj === '-') return;
  engelZaman = Date.now();
  const b = $('band');
  b.className = 'band p2';
  $('band-pri').hidden = false;
  $('band-pri').className = 'pri p2'; $('band-pri').textContent = '⊘';
  $('band-mesaj').textContent = mesaj;
  setTimeout(() => { if (Date.now() - engelZaman >= 3800) bandCiz(); }, 4000);
}

/* ───────────────────────────────── AAR */
function aar(m) {
  const s = m.skor || {};
  const sat = (o) => `<tr><td class="zaman">${sureBicim(o.t)}</td>
    <td>${o.tip}</td><td>${o.ad}</td></tr>`;
  $('aar').innerHTML = `
    <h2>Vardiya Sonu — Değerlendirme (AAR)</h2>
    <div class="skor">${s.toplam ?? '—'} <span style="font-size:15px">/ 100</span></div>
    <table>
      <tr><th>Alarm / saat (ISA-18.2 hedef &lt;6)</th><td>${s.alarm_saatlik ?? '—'}</td></tr>
      <tr><th>Alarm flood</th><td>${s.flood_sayisi ?? '—'}</td></tr>
      <tr><th>Ortalama onay gecikmesi</th><td>${s.ort_ack_gecikme_sn ?? '—'} sn</td></tr>
      <tr><th>Doğru müdahale</th><td>${s.dogru_mudahale ?? '—'}</td></tr>
      <tr><th>Yanlış müdahale</th><td>${s.yanlis_mudahale ?? '—'}</td></tr>
      <tr><th>Kaçırılan müdahale</th><td>${s.kacirilan_mudahale ?? '—'}</td></tr>
      <tr><th>Stabilizasyon süresi</th><td>${s.stabilizasyon_sn ?? '—'} sn</td></tr>
    </table>
    <h3>Sizin hattınız</h3>
    <table>${(m.olaylar || []).map(sat).join('')}</table>
    <h3>Optimal hat</h3>
    <table>${(m.optimal || []).map(o => sat({ ...o, tip: '' })).join('')}</table>
    <div style="margin-top:16px"><button class="birincil" id="aar-kapat">Kapat</button></div>`;
  $('aar-ortu').classList.add('acik');
  $('aar-kapat').onclick = () => $('aar-ortu').classList.remove('acik');
}

/* ───────────────────────────────── bağlantı */
const wsUrl = () => `ws://${location.host || 'localhost:8000'}/ws` +
  `?sema=${sema}&mod=${Egitim.modu()}&senaryo=${senaryo}`;

function baglan() {
  rozet('BAĞLANIYOR', false);
  ws = new WebSocket(wsUrl());
  ws.onopen = () => rozet('CANLI', false);
  ws.onclose = () => { rozet('BAĞLANTI KOPTU', true); setTimeout(baglan, 2000); };
  ws.onerror = () => rozet('BAĞLANTI KOPTU', true);
  ws.onmessage = (e) => mesaj(JSON.parse(e.data));
}
function yenidenBaglan() {
  if (ws) { ws.onclose = null; ws.close(); }
  baglan();
}
function gonder(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function rozet(m, kopuk) {
  $('d-baglanti-v').textContent = m;
  $('d-baglanti').classList.toggle('kopuk', !!kopuk);
  $('d-baglanti').classList.toggle('canli', !kopuk);
}

const sureBicim = (sn) => {
  sn = Math.max(0, Math.floor(sn || 0));
  return `${String(Math.floor(sn / 60)).padStart(2, '0')}:${String(sn % 60).padStart(2, '0')}`;
};

/* ───────────────────────────────── yardım penceresi */
function yardimAc() {
  $('yardim').innerHTML = `
    <h2>RemoteOps — bu sistem nedir?</h2>
    <p><b>RemoteOps, bir yeraltı madeninin kontrol odası simülatörüdür.</b>
    Gerçek bir ocağı kontrol etmez — sizi o ocağı yönetecek operatör olarak yetiştirir
    ve yetkinliğinizi ölçer. Uçuş simülatörü uçağı uçurmaz, pilotu yetiştirir.</p>

    <h3>Neyi yönetiyorsunuz?</h3>
    <table>
      <tr><th>ALAN 10 — Havalandırma</th><td>Ocağa temiz hava basar, kirli havayı atar.
        Arınlara yeterli hava gitmezse metan birikir. En kritik sistem budur.</td></tr>
      <tr><th>ALAN 30 — Cevher hattı</th><td>Cevheri kırıp yüzeye taşınacak hale getirir.
        Ekipmanlar interlock ile bağlıdır; yanlış sırada başlatılamaz.</td></tr>
      <tr><th>ALAN 40 — Su atma</th><td>Ocağa sızan suyu toplayıp yüzeye basar.
        Sump taşarsa alt katlar su altında kalır.</td></tr>
    </table>

    <h3>Nasıl kullanılır?</h3>
    <p>Şemadaki <b>herhangi bir ekipmana tıklayın</b> — faceplate açılır: durum, canlı
    ölçümler, <b>çalışma izni (interlock)</b> ve komut düğmesi. Komutun sonucu ne olacak,
    panelde yazar.</p>

    <h3>Eğitim modları</h3>
    <table>
      <tr><th>Rehberli</th><td>Her adım sırayla gösterilir, ekipman işaretlenir.</td></tr>
      <tr><th>İpuçlu</th><td>Görev verilir; takılırsanız ipucu düğmesi adımı açar.</td></tr>
      <tr><th>Bağımsız</th><td>Sadece görev söylenir; adımları siz belirlersiniz.</td></tr>
      <tr><th>Sınav</th><td>Hiç yönlendirme yok. Gerçek operatör deneyimi.</td></tr>
    </table>

    <h3>Nasıl puanlanıyorsunuz?</h3>
    <p>ANSI/ISA-18.2'ye göre: saatlik alarm yükü (hedef &lt;6), alarm flood, onay
    gecikmesi, doğru müdahale ve stabilizasyon süresi.
    <b>Alarmı onaylamak, müdahale etmek değildir</b> — sistem ikisini ayırır.</p>

    <div style="margin-top:16px"><button class="birincil" id="yardim-kapat">Anladım</button></div>`;
  $('yardim-ortu').classList.add('acik');
  $('yardim-kapat').onclick = () => $('yardim-ortu').classList.remove('acik');
}

/* ───────────────────────────────── başlat */
async function basla() {
  try {
    if (localStorage.getItem('tema') === 'acik')
      document.body.className = 'tema-acik';
  } catch (e) {}

  // şebeke tanımı (havalandırma şeması bundan üretilir)
  try {
    window._sebekeTanim = await fetch(`api/sebeke/${sema}`).then(r => r.json());
  } catch (e) { window._sebekeTanim = null; }

  // senaryo listesi
  try {
    const liste = await fetch('api/senaryolar').then(r => r.json());
    $('senaryo-sec').innerHTML = liste.map(s =>
      `<option value="${s.id}">${s.id} · ${s.ad}</option>`).join('');
    $('senaryo-sec').value = senaryo;
    $('senaryo-sec').onchange = () => {
      senaryo = $('senaryo-sec').value;
      gonder({ tip: 'senaryo', emr: 'basla', id: senaryo, mod: Egitim.modu() });
    };
  } catch (e) {}

  Faceplate.kur({
    gonder, veri: () => deger, alarmPri,
    interlock: (ad) => {
      const izin = deger[`interlock.${ad}.izin`];
      if (izin === undefined) return null;
      return { izin: !!izin, sebep: izin ? '' : deger[`interlock.${ad}.sebep`] };
    },
  });

  Egitim.kur({
    vurgula: hedefVurgula,
    ekranaGec,
    modDegisti: () => gonder({ tip: 'senaryo', emr: 'basla', id: senaryo, mod: Egitim.modu() }),
  });
  $('kart-mod').textContent = Egitim.MODLAR[Egitim.modu()].ad;
  $('mod-sec').addEventListener('change', () => {
    $('kart-mod').textContent = Egitim.MODLAR[Egitim.modu()].ad;
  });

  // olaylar
  $('btn-ack').onclick = () => {
    const a = alarmlar.filter(x => x.aktiv && !x.tesdiqlendi)
      .sort((x, y) => x.prioritet - y.prioritet)[0];
    if (a) gonder({ tip: 'ack', alarm_id: a.id });
  };
  $('btn-ack-tum').onclick = () => gonder({ tip: 'ack', alarm_id: '*' });
  $('btn-reset').onclick = () =>
    gonder({ tip: 'senaryo', emr: 'sifirla', id: senaryo, mod: Egitim.modu() });
  $('btn-bilgi').onclick = () => { $('bilgi').hidden = !$('bilgi').hidden; };
  $('btn-yardim').onclick = yardimAc;
  $('btn-tema').onclick = () => {
    const koyu = document.body.classList.toggle('tema-koyu');
    document.body.classList.toggle('tema-acik', !koyu);
    try { localStorage.setItem('tema', koyu ? 'koyu' : 'acik'); } catch (e) {}
    ciz();
  };
  document.querySelectorAll('.ortu').forEach(o =>
    o.onclick = e => { if (e.target === o) o.classList.remove('acik'); });
  setInterval(() => { $('d-saat').textContent = new Date().toLocaleString('tr-TR'); }, 1000);

  ekranaGec('genel');
  baglan();

  // ilk açılışta sistemi tanıt
  try {
    if (!localStorage.getItem('tanitildi')) {
      yardimAc(); $('bilgi').hidden = false;
      localStorage.setItem('tanitildi', '1');
    }
  } catch (e) {}
}

basla().catch(e => {
  document.body.insertAdjacentHTML('afterbegin',
    `<div style="padding:12px;background:#FF35C8;color:#fff">Yükleme hatası: ${e.message}
     <br><small>Sunucu ile açın: <code>python -m uvicorn server.main:app --port 8000</code></small></div>`);
});
