/* RemoteOps — Endustriyel HMI sembol kutuphanesi
 *
 * ANSI/ISA-5.1 ve ISO 10628 cizim gelenegine gore SVG ekipman sembolleri.
 * Her sembol UC sey dondurur:
 *    svg   — cizim
 *    bind  — { elemanId: {tip, etiket, ...} }  canli veriye baglanma
 *    click — { elemanId: {hedef, tip, ad} }    faceplate acar
 *
 * Kullanim:
 *    const b = new Cizim();
 *    b.pompa(300, 400, 'P1', 'SUMP POMPASI 1');
 *    const { svg, bind, click } = b.bitir(1200, 700);
 *
 * KURAL (ISA-18.2): doygun kirmizi/turuncu/sari YALNIZCA alarm icindir.
 * Ekipman durumu dolu/bos govde ve etiket ile gosterilir, renkle degil.
 */
'use strict';

const E = (s) => String(s).replace(/[<>&"]/g, c =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

class Cizim {
  constructor() {
    this.kat = { boru: '', ekipman: '', olcum: '', yazi: '' };
    this.bind = {};
    this.click = {};
    this._no = 1;
  }

  _b(id, cfg) { this.bind[id] = cfg; }
  _c(id, cfg) { this.click[id] = cfg; }

  /* ================================================== BORU / OLUK / BANT */

  /** Proses hatti. servis: cevher | su | hava | temiz | donus | bosluk */
  boru(d, servis = 'su', opt = {}) {
    const kal = opt.kalinlik || 9;
    const id = opt.id;
    this.kat.boru += `<g class="hat sv-${servis}"${id ? ` id="hat_${id}"` : ''}>
      <path d="${d}" class="hat-dis" style="stroke-width:${kal + 3}"/>
      <path d="${d}" class="hat-ic"  style="stroke-width:${kal}"/>
      ${opt.akis === false ? '' :
        `<path d="${d}" class="hat-akis" style="stroke-width:${Math.max(2, kal * .36)}"
               ${id ? `id="akis_${id}"` : ''}/>`}
    </g>`;
    if (id && opt.akisEtiket) this._b(`akis_${id}`, { tip: 'akis', etiket: opt.akisEtiket });
    if (opt.ok) for (const [x, y, a] of opt.ok)
      this.kat.boru += `<path class="hat-ok sv-${servis}" d="M-7,-5 L7,0 L-7,5 Z"
        transform="translate(${x} ${y}) rotate(${a})"/>`;
    return this;
  }

  /** Malzeme oluğu (chute) — cevher akisi icin kesik govde */
  oluk(x1, y1, x2, y2) {
    this.kat.boru += `<path class="oluk" d="M${x1 - 7},${y1} L${x2 - 7},${y2}
      L${x2 + 7},${y2} L${x1 + 7},${y1} Z"/>`;
    return this;
  }

  /** Bantli konveyor — tambur + bant + tahrik motoru + yuk gostergesi */
  konveyor(x1, y1, x2, y2, id, ad, etiketYuk) {
    const a = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    const L = Math.hypot(x2 - x1, y2 - y1);
    this.kat.ekipman += `<g id="eq_${id}" class="ekipman tik" data-eq="1">
      <g transform="translate(${x1} ${y1}) rotate(${a})">
        <rect x="0" y="-13" width="${L}" height="26" class="bant-govde"/>
        <rect id="${id}_yukbar" x="4" y="-10" width="0" height="7" class="bant-yuk"/>
        <circle cx="0" cy="0" r="12" class="eq-dolgu"/>
        <circle id="${id}_govde" cx="${L}" cy="0" r="15" class="eq-dolgu"/>
        <circle cx="${L}" cy="0" r="5" class="eq-gobek"/>
        <rect x="${L - 13}" y="17" width="26" height="14" class="eq-motor"/>
        <text x="${L}" y="27" class="et-mini" text-anchor="middle">M</text>
      </g>
      <text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 24}" class="et-eq"
            text-anchor="middle">${E(id)}</text>
      <text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + 34}" class="et-alt"
            text-anchor="middle">${E(ad)}</text>
      <text id="${id}_durum" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + 46}"
            class="et-durum" text-anchor="middle">—</text>
    </g>`;
    this._b(`${id}_govde`, { tip: 'govde', etiket: `motor.${id}.durum` });
    this._b(`${id}_durum`, { tip: 'durum', etiket: `motor.${id}.durum` });
    this._b(`${id}_yukbar`, { tip: 'oran', etiket: etiketYuk, max: 450, uzunluk: L - 8 });
    this._c(`eq_${id}`, { hedef: `motor.${id}`, tip: 'motor', ad: `${id} — ${ad}` });
    return this;
  }

  /* ================================================== EKIPMAN */

  /** Santrifuj pompa — ISA: daire + salyangoz + kaide + motor */
  pompa(x, y, id, ad) {
    this.kat.ekipman += `<g id="eq_${id}" class="ekipman tik" data-eq="1">
      <path class="eq-govde" d="M${x - 17},${y + 16} L${x - 17},${y - 5}
            A17,17 0 1,1 ${x + 17},${y + 3} L${x + 17},${y + 16} Z"/>
      <circle id="${id}_govde" cx="${x}" cy="${y - 2}" r="11" class="eq-dolgu"/>
      <circle cx="${x}" cy="${y - 2}" r="3.5" class="eq-gobek"/>
      <rect x="${x - 24}" y="${y + 16}" width="48" height="6" class="eq-kaide"/>
      <rect x="${x - 12}" y="${y - 38}" width="24" height="15" class="eq-motor"/>
      <text x="${x}" y="${y - 27}" class="et-mini" text-anchor="middle">M</text>
      <line x1="${x}" y1="${y - 23}" x2="${x}" y2="${y - 13}" class="eq-mil"/>
      <text x="${x}" y="${y + 34}" class="et-eq" text-anchor="middle">${E(id)}</text>
      <text id="${id}_durum" x="${x}" y="${y + 45}" class="et-durum"
            text-anchor="middle">—</text>
    </g>`;
    this._b(`${id}_govde`, { tip: 'govde', etiket: `motor.${id}.durum` });
    this._b(`${id}_durum`, { tip: 'durum', etiket: `motor.${id}.durum` });
    this._c(`eq_${id}`, { hedef: `motor.${id}`, tip: 'motor', ad: `${id} — ${ad}` });
    return this;
  }

  /** Cene kiricisi — gövde + hareketli cene + volan + motor */
  kirici(x, y, id, ad) {
    this.kat.ekipman += `<g id="eq_${id}" class="ekipman tik" data-eq="1">
      <path id="${id}_govde" class="eq-dolgu"
            d="M${x - 46},${y - 34} L${x + 46},${y - 34} L${x + 30},${y + 30}
               L${x - 30},${y + 30} Z"/>
      <path class="kirici-cene" d="M${x - 26},${y - 26} L${x - 9},${y + 22}"/>
      <path class="kirici-cene" d="M${x + 26},${y - 26} L${x + 9},${y + 22}"/>
      <circle cx="${x - 54}" cy="${y - 12}" r="15" class="eq-volan"/>
      <circle cx="${x - 54}" cy="${y - 12}" r="4" class="eq-gobek"/>
      <rect x="${x - 78}" y="${y + 10}" width="30" height="17" class="eq-motor"/>
      <text x="${x - 63}" y="${y + 23}" class="et-mini" text-anchor="middle">M</text>
      <text x="${x}" y="${y - 42}" class="et-eq" text-anchor="middle">${E(id)}</text>
      <text x="${x}" y="${y + 46}" class="et-alt" text-anchor="middle">${E(ad)}</text>
      <text id="${id}_durum" x="${x}" y="${y + 58}" class="et-durum"
            text-anchor="middle">—</text>
    </g>`;
    this._b(`${id}_govde`, { tip: 'govde', etiket: `motor.${id}.durum` });
    this._b(`${id}_durum`, { tip: 'durum', etiket: `motor.${id}.durum` });
    this._c(`eq_${id}`, { hedef: `motor.${id}`, tip: 'kirici', ad: `${id} — ${ad}` });
    return this;
  }

  /** Apron besleyici — egik tabla + tahrik */
  besleyici(x, y, id, ad) {
    this.kat.ekipman += `<g id="eq_${id}" class="ekipman tik" data-eq="1">
      <path id="${id}_govde" class="eq-dolgu"
            d="M${x - 40},${y - 10} L${x + 40},${y + 6} L${x + 40},${y + 18}
               L${x - 40},${y + 2} Z"/>
      <circle cx="${x - 40}" cy="${y - 4}" r="9" class="eq-volan"/>
      <circle cx="${x + 40}" cy="${y + 12}" r="9" class="eq-volan"/>
      <rect x="${x + 30}" y="${y + 24}" width="26" height="14" class="eq-motor"/>
      <text x="${x + 43}" y="${y + 34}" class="et-mini" text-anchor="middle">M</text>
      <text x="${x - 6}" y="${y - 20}" class="et-eq" text-anchor="middle">${E(id)}</text>
      <text id="${id}_durum" x="${x - 6}" y="${y + 40}" class="et-durum"
            text-anchor="middle">—</text>
    </g>`;
    this._b(`${id}_govde`, { tip: 'govde', etiket: `motor.${id}.durum` });
    this._b(`${id}_durum`, { tip: 'durum', etiket: `motor.${id}.durum` });
    this._c(`eq_${id}`, { hedef: `motor.${id}`, tip: 'besleyici', ad: `${id} — ${ad}` });
    return this;
  }

  /** Bunker / silo — gövde + huni + seviye dolgusu */
  bunker(x, y, w, h, id, ad, etiketSeviye) {
    const hh = 34;
    this.kat.ekipman += `<g class="ekipman">
      <clipPath id="clip_${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" class="kap-ic"/>
      <rect id="${id}_dolgu" x="${x}" y="${y + h}" width="${w}" height="0"
            class="kap-malzeme" clip-path="url(#clip_${id})"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" class="kap-cerceve"/>
      <path class="kap-huni" d="M${x},${y + h} L${x + w / 2 - 11},${y + h + hh}
            L${x + w / 2 + 11},${y + h + hh} L${x + w},${y + h} Z"/>
      <text x="${x + w / 2}" y="${y - 20}" class="et-eq" text-anchor="middle">${E(id)}</text>
      <text x="${x + w / 2}" y="${y - 8}" class="et-alt" text-anchor="middle">${E(ad)}</text>
    </g>`;
    this._b(`${id}_dolgu`, { tip: 'seviye', etiket: etiketSeviye, x, y, w, h });
    return this;
  }

  /** Tank — yuvarlak koseli govde + sivi seviyesi */
  tank(x, y, w, h, id, ad, etiketSeviye) {
    this.kat.ekipman += `<g class="ekipman">
      <clipPath id="clip_${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/></clipPath>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" class="kap-ic"/>
      <rect id="${id}_dolgu" x="${x}" y="${y + h}" width="${w}" height="0"
            class="kap-sivi" clip-path="url(#clip_${id})"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" class="kap-cerceve"/>
      <text x="${x + w / 2}" y="${y - 20}" class="et-eq" text-anchor="middle">${E(id)}</text>
      <text x="${x + w / 2}" y="${y - 8}" class="et-alt" text-anchor="middle">${E(ad)}</text>
    </g>`;
    this._b(`${id}_dolgu`, { tip: 'seviye', etiket: etiketSeviye, x, y, w, h });
    return this;
  }

  /** Sump havuzu — yeralti su toplama (kesik ust) */
  sump(x, y, w, h, id, ad, etiketSeviye) {
    this.kat.ekipman += `<g class="ekipman">
      <clipPath id="clip_${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" class="kap-ic"/>
      <rect id="${id}_dolgu" x="${x}" y="${y + h}" width="${w}" height="0"
            class="kap-sivi" clip-path="url(#clip_${id})"/>
      <path class="kap-cerceve" d="M${x},${y} L${x},${y + h} L${x + w},${y + h} L${x + w},${y}"/>
      <path class="kap-taban" d="M${x},${y + h} L${x + w},${y + h}"/>
      <text x="${x + w / 2}" y="${y - 8}" class="et-eq" text-anchor="middle">${E(id)}</text>
      <text x="${x + w / 2}" y="${y + h + 16}" class="et-alt" text-anchor="middle">${E(ad)}</text>
    </g>`;
    this._b(`${id}_dolgu`, { tip: 'seviye', etiket: etiketSeviye, x, y, w, h });
    return this;
  }

  /** Motorlu vana — ISA: iki ucgen + aktuator kutusu */
  vana(x, y, id, ad, aci = 0) {
    this.kat.ekipman += `<g id="eq_${id}" class="ekipman tik" data-eq="1">
      <g transform="rotate(${aci} ${x} ${y})">
        <path id="${id}_govde" class="eq-dolgu"
              d="M${x - 15},${y - 13} L${x},${y} L${x - 15},${y + 13} Z
                 M${x + 15},${y - 13} L${x},${y} L${x + 15},${y + 13} Z"/>
        <line x1="${x}" y1="${y}" x2="${x}" y2="${y - 20}" class="eq-mil"/>
        <rect x="${x - 12}" y="${y - 34}" width="24" height="14" class="eq-motor"/>
        <text x="${x}" y="${y - 23}" class="et-mini" text-anchor="middle">M</text>
      </g>
      <text x="${x}" y="${y + 30}" class="et-eq" text-anchor="middle">${E(id)}</text>
      <text id="${id}_durum" x="${x}" y="${y + 41}" class="et-durum"
            text-anchor="middle">—</text>
    </g>`;
    this._b(`${id}_govde`, { tip: 'vana', etiket: `vana.${id}.acilim` });
    this._b(`${id}_durum`, { tip: 'durum', etiket: `vana.${id}.durum` });
    this._c(`eq_${id}`, { hedef: `vana.${id}`, tip: 'vana', ad: `${id} — ${ad}` });
    return this;
  }

  /** Eksenel fan — govde + flans + pervane */
  fan(x, y, id, ad) {
    let kanat = '';
    for (let i = 0; i < 6; i++)
      kanat += `<path d="M0,0 L14,-4 L12,4 Z" transform="rotate(${i * 60})" class="fan-kanat"/>`;
    this.kat.ekipman += `<g id="eq_${id}" class="ekipman tik" data-eq="1">
      <rect x="${x - 32}" y="${y - 26}" width="64" height="52" rx="2" class="eq-govde"/>
      <rect x="${x - 37}" y="${y - 30}" width="8" height="60" class="eq-kaide"/>
      <rect x="${x + 29}" y="${y - 30}" width="8" height="60" class="eq-kaide"/>
      <g transform="translate(${x} ${y})" id="${id}_doner">
        <circle r="20" id="${id}_govde" class="eq-dolgu"/>
        <g class="fan-kanatlar">${kanat}</g>
        <circle r="5.5" class="eq-gobek"/>
      </g>
      <rect x="${x - 11}" y="${y + 26}" width="22" height="13" class="eq-motor"/>
      <text x="${x}" y="${y - 34}" class="et-eq" text-anchor="middle">${E(id)}</text>
      <text id="${id}_durum" x="${x}" y="${y + 52}" class="et-durum"
            text-anchor="middle">—</text>
    </g>`;
    this._b(`${id}_govde`, { tip: 'govde', etiket: `fan.${id}.durum` });
    this._b(`${id}_doner`, { tip: 'donme', etiket: `fan.${id}.durum` });
    this._b(`${id}_durum`, { tip: 'durum', etiket: `fan.${id}.durum` });
    this._c(`eq_${id}`, { hedef: `fan.${id}`, tip: 'fan', ad: `${id} — ${ad}` });
    return this;
  }

  /* ================================================== OLCUM */

  /** ISA-5.1 olcum balonu + deger kutusu.
   *  fn: AT analiz · FT debi · PT basinc · LT seviye · IT akim · WT tarti · SC hiz */
  olcum(x, y, bx, by, fn, etiket, ad, birim, opt = {}) {
    const eid = 'v_' + etiket.replace(/[^\w]/g, '_');
    const w = opt.genis || 66;
    this.kat.olcum += `<g class="olcum">
      <line x1="${x}" y1="${y}" x2="${bx}" y2="${by}" class="ol-baglanti"/>
      <circle id="${eid}_balon" cx="${bx}" cy="${by}" r="16" class="ol-balon"/>
      <line x1="${bx - 16}" y1="${by}" x2="${bx + 16}" y2="${by}" class="ol-ayirac"/>
      <text x="${bx}" y="${by - 4}" class="ol-fn" text-anchor="middle">${fn}</text>
      <text x="${bx}" y="${by + 11}" class="ol-no" text-anchor="middle">${this._no++}</text>
      <rect id="${eid}_kutu" x="${bx - w / 2}" y="${by + 19}" width="${w}" height="21"
            class="ol-kutu"/>
      <text id="${eid}" x="${bx + w / 2 - 20}" y="${by + 34}" class="ol-deger"
            text-anchor="end">—</text>
      <text x="${bx + w / 2 - 5}" y="${by + 34}" class="ol-birim" text-anchor="end">${E(birim)}</text>
      <text x="${bx}" y="${by + 52}" class="ol-etiket" text-anchor="middle">${E(ad)}</text>
    </g>`;
    this._b(eid, { tip: 'deger', etiket, ondalik: opt.ondalik ?? 1 });
    this._b(`${eid}_balon`, { tip: 'balon', etiket });
    this._b(`${eid}_kutu`, { tip: 'kutu', etiket });
    return this;
  }

  /** Kucuk deger etiketi (balonsuz) */
  deger(x, y, etiket, ad, birim, ondalik = 0) {
    const eid = 'v_' + etiket.replace(/[^\w]/g, '_');
    this.kat.olcum += `<g class="mini-deger">
      <rect x="${x}" y="${y}" width="78" height="30" class="ol-kutu" id="${eid}_kutu"/>
      <text x="${x + 5}" y="${y + 11}" class="ol-etiket">${E(ad)}</text>
      <text id="${eid}" x="${x + 56}" y="${y + 25}" class="ol-deger" text-anchor="end">—</text>
      <text x="${x + 73}" y="${y + 25}" class="ol-birim" text-anchor="end">${E(birim)}</text>
    </g>`;
    this._b(eid, { tip: 'deger', etiket, ondalik });
    this._b(`${eid}_kutu`, { tip: 'kutu', etiket });
    return this;
  }

  /** Baslik / aciklama metni */
  not(x, y, metin, sinif = 'et-not') {
    this.kat.yazi += `<text x="${x}" y="${y}" class="${sinif}">${E(metin)}</text>`;
    return this;
  }

  /** Alan cercevesi — proses bolgelerini ayirir */
  bolge(x, y, w, h, baslik) {
    this.kat.boru = `<g class="bolge"><rect x="${x}" y="${y}" width="${w}" height="${h}"
        rx="4" class="bolge-kutu"/>
      <text x="${x + 10}" y="${y + 16}" class="bolge-baslik">${E(baslik)}</text></g>`
      + this.kat.boru;
    return this;
  }

  bitir(W, H) {
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"
            id="proses-svg" preserveAspectRatio="xMidYMid meet">
        <rect x="0" y="0" width="${W}" height="${H}" class="zemin"/>
        <g id="k-boru">${this.kat.boru}</g>
        <g id="k-ekipman">${this.kat.ekipman}</g>
        <g id="k-olcum">${this.kat.olcum}</g>
        <g id="k-yazi">${this.kat.yazi}</g>
      </svg>`,
      bind: this.bind, click: this.click,
    };
  }
}

window.HMI = window.HMI || {};
window.HMI.Cizim = Cizim;
