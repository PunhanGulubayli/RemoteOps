"""
RemoteOps — Yeralti cevher hatti + su atma prosesi

Havalandirma sebekesinin (network.py) YANINDA calisan ikinci proses adasi.
Gercek bir yeralti madeninde bulunan ekipman ve davranislar:

  CEVHER HATTI
    BN01 ROM bunkeri ─[FE01 apron besleyici]→ CR01 cene kiricisi
      → CV01 bant → BN02 surge bunkeri → CV02 bant → skip/kuyu

  SU ATMA
    ocak suyu → TK01 cokeltme tanki → HV01 motorlu vana → S1 sump
      → P1/P2 santrifuj pompalar → yuzeye basma

GERCEK SANAYI DAVRANISI — bunlar "gorsel" degil, mantiktir:
  * BASLATMA SIRASI akistan GERIYE dogru: CV02 → CV01 → CR01 → FE01
    (once bosaltan ekipman calisir, sonra besleyen). Aksi halde malzeme yigilir.
  * DURDURMA SIRASI akis YONUNDE: FE01 → CR01 → CV01 → CV02 (hat bosalsin)
  * INTERLOCK: besleyici, kirici calismadan calismaz; kirici, bant calismadan
    calismaz; bant, alici bunker doluyken calismaz
  * TRIP: motor asiri akim, kirici tikanma (choke), bunker yuksek seviye,
    pompa kuru calisma korumasi. Trip sonrasi RESET gerekir — kendiliginden
    calismaz. (Gercek sahada da boyledir.)
"""

from __future__ import annotations

from dataclasses import dataclass, field

# ---------------------------------------------------------------- sabitler
TPH_MAX = 420.0          # hattin nominal kapasitesi (ton/saat)
CR_NOMINAL_A = 310.0     # kirici nominal motor akimi
CR_TRIP_A = 520.0        # kirici trip esigi
CV_NOMINAL_A = 95.0
CV_TRIP_A = 165.0
FE_NOMINAL_A = 48.0
POMPA_A = 88.0
POMPA_DEBI = 0.045       # m3/s (her pompa)


@dataclass
class Motor:
    """Ortak motor davranisi: calisiyor / durdu / trip. Trip RESET ister."""
    id: str
    ad: str
    nominal_a: float
    trip_a: float
    calisiyor: bool = False
    trip: bool = False
    trip_sebep: str = ""
    akim: float = 0.0
    calisma_sn: int = 0

    @property
    def durum(self) -> str:
        if self.trip:
            return "ariza"
        return "isliyir" if self.calisiyor else "dayandi"

    def basla(self) -> tuple[bool, str]:
        if self.trip:
            return False, f"{self.id} ARIZA durumunda — once RESET gerekir"
        if self.calisiyor:
            return False, f"{self.id} zaten calisiyor"
        self.calisiyor = True
        return True, ""

    def dayandir(self) -> tuple[bool, str]:
        self.calisiyor = False
        return True, ""

    def sifirla_trip(self) -> tuple[bool, str]:
        if not self.trip:
            return False, f"{self.id} arizali degil"
        self.trip = False
        self.trip_sebep = ""
        return True, ""

    def trip_et(self, sebep: str) -> None:
        self.calisiyor = False
        self.trip = True
        self.trip_sebep = sebep

    def akim_adim(self, hedef_a: float, dt: float, tau: float = 3.0) -> None:
        hedef = hedef_a if self.calisiyor else 0.0
        self.akim += (hedef - self.akim) * (dt / tau)
        if self.calisiyor:
            self.calisma_sn += int(dt)
            if self.akim > self.trip_a:
                self.trip_et("asiri akim")


@dataclass
class Bunker:
    """Malzeme bunkeri / silo — kutle dengesi ile seviye."""
    id: str
    ad: str
    hacim_t: float           # ton kapasite
    dolu_t: float
    yuksek: float = 88.0     # % — bu seviyede besleme kesilir
    dusuk: float = 8.0       # %

    @property
    def seviye(self) -> float:
        return max(0.0, min(100.0, self.dolu_t / self.hacim_t * 100.0))

    def ekle(self, ton: float) -> float:
        """Ton ekler; tasan miktari dondurur."""
        bosluk = self.hacim_t - self.dolu_t
        alinan = min(ton, max(0.0, bosluk))
        self.dolu_t += alinan
        return ton - alinan

    def cek(self, ton: float) -> float:
        """Ton ceker; gercekte cekilebilen miktari dondurur."""
        alinan = min(ton, self.dolu_t)
        self.dolu_t -= alinan
        return alinan


@dataclass
class Vana:
    """Motorlu vana — aninda acilmaz, strok suresi vardir."""
    id: str
    ad: str
    acilim: float = 100.0        # %
    hedef: float = 100.0
    strok_sn: float = 12.0       # tam acik <-> tam kapali

    @property
    def durum(self) -> str:
        if self.acilim >= 99.0:
            return "acik"
        if self.acilim <= 1.0:
            return "bagli"
        return "hereket"

    def adim(self, dt: float) -> None:
        hiz = 100.0 / self.strok_sn * dt
        if self.acilim < self.hedef:
            self.acilim = min(self.hedef, self.acilim + hiz)
        elif self.acilim > self.hedef:
            self.acilim = max(self.hedef, self.acilim - hiz)


# ====================================================================
@dataclass
class ProsesHatti:
    """Cevher hatti + su atma. Havalandirmadan bagimsiz, ayni tick'te kosar."""

    # --- cevher hatti ---
    bn01: Bunker = field(default_factory=lambda: Bunker("BN01", "ROM bunkeri", 900.0, 520.0))
    bn02: Bunker = field(default_factory=lambda: Bunker("BN02", "Surge bunkeri", 420.0, 130.0))
    fe01: Motor = field(default_factory=lambda: Motor("FE01", "Apron besleyici", FE_NOMINAL_A, 92.0))
    cr01: Motor = field(default_factory=lambda: Motor("CR01", "Cene kiricisi", CR_NOMINAL_A, CR_TRIP_A))
    cv01: Motor = field(default_factory=lambda: Motor("CV01", "Bant 01", CV_NOMINAL_A, CV_TRIP_A))
    cv02: Motor = field(default_factory=lambda: Motor("CV02", "Bant 02", CV_NOMINAL_A, CV_TRIP_A))
    fe01_hiz: float = 70.0          # VSD %
    cr01_css: float = 125.0         # mm — kapali taraf acikligi
    cv01_yuk: float = 0.0           # t/h
    cv02_yuk: float = 0.0
    uretim_t: float = 0.0           # vardiya toplami
    _cr_dolgu: float = 0.0          # kirici hazne dolgusu (choke gostergesi)

    # --- su atma ---
    tk01: Bunker = field(default_factory=lambda: Bunker("TK01", "Cokeltme tanki", 260.0, 95.0))
    hv01: Vana = field(default_factory=lambda: Vana("HV01", "Sump besleme vanasi"))
    sump_m3: float = 30.0
    sump_max: float = 60.0
    su_girisi: float = 0.075        # m3/s — ocaktan gelen
    p1: Motor = field(default_factory=lambda: Motor("P1", "Sump pompasi 1", POMPA_A, 128.0,
                                                calisiyor=True))
    p2: Motor = field(default_factory=lambda: Motor("P2", "Sump pompasi 2", POMPA_A, 128.0))
    basma_debi: float = 0.0         # m3/s
    basma_basinc: float = 0.0       # bar

    # --- senaryo enjeksiyonlari ---
    cr_tikanma: float = 1.0         # >1 = kirici zorlaniyor
    cv01_kacik: bool = False        # bant kacikligi
    _engel: list = field(default_factory=list)   # son reddedilen emir sebepleri

    # ---------------------------------------------------------------- motorlar
    @property
    def motorlar(self) -> dict[str, Motor]:
        return {m.id: m for m in (self.fe01, self.cr01, self.cv01, self.cv02,
                                  self.p1, self.p2)}

    # ---------------------------------------------------------------- interlock
    def interlock(self, mid: str) -> tuple[bool, str]:
        """Bu ekipman SIMDI calisabilir mi? (False, sebep) doner.

        Gercek tesiste baslatma sirasi akistan GERIYE dogrudur.
        """
        if mid == "CV02":
            return True, ""
        if mid == "CV01":
            if not self.cv02.calisiyor:
                return False, "CV02 calismiyor — once asagi akis bandi baslatilmali"
            if self.bn02.seviye >= self.bn02.yuksek:
                return False, f"BN02 yuksek seviye (%{self.bn02.seviye:.0f}) — bant beslenemez"
            return True, ""
        if mid == "CR01":
            if not self.cv01.calisiyor:
                return False, "CV01 calismiyor — kirici bosaltamaz"
            return True, ""
        if mid == "FE01":
            if not self.cr01.calisiyor:
                return False, "CR01 calismiyor — besleyici kiriciyi doldurur"
            if self.bn01.seviye <= self.bn01.dusuk:
                return False, f"BN01 bos (%{self.bn01.seviye:.0f}) — beslenecek malzeme yok"
            return True, ""
        if mid in ("P1", "P2"):
            if self.sump_seviye <= 10.0:
                return False, f"Sump seviyesi dusuk (%{self.sump_seviye:.0f}) — kuru calisma riski"
            if self.hv01.acilim < 5.0:
                return False, "HV01 kapali — pompa basamaz"
            return True, ""
        return True, ""

    @property
    def sump_seviye(self) -> float:
        return max(0.0, min(100.0, self.sump_m3 / self.sump_max * 100.0))

    # ---------------------------------------------------------------- emir
    def emr(self, hedef: str, emr: str, deyer: float | None = None) -> tuple[bool, str]:
        tip, _, ad = hedef.partition(".")

        if tip == "motor" and ad in self.motorlar:
            m = self.motorlar[ad]
            if emr == "basla":
                ok, sebep = self.interlock(ad)
                if not ok:
                    return False, f"INTERLOCK: {sebep}"
                return m.basla()
            if emr == "dayandir":
                return m.dayandir()
            if emr == "sifirla":
                return m.sifirla_trip()
            return False, f"bilinmeyen emir: {emr}"

        if tip == "vsd" and ad == "FE01" and emr == "ayarla" and deyer is not None:
            self.fe01_hiz = max(0.0, min(100.0, float(deyer)))
            return True, ""

        if tip == "css" and ad == "CR01" and emr == "ayarla" and deyer is not None:
            self.cr01_css = max(80.0, min(200.0, float(deyer)))
            return True, ""

        if tip == "vana" and ad == "HV01":
            if emr == "ac":
                self.hv01.hedef = 100.0; return True, ""
            if emr == "bagla":
                self.hv01.hedef = 0.0; return True, ""
            if emr == "ayarla" and deyer is not None:
                self.hv01.hedef = max(0.0, min(100.0, float(deyer))); return True, ""

        return False, f"{hedef} / {emr} uygulanamadi"

    # ---------------------------------------------------------------- adim
    def adim(self, dt: float = 1.0) -> None:
        self._cevher_adim(dt)
        self._su_adim(dt)

    def _cevher_adim(self, dt: float) -> None:
        # --- interlock ihlali olusursa ekipman kendiliginden durur (gercekte de boyle) ---
        for mid in ("FE01", "CR01", "CV01"):
            m = self.motorlar[mid]
            if m.calisiyor:
                ok, sebep = self.interlock(mid)
                if not ok:
                    m.dayandir()
                    self._engel.append(f"{mid} interlock ile durdu: {sebep}")

        saat = dt / 3600.0

        # besleyici -> kirici haznesi
        besleme = 0.0
        if self.fe01.calisiyor:
            istenen = TPH_MAX * (self.fe01_hiz / 100.0) * saat
            besleme = self.bn01.cek(istenen)
        self._cr_dolgu += besleme

        # kirici -> CV01
        kirilan = 0.0
        if self.cr01.calisiyor:
            # CSS kucukse kapasite duser (ince kirma daha yavas)
            kapasite = TPH_MAX * (0.55 + 0.45 * (self.cr01_css - 80.0) / 120.0) * saat
            kapasite /= max(self.cr_tikanma, 0.2)
            kirilan = min(self._cr_dolgu, kapasite)
            self._cr_dolgu -= kirilan
        self.cv01_yuk = kirilan / max(saat, 1e-9) if self.cr01.calisiyor else 0.0

        # CV01 -> BN02
        if self.cv01.calisiyor:
            tasan = self.bn02.ekle(kirilan)
            if tasan > 0.001:
                self.cv01.trip_et("BN02 dolu — bant tasti")
        else:
            self.cv01_yuk = 0.0
            self._cr_dolgu += kirilan          # bant durduysa malzeme kiricida kalir

        # BN02 -> CV02 -> skip
        cekilen = 0.0
        if self.cv02.calisiyor:
            cekilen = self.bn02.cek(TPH_MAX * 0.85 * saat)
            self.uretim_t += cekilen
        self.cv02_yuk = cekilen / max(saat, 1e-9) if self.cv02.calisiyor else 0.0

        # --- motor akimlari ---
        # Kirici akimi GERCEK kirma debisine baglidir; hazne dolgusu ek yuk getirir
        # (malzeme yigildikca cene zorlanir -> choke yaklasimi).
        cr_debi = kirilan / max(saat, 1e-9)
        dolgu_orani = min(3.0, self._cr_dolgu / max(TPH_MAX * saat, 1e-9)) if saat else 0.0
        self.cr01.akim_adim(
            CR_NOMINAL_A * (0.28 + 0.72 * min(1.35, cr_debi / TPH_MAX)
                            + 0.22 * dolgu_orani) * self.cr_tikanma, dt)
        self.fe01.akim_adim(FE_NOMINAL_A * (0.4 + 0.6 * self.fe01_hiz / 100.0), dt)
        self.cv01.akim_adim(
            CV_NOMINAL_A * (0.45 + 0.55 * self.cv01_yuk / TPH_MAX) *
            (1.9 if self.cv01_kacik else 1.0), dt)
        self.cv02.akim_adim(CV_NOMINAL_A * (0.45 + 0.55 * self.cv02_yuk / TPH_MAX), dt)

        # kirici tikanmasi — hazne tasarsa
        if self._cr_dolgu > TPH_MAX * saat * 6 and self.cr01.calisiyor:
            self.cr01.trip_et("kirici tikandi (choke)")

    def _su_adim(self, dt: float) -> None:
        self.hv01.adim(dt)

        # ocak suyu -> cokeltme tanki (ton ~ m3 kabul)
        self.tk01.ekle(self.su_girisi * dt)

        # tank -> sump (vana acilimi ile)
        gecen = min(self.tk01.dolu_t, 0.12 * (self.hv01.acilim / 100.0) * dt)
        self.tk01.cek(gecen)
        self.sump_m3 += gecen

        # pompalar
        for p in (self.p1, self.p2):
            if p.calisiyor:
                ok, sebep = self.interlock(p.id)
                if not ok:
                    p.trip_et(sebep if "kuru" in sebep else "interlock")
        acik = sum(1 for p in (self.p1, self.p2) if p.calisiyor)
        pompalanan = min(self.sump_m3, acik * POMPA_DEBI * dt)
        self.sump_m3 = max(0.0, self.sump_m3 - pompalanan)
        self.basma_debi = pompalanan / dt if dt else 0.0
        self.basma_basinc = 0.0 if acik == 0 else (18.5 + 4.2 * (acik - 1))
        self.p1.akim_adim(POMPA_A, dt)
        self.p2.akim_adim(POMPA_A, dt)

    # ---------------------------------------------------------------- cikti
    def deyerler(self) -> dict:
        d: dict[str, float | str] = {}
        for m in self.motorlar.values():
            d[f"motor.{m.id}.durum"] = m.durum
            d[f"motor.{m.id}.akim"] = round(m.akim, 1)
            d[f"motor.{m.id}.yuk"] = round(m.akim / m.nominal_a * 100, 0)
            d[f"motor.{m.id}.trip"] = m.trip_sebep or "-"
            d[f"motor.{m.id}.ariza"] = 1 if m.trip else 0
            d[f"motor.{m.id}.calisiyor"] = 1 if m.calisiyor else 0
        # Interlock/permissive durumu — faceplate "calisma izni var mi" gosterir
        for mid in self.motorlar:
            izin, sebep = self.interlock(mid)
            d[f"interlock.{mid}.izin"] = 1 if izin else 0
            d[f"interlock.{mid}.sebep"] = sebep or "-"
        d.update({
            "bunker.BN01.seviyye": round(self.bn01.seviye, 1),
            "bunker.BN01.ton": round(self.bn01.dolu_t, 0),
            "bunker.BN02.seviyye": round(self.bn02.seviye, 1),
            "bunker.BN02.ton": round(self.bn02.dolu_t, 0),
            "vsd.FE01.hiz": round(self.fe01_hiz, 0),
            "css.CR01.acilim": round(self.cr01_css, 0),
            "bant.CV01.yuk": round(self.cv01_yuk, 0),
            "bant.CV02.yuk": round(self.cv02_yuk, 0),
            "uretim.vardiya.ton": round(self.uretim_t, 1),
            "tank.TK01.seviyye": round(self.tk01.seviye, 1),
            "vana.HV01.acilim": round(self.hv01.acilim, 0),
            "vana.HV01.durum": self.hv01.durum,
            "sump.S1.seviyye": round(self.sump_seviye, 1),
            "sump.S1.hacim": round(self.sump_m3, 1),
            "basma.debi": round(self.basma_debi * 1000, 1),      # L/s
            "basma.basinc": round(self.basma_basinc, 1),          # bar
        })
        return d

    def sifirla(self) -> None:
        yeni = ProsesHatti()
        for alan, deger in yeni.__dict__.items():
            setattr(self, alan, deger)
