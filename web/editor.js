/* RemoteOps — Sema Editoru
 *
 * Kullanici kendi ventilasyon agini cizer. Cikti, motorun dogrudan okudugu
 * sebeke JSON'udur. SVG ve etiket eslemesi OTOMATIK uretilir (sema_ciz.js).
 *
 * Atkinson direnci:  R = k * Per * L / A^3      [N*s^2/m^8]
 *   k  = surtunme faktoru (kg/m^3): betonlu kuyu 0.004, kayac galeri 0.012, arin 0.016
 *   Per= cevre (dikdortgen kesit varsayimi, en/boy ~1.3)
 */
'use strict';

const IZGARA = 20;
const K_VARSAYILAN = { kuyu: 0.004, kuyu_fan: 0.004, galeri: 0.012, arin: 0.016,
                       kapi: 0.012, tenzim: 0.012, sizinti: 0.020 };
const A_VARSAYILAN = { kuyu: 19.6, kuyu_fan: 19.6, galeri: 14.0, arin: 7.5,
                       kapi: 9.0, tenzim: 10.0, sizinti: 1.0 };
const L_VARSAYILAN = { kuyu: 300, kuyu_fan: 300, galeri: 400, arin: 160,
                       kapi: 40, tenzim: 250, sizinti: 30 };

const $ = (id) => document.getElementById(id);
const kanvas = $('kanvas');

let ag = bosAg();
let mod = 'sec';
let secili = null;            // {tip:'dugum'|'kol', id}
let kolBasi = null;           // kol cizerken ilk dugum
let surukle = null;

/* ---------------------------------------------------------------- model */

function bosAg() {
  return {
    ad: 'Yeni Ocak', aciklama: 'Editorde olusturuldu.', versiya: '1.0',
    birimler: { R: 'N*s^2/m^8 (Atkinson direnci)', Q: 'm^3/s', P: 'Pa', A: 'm^2', L: 'm' },
    cizim: { genislik: 1020, yukseklik: 620 },
    dugumler: [{ id: 'N0', ad: 'Yuzey / Atmosfer', x: 500, y: 60, tip: 'atmosfer' }],
    kollar: [], gaz_kaynaklari: [],
    esikler: { ch4: { p3: 1.0, p2: 1.5, p1: 2.0, birim: '%' },
               o2: { p1_alt: 19.0, birim: '%' },
               co: { p2: 30, p1: 50, birim: 'ppm' },
               arin_min_hiz: { deger: 0.5, birim: 'm/s' } },
  };
}

function yeniDugumId() {
  let i = 0;
  while (ag.dugumler.some(d => d.id === `N${i}`)) i++;
  return `N${i}`;
}
function yeniKolId() {
  let i = 1;
  const p = (n) => `B${String(n).padStart(2, '0')}`;
  while (ag.kollar.some(k => k.id === p(i))) i++;
  return p(i);
}
const dugumBul = (id) => ag.dugumler.find(d => d.id === id);
const kolBul = (id) => ag.kollar.find(k => k.id === id);

/** Atkinson: R = k*Per*L/A^3, dikdortgen kesit (en/boy ~1.3) */
function atkinsonR(A, L, k) {
  const en = Math.sqrt(1.3 * A), boy = A / en;
  const per = 2 * (en + boy);
  return k * per * L / Math.pow(A, 3);
}

function kolOlustur(tip, a, b) {
  const A = A_VARSAYILAN[tip], L = L_VARSAYILAN[tip], kf = K_VARSAYILAN[tip];
  const id = yeniKolId();
  const kol = { id, ad: adOner(tip, id), from: a, to: b, A, L, k: kf,
                R: +atkinsonR(A, L, kf).toFixed(4), tip: tip === 'kuyu_fan' ? 'kuyu' : tip };

  if (tip === 'kuyu_fan') {
    kol.fan = { id: 'ana_1', ad: 'Ana fan', p0: 3000.0, k: 0.0826,
                aciklama: 'P_fan = p0 - k*Q^2 (Pa)' };
  }
  if (tip === 'kapi') {
    const no = ag.kollar.filter(x => x.kapi).length + 1;
    kol.R = 5000.0;
    kol.kapi = { id: `QAPI_${no}`, acik_R: 0.05, bagli_R: 5000.0, varsayilan: 'bagli' };
  }
  if (tip === 'tenzim') {
    const no = ag.kollar.filter(x => x.tenzim).length + 1;
    kol.tenzim = { id: `T${no}`, min_R: +kol.R.toFixed(3), max_R: 12.0,
                   varsayilan_acilim: 100 };
  }
  if (tip === 'arin') {
    const no = ag.kollar.filter(x => x.arin).length + 1;
    kol.arin = `ARIN_${no}`;
    ag.gaz_kaynaklari.push({ arin: kol.arin, kol: id, ch4_m3_s: 0.22,
                             aciklama: 'Metan cikisi' });
  }
  if (tip === 'sizinti') kol.R = 150.0;
  return kol;
}

function adOner(tip, id) {
  return ({ galeri: 'Galeri', arin: 'Arin', kuyu: 'Kuyu', kuyu_fan: 'Kuyu + fan',
            kapi: 'Hava kapisi', tenzim: 'Tenzim', sizinti: 'Baraj sizintisi' })[tip] + ' ' + id;
}

/* ---------------------------------------------------------------- cizim */

function ciz() {
  const W = ag.cizim.genislik, H = ag.cizim.yukseklik;
  let s = '';
  for (let x = 0; x <= W; x += IZGARA) s += `<line class="izgara" x1="${x}" y1="0" x2="${x}" y2="${H}"/>`;
  for (let y = 0; y <= H; y += IZGARA) s += `<line class="izgara" x1="0" y1="${y}" x2="${W}" y2="${H > y ? y : y}"/>`;

  for (const k of ag.kollar) {
    const a = dugumBul(k.from), b = dugumBul(k.to);
    if (!a || !b) continue;
    const pts = [[a.x, a.y], ...(k.yol || []), [b.x, b.y]];
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
    const sinif = k.fan ? 'kuyu' : (k.kapi ? 'kapi' : (k.tenzim ? 'tenzim' : k.tip));
    const sec = secili && secili.tip === 'kol' && secili.id === k.id ? ' secili' : '';
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    s += `<path class="kol ${sinif}${sec}" d="${d}"/>
          <path class="kol-tik" d="${d}" data-kol="${k.id}"/>
          <text class="et-kol" x="${mx}" y="${my - 9}" text-anchor="middle">${k.id}${
            k.fan ? ' ⟳' : k.kapi ? ' ▯' : k.tenzim ? ' ▷◁' : k.arin ? ' ▦' : ''}</text>`;
  }

  if (kolBasi) {
    const a = dugumBul(kolBasi);
    s += `<circle class="onizleme" cx="${a.x}" cy="${a.y}" r="16"/>`;
  }

  for (const d of ag.dugumler) {
    const sec = secili && secili.tip === 'dugum' && secili.id === d.id ? ' secili' : '';
    s += `<circle class="dugum${d.tip === 'atmosfer' ? ' atmosfer' : ''}${sec}"
            cx="${d.x}" cy="${d.y}" r="9" data-dugum="${d.id}"/>
          <text class="et" x="${d.x + 12}" y="${d.y - 10}">${d.id}</text>`;
  }
  kanvas.innerHTML = s;
}

/* ---------------------------------------------------------------- etkilesim */

function svgNokta(evt) {
  const r = kanvas.getBoundingClientRect();
  const W = ag.cizim.genislik, H = ag.cizim.yukseklik;
  const olcek = Math.min(r.width / W, r.height / H);
  const ofsX = (r.width - W * olcek) / 2, ofsY = (r.height - H * olcek) / 2;
  return { x: (evt.clientX - r.left - ofsX) / olcek, y: (evt.clientY - r.top - ofsY) / olcek };
}
const yapistir = (v) => Math.round(v / IZGARA) * IZGARA;

kanvas.addEventListener('mousedown', (e) => {
  const dId = e.target.dataset.dugum, kId = e.target.dataset.kol;
  const p = svgNokta(e);

  if (mod === 'sil') {
    if (dId) {
      ag.kollar = ag.kollar.filter(k => k.from !== dId && k.to !== dId);
      ag.dugumler = ag.dugumler.filter(d => d.id !== dId);
    } else if (kId) {
      const k = kolBul(kId);
      if (k && k.arin) ag.gaz_kaynaklari = ag.gaz_kaynaklari.filter(g => g.arin !== k.arin);
      ag.kollar = ag.kollar.filter(x => x.id !== kId);
    }
    secili = null; ciz(); ozellikCiz(); return;
  }

  if (mod === 'dugum' && !dId) {
    const id = yeniDugumId();
    ag.dugumler.push({ id, ad: `Kavsak ${id}`, x: yapistir(p.x), y: yapistir(p.y), tip: 'kavsak' });
    secili = { tip: 'dugum', id }; ciz(); ozellikCiz(); return;
  }

  if (mod === 'kol' && dId) {
    if (!kolBasi) { kolBasi = dId; ciz(); return; }
    if (kolBasi === dId) { kolBasi = null; ciz(); return; }
    const k = kolOlustur($('kol-tip').value, kolBasi, dId);
    ag.kollar.push(k);
    kolBasi = null; secili = { tip: 'kol', id: k.id };
    ciz(); ozellikCiz(); return;
  }

  if (mod === 'sec') {
    if (dId) { secili = { tip: 'dugum', id: dId }; surukle = dId; ciz(); ozellikCiz(); }
    else if (kId) { secili = { tip: 'kol', id: kId }; ciz(); ozellikCiz(); }
    else { secili = null; ciz(); ozellikCiz(); }
  }
});

window.addEventListener('mousemove', (e) => {
  if (!surukle) return;
  const p = svgNokta(e), d = dugumBul(surukle);
  if (d) { d.x = yapistir(p.x); d.y = yapistir(p.y); ciz(); }
});
window.addEventListener('mouseup', () => { surukle = null; });

document.querySelectorAll('.mod').forEach(b => b.onclick = () => {
  document.querySelectorAll('.mod').forEach(x => x.classList.remove('aktif'));
  b.classList.add('aktif'); mod = b.dataset.mod; kolBasi = null; ciz();
});

/* ---------------------------------------------------------------- ozellikler */

function alan(etiket, deger, oku, tip = 'text') {
  const id = 'f_' + Math.random().toString(36).slice(2, 8);
  setTimeout(() => {
    const el = $(id);
    if (el) el.onchange = () => { oku(tip === 'number' ? Number(el.value) : el.value); ciz(); ozellikCiz(); };
  });
  return `<div class="satir"><label>${etiket}</label>
          <input id="${id}" type="${tip}" value="${deger}"></div>`;
}

function ozellikCiz() {
  const c = $('ozellik-ic');
  if (!secili) { c.innerHTML = '<div class="ipucu">Bir dugum veya kol secin.</div>'; return; }

  if (secili.tip === 'dugum') {
    const d = dugumBul(secili.id);
    if (!d) { c.innerHTML = ''; return; }
    c.innerHTML = `<div style="font-weight:700">DUGUM ${d.id}</div>`
      + alan('Ad', d.ad, v => d.ad = v)
      + alan('x', d.x, v => d.x = v, 'number')
      + alan('y', d.y, v => d.y = v, 'number')
      + `<div class="satir"><label>Tip</label><select id="d_tip">
           <option value="kavsak"${d.tip === 'kavsak' ? ' selected' : ''}>kavsak</option>
           <option value="atmosfer"${d.tip === 'atmosfer' ? ' selected' : ''}>atmosfer</option>
         </select></div>`;
    setTimeout(() => { const s = $('d_tip'); if (s) s.onchange = () => { d.tip = s.value; ciz(); }; });
    return;
  }

  const k = kolBul(secili.id);
  if (!k) { c.innerHTML = ''; return; }
  let h = `<div style="font-weight:700">KOL ${k.id} &nbsp;<span style="font-weight:400;color:var(--soluk)">${k.from} → ${k.to}</span></div>`
    + alan('Ad', k.ad, v => k.ad = v)
    + alan('Kesit A (m2)', k.A, v => { k.A = v; k.R = +atkinsonR(k.A, k.L, k.k).toFixed(4); }, 'number')
    + alan('Uzunluk L (m)', k.L || 0, v => { k.L = v; k.R = +atkinsonR(k.A, k.L, k.k).toFixed(4); }, 'number')
    + alan('Surtunme k', k.k || 0.012, v => { k.k = v; k.R = +atkinsonR(k.A, k.L, k.k).toFixed(4); }, 'number')
    + alan('Direnc R', k.R, v => k.R = v, 'number')
    + `<div class="ipucu">R = k·Per·L/A³ — A, L veya k degisince otomatik hesaplanir.
       Dogrudan R de yazabilirsiniz.</div>`;

  if (k.fan) h += `<hr style="border:none;border-top:1px solid #B0B0B0">
    <div style="font-weight:600">ANA FAN — ${k.fan.id}</div>`
    + alan('p0 (Pa)', k.fan.p0, v => k.fan.p0 = v, 'number')
    + alan('k (fan)', k.fan.k, v => k.fan.k = v, 'number')
    + `<div class="ipucu">P_fan = p0 − k·Q². Bos yukte p0, debi arttikca duser.</div>`;

  if (k.kapi) h += `<hr style="border:none;border-top:1px solid #B0B0B0">
    <div style="font-weight:600">KAPI — ${k.kapi.id}</div>`
    + alan('Acik R', k.kapi.acik_R, v => k.kapi.acik_R = v, 'number')
    + alan('Kapali R', k.kapi.bagli_R, v => { k.kapi.bagli_R = v; k.R = v; }, 'number');

  if (k.tenzim) h += `<hr style="border:none;border-top:1px solid #B0B0B0">
    <div style="font-weight:600">TENZIM — ${k.tenzim.id}</div>`
    + alan('min R (tam acik)', k.tenzim.min_R, v => k.tenzim.min_R = v, 'number')
    + alan('max R (tam kisik)', k.tenzim.max_R, v => k.tenzim.max_R = v, 'number');

  if (k.arin) {
    const g = ag.gaz_kaynaklari.find(x => x.arin === k.arin);
    h += `<hr style="border:none;border-top:1px solid #B0B0B0">
      <div style="font-weight:600">ARIN — ${k.arin}</div>`
      + alan('CH4 kaynagi (m3/s)', g ? g.ch4_m3_s : 0.2,
             v => { if (g) g.ch4_m3_s = v; }, 'number')
      + `<div class="ipucu">Normal CH4 ≈ kaynak/debi. Debi 38 m³/s ve kaynak 0.22 ise ≈ %0.58.</div>`;
  }
  c.innerHTML = h;
}

/* ---------------------------------------------------------------- dogrula / kaydet */

async function dogrula() {
  const c = $('dogrulama');
  const yerel = [];
  if (!ag.dugumler.some(d => d.tip === 'atmosfer')) yerel.push('Atmosfer dugumu yok.');
  if (!ag.kollar.some(k => k.fan)) yerel.push('ANA FAN yok — hava akmaz.');
  if (ag.kollar.length < 2) yerel.push('En az 2 kol gerekir.');
  const dereceler = {};
  ag.dugumler.forEach(d => dereceler[d.id] = 0);
  ag.kollar.forEach(k => { dereceler[k.from]++; dereceler[k.to]++; });
  const yalniz = Object.keys(dereceler).filter(d => dereceler[d] === 0);
  if (yalniz.length) yerel.push(`Baglanmamis dugum: ${yalniz.join(', ')}`);
  const dongu = ag.kollar.length - ag.dugumler.length + 1;
  if (dongu < 1) yerel.push('Kapali devre yok — giris ve cikis ayni atmosfer dugumune baglanmali.');

  if (yerel.length) {
    c.innerHTML = yerel.map(x => `<div class="hata">✗ ${x}</div>`).join('');
    return false;
  }

  c.innerHTML = '<span style="color:var(--soluk)">Fizik motorunda cozuluyor…</span>';
  try {
    const r = await fetch('api/sebeke/_dogrula', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ag) }).then(x => x.json());
    if (r.xeta) { c.innerHTML = `<div class="hata">✗ ${r.xeta}</div>`; return false; }
    c.innerHTML = `<div class="ok">✓ Ag cozuldu — ${r.yontem}</div>
      <div>Kirchhoff-1: ${Number(r.denge).toExponential(1)} m³/s ·
           Kirchhoff-2: ${Number(r.kirchhoff2).toExponential(1)} Pa</div>
      <div>Toplam debi: <b>${r.fan_debi} m³/s</b> · Fan: ${r.fan_basinc} Pa · ${r.fan_guc} kW</div>
      ${(r.uyarilar || []).map(u => `<div class="hata">⚠ ${u}</div>`).join('')}
      <table class="mini">${r.kollar.map(k =>
        `<tr><td>${k.id}</td><td>${k.ad}</td><td>${k.Q} m³/s</td><td>${k.hiz} m/s</td></tr>`).join('')}</table>`;
    return true;
  } catch (e) {
    c.innerHTML = `<div class="hata">✗ Sunucuya ulasilamadi: ${e.message}</div>`;
    return false;
  }
}

$('btn-dogrula').onclick = dogrula;

/* NOT: native alert/confirm/prompt KULLANILMAZ — gomulu tarayicilarda bloke
   olabilir (dialog gostermeden false/null doner) ve kullanici hicbir sey
   olmadigini sanir. Geri bildirim dogrulama panelinde verilir. */
function bildir(html, sinif) {
  $('dogrulama').innerHTML = '<div class="' + (sinif || '') + '">' + html + '</div>';
}

$('btn-kaydet').onclick = async () => {
  const ad = ($('sema-ad').value || '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(ad)) {
    bildir('✗ Geçerli bir şema adı yazın (yalnız harf, rakam, _ ve -).', 'hata'); return;
  }
  if (!await dogrula()) return;                  // hatalar zaten panelde
  ag.ad = (ag.ad === 'Yeni Ocak') ? ad : ag.ad;
  const r = await fetch('api/sebeke/' + ad, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ag) }).then(x => x.json());
  if (r.ok) {
    bildir('✓ Kaydedildi: <b>' + ad + '</b><br>' +
           '<a href="index.html?sema=' + ad + '">' +
           '<button style="margin-top:6px">Simülatörde Aç</button></a>', 'ok');
    listeYukle();
  } else bildir('✗ Hata: ' + (r.xeta || 'bilinmeyen'), 'hata');
};

// iki asamali silme — native confirm yerine
let yeniOnay = false;
$('btn-yeni').onclick = () => {
  const b = $('btn-yeni');
  if (!yeniOnay) {
    yeniOnay = true; b.textContent = 'Emin misiniz?'; b.classList.add('aktif');
    setTimeout(() => { yeniOnay = false; b.textContent = 'Yeni';
                       b.classList.remove('aktif'); }, 3500);
    return;
  }
  yeniOnay = false; b.textContent = 'Yeni'; b.classList.remove('aktif');
  ag = bosAg(); secili = null; kolBasi = null; ciz(); ozellikCiz();
  bildir('Yeni boş şema oluşturuldu.');
};

$('btn-yukle').onclick = async () => {
  const id = $('yukle-sec').value;
  if (!id) return;
  ag = await fetch(`api/sebeke/${id}`).then(r => r.json());
  ag.gaz_kaynaklari = ag.gaz_kaynaklari || [];
  $('sema-ad').value = id;
  secili = null; ciz(); ozellikCiz();
};

async function listeYukle() {
  try {
    const l = await fetch('api/semalar').then(r => r.json());
    $('yukle-sec').innerHTML = l.map(s =>
      `<option value="${s.id}">${s.ad} (${s.dugum}/${s.kol})</option>`).join('');
  } catch (e) { /* sunucu yok */ }
}

ciz(); ozellikCiz(); listeYukle();
