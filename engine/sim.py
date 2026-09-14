"""
RemoteOps — Simulasyon cekirdegi.

Uc proses adasini birlestirir ve contract.md'ye uygun 'tick' uretir:

  1) HAVALANDIRMA  (network.py)  — Atkinson + Hardy-Cross/Newton-Raphson
  2) GAZ           (bu dosya)    — advection + difuzyon + kaldirma kuvveti
  3) CEVHER + SU   (proses.py)   — bunker/besleyici/kirici/bant/pompa, interlock

Gaz modeli (CH4):
    Kararli hal karisim:   C_ss = kaynak / (Q + kaynak) * 100      [%]
    Advection gecikmesi:   dC/dt = (C_ss - C) / tau,  tau = V / Q  [s]
    Tabakalasma (buoyancy):
        Metan havadan hafiftir. Hava hizi dustukce tavanda birikir.
        Tavan sensoru ortalamadan yuksek okur:
            tabaka = 1 + kl * max(0, (v_kritik - v) / v_kritik)
    NOT: Sadece Fick difuzyonu DEGIL. Tasima + kaldirma kuvveti birlikte.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from network import Sebeke
from proses import ProsesHatti

VARSAYILAN_SEBEKE = Path(__file__).resolve().parent.parent / "data" / "sebeke_ocak1.json"

V_KRITIK = 2.0      # m/s — altinda tabakalasma baslar
KL = 1.2            # tabakalasma siddeti
O2_TEMIZ = 20.9     # %


@dataclass
class AlarmTanimi:
    id: str
    etiket: str
    prioritet: int
    mesaj: str
    yon: str                 # "ust" (deger >= esik) | "alt" (deger <= esik)
    esik: float
    histerezis: float = 0.0  # geri donus payi — titremeyi (chattering) onler
    alan: str = "genel"      # hangi ekranda gosterilecek


@dataclass
class AktifAlarm:
    id: str
    etiket: str
    prioritet: int
    mesaj: str
    vaxt: int
    alan: str = "genel"
    tesdiqlendi: bool = False
    aktiv: bool = True


@dataclass
class Simulasyon:
    sebeke: Sebeke = field(default=None)
    proses: ProsesHatti = field(default_factory=ProsesHatti)
    t: int = 0

    # gaz durumu: arin -> CH4 % (ortalama)
    ch4: dict[str, float] = field(default_factory=dict)
    gaz_carpani: dict[str, float] = field(default_factory=dict)

    # alarmlar
    tanimlar: list[AlarmTanimi] = field(default_factory=list)
    aktif: dict[str, AktifAlarm] = field(default_factory=dict)
    _sayac: int = 0
    olaylar: list[dict] = field(default_factory=list)
    son_engel: str = ""              # son interlock reddi (arayuz gosterir)

    # ---------------------------------------------------------------- kurulum
    @classmethod
    def olustur(cls, sebeke_yolu: str | Path = VARSAYILAN_SEBEKE) -> "Simulasyon":
        s = cls(sebeke=Sebeke.yukle(sebeke_yolu))
        s.sebeke.coz()
        for g in s.sebeke.gaz_kaynaklari:
            s.gaz_carpani[g["arin"]] = 1.0
            s.ch4[g["arin"]] = s._ch4_kararli(g["arin"])
        s.tanimlar = s._alarm_tanimlari()
        return s

    def _alarm_tanimlari(self) -> list[AlarmTanimi]:
        e = self.sebeke.esikler
        ch4 = e.get("ch4", {"p3": 1.0, "p2": 1.5, "p1": 2.0})
        t: list[AlarmTanimi] = []

        # --- havalandirma / gaz ---
        for arin in self.ch4:
            no = arin.split("_")[1]
            t += [
                AlarmTanimi(f"CH4_P1_{arin}", f"qaz.ch4.{arin}", 1,
                            f"CH4 KRITIK — ARIN {no} (>%{ch4['p1']})", "ust", ch4["p1"], 0.1, "gaz"),
                AlarmTanimi(f"CH4_P2_{arin}", f"qaz.ch4.{arin}", 2,
                            f"CH4 yuksek — ARIN {no} (>%{ch4['p2']})", "ust", ch4["p2"], 0.1, "gaz"),
                AlarmTanimi(f"CH4_P3_{arin}", f"qaz.ch4.{arin}", 3,
                            f"CH4 esik ustu — ARIN {no} (>%{ch4['p3']})", "ust", ch4["p3"], 0.1, "gaz"),
                AlarmTanimi(f"HIZ_P2_{arin}", f"arin.{arin}.hiz", 2,
                            f"Hava hizi dusuk — ARIN {no}", "alt", 1.5, 0.2, "hava"),
            ]
        t += [
            AlarmTanimi("FAN_P1", "fan.ana_1.durum", 1, "ANA FAN DURDU", "alt", 0.5, 0, "hava"),
            AlarmTanimi("DEBI_P2", "fan.ana_1.debi", 2,
                        "Ocak debisi dusuk (<90 m3/s)", "alt", 90.0, 3.0, "hava"),
        ]

        # --- cevher hatti ---
        for mid, ad in (("CR01", "KIRICI"), ("CV01", "BANT 01"),
                        ("CV02", "BANT 02"), ("FE01", "BESLEYICI")):
            t.append(AlarmTanimi(f"TRIP_{mid}", f"motor.{mid}.ariza", 1,
                                 f"{ad} ARIZA — trip", "ust", 0.5, 0, "cevher"))
        t += [
            AlarmTanimi("CR01_YUK", "motor.CR01.yuk", 2,
                        "Kirici motoru yuksek yukte (>%125)", "ust", 125.0, 8.0, "cevher"),
            AlarmTanimi("BN02_HI", "bunker.BN02.seviyye", 2,
                        "BN02 surge bunkeri yuksek (>%85)", "ust", 85.0, 4.0, "cevher"),
            AlarmTanimi("BN01_LO", "bunker.BN01.seviyye", 3,
                        "BN01 ROM bunkeri dusuk (<%12)", "alt", 12.0, 4.0, "cevher"),
        ]

        # --- su atma ---
        t += [
            AlarmTanimi("SUMP_P3", "sump.S1.seviyye", 3,
                        "Sump seviyesi yuksek (>%75)", "ust", 75.0, 3.0, "su"),
            AlarmTanimi("SUMP_P1", "sump.S1.seviyye", 1,
                        "SUMP TASMA RISKI (>%92)", "ust", 92.0, 3.0, "su"),
            AlarmTanimi("TK01_HI", "tank.TK01.seviyye", 2,
                        "TK01 cokeltme tanki yuksek (>%80)", "ust", 80.0, 4.0, "su"),
            AlarmTanimi("TRIP_P1", "motor.P1.ariza", 2, "POMPA P1 ARIZA", "ust", 0.5, 0, "su"),
            AlarmTanimi("TRIP_P2", "motor.P2.ariza", 2, "POMPA P2 ARIZA", "ust", 0.5, 0, "su"),
        ]
        return t

    # ---------------------------------------------------------------- gaz fizigi
    def _ch4_kararli(self, arin: str) -> float:
        for g in self.sebeke.gaz_kaynaklari:
            if g["arin"] == arin:
                q = self.sebeke.arin_debileri().get(arin, 0.001)
                kaynak = g["ch4_m3_s"] * self.gaz_carpani.get(arin, 1.0)
                return kaynak / (max(q, 0.001) + kaynak) * 100.0
        return 0.0

    def _arin_kolu(self, arin: str):
        for k in self.sebeke.kollar.values():
            if k.arin == arin:
                return k
        return None

    def _tabaka_carpani(self, arin: str) -> float:
        """Tavan sensoru / ortalama orani. Hiz dustukce metan tavanda birikir."""
        k = self._arin_kolu(arin)
        if k is None:
            return 1.0
        return 1.0 + KL * max(0.0, (V_KRITIK - k.hiz) / V_KRITIK)

    def _gaz_adim(self, dt: float) -> None:
        for arin in self.ch4:
            k = self._arin_kolu(arin)
            q = max(abs(k.Q), 0.05) if k else 0.05
            hacim = (k.alan * 150.0) if k else 1000.0
            tau = max(hacim / q, 2.0)
            hedef = self._ch4_kararli(arin)
            self.ch4[arin] += (hedef - self.ch4[arin]) * (dt / tau)

    # ---------------------------------------------------------------- alarm
    def _deger(self, etiket: str, d: dict) -> float:
        v = d.get(etiket)
        if isinstance(v, bool):
            return 1.0 if v else 0.0
        if isinstance(v, str):
            return 0.0 if v in ("dayandi", "ariza", "bagli") else 1.0
        return float(v) if v is not None else 0.0

    def _alarm_adim(self, d: dict) -> None:
        for td in self.tanimlar:
            v = self._deger(td.etiket, d)
            var = td.id in self.aktif and self.aktif[td.id].aktiv
            if td.yon == "ust":
                tetik, birak = v >= td.esik, v < td.esik - td.histerezis
            else:
                tetik, birak = v <= td.esik, v > td.esik + td.histerezis

            if tetik and not var:
                self._sayac += 1
                self.aktif[td.id] = AktifAlarm(
                    id=f"A{self._sayac:03d}", etiket=td.etiket, prioritet=td.prioritet,
                    mesaj=td.mesaj, vaxt=self.t, alan=td.alan)
                self.olaylar.append({"t": self.t, "tip": "alarm",
                                     "ad": td.mesaj, "prioritet": td.prioritet})
            elif birak and var:
                self.aktif[td.id].aktiv = False

    # ---------------------------------------------------------------- adim
    def adim(self, dt: float = 1.0) -> None:
        self.sebeke.coz()
        self._gaz_adim(dt)
        self.proses.adim(dt)
        if self.proses._engel:
            self.son_engel = self.proses._engel[-1]
            for e in self.proses._engel:
                self.olaylar.append({"t": self.t, "tip": "interlock", "ad": e})
            self.proses._engel.clear()
        self._alarm_adim(self.deyerler())
        self.t += int(dt)

    # ---------------------------------------------------------------- cikti
    def deyerler(self) -> dict:
        s = self.sebeke
        f = s.fan_bilgisi()
        d: dict[str, float | str] = {
            "fan.ana_1.debi": round(f["debi"], 1),
            "fan.ana_1.basinc": round(f["basinc"]),
            "fan.ana_1.rpm": round(980 * (1.0 if f["calisiyor"] else 0.0)),
            "fan.ana_1.guc": round(f["guc_kw"]),
            "fan.ana_1.durum": "isliyir" if f["calisiyor"] else "dayandi",
        }
        for kid, k in s.kollar.items():
            d[f"qol.{kid}.debi"] = round(abs(k.Q), 2)
            d[f"qol.{kid}.hiz"] = round(k.hiz, 2)
            d[f"qol.{kid}.yon"] = 1 if k.Q >= 0 else -1
        for arin, c in self.ch4.items():
            tavan = c * self._tabaka_carpani(arin)
            k = self._arin_kolu(arin)
            d[f"qaz.ch4.{arin}"] = round(tavan, 2)
            d[f"qaz.ch4_ort.{arin}"] = round(c, 2)
            d[f"qaz.o2.{arin}"] = round(O2_TEMIZ * (1 - tavan / 100.0), 1)
            d[f"arin.{arin}.debi"] = round(abs(k.Q), 1) if k else 0.0
            d[f"arin.{arin}.hiz"] = round(k.hiz, 2) if k else 0.0
        for k in s.kollar.values():
            if k.kapi_id:
                acik = k.R < (k.kapi_bagli_R * 0.5)
                d[f"qapi.{k.kapi_id}.durum"] = "acik" if acik else "bagli"
            if k.tenzim_id:
                import math
                lo, hi = k.tenzim_min_R, k.tenzim_max_R
                a = math.log(max(k.R, lo) / hi) / math.log(lo / hi)
                d[f"tenzim.{k.tenzim_id}.acilim"] = round(max(0, min(100, a * 100)))

        d.update(self.proses.deyerler())
        return d

    def tick(self) -> dict:
        return {
            "tip": "tick", "t": self.t, "deyerler": self.deyerler(),
            "engel": self.son_engel,
            "alarmlar": [
                {"id": a.id, "etiket": a.etiket, "prioritet": a.prioritet,
                 "mesaj": a.mesaj, "vaxt": a.vaxt, "alan": a.alan,
                 "tesdiqlendi": a.tesdiqlendi, "aktiv": a.aktiv}
                for a in sorted(self.aktif.values(), key=lambda x: (x.prioritet, x.vaxt))
                if a.aktiv or not a.tesdiqlendi
            ],
        }

    def init_mesaji(self, senaryo: dict | None = None) -> dict:
        ch4 = self.sebeke.esikler.get("ch4", {})
        et: dict[str, dict] = {}
        for arin in self.ch4:
            et[f"qaz.ch4.{arin}"] = {"vahid": "%", "min": 0, "max": 5,
                                     "normal": [0, ch4.get("p3", 1.0)],
                                     "p3": ch4.get("p3"), "p2": ch4.get("p2"), "p1": ch4.get("p1")}
            et[f"arin.{arin}.debi"] = {"vahid": "m3/s", "min": 0, "max": 60,
                                       "normal": [25, 50], "p2": 20}
            et[f"arin.{arin}.hiz"] = {"vahid": "m/s", "min": 0, "max": 8,
                                      "normal": [1.5, 6.0], "p2": 1.5}
        et.update({
            "fan.ana_1.debi":   {"vahid": "m3/s", "min": 0, "max": 180, "normal": [100, 140], "p2": 90},
            "fan.ana_1.basinc": {"vahid": "Pa", "min": 0, "max": 3200, "normal": [1500, 2400]},
            "fan.ana_1.guc":    {"vahid": "kW", "min": 0, "max": 500, "normal": [200, 350]},
            "motor.CR01.akim":  {"vahid": "A", "min": 0, "max": 560, "normal": [180, 400], "p2": 420},
            "motor.CV01.akim":  {"vahid": "A", "min": 0, "max": 180, "normal": [45, 130], "p2": 150},
            "motor.CV02.akim":  {"vahid": "A", "min": 0, "max": 180, "normal": [45, 130], "p2": 150},
            "motor.FE01.akim":  {"vahid": "A", "min": 0, "max": 100, "normal": [20, 70]},
            "motor.P1.akim":    {"vahid": "A", "min": 0, "max": 140, "normal": [70, 100]},
            "motor.P2.akim":    {"vahid": "A", "min": 0, "max": 140, "normal": [70, 100]},
            "bunker.BN01.seviyye": {"vahid": "%", "min": 0, "max": 100, "normal": [20, 85], "p3": 12},
            "bunker.BN02.seviyye": {"vahid": "%", "min": 0, "max": 100, "normal": [15, 80], "p2": 85},
            "tank.TK01.seviyye": {"vahid": "%", "min": 0, "max": 100, "normal": [20, 70], "p2": 80},
            "sump.S1.seviyye":  {"vahid": "%", "min": 0, "max": 100, "normal": [20, 70],
                                 "p3": 75, "p1": 92},
            "bant.CV01.yuk":    {"vahid": "t/h", "min": 0, "max": 450, "normal": [150, 380]},
            "bant.CV02.yuk":    {"vahid": "t/h", "min": 0, "max": 450, "normal": [150, 380]},
            "basma.debi":       {"vahid": "L/s", "min": 0, "max": 120, "normal": [40, 95]},
            "basma.basinc":     {"vahid": "bar", "min": 0, "max": 32, "normal": [15, 26]},
            "uretim.vardiya.ton": {"vahid": "t", "min": 0, "max": 3000, "normal": [0, 3000]},
        })
        return {"tip": "init", "sema": "ocak1",
                "senaryo": senaryo or {"id": "S00", "ad": "Normal isletme", "sure_sn": 0},
                "etiketler": et}

    # ---------------------------------------------------------------- komut
    def emr(self, hedef: str, emr: str, deyer: float | None = None) -> dict:
        tip, _, ad = hedef.partition(".")
        ok, sebep = False, ""

        if tip == "qapi":
            ok = self.sebeke.kapi_ayarla(ad, emr == "ac")
        elif tip == "tenzim" and emr == "ayarla" and deyer is not None:
            ok = self.sebeke.tenzim_ayarla(ad, float(deyer))
        elif tip == "fan" and emr in ("basla", "dayandir"):
            ok = self.sebeke.fan_ayarla(ad, emr == "basla")
        else:
            ok, sebep = self.proses.emr(hedef, emr, deyer)

        if ok:
            self.sebeke.coz()
            self.son_engel = ""
            self.olaylar.append({"t": self.t, "tip": "emr", "ad": f"{hedef} -> {emr}"})
            return {"tip": "onay", "hedef": hedef, "emr": emr}

        self.son_engel = sebep or f"{hedef} / {emr} uygulanamadi"
        return {"tip": "xeta", "kod": "GECERSIZ_EMR", "hedef": hedef,
                "mesaj": self.son_engel}

    def ack(self, alarm_id: str) -> None:
        for a in self.aktif.values():
            if (alarm_id == "*" or a.id == alarm_id) and not a.tesdiqlendi:
                a.tesdiqlendi = True
                self.olaylar.append({"t": self.t, "tip": "ack", "ad": f"{a.id} tesdiqlendi"})

    def sifirla(self) -> None:
        self.sebeke.sifirla(); self.sebeke.coz()
        self.proses.sifirla()
        self.t = 0
        self.aktif.clear(); self.olaylar.clear(); self._sayac = 0
        self.son_engel = ""
        for a in self.gaz_carpani:
            self.gaz_carpani[a] = 1.0
        for a in self.ch4:
            self.ch4[a] = self._ch4_kararli(a)


if __name__ == "__main__":
    sim = Simulasyon.olustur()
    print("=== Baslangic ===")
    d = sim.tick()["deyerler"]
    for e in ("fan.ana_1.debi", "qaz.ch4.ARIN_2", "bunker.BN01.seviyye",
              "motor.CR01.durum", "sump.S1.seviyye", "vana.HV01.durum"):
        print(f"   {e:<26} = {d[e]}")

    print("\n=== Interlock testi: once besleyiciyi baslatmayi dene ===")
    print("  ", sim.emr("motor.FE01", "basla")["mesaj"])

    print("\n=== Dogru baslatma sirasi (akistan geriye) ===")
    for mid in ("CV02", "CV01", "CR01", "FE01"):
        r = sim.emr(f"motor.{mid}", "basla")
        print(f"   {mid}: {'OK' if r['tip'] == 'onay' else r['mesaj']}")

    for _ in range(120):
        sim.adim()
    d = sim.tick()["deyerler"]
    print(f"\n=== 120 sn sonra ===")
    for e in ("motor.CR01.akim", "bant.CV01.yuk", "bunker.BN02.seviyye",
              "uretim.vardiya.ton", "sump.S1.seviyye"):
        print(f"   {e:<26} = {d[e]}")
    print(f"   aktif alarm: {len(sim.tick()['alarmlar'])}")
