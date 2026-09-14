/* RemoteOps — kontrol odasi arayuzu
 *
 * Mimari:  SVG (sema)  +  ocak1.map.json (baglanti)  +  motor (etiketler)
 * Bu dosya SEMAYI BILMEZ. Sadece map.json'u okur.
 * Yeni bir sirket icin: yeni SVG + yeni map.json. BU DOSYA DEGISMEZ.
 *
 * MOCK: backend hazir degilse web/mock/*.json'dan oynatir.
 */
'use strict';

// ---------------------------------------------------------------- ayarlar
const MOCK = !location.port || location.port === '5500';   // 8000 = FastAPI
const wsUrl = () => `ws://${location.host || 'localhost:8000'}/ws?sema=${SEMA_ID}`;
let SEMA_ID = new URLSearchParams(location.search).get('sema') || 'ocak1';
const TREND_UZUNLUK = 300;

const PRI_RENK = { 1: '#FF0000', 2: '#FFA500', 3: '#FFFF00', 4: '#FF00FF' };

// ---------------------------------------------------------------- durum
let harita = null;          // map.json
let etiketBilgi = {};       // init.etiketler
let sonDeger = {};
let alarmlar = [];
let trendVeri = {};         // etiket -> [deger]
let trendEtiket = null;
let baslangicZaman = 0;
let toplamAlarm = 0, floodSayisi = 0, ackGecikmeleri = [];
let alarmZamanlari = [];    // flood hesabi icin
let gorulenAlarm = new Set();
let ws = null;
let akisFaz = {};           // akis oku animasyon fazi (kol -> piksel)

const $ = (id) => document.getElementById(id);

/** Bir SVG grubunun gorsel merkezi — ok dondurmek icin */
function okMerkez(node) {
  try { const b = node.getBBox(); return [(b.x + b.width / 2).toFixed(1),
                                          (b.y + b.height / 2).toFixed(1)]; }
  catch (e) { return [0, 0]; }
}

// ---------------------------------------------------------------- yukleme
async function sebekeYukle(id) {
  // Once API, yoksa statik kopya (mock modu)
  for (const u of [`api/sebeke/${id}`, `mock/sebeke_${id}.json`]) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const v = await r.json();
      if (v && v.dugumler) return v;
    } catch (e) { /* sonrakini dene */ }
  }
  throw new Error(`Sebeke yuklenemedi: ${id}`);
}

/** Semayi sebeke tanimindan URETIR. El ile SVG/map.json gerekmez. */
async function semaKur(id) {
  const sb = await sebekeYukle(id);
  const uret = RemoteOpsSema.semaUret(sb);
  $('sema').innerHTML = uret.svg;
  harita = { elemanlar: uret.baglanti, tiklanabilir: uret.tiklanabilir };
  akisFaz = {};
  $('sema-baslik').textContent = (sb.ad || id).toUpperCase();
  fpKapat();
  tiklamalariBagla();
}

async function semaListesi() {
  const sec = $('sema-sec');
  if (!sec) return;
  try {
    const liste = await fetch('api/semalar').then(r => r.json());
    sec.innerHTML = '';
    liste.forEach(s => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = `${s.ad}  (${s.dugum} dugum / ${s.kol} kol)`;
      sec.appendChild(o);
    });
    sec.value = SEMA_ID;
    sec.onchange = async () => {
      SEMA_ID = sec.value;
      await semaKur(SEMA_ID);
      // Simulasyon da ayni aga gecmeli - baglantiyi yenile
      if (ws) { ws.onclose = null; ws.close(); }
      sonDeger = {}; alarmlar = [];
      if (!MOCK) wsBasla();
    };
  } catch (e) { sec.style.display = 'none'; }
}

async function basla() {
  try {
    if (localStorage.getItem('tema') === 'acik') {
      document.body.classList.remove('tema-koyu');
      document.body.classList.add('tema-acik');
    }
  } catch (e) {}
  await semaKur(SEMA_ID);
  olaylariBagla();
  semaListesi();
  if (MOCK) await mockBasla();
  else wsBasla();
}

// ---------------------------------------------------------------- baglanti
function wsBasla() {
  rozet('BAGLANIYOR', false);
  ws = new WebSocket(wsUrl());
  ws.onopen = () => rozet('CANLI', false);
  ws.onclose = () => { rozet('BAGLANTI KOPTU', true); setTimeout(wsBasla, 2000); };
  ws.onerror = () => rozet('BAGLANTI KOPTU', true);
  ws.onmessage = (e) => mesaj(JSON.parse(e.data));
}

async function mockBasla() {
  rozet('MOCK VERI', false);
  const [init, ticks] = await Promise.all([
    fetch('mock/init_ornek.json').then(r => r.json()),
    fetch('mock/tick_ornek.json').then(r => r.json()),
  ]);
  mesaj(init);
  let i = 0;
  setInterval(() => { mesaj(ticks[i]); i = (i + 1) % ticks.length; }, 1000);
}

function gonder(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  else console.info('[mock] gonderilecekti:', obj);
}

function rozet(metin, kopuk) {
  $('d-baglanti-v').textContent = metin;
  const el = $('d-baglanti');
  el.classList.toggle('kopuk', !!kopuk);
  el.classList.toggle('canli', !kopuk);
}

// ---------------------------------------------------------------- mesajlar
function mesaj(m) {
  if (!m) return;
  if (m.tip === 'init') return init(m);
  if (m.tip === 'tick') return tick(m);
  if (m.tip === 'kocluk') return koc(m);
  if (m.tip === 'bitti') return aarGoster(m);
  if (m.tip === 'xeta') console.warn('Sunucu hatasi:', m.mesaj);
}

function init(m) {
  etiketBilgi = m.etiketler || {};
  $('senaryo-ad').textContent = m.senaryo ? m.senaryo.ad : '';
  baslangicZaman = 0;
  toplamAlarm = 0; floodSayisi = 0; ackGecikmeleri = [];
  alarmZamanlari = []; gorulenAlarm = new Set(); trendVeri = {};

  const sec = $('trend-sec');
  sec.innerHTML = '';
  Object.keys(etiketBilgi).forEach(e => {
    trendVeri[e] = [];
    const o = document.createElement('option');
    o.value = e; o.textContent = `${e}  (${etiketBilgi[e].vahid || ''})`;
    sec.appendChild(o);
  });
  trendEtiket = sec.value = 'qaz.ch4.ARIN_2' in etiketBilgi
    ? 'qaz.ch4.ARIN_2' : Object.keys(etiketBilgi)[0];
}

function tick(m) {
  Object.assign(sonDeger, m.deyerler);
  alarmlar = m.alarmlar || [];
  $('sure').textContent = sureBicim(m.t);

  for (const e in trendVeri) {
    if (e in sonDeger && typeof sonDeger[e] === 'number') {
      trendVeri[e].push(sonDeger[e]);
      if (trendVeri[e].length > TREND_UZUNLUK) trendVeri[e].shift();
    }
  }
  alarmIstatistik(m.t);
  semaCiz();
  alarmListesiCiz();
  bandCiz();
  fpYenile();
  kpiCiz(m.t);
  trendCiz();
}

// ---------------------------------------------------------------- sema
function alarmPri(etiket) {
  let en = 0;
  for (const a of alarmlar)
    if (a.etiket === etiket && a.aktiv)
      en = (en === 0) ? a.prioritet : Math.min(en, a.prioritet);
  return en;
}

/** Uretec 'etiket', elle yazilan map.json 'baglanti' alanini kullanir. */
const etiketAl = (cfg) => cfg.baglanti || cfg.etiket;

function semaCiz() {
  const el = harita.elemanlar;
  for (const id in el) {
    const cfg = el[id];
    const node = document.getElementById(id);
    if (!node || !cfg.tip) continue;
    const et = etiketAl(cfg);
    const v = sonDeger[et];
    if (v === undefined) continue;
    const pri = alarmPri(et);

    if (cfg.tip === 'deger') {
      node.textContent = ((typeof v === 'number')
        ? v.toFixed(cfg.ondalik ?? 1) : v) + (cfg.sonek || '');
      node.style.fill = pri ? PRI_RENK[pri] : '';
      node.style.fontWeight = pri ? '700' : '600';

    } else if (cfg.tip === 'durum') {
      node.textContent = String(v).toUpperCase();
      node.style.fill = pri ? PRI_RENK[pri] : '';

    } else if (cfg.tip === 'bar') {
      const oran = Math.max(0, Math.min(1,
        (Number(v) - cfg.min) / (cfg.max - cfg.min)));
      node.setAttribute('width', (oran * cfg.genislik).toFixed(1));
      node.style.fill = pri ? PRI_RENK[pri] : '';

    } else if (cfg.tip === 'govde') {
      const dolu = cfg.esik !== undefined
        ? Number(v) < cfg.esik                       // tenzim: kisikken dolu
        : (cfg.dolu_durumlar || []).includes(String(v));
      node.style.fill = pri ? PRI_RENK[pri] : (dolu ? '#6E6E6E' : '#FFFFFF');

    } else if (cfg.tip === 'blok') {
      // arin blogu: alarm varsa cerceve rengi degisir
      node.style.stroke = pri ? PRI_RENK[pri] : '#404040';
      node.style.strokeWidth = pri ? '3' : '1.8';

    } else if (cfg.tip === 'balon') {
      node.style.stroke = pri ? PRI_RENK[pri] : '#404040';
      node.style.strokeWidth = pri ? '3' : '1.5';

    } else if (cfg.tip === 'ok') {
      // MSHA: akis yonu oku. Debi ters aktiginda ok 180 donmeli.
      if (Number(v) < 0) node.setAttribute('transform',
        `rotate(180 ${okMerkez(node).join(' ')})`);
      else node.removeAttribute('transform');

    } else if (cfg.tip === 'donme') {
      // fan calisiyorsa kanatlar doner
      node.classList.toggle('doner', String(v) === 'isliyir');

    } else if (cfg.tip === 'kapi_yaprak') {
      // acik kapi yapragi acili durur (maden harita gelenegi)
      const k = node.getBBox();
      node.setAttribute('transform', String(v) === 'acik'
        ? `rotate(62 ${(k.x + k.width / 2).toFixed(1)} ${(k.y + k.height / 2).toFixed(1)})`
        : '');

    } else if (cfg.tip === 'seviye') {
      // tank dolgusu: yuzde -> yukseklik (asagidan yukari)
      const o = Math.max(0, Math.min(1, Number(v) / 100));
      node.setAttribute('height', (cfg.h * o).toFixed(1));
      node.setAttribute('y', (cfg.y + cfg.h * (1 - o)).toFixed(1));
      node.style.fill = pri ? PRI_RENK[pri] : '';

    } else if (cfg.tip === 'kutu') {
      node.style.stroke = pri ? PRI_RENK[pri] : '';
      node.style.strokeWidth = pri ? '2.4' : '';

    } else if (cfg.tip === 'akis') {
      // akis oku animasyonu: hiz kadar ilerle, yon isaretine gore
      const hiz = Number(v) || 0;
      const yon = Number(sonDeger[et.replace('.hiz', '.yon')]) || 1;
      akisFaz[id] = ((akisFaz[id] || 0) + hiz * 3.2 * yon) % 26;
      node.setAttribute('stroke-dashoffset', (-akisFaz[id]).toFixed(1));
      node.style.opacity = hiz < 0.15 ? '0' : String(Math.min(0.9, 0.25 + hiz * 0.16));
    }
  }

}

// ---------------------------------------------------------------- tiklama
let fpAktif = null;          // acik faceplate'in konfigurasyonu

function tiklamalariBagla() {
  const el = harita.tiklanabilir || {};
  for (const id in el) {
    const cfg = el[id];
    const node = document.getElementById(id);
    if (!node) continue;
    node.dataset.tiklanabilir = '1';
    node.addEventListener('click', (e) => { e.stopPropagation(); fpAc(id, cfg, node); });
  }
}

/* ---------------------------------------------------------------- faceplate
 * Gercek SCADA native confirm()/prompt() kullanmaz — ekipman faceplate'i acar.
 * Ayrica gomulu tarayicilarda native dialoglar BLOKELI olabilir
 * (confirm() dialog gostermeden false doner) => komutlar sessizce kaybolur.
 */
function fpAc(id, cfg, node) {
  fpAktif = cfg;
  $('fp-ad').textContent = cfg.etiket || cfg.hedef;
  $('fp-etiket').textContent = cfg.hedef;

  // konum: ekipmanin yaninda, ekran disina tasmadan
  const r = node.getBoundingClientRect();
  const fp = $('fp');
  fp.hidden = false;
  const g = fp.getBoundingClientRect();
  let x = r.right + 12, y = r.top - 10;
  if (x + g.width > innerWidth - 8) x = r.left - g.width - 12;
  if (x < 8) x = 8;
  y = Math.max(8, Math.min(y, innerHeight - g.height - 8));
  fp.style.left = x + 'px';
  fp.style.top = y + 'px';

  fpYenile();
}

function fpKapat() { fpAktif = null; $('fp').hidden = true; }

/** Faceplate icerigini canli degerlerle tazeler (her tick cagrilir). */
function fpYenile() {
  if (!fpAktif) return;
  const cfg = fpAktif;
  const durum = sonDeger[etiketAl(cfg)];
  $('fp-durum').textContent = durum === undefined ? '—' : String(durum).toUpperCase();

  // ilgili olcumler
  const onek = cfg.hedef.split('.').slice(-1)[0];
  const satir = [];
  for (const e in sonDeger) {
    if (!e.includes(onek) || typeof sonDeger[e] !== 'number') continue;
    if (e.endsWith('.yon')) continue;
    const ad = e.split('.').slice(-1)[0];
    satir.push(`<div class="fp-satir${alarmPri(e) ? ' alarm' : ''}">
      <span>${ad}</span><b>${sonDeger[e]}</b></div>`);
    if (satir.length >= 5) break;
  }
  $('fp-olcum').innerHTML = satir.join('');

  // ayarlanabilir eleman (tenzim) -> kaydirici
  const giris = $('fp-giris');
  if (cfg.emr === 'ayarla') {
    giris.hidden = false;
    $('fp-giris-et').textContent = cfg.etiket;
    const d = $('fp-deger');
    d.min = cfg.giris.min; d.max = cfg.giris.max;
    if (document.activeElement !== d) d.value = Number(durum) || 0;
    $('fp-deger-v').textContent = d.value;
    d.oninput = () => { $('fp-deger-v').textContent = d.value; };
    $('fp-emirler').innerHTML = '<button class="birincil" data-e="ayarla">UYGULA</button>';
  } else {
    giris.hidden = true;
    const emr = (cfg.emirler || {})[String(durum)];
    if (!emr) { $('fp-emirler').innerHTML =
      '<span style="color:var(--yazi-dim)">Bu durumda komut yok.</span>'; }
    else {
      const tehlike = ['dayandir', 'ac'].includes(emr);
      $('fp-emirler').innerHTML =
        `<button class="${tehlike ? 'tehlikeli' : 'birincil'}" data-e="${emr}">
           ${emr.toUpperCase()}</button>`;
    }
  }

  // uyari metni — operatore sonucu hatirlat
  const u = $('fp-uyari');
  const uyari = {
    dayandir: 'Ana fan durursa tüm ocakta hava akışı durur ve metan birikmeye başlar.',
    ac: 'Hava kapısı açılırsa hava arınlara uğramadan kısa devre yapar.',
  }[(cfg.emirler || {})[String(durum)]] || '';
  u.hidden = !uyari; u.textContent = uyari;

  $('fp-emirler').querySelectorAll('button').forEach(b => b.onclick = () => {
    if (b.dataset.e === 'ayarla')
      gonder({ tip: 'emr', hedef: cfg.hedef, emr: 'ayarla', deyer: Number($('fp-deger').value) });
    else
      gonder({ tip: 'emr', hedef: cfg.hedef, emr: b.dataset.e });
    fpKapat();
  });
}

function olaylariBagla() {
  $('btn-ack').onclick = () => {
    const a = alarmlar.filter(x => x.aktiv && !x.tesdiqlendi)
      .sort((x, y) => x.prioritet - y.prioritet)[0];
    if (a) gonder({ tip: 'ack', alarm_id: a.id });
  };
  $('btn-ack-tum').onclick = () => gonder({ tip: 'ack', alarm_id: '*' });
  $('btn-tema').onclick = () => {
    const k = document.body.classList.toggle('tema-koyu');
    document.body.classList.toggle('tema-acik', !k);
    try { localStorage.setItem('tema', k ? 'koyu' : 'acik'); } catch (e) {}
  };
  setInterval(() => {
    $('d-saat').textContent = new Date().toLocaleString('tr-TR');
  }, 1000);
  $('btn-reset').onclick = () => gonder({ tip: 'senaryo', emr: 'sifirla' });
  $('fp-kapat').onclick = fpKapat;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fpKapat(); });
  document.querySelector('.proses').addEventListener('click', e => {
    if (!e.target.closest('[data-tiklanabilir]')) fpKapat();
  });
  $('trend-sec').onchange = (e) => { trendEtiket = e.target.value; trendCiz(); };
  document.querySelectorAll('.serit button').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.serit button').forEach(x => x.classList.remove('aktif'));
      b.classList.add('aktif');
      alanUygula(b.dataset.alan);
    };
  });
  $('aar-ortu').onclick = (e) => {
    if (e.target.id === 'aar-ortu') $('aar-ortu').classList.remove('acik');
  };
}

/** Navigasyon bandi: hangi katmanlarin one cikacagini belirler.
 *  Sabit navigasyon + tutarli yerlesim (ISO 11064 / ISA-101). */
function alanUygula(alan) {
  const svg = document.querySelector('#sema svg');
  if (!svg) return;
  const soluk = (sec, s) => svg.querySelectorAll(sec)
    .forEach(n => n.style.opacity = s);
  soluk('#kat-olcum .olcum', '1');
  soluk('#kat-kanal .kanal', '1');
  if (alan === 'gaz') {
    svg.querySelectorAll('#kat-olcum .olcum').forEach(g => {
      const fn = g.querySelector('.ol-fn');
      g.style.opacity = (fn && fn.textContent === 'AT') ? '1' : '.28';
    });
  } else if (alan === 'hava') {
    svg.querySelectorAll('#kat-olcum .olcum').forEach(g => {
      const fn = g.querySelector('.ol-fn');
      g.style.opacity = (fn && ['FT', 'PT', 'HC'].includes(fn.textContent)) ? '1' : '.28';
    });
  }
}

// ---------------------------------------------------------------- alarmlar
function alarmIstatistik(t) {
  for (const a of alarmlar) {
    if (!gorulenAlarm.has(a.id)) {
      gorulenAlarm.add(a.id);
      toplamAlarm++;
      alarmZamanlari.push(a.vaxt);
    }
  }
  // ISA-18.2: 10 dakikada > 10 alarm = alarm flood
  const pencere = alarmZamanlari.filter(v => v > t - 600).length;
  if (pencere > 10 && !alarmIstatistik._floodAktif) {
    floodSayisi++; alarmIstatistik._floodAktif = true;
  } else if (pencere <= 10) {
    alarmIstatistik._floodAktif = false;
  }
}

function alarmListesiCiz() {
  const g = $('alarm-govde');
  g.innerHTML = '';
  if (!alarmlar.length) {
    g.innerHTML = '<tr><td colspan="4" style="color:var(--yazi-soluk);' +
                  'padding:8px 4px">Aktif alarm yok.</td></tr>';
    return;
  }
  for (const a of alarmlar) {
    const tr = document.createElement('tr');
    if (!a.tesdiqlendi && a.aktiv) tr.className = 'tesdiqsiz';
    if (!a.aktiv) tr.className = 'pasif';
    tr.innerHTML =
      `<td><span class="pri p${a.prioritet}">${a.prioritet}</span></td>` +
      `<td>${a.mesaj}${a.aktiv ? '' : ' <i>(normale dondu)</i>'}</td>` +
      `<td class="zaman">${sureBicim(a.vaxt)}</td><td></td>`;
    if (!a.tesdiqlendi) {
      const b = document.createElement('button');
      b.textContent = 'Onayla';
      b.style.padding = '1px 6px'; b.style.fontSize = '11px';
      b.onclick = () => gonder({ tip: 'ack', alarm_id: a.id });
      tr.lastElementChild.appendChild(b);
    }
    g.appendChild(tr);
  }
}

/** Her zaman gorunur alarm bandi: en yuksek oncelikli aktif alarm */
function bandCiz() {
  const band = $('band');
  const aktif = alarmlar.filter(a => a.aktiv)
    .sort((a, b) => a.prioritet - b.prioritet || a.vaxt - b.vaxt);
  band.className = 'band' + (aktif.length ? ' p' + aktif[0].prioritet : ' sakin');
  const pri = $('band-pri');
  if (!aktif.length) {
    pri.style.visibility = 'hidden';
    $('band-mesaj').textContent = 'Aktif alarm yok.';
    $('band-zaman').textContent = '';
    return;
  }
  const a = aktif[0];
  pri.style.visibility = '';
  pri.className = 'pri p' + a.prioritet;
  pri.textContent = a.prioritet;
  $('band-mesaj').textContent = a.mesaj +
    (aktif.length > 1 ? `   (+${aktif.length - 1} aktif alarm daha)` : '');
  $('band-zaman').textContent = sureBicim(a.vaxt);
}

function kpiCiz(t) {
  // ISA-18.2: surusen 10 dk pencere -> saatlik hiz (x6).
  // Pencere henuz dolmadiysa gecen sureye gore olceklenir, ama
  // en az 60 sn'lik taban kullanilir ki ilk saniyelerde absurd deger cikmasin.
  const pencereSn = Math.min(600, Math.max(60, t));
  const pencereAdet = alarmZamanlari.filter(v => v > t - pencereSn).length;
  const saat = pencereAdet * (3600 / pencereSn);
  $('kpi-saat').textContent = saat.toFixed(1);
  $('d-alarm').classList.toggle('asildi', saat > 6);
  $('kpi-flood').textContent = floodSayisi;
  $('d-flood').classList.toggle('asildi', floodSayisi > 0);
  $('kpi-toplam').textContent = toplamAlarm;
  const onaysiz = alarmlar.filter(a => !a.tesdiqlendi).length;
  $('kpi-onaysiz').textContent = onaysiz;
  $('kpi-onaysiz').parentElement.classList.toggle('asildi', onaysiz > 2);
  $('kpi-ack').textContent = ackGecikmeleri.length
    ? Math.round(ackGecikmeleri.reduce((a, b) => a + b, 0) / ackGecikmeleri.length) + ' sn'
    : '—';
}

// ---------------------------------------------------------------- koc
function koc(m) {
  const k = $('koc');
  k.className = 'panel ' + (m.seviyye || '');
  $('koc-govde').innerHTML =
    `<div class="baslik">${m.baslik || ''}</div><div>${m.izah || ''}</div>` +
    (m.tovsiye ? `<div class="tovsiye"><b>Oneri:</b> ${m.tovsiye}</div>` : '') +
    `<div class="kaynak">kaynak: ${m.kaynak === 'llm' ? 'dil modeli' : 'fizik motoru'}</div>`;
}

// ---------------------------------------------------------------- trend
function trendCiz() {
  const c = $('trend-cizim'), x = c.getContext('2d');
  const veri = trendVeri[trendEtiket] || [];
  const bilgi = etiketBilgi[trendEtiket] || {};
  x.clearRect(0, 0, c.width, c.height);
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  if (veri.length < 2) return;

  const enAz = bilgi.min ?? Math.min(...veri);
  const enCok = bilgi.max ?? Math.max(...veri);
  const Y = (v) => c.height - ((v - enAz) / (enCok - enAz || 1)) * (c.height - 8) - 4;

  // normal calisma bandi (gri) — ISA-101
  if (bilgi.normal) {
    x.fillStyle = '#E6E6E6';
    x.fillRect(0, Y(bilgi.normal[1]), c.width, Y(bilgi.normal[0]) - Y(bilgi.normal[1]));
  }
  // alarm esikleri
  for (const [alan, pri] of [['p3', 3], ['p2', 2], ['p1', 1]]) {
    if (bilgi[alan] == null) continue;
    x.strokeStyle = PRI_RENK[pri]; x.lineWidth = 1; x.setLineDash([5, 4]);
    x.beginPath(); x.moveTo(0, Y(bilgi[alan])); x.lineTo(c.width, Y(bilgi[alan])); x.stroke();
  }
  x.setLineDash([]);
  // egri
  x.strokeStyle = '#1A1A1A'; x.lineWidth = 1.8; x.beginPath();
  veri.forEach((v, i) => {
    const px = (i / (TREND_UZUNLUK - 1)) * c.width;
    i ? x.lineTo(px, Y(v)) : x.moveTo(px, Y(v));
  });
  x.stroke();
  x.fillStyle = '#555'; x.font = '11px system-ui';
  x.fillText(`${veri[veri.length - 1].toFixed(2)} ${bilgi.vahid || ''}`, 6, 13);
}

// ---------------------------------------------------------------- AAR
function aarGoster(m) {
  const s = m.skor || {};
  const satir = (o) => `<tr><td class="zaman">${sureBicim(o.t)}</td>` +
    `<td>${o.tip}</td><td>${o.ad}</td></tr>`;
  $('aar').innerHTML = `
    <h2>Senaryo Sonu — Degerlendirme (AAR)</h2>
    <div class="skor">${s.toplam ?? '—'} <span style="font-size:14px">/ 100</span></div>
    <table>
      <tr><th>Alarm / saat (ISA-18.2 hedef &lt;6)</th><td>${s.alarm_saatlik ?? '—'}</td></tr>
      <tr><th>Alarm flood sayisi</th><td>${s.flood_sayisi ?? '—'}</td></tr>
      <tr><th>Ortalama onay gecikmesi</th><td>${s.ort_ack_gecikme_sn ?? '—'} sn</td></tr>
      <tr><th>Dogru mudahale</th><td>${s.dogru_mudahale ?? '—'}</td></tr>
      <tr><th>Yanlis mudahale</th><td>${s.yanlis_mudahale ?? '—'}</td></tr>
      <tr><th>Kacirilan mudahale</th><td>${s.kacirilan_mudahale ?? '—'}</td></tr>
      <tr><th>Stabilizasyon suresi</th><td>${s.stabilizasyon_sn ?? '—'} sn</td></tr>
    </table>
    <h3 style="font-size:13px;margin:12px 0 4px">Sizin hattiniz</h3>
    <table><tr><th>Zaman</th><th>Tip</th><th>Olay</th></tr>
      ${(m.olaylar || []).map(satir).join('')}</table>
    <h3 style="font-size:13px;margin:12px 0 4px">Optimal hat</h3>
    <table><tr><th>Zaman</th><th></th><th>Beklenen islem</th></tr>
      ${(m.optimal || []).map(o => satir({ ...o, tip: '' })).join('')}</table>
    <div style="margin-top:14px"><button onclick="document.getElementById('aar-ortu')
      .classList.remove('acik')">Kapat</button></div>`;
  $('aar-ortu').classList.add('acik');
}

// ---------------------------------------------------------------- yardimci
function sureBicim(sn) {
  sn = Math.max(0, Math.floor(sn || 0));
  return `${String(Math.floor(sn / 60)).padStart(2, '0')}:${String(sn % 60).padStart(2, '0')}`;
}

basla().catch(e => {
  console.error(e);
  document.body.insertAdjacentHTML('afterbegin',
    `<div style="padding:10px;background:#FF00FF;color:#fff">Yukleme hatasi: ${e.message}
     <br><small>index.html'i dogrudan acmayin. Calistirin:
     <code>python -m http.server 5500 --directory web</code></small></div>`);
});
