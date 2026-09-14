"""
RemoteOps - Senaryo motoru + puanlama (ISA-18.2 tabanli)

Senaryo = YAML dosyasi. Kod yazmadan yeni senaryo eklenir.
Puanlama ANSI/ISA-18.2 / EEMUA 191 olculerine dayanir:
    - operator basina saatte alarm (hedef < 6)
    - alarm flood (10 dakikada > 10 alarm)
    - onay (ACK) gecikmesi
    - dogru / yanlis / kacirilan mudahale
    - stabilizasyon suresi
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

SENARYO_DIZIN = Path(__file__).resolve().parent.parent / "scenarios"

# ISA-18.2 esikleri
HEDEF_ALARM_SAAT = 6.0
FLOOD_PENCERE = 600      # sn
FLOOD_ESIK = 10          # bu pencerede bundan fazla alarm = flood


@dataclass
class Senaryo:
    id: str
    ad: str
    aciklama: str = ""
    sure_sn: int = 300
    olaylar: list[dict] = field(default_factory=list)
    optimal: list[dict] = field(default_factory=list)
    basari: list[dict] = field(default_factory=list)
    gorevler: list[dict] = field(default_factory=list)   # egitim adimlari
    ekran: str = "genel"                                  # acilista gosterilecek ekran

    @classmethod
    def yukle(cls, sid: str) -> "Senaryo":
        y = yaml.safe_load((SENARYO_DIZIN / f"{sid}.yaml").read_text(encoding="utf-8"))
        return cls(**y)

    @staticmethod
    def liste() -> list[dict]:
        out = []
        for f in sorted(SENARYO_DIZIN.glob("*.yaml")):
            y = yaml.safe_load(f.read_text(encoding="utf-8"))
            out.append({"id": y["id"], "ad": y["ad"],
                        "sure_sn": y.get("sure_sn", 300),
                        "ekran": y.get("ekran", "genel"),
                        "aciklama": (y.get("aciklama") or "").strip()})
        return out


@dataclass
class Oturum:
    """Bir senaryo kosusu: olaylari uygular, operatoru olcer, puan verir."""
    senaryo: Senaryo
    uygulanan: set = field(default_factory=set)
    olaylar: list[dict] = field(default_factory=list)
    alarm_zamanlari: list[int] = field(default_factory=list)
    ack_gecikmeleri: list[int] = field(default_factory=list)
    gorulen_alarm: dict = field(default_factory=dict)     # alarm_id -> dogus t
    dogru: int = 0
    yanlis: int = 0
    tamamlanan: set = field(default_factory=set)
    flood_sayisi: int = 0
    _flood_aktif: bool = False
    stabil_t: int | None = None
    bitti: bool = False

    # -------------------------------------------------------------- olaylar

    def adim(self, sim) -> None:
        """Zamani gelen ariza olaylarini uygula."""
        for i, o in enumerate(self.senaryo.olaylar):
            if i in self.uygulanan or sim.t < o["t"]:
                continue
            self.uygulanan.add(i)
            etki = o.get("etki", {})
            if "hedef" in etki:
                sim.emr(etki["hedef"], etki["emr"], etki.get("deyer"))
            if "gaz_carpani" in etki:
                for arin, c in etki["gaz_carpani"].items():
                    sim.gaz_carpani[arin] = float(c)
            if "kol_direnc" in etki:
                for kol, c in etki["kol_direnc"].items():
                    sim.sebeke.kol_direnc_carp(kol, float(c))
            if "su_girisi" in etki:
                sim.proses.su_girisi = float(etki["su_girisi"])
            if "fe01_hiz" in etki:
                sim.proses.fe01_hiz = float(etki["fe01_hiz"])
            if "cr_tikanma" in etki:
                sim.proses.cr_tikanma = float(etki["cr_tikanma"])
            if "cv01_kacik" in etki:
                sim.proses.cv01_kacik = bool(etki["cv01_kacik"])
            if "trip" in etki:
                m = sim.proses.motorlar.get(etki["trip"])
                if m:
                    m.trip_et(etki.get("trip_sebep", "saha arizasi"))
            sim.sebeke.coz()
            self.olaylar.append({"t": sim.t, "tip": o.get("tip", "ariza"), "ad": o["ad"]})

        self._alarm_izle(sim)
        self._basari_izle(sim)
        if sim.t >= self.senaryo.sure_sn:
            self.bitti = True

    def _alarm_izle(self, sim) -> None:
        for a in sim.aktif.values():
            if a.id not in self.gorulen_alarm:
                self.gorulen_alarm[a.id] = a.vaxt
                self.alarm_zamanlari.append(a.vaxt)
        # ISA-18.2 alarm flood
        pencere = [v for v in self.alarm_zamanlari if v > sim.t - FLOOD_PENCERE]
        if len(pencere) > FLOOD_ESIK and not self._flood_aktif:
            self.flood_sayisi += 1
            self._flood_aktif = True
            self.olaylar.append({"t": sim.t, "tip": "flood",
                                 "ad": f"ALARM FLOOD ({len(pencere)} alarm / 10 dk)"})
        elif len(pencere) <= FLOOD_ESIK:
            self._flood_aktif = False

    def _basari_izle(self, sim) -> None:
        if not self.senaryo.basari or self.stabil_t is not None:
            return
        d = sim.deyerler()
        for b in self.senaryo.basari:
            v = d.get(b["etiket"])
            if v is None:
                return
            if b["kosul"] == "alt" and not (float(v) <= b["deger"]):
                return
            if b["kosul"] == "ust" and not (float(v) >= b["deger"]):
                return
        if any(o["tip"] == "ariza" for o in self.olaylar):
            self.stabil_t = sim.t
            self.olaylar.append({"t": sim.t, "tip": "stabil", "ad": "Sistem normale dondu"})

    # -------------------------------------------------------------- operator

    def emir_kaydet(self, sim, hedef: str, emr: str, ok: bool) -> bool:
        """Operator emrini kaydet; optimal hatta uyuyorsa dogru say."""
        beklenen = [o for o in self.senaryo.optimal
                    if o["kontrol"]["hedef"] == hedef and o["kontrol"]["emr"] == emr]
        dogru = bool(beklenen) and ok
        if dogru:
            self.dogru += 1
            self.tamamlanan.add(beklenen[0]["ad"])
        elif ok:
            self.yanlis += 1
        self.olaylar.append({"t": sim.t, "tip": "emr",
                             "ad": f"{hedef} -> {emr}", "dogru": dogru})
        return dogru

    def ack_kaydet(self, sim, alarm_id: str) -> None:
        for a in sim.aktif.values():
            if (alarm_id == "*" or a.id == alarm_id) and not a.tesdiqlendi:
                self.ack_gecikmeleri.append(max(0, sim.t - a.vaxt))
        self.olaylar.append({"t": sim.t, "tip": "ack", "ad": f"{alarm_id} onaylandi"})

    # -------------------------------------------------------------- puan

    def skor(self, sim) -> dict:
        t = max(sim.t, 1)
        pencere = min(FLOOD_PENCERE, max(60, t))
        alarm_saat = len([v for v in self.alarm_zamanlari
                          if v > t - pencere]) * (3600 / pencere)
        ort_ack = (round(sum(self.ack_gecikmeleri) / len(self.ack_gecikmeleri))
                   if self.ack_gecikmeleri else None)
        kacirilan = max(0, len(self.senaryo.optimal) - len(self.tamamlanan))

        # --- puan bilesenleri (toplam 100) ---
        p_mudahale = 45 * (len(self.tamamlanan) / max(len(self.senaryo.optimal), 1))
        p_ack = 20 if ort_ack is None else max(0, 20 - min(20, ort_ack / 3))
        p_alarm = 15 if alarm_saat <= HEDEF_ALARM_SAAT else \
            max(0, 15 - (alarm_saat - HEDEF_ALARM_SAAT) * 0.5)
        p_flood = max(0, 10 - 5 * self.flood_sayisi)
        if self.stabil_t is None:
            p_stabil = 0
        else:
            gecikme = self.stabil_t - min((o["t"] for o in self.olaylar
                                           if o["tip"] == "ariza"), default=0)
            p_stabil = max(0, 10 - min(10, gecikme / 30))
        p_ceza = 3 * self.yanlis

        toplam = max(0, round(p_mudahale + p_ack + p_alarm + p_flood + p_stabil - p_ceza))
        return {
            "toplam": toplam,
            "alarm_saatlik": round(alarm_saat, 1),
            "flood_sayisi": self.flood_sayisi,
            "ort_ack_gecikme_sn": ort_ack,
            "dogru_mudahale": len(self.tamamlanan),
            "yanlis_mudahale": self.yanlis,
            "kacirilan_mudahale": kacirilan,
            "stabilizasyon_sn": self.stabil_t,
            "dagilim": {
                "mudahale_45": round(p_mudahale, 1), "onay_20": round(p_ack, 1),
                "alarm_yuku_15": round(p_alarm, 1), "flood_10": round(p_flood, 1),
                "stabilizasyon_10": round(p_stabil, 1), "ceza": -p_ceza,
            },
        }

    def bitti_mesaji(self, sim, sebep: str = "sure_doldu") -> dict:
        return {
            "tip": "bitti", "t": sim.t, "sebep": sebep,
            "skor": self.skor(sim),
            "olaylar": self.olaylar,
            "optimal": [{"t": o.get("t_hedef", 0), "ad": o["ad"]}
                        for o in self.senaryo.optimal],
        }
