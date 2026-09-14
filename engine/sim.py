"""
RemoteOps - Simulasyon cekirdegi.

Ventilasyon (network.py) uzerine gaz, su ve konveyor modellerini ekler,
alarmlari uretir ve contract.md'ye uygun 'tick' mesaji cikarir.

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

VARSAYILAN_SEBEKE = Path(__file__).resolve().parent.parent / "data" / "sebeke_ocak1.json"

V_KRITIK = 2.0      # m/s - altinda tabakalasma baslar
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
    histerezis: float = 0.0  # geri donus payi - titremeyi (chattering) onler


@dataclass
class AktifAlarm:
    id: str
    etiket: str
    prioritet: int
    mesaj: str
    vaxt: int
    tesdiqlendi: bool = False
    aktiv: bool = True


@dataclass
class Simulasyon:
    sebeke: Sebeke = field(default=None)
    t: int = 0

    # gaz durumu:  arin -> CH4 %  (ortalama)
    ch4: dict[str, float] = field(default_factory=dict)
    gaz_carpani: dict[str, float] = field(default_factory=dict)   # senaryo: emisyon artisi

    # su atma
    sump_hacim: float = 30.0          # m3
    sump_max: float = 60.0            # m3
    su_girisi: float = 0.075          # m3/s (P1 tek basina yetmez)
    nasos: dict[str, bool] = field(default_factory=lambda: {"P1": True, "P2": False})
    nasos_debi: float = 0.045         # m3/s (her nasos)

    # konveyor
    konveyor_calisiyor: bool = True
    konveyor_yuk: float = 62.0        # %
    konveyor_hedef_yuk: float = 62.0
    konveyor_ariza: bool = False

    # alarmlar
    tanimlar: list[AlarmTanimi] = field(default_factory=list)
    aktif: dict[str, AktifAlarm] = field(default_factory=dict)
    _sayac: int = 0
    _onceki: dict[str, float] = field(default_factory=dict)
    olaylar: list[dict] = field(default_factory=list)

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
        for arin in self.ch4:
            no = arin.split("_")[1]
            t += [
                AlarmTanimi(f"CH4_P1_{arin}", f"qaz.ch4.{arin}", 1,
                            f"CH4 KRITIK - ARIN {no} (>%{ch4['p1']})", "ust", ch4["p1"], 0.1),
                AlarmTanimi(f"CH4_P2_{arin}", f"qaz.ch4.{arin}", 2,
                            f"CH4 yuksek - ARIN {no} (>%{ch4['p2']})", "ust", ch4["p2"], 0.1),
                AlarmTanimi(f"CH4_P3_{arin}", f"qaz.ch4.{arin}", 3,
                            f"CH4 esik ustu - ARIN {no} (>%{ch4['p3']})", "ust", ch4["p3"], 0.1),
                AlarmTanimi(f"HIZ_P2_{arin}", f"arin.{arin}.hiz", 2,
                            f"Hava hizi dusuk - ARIN {no}", "alt", 1.5, 0.2),
            ]
        t += [
            AlarmTanimi("FAN_P1", "fan.ana_1.durum", 1, "ANA FAN DURDU", "alt", 0.5),
            AlarmTanimi("DEBI_P2", "fan.ana_1.debi", 2, "Ocak debisi dusuk (<90 m3/s)", "alt", 90.0, 3.0),
            AlarmTanimi("SUMP_P3", "sump.S1.seviyye", 3, "Sump seviyesi yuksek (>%75)", "ust", 75.0, 3.0),
            AlarmTanimi("SUMP_P1", "sump.S1.seviyye", 1, "SUMP TASMA RISKI (>%92)", "ust", 92.0, 3.0),
            AlarmTanimi("KONV_P2", "konveyer.K1.akim", 2, "Konveyor akimi yuksek", "ust", 210.0, 10.0),
            AlarmTanimi("KONV_P1", "konveyer.K1.durum", 1, "KONVEYOR ARIZA - durdu", "alt", 0.5),
        ]
        return t

    # ---------------------------------------------------------------- fizik

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
            hacim = (k.alan * 150.0) if k else 1000.0      # arin hava hacmi ~ A*L
            tau = max(hacim / q, 2.0)                       # advection zaman sabiti
            hedef = self._ch4_kararli(arin)
            self.ch4[arin] += (hedef - self.ch4[arin]) * (dt / tau)

    def _su_adim(self, dt: float) -> None:
        pompalanan = sum(self.nasos_debi for a in self.nasos.values() if a)
        self.sump_hacim += (self.su_girisi - pompalanan) * dt
        self.sump_hacim = max(0.0, min(self.sump_max * 1.05, self.sump_hacim))

    def _konveyor_adim(self, dt: float) -> None:
        if not self.konveyor_calisiyor:
            self.konveyor_yuk += (0.0 - self.konveyor_yuk) * (dt / 8.0)
            return
        self.konveyor_yuk += (self.konveyor_hedef_yuk - self.konveyor_yuk) * (dt / 12.0)
        if self.konveyor_akim() > 250.0:                    # termik koruma
            self.konveyor_calisiyor = False
            self.konveyor_ariza = True

    def konveyor_akim(self) -> float:
        if not self.konveyor_calisiyor:
            return 0.0
        return 42.0 + 1.9 * self.konveyor_yuk

    # ---------------------------------------------------------------- alarm

    def _deger(self, etiket: str, d: dict | None = None) -> float:
        d = d if d is not None else self.deyerler()
        v = d.get(etiket)
        if isinstance(v, bool):
            return 1.0 if v else 0.0
        if isinstance(v, str):
            return 0.0 if v in ("dayandi", "ariza") else 1.0
        return float(v) if v is not None else 0.0

    def _alarm_adim(self) -> None:
        anlik = self.deyerler()          # tick basina TEK kez hesapla
        for td in self.tanimlar:
            v = self._deger(td.etiket, anlik)
            var = td.id in self.aktif and self.aktif[td.id].aktiv
            if td.yon == "ust":
                tetik = v >= td.esik
                birak = v < td.esik - td.histerezis
            else:
                tetik = v <= td.esik
                birak = v > td.esik + td.histerezis

            if tetik and not var:
                self._sayac += 1
                self.aktif[td.id] = AktifAlarm(
                    id=f"A{self._sayac:03d}", etiket=td.etiket, prioritet=td.prioritet,
                    mesaj=td.mesaj, vaxt=self.t)
                self.olaylar.append({"t": self.t, "tip": "alarm",
                                     "ad": td.mesaj, "prioritet": td.prioritet})
            elif birak and var:
                self.aktif[td.id].aktiv = False

    # ---------------------------------------------------------------- adim

    def adim(self, dt: float = 1.0) -> None:
        self.sebeke.coz()
        self._gaz_adim(dt)
        self._su_adim(dt)
        self._konveyor_adim(dt)
        self._alarm_adim()
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
            "sump.S1.seviyye": round(self.sump_hacim / self.sump_max * 100, 1),
            "nasos.P1.durum": "isliyir" if self.nasos["P1"] else "dayandi",
            "nasos.P2.durum": "isliyir" if self.nasos["P2"] else "dayandi",
            "nasos.P1.akim": round(88.0 if self.nasos["P1"] else 0.0, 1),
            "nasos.P2.akim": round(88.0 if self.nasos["P2"] else 0.0, 1),
            "konveyer.K1.yuk": round(self.konveyor_yuk, 1),
            "konveyer.K1.akim": round(self.konveyor_akim(), 1),
            "konveyer.K1.durum": ("ariza" if self.konveyor_ariza
                                  else "isliyir" if self.konveyor_calisiyor else "dayandi"),
        }
        for kid, k in s.kollar.items():
            d[f"qol.{kid}.debi"] = round(abs(k.Q), 2)
            d[f"qol.{kid}.hiz"] = round(k.hiz, 2)
            d[f"qol.{kid}.yon"] = 1 if k.Q >= 0 else -1   # akis oku yonu
        for arin, c in self.ch4.items():
            tavan = c * self._tabaka_carpani(arin)
            k = self._arin_kolu(arin)
            d[f"qaz.ch4.{arin}"] = round(tavan, 2)            # tavan sensoru okur
            d[f"qaz.ch4_ort.{arin}"] = round(c, 2)            # ortalama (referans)
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
        return d

    def tick(self) -> dict:
        return {
            "tip": "tick",
            "t": self.t,
            "deyerler": self.deyerler(),
            "alarmlar": [
                {"id": a.id, "etiket": a.etiket, "prioritet": a.prioritet,
                 "mesaj": a.mesaj, "vaxt": a.vaxt,
                 "tesdiqlendi": a.tesdiqlendi, "aktiv": a.aktiv}
                for a in sorted(self.aktif.values(), key=lambda x: (x.prioritet, x.vaxt))
                if a.aktiv or not a.tesdiqlendi
            ],
        }

    def init_mesaji(self, senaryo: dict | None = None) -> dict:
        e = self.sebeke.esikler
        ch4 = e.get("ch4", {})
        etiketler: dict[str, dict] = {}
        for arin in self.ch4:
            etiketler[f"qaz.ch4.{arin}"] = {
                "vahid": "%", "min": 0, "max": 5, "normal": [0, ch4.get("p3", 1.0)],
                "p3": ch4.get("p3"), "p2": ch4.get("p2"), "p1": ch4.get("p1")}
            etiketler[f"arin.{arin}.debi"] = {
                "vahid": "m3/s", "min": 0, "max": 60, "normal": [25, 50], "p2": 20}
            etiketler[f"arin.{arin}.hiz"] = {
                "vahid": "m/s", "min": 0, "max": 8, "normal": [1.5, 6.0], "p2": 1.5}
        etiketler.update({
            "fan.ana_1.debi":   {"vahid": "m3/s", "min": 0, "max": 180, "normal": [100, 140], "p2": 90},
            "fan.ana_1.basinc": {"vahid": "Pa", "min": 0, "max": 3200, "normal": [1500, 2400]},
            "fan.ana_1.guc":    {"vahid": "kW", "min": 0, "max": 500, "normal": [200, 350]},
            "sump.S1.seviyye":  {"vahid": "%", "min": 0, "max": 100, "normal": [20, 70],
                                 "p3": 75, "p1": 92},
            "konveyer.K1.yuk":  {"vahid": "%", "min": 0, "max": 120, "normal": [30, 85]},
            "konveyer.K1.akim": {"vahid": "A", "min": 0, "max": 280, "normal": [80, 200],
                                 "p2": 210},
        })
        return {"tip": "init", "sema": "ocak1",
                "senaryo": senaryo or {"id": "S00", "ad": "Normal isletme", "sure_sn": 0},
                "etiketler": etiketler}

    # ---------------------------------------------------------------- komut

    def emr(self, hedef: str, emr: str, deyer: float | None = None) -> dict:
        tip, _, ad = hedef.partition(".")
        ok = False
        if tip == "qapi":
            ok = self.sebeke.kapi_ayarla(ad, emr == "ac")
        elif tip == "tenzim" and emr == "ayarla" and deyer is not None:
            ok = self.sebeke.tenzim_ayarla(ad, float(deyer))
        elif tip == "fan":
            if emr in ("basla", "dayandir"):
                ok = self.sebeke.fan_ayarla(ad, emr == "basla")
        elif tip == "nasos" and ad in self.nasos:
            self.nasos[ad] = (emr == "basla"); ok = True
        elif tip == "konveyer":
            if emr == "basla":
                self.konveyor_calisiyor, self.konveyor_ariza = True, False; ok = True
            elif emr == "dayandir":
                self.konveyor_calisiyor = False; ok = True

        if ok:
            self.sebeke.coz()
            self.olaylar.append({"t": self.t, "tip": "emr", "ad": f"{hedef} -> {emr}"})
            return {"tip": "onay", "hedef": hedef, "emr": emr}
        return {"tip": "xeta", "kod": "GECERSIZ_EMR",
                "mesaj": f"{hedef} / {emr} uygulanamadi"}

    def ack(self, alarm_id: str) -> None:
        for a in self.aktif.values():
            if alarm_id == "*" or a.id == alarm_id:
                if not a.tesdiqlendi:
                    a.tesdiqlendi = True
                    self.olaylar.append({"t": self.t, "tip": "ack", "ad": f"{a.id} tesdiqlendi"})

    def sifirla(self) -> None:
        self.sebeke.sifirla(); self.sebeke.coz()
        self.t = 0
        self.aktif.clear(); self.olaylar.clear(); self._sayac = 0
        self.sump_hacim = 30.0
        self.nasos = {"P1": True, "P2": False}
        self.konveyor_calisiyor, self.konveyor_ariza = True, False
        self.konveyor_yuk = self.konveyor_hedef_yuk = 62.0
        for a in self.gaz_carpani:
            self.gaz_carpani[a] = 1.0
        for a in self.ch4:
            self.ch4[a] = self._ch4_kararli(a)


if __name__ == "__main__":
    sim = Simulasyon.olustur()
    print("t=0 baslangic:")
    d = sim.tick()["deyerler"]
    for e in ("fan.ana_1.debi", "fan.ana_1.basinc", "qaz.ch4.ARIN_1",
              "qaz.ch4.ARIN_2", "arin.ARIN_2.hiz", "sump.S1.seviyye",
              "konveyer.K1.akim", "qapi.QAPI_1.durum", "tenzim.T1.acilim"):
        print(f"   {e:<24} = {d[e]}")

    print("\nt=60'ta QAPI_1 aciliyor (kisa devre)...")
    for _ in range(60):
        sim.adim()
    sim.emr("qapi.QAPI_1", "ac")
    for adim in range(180):
        sim.adim()
        if adim % 60 == 59:
            tk = sim.tick()
            d = tk["deyerler"]
            print(f"   t={sim.t:>3}s  CH4_A2=%{d['qaz.ch4.ARIN_2']:<5} "
                  f"hiz={d['arin.ARIN_2.hiz']:<5} fan={d['fan.ana_1.debi']:<6} "
                  f"alarm={len(tk['alarmlar'])}")
    print("\nAktif alarmlar:")
    for a in sim.tick()["alarmlar"]:
        print(f"   P{a['prioritet']}  {a['mesaj']}")
