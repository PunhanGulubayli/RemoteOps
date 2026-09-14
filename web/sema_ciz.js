/* RemoteOps — Proses Sema Ureteci  v2
 *
 * Sebeke tanimindan gercek bir kontrol odasi mimigi uretir.
 *
 * DAYANAKLAR
 *  - MSHA 30 CFR 75.372 (maden havalandirma haritasi): havalandirma kontrolleri
 *    (kapi, regulator, baraj/stopping, overcast, seal), AKIS YONU OKLARI, debi
 *    miktarlari, fanlar, olcum noktalari ve LEGEND gosterilmek zorundadir.
 *  - Maden harita gelenegi: temiz hava / donus havasi ayri renkte gosterilir.
 *  - ANSI/ISA-101 + ISA-18.2: doymus kirmizi/turuncu/sari YALNIZCA alarm icindir.
 *
 * COZULEN CELISKI
 *  Maden gelenegi donus havasina KIRMIZI der; ISA-18.2 kirmiziyi P1 alarma ayirir.
 *  Cozum: hava servisi SOLGUN (desature) tonlarla gosterilir, doymus alarm
 *  renkleri hicbir normal durumda kullanilmaz. Legend bunu acikca yazar.
 *
 * Cikti: { svg, baglanti, tiklanabilir }
 */
'use strict';

const esc = (s) => String(s).replace(/[<>&"]/g, c =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

/* ------------------------------------------------------------------ geometri */
const uzunluk = (p) => p.reduce((L, n, i) =>
  i ? L + Math.hypot(n[0] - p[i - 1][0], n[1] - p[i - 1][1]) : 0, 0);

function nokta(p, t) {
  const hedef = uzunluk(p) * t;
  let gecti = 0;
  for (let i = 1; i < p.length; i++) {
    const dx = p[i][0] - p[i - 1][0], dy = p[i][1] - p[i - 1][1];
    const seg = Math.hypot(dx, dy);
    if (gecti + seg >= hedef || i === p.length - 1) {
      const k = seg ? (hedef - gecti) / seg : 0;
      return { x: p[i - 1][0] + dx * k, y: p[i - 1][1] + dy * k,
               ux: seg ? dx / seg : 1, uy: seg ? dy / seg : 0 };
    }
    gecti += seg;
  }
  return { x: p[0][0], y: p[0][1], ux: 1, uy: 0 };
}
const yolStr = (p) => p.map((n, i) => `${i ? 'L' : 'M'}${n[0]},${n[1]}`).join(' ');
const derece = (n) => (Math.atan2(n.uy, n.ux) * 180 / Math.PI).toFixed(1);

/* ------------------------------------------------------------------ semboller */

/** Eksenel fan: govde + gobek + kanatlar + motor kutusu */
function semFan(n, id) {
  const a = derece(n), x = n.x, y = n.y;
  let kanat = '';
  for (let i = 0; i < 6; i++) {
    const r = i * 60;
    kanat += `<path d="M0,0 L13,-4 L11,4 Z" transform="rotate(${r})" class="fan-kanat"/>`;
  }
  return `<g id="sim_${id}" class="ekipman tik" data-tik="1" transform="rotate(${a} ${x} ${y})">
    <rect x="${x - 30}" y="${y - 24}" width="60" height="48" rx="2" class="ek-govde"/>
    <rect x="${x - 34}" y="${y - 28}" width="8" height="56" class="ek-flans"/>
    <rect x="${x + 26}" y="${y - 28}" width="8" height="56" class="ek-flans"/>
    <g transform="translate(${x} ${y})" id="${id}_govde_g">
      <circle r="19" id="${id}_govde" class="ek-dolgu"/>
      <g class="fan-kanatlar">${kanat}</g>
      <circle r="5" class="ek-gobek"/>
    </g>
    <rect x="${x - 9}" y="${y + 24}" width="18" height="11" class="ek-motor"/>
  </g>`;
}

/** Havalandirma kapisi — maden harita sembolu: yola dik kanat + menteseli yaprak */
function semKapi(n, id) {
  const a = derece(n), x = n.x, y = n.y;
  return `<g id="sim_${id}" class="ekipman tik" data-tik="1">
    <g transform="rotate(${a} ${x} ${y})">
      <line x1="${x}" y1="${y - 22}" x2="${x}" y2="${y + 22}" class="ek-cerceve"/>
      <rect x="${x - 3}" y="${y - 22}" width="6" height="10" class="ek-mesnet"/>
      <rect x="${x - 3}" y="${y + 12}" width="6" height="10" class="ek-mesnet"/>
      <g id="${id}_yaprak_g">
        <rect id="${id}_govde" x="${x - 2}" y="${y - 13}" width="4" height="26" class="ek-dolgu"/>
      </g>
    </g>
    <text x="${x}" y="${y - 30}" class="et-ad" text-anchor="middle">${esc(id)}</text>
  </g>`;
}

/** Regulator / tenzim — ayarlanabilir orifis: bariyer + ortada acikllik */
function semTenzim(n, id) {
  const a = derece(n), x = n.x, y = n.y;
  return `<g id="sim_${id}" class="ekipman tik" data-tik="1">
    <g transform="rotate(${a} ${x} ${y})">
      <path class="ek-cerceve-k" d="M${x - 2},${y - 23} L${x - 2},${y - 7} M${x - 2},${y + 7} L${x - 2},${y + 23}"/>
      <path id="${id}_govde" class="ek-dolgu"
            d="M${x + 10},${y - 20} L${x - 2},${y - 7} L${x - 2},${y + 7} L${x + 10},${y + 20} Z"/>
    </g>
    <text x="${x}" y="${y - 30}" class="et-ad" text-anchor="middle">${esc(id)}</text>
  </g>`;
}

/** Arin / uretim panosu */
function semArin(p, arin) {
  const n = nokta(p, 0.5), a = derece(n);
  const w = Math.min(160, Math.max(70, uzunluk(p) * 0.5)), h = 30;
  return `<g id="grup_${arin}">
    <g transform="rotate(${a} ${n.x} ${n.y})">
      <rect id="${arin}_blok" x="${(n.x - w / 2).toFixed(1)}" y="${(n.y - h / 2).toFixed(1)}"
            width="${w.toFixed(1)}" height="${h}" class="ek-arin"/>
      <path class="ek-arin-tara" d="${
        Array.from({ length: Math.floor(w / 10) }, (_, i) =>
          `M${(n.x - w / 2 + i * 10 + 4).toFixed(1)},${n.y + h / 2} l8,-${h}`).join(' ')}"/>
    </g>
    <text x="${n.x}" y="${(n.y - h / 2 - 8).toFixed(1)}" class="et-blok"
          text-anchor="middle">${esc(arin.replace('_', ' '))}</text>
  </g>`;
}

/** Kuyu agzi kulesi (headframe) */
function semKule(x, y) {
  return `<g class="ekipman">
    <path class="ek-kule" d="M${x - 16},${y} L${x},${y - 26} L${x + 16},${y} Z"/>
    <line class="ek-kule-l" x1="${x - 10}" y1="${y - 9}" x2="${x + 10}" y2="${y - 9}"/>
    <circle cx="${x}" cy="${y - 21}" r="3.2" class="ek-gobek"/>
  </g>`;
}

/** ISA-5.1 olcum balonu + degerli okuma kutusu */
function semOlcum(x, y, bx, by, fn, no, elemanId, etiket, birim) {
  const w = 62, h = 20;
  return `<g class="olcum">
    <line x1="${x}" y1="${y}" x2="${bx}" y2="${by}" class="ol-cizgi"/>
    <circle id="${elemanId}_balon" cx="${bx}" cy="${by}" r="16" class="ol-balon"/>
    <line x1="${bx - 16}" y1="${by}" x2="${bx + 16}" y2="${by}" class="ol-ayirac"/>
    <text x="${bx}" y="${by - 4}" class="ol-fn" text-anchor="middle">${fn}</text>
    <text x="${bx}" y="${by + 11}" class="ol-no" text-anchor="middle">${esc(no)}</text>
    <rect id="${elemanId}_kutu" x="${bx - w / 2}" y="${by + 19}" width="${w}" height="${h}"
          class="ol-kutu"/>
    <text id="${elemanId}" x="${bx + w / 2 - 17}" y="${by + 33}" class="ol-deger"
          text-anchor="end">—</text>
    <text x="${bx + w / 2 - 4}" y="${by + 33}" class="ol-birim" text-anchor="end">${esc(birim)}</text>
    <text x="${bx}" y="${by + 50}" class="ol-etiket" text-anchor="middle">${esc(etiket)}</text>
  </g>`;
}




/* ------------------------------------------------------------------ yardimci */

function balonYeri(x, y, dx, dy, W, H) {
  const MX = 60, MY = 58, MB = 96;
  let bx = x + dx, by = y + dy;
  if (by < MY) by = y + Math.abs(dy);
  if (by > H - MB) by = y - Math.abs(dy);
  if (bx < MX) bx = x + Math.abs(dx);
  if (bx > W - MX) bx = x - Math.abs(dx);
  return [Math.max(MX, Math.min(W - MX, bx)), Math.max(MY, Math.min(H - MB, by))];
}

/** Kol "servisi": temiz hava mı, dönüş havası mı?
 *
 *  Arın, kapı ve sızıntı kolları BAGLANTI GRAFINDEN CIKARILIR — çünkü bunlar
 *  temiz ile dönüşü birbirine baglayan gecislerdir; grafta biraklirsa her yer
 *  "karma" cikar. Kalan agda arin GIRISlerinden ve CIKISlarindan mesafe
 *  hesaplanir; her kol hangisine daha yakinsa o servise atanir.
 */
function servisBelirle(sb) {
  const gecis = new Set(['arin', 'kapi', 'sizinti']);
  const kolGecis = (k) => k.arin || k.kapi || k.tip === 'sizinti' || gecis.has(k.tip);

  const komsu = {};
  sb.dugumler.forEach(d => komsu[d.id] = []);
  sb.kollar.forEach(k => {
    if (kolGecis(k)) return;
    (komsu[k.from] || []).push(k.to);
    (komsu[k.to] || []).push(k.from);
  });

  const bfs = (tohumlar) => {
    const u = {}; tohumlar.forEach(d => u[d] = 0);
    const q = [...tohumlar];
    while (q.length) {
      const d = q.shift();
      for (const n of komsu[d] || []) if (u[n] === undefined) { u[n] = u[d] + 1; q.push(n); }
    }
    return u;
  };

  const arinlar = sb.kollar.filter(k => k.arin);
  const dT = bfs(arinlar.map(k => k.from));     // arın girişine yakın = temiz
  const dD = bfs(arinlar.map(k => k.to));       // arın çıkışına yakın = dönüş
  const INF = 1e9;
  const en = (u, k) => Math.min(u[k.from] ?? INF, u[k.to] ?? INF);

  const servis = {};
  for (const k of sb.kollar) {
    if (k.arin) { servis[k.id] = 'arin'; continue; }
    // kapı ve sızıntı temiz ile dönüşü baglar -> tanimi geregi karma (kısa devre yolu)
    if (k.kapi || k.tip === 'sizinti') { servis[k.id] = 'karma'; continue; }
    const a = en(dT, k), b = en(dD, k);
    servis[k.id] = a === b ? 'karma' : (a < b ? 'temiz' : 'donus');
  }
  return servis;
}

/* ------------------------------------------------------------------ uretec */

function semaUret(sb) {
  const dugum = {}; sb.dugumler.forEach(d => dugum[d.id] = d);
  const W = (sb.cizim && sb.cizim.genislik) || 1020;
  const AG_H = (sb.cizim && sb.cizim.yukseklik) || 620;
  const H = AG_H;
  const servis = servisBelirle(sb);

  const baglanti = {}, tiklanabilir = {};
  let kanal = '', oklar = '', ekipman = '', olcum = '', dugumler = '', no = 1;

  /* ---- kanallar (galeriler) ---- */
  for (const k of sb.kollar) {
    const a = dugum[k.from], b = dugum[k.to];
    if (!a || !b) continue;
    const p = [[a.x, a.y], ...(k.yol || []), [b.x, b.y]];
    const d = yolStr(p);
    const sizma = k.tip === 'sizinti';
    const kal = sizma ? 4 : Math.max(9, Math.min(26, 4 + Math.sqrt(k.A || 9) * 3.1));
    const sv = servis[k.id];

    kanal += `<g id="yol_${k.id}" class="kanal sv-${sv}${sizma ? ' sizinti' : ''}">
      <path d="${d}" class="kn-dis" style="stroke-width:${kal + 3}"/>
      <path d="${d}" class="kn-ic"  style="stroke-width:${kal}"/>
      <path id="akis_${k.id}" d="${d}" class="kn-akis"
            style="stroke-width:${Math.max(2, kal * 0.34)}"/>
    </g>`;
    baglanti[`akis_${k.id}`] = { tip: 'akis', etiket: `qol.${k.id}.hiz` };

    // MSHA: akis yonu oklari zorunlu
    if (!sizma && uzunluk(p) > 55) {
      let t = '';
      for (const o of [0.32, 0.68]) {
        const n = nokta(p, o);
        t += `<path d="M-7,-5 L7,0 L-7,5 Z" transform="translate(${n.x.toFixed(1)} ${
          n.y.toFixed(1)}) rotate(${derece(n)})"/>`;
      }
      oklar += `<g id="ok_${k.id}" class="ok sv-${sv}">${t}</g>`;
      baglanti[`ok_${k.id}`] = { tip: 'ok', etiket: `qol.${k.id}.yon` };
    }
  }

  /* ---- ekipman + olcum ---- */
  for (const k of sb.kollar) {
    const a = dugum[k.from], b = dugum[k.to];
    if (!a || !b) continue;
    const p = [[a.x, a.y], ...(k.yol || []), [b.x, b.y]];

    if (k.fan) {
      const n = nokta(p, 0.5);
      ekipman += semFan(n, k.fan.id);
      baglanti[`${k.fan.id}_govde`] = { tip: 'govde', etiket: `fan.${k.fan.id}.durum`,
                                        dolu_durumlar: ['isliyir'] };
      baglanti[`${k.fan.id}_govde_g`] = { tip: 'donme', etiket: `fan.${k.fan.id}.durum` };
      tiklanabilir[`sim_${k.fan.id}`] = {
        hedef: `fan.${k.fan.id}`, etiket: `ANA FAN ${k.fan.id}`,
        baglanti: `fan.${k.fan.id}.durum`,
        emirler: { isliyir: 'dayandir', dayandi: 'basla' } };

      const [fx, fy] = balonYeri(n.x, n.y, -96, -74, W, H);
      const [px, py] = balonYeri(n.x, n.y, 96, -74, W, H);
      olcum += semOlcum(n.x, n.y, fx, fy, 'FT', `${no++}`, `FAN_${k.fan.id}_debi`,
                        'OCAK DEBISI', 'm³/s');
      olcum += semOlcum(n.x, n.y, px, py, 'PT', `${no++}`, `FAN_${k.fan.id}_basinc`,
                        'FAN BASINCI', 'Pa');
      baglanti[`FAN_${k.fan.id}_debi`] = { tip: 'deger', etiket: `fan.${k.fan.id}.debi`, ondalik: 1 };
      baglanti[`FAN_${k.fan.id}_basinc`] = { tip: 'deger', etiket: `fan.${k.fan.id}.basinc`, ondalik: 0 };
    }

    if (k.kapi) {
      ekipman += semKapi(nokta(p, 0.5), k.kapi.id);
      baglanti[`${k.kapi.id}_govde`] = { tip: 'govde', etiket: `qapi.${k.kapi.id}.durum`,
                                         dolu_durumlar: ['bagli'] };
      baglanti[`${k.kapi.id}_yaprak_g`] = { tip: 'kapi_yaprak', etiket: `qapi.${k.kapi.id}.durum` };
      tiklanabilir[`sim_${k.kapi.id}`] = {
        hedef: `qapi.${k.kapi.id}`, etiket: `HAVA KAPISI ${k.kapi.id}`,
        baglanti: `qapi.${k.kapi.id}.durum`,
        emirler: { acik: 'bagla', bagli: 'ac' } };
    }

    if (k.tenzim) {
      const n = nokta(p, 0.5);
      ekipman += semTenzim(n, k.tenzim.id);
      const [tx, ty] = balonYeri(n.x, n.y, 78, 50, W, H);
      olcum += semOlcum(n.x, n.y, tx, ty, 'HC', `${no++}`, `${k.tenzim.id}_acilim`,
                        `${k.tenzim.id} ACILIM`, '%');
      baglanti[`${k.tenzim.id}_acilim`] = { tip: 'deger', etiket: `tenzim.${k.tenzim.id}.acilim`, ondalik: 0 };
      baglanti[`${k.tenzim.id}_govde`] = { tip: 'govde', etiket: `tenzim.${k.tenzim.id}.acilim`, esik: 50 };
      tiklanabilir[`sim_${k.tenzim.id}`] = {
        hedef: `tenzim.${k.tenzim.id}`, etiket: `${k.tenzim.id} acilim (%)`,
        emr: 'ayarla', giris: { min: 0, max: 100 }, baglanti: `tenzim.${k.tenzim.id}.acilim` };
    }

    if (k.arin) {
      ekipman += semArin(p, k.arin);
      const s = nokta(p, 0.18), c = nokta(p, 0.82);
      const [sx, sy] = balonYeri(s.x, s.y, -14, -76, W, H);
      const [cx, cy] = balonYeri(c.x, c.y, 14, -76, W, H);
      olcum += semOlcum(s.x, s.y, sx, sy, 'AT', `${no++}`, `${k.arin}_ch4`,
                        `${k.arin.replace('_', ' ')} CH₄`, '%');
      olcum += semOlcum(c.x, c.y, cx, cy, 'FT', `${no++}`, `${k.arin}_debi`,
                        `${k.arin.replace('_', ' ')} HAVA`, 'm³/s');
      baglanti[`${k.arin}_ch4`] = { tip: 'deger', etiket: `qaz.ch4.${k.arin}`, ondalik: 2 };
      baglanti[`${k.arin}_ch4_balon`] = { tip: 'balon', etiket: `qaz.ch4.${k.arin}` };
      baglanti[`${k.arin}_ch4_kutu`] = { tip: 'kutu', etiket: `qaz.ch4.${k.arin}` };
      baglanti[`${k.arin}_debi`] = { tip: 'deger', etiket: `arin.${k.arin}.debi`, ondalik: 1 };
      baglanti[`${k.arin}_debi_balon`] = { tip: 'balon', etiket: `arin.${k.arin}.hiz` };
      baglanti[`${k.arin}_blok`] = { tip: 'blok', etiket: `qaz.ch4.${k.arin}` };
    }
  }

  /* ---- dugumler + kuyu kuleleri ---- */
  for (const d of sb.dugumler) {
    if (d.tip === 'atmosfer') { ekipman += semKule(d.x, d.y); continue; }
    dugumler += `<circle cx="${d.x}" cy="${d.y}" r="3.6" class="dg"/>
                 <text x="${d.x + 7}" y="${d.y - 6}" class="et-dg">${esc(d.id)}</text>`;
  }

  /* ---- legend (MSHA zorunlulugu) ---- */
  const lg = (yy, sinif, ad) =>
    `<g transform="translate(0 ${yy})"><line x1="8" y1="0" x2="34" y2="0"
        class="lg-cizgi ${sinif}"/><text x="40" y="4" class="lg-yazi">${ad}</text></g>`;
  const legend = `<g id="legend" transform="translate(${W - 202} ${H - 116})">
    <rect x="0" y="0" width="188" height="96" class="lg-kutu"/>
    <text x="8" y="15" class="lg-baslik">LEJANT</text>
    ${lg(30, 'sv-temiz', 'Temiz hava (giris)')}
    ${lg(48, 'sv-donus', 'Dönüş havası')}
    ${lg(66, 'sv-arin', 'Arın / üretim')}
    <text x="8" y="88" class="lg-not">Doygun renk = yalnızca ALARM (ISA-18.2)</text>
  </g>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"
       id="sema-svg" preserveAspectRatio="xMidYMid meet">
  <rect x="0" y="0" width="${W}" height="${H}" class="zemin"/>
  <line x1="24" y1="${(sb.dugumler.find(d => d.tip === 'atmosfer') || { y: 48 }).y}"
        x2="${W - 24}" y2="${(sb.dugumler.find(d => d.tip === 'atmosfer') || { y: 48 }).y}"
        class="yuzey"/>
  <text x="28" y="${(sb.dugumler.find(d => d.tip === 'atmosfer') || { y: 48 }).y - 7}"
        class="et-dg">YÜZEY</text>
  <g id="kat-kanal">${kanal}</g>
  <g id="kat-ok">${oklar}</g>
  <g id="kat-dugum">${dugumler}</g>
  <g id="kat-ekipman">${ekipman}</g>
  <g id="kat-olcum">${olcum}</g>
  ${legend}
</svg>`;

  return { svg, baglanti, tiklanabilir };
}

window.RemoteOpsSema = { semaUret };
