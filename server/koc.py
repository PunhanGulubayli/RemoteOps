"""
RemoteOps - Yapay Zeka Koc (aciklanabilir / XAI)

TASARIM KARARI — bunu jurinin sormasi halinde sunum notu olarak kullanin:
  Cekirdek DETERMINISTIKTIR. Aciklama bir dil modelinden degil,
  FIZIK KALINTISINDAN cikar:

      kalinti = olculen deger  -  fiziginin bekledigi deger

  Ornek: QAPI_1 direnci tabana gore 100.000 kat dustuyse, bu bir kisa devredir.
  Kisa devrenin imzasi: FAN DEBISI ARTAR ama ARIN DEBISI DUSER.
  Bu cikarim sablonla yazilir; model gerekmez.

  LLM yalnizca "konusan katmandir" (metni akiciligi icin). Yoksa da calisir.
  => Demo gunu internet olmasa bile koc CALISIR. Varsayilan: sablon.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# esik degerleri - ne zaman "kayda deger sapma" sayilir
DEBI_SAPMA = 0.15        # arin debisinde %15 dususu
KAPI_ORAN = 10.0         # direnc tabana gore kac kat degisirse "acildi" sayilir
SUMP_EGIM = 0.20         # %/tick - sump yukseliyor mu


@dataclass
class Koc:
    taban: dict = field(default_factory=dict)     # t=0 anlik degerler
    taban_R: dict = field(default_factory=dict)   # kol_id -> R
    son_soylenen: dict = field(default_factory=dict)   # baslik -> son soylendigi t
    soguma_sn: int = 20                           # ayni mesaji tekrar etme

    def ogren(self, sim) -> None:
        """t=0 normal rejimi taban al."""
        self.taban = dict(sim.deyerler())
        self.taban_R = {k.id: k.R for k in sim.sebeke.kollar.values()}

    # ------------------------------------------------------------------
    def degerlendir(self, sim) -> dict | None:
        """Fizik kalintisina gore aciklama uret. Yoksa None.

        TUM kurallar degerlendirilir (ilk eslesende durulmaz) - aksi halde
        surekli aktif olan bir bulgu (or. gaz emisyonu) ikincil bir sorunu
        (or. sump doluyor) kalici olarak gizler. Gercek kontrol odasinda
        es zamanli iki sorun da operatore ulasmalidir.

        Secim: sogumada olmayanlar arasindan EN YUKSEK onem dereceli bulgu.
        """
        if not self.taban:
            return None
        d = sim.deyerler()
        onem = {"kritik": 0, "uyari": 1, "bilgi": 2}
        bulgular = [b for b in (self._fan_durdu(sim, d),
                                self._motor_trip(sim, d),
                                self._kisa_devre(sim, d),
                                self._regulator(sim, d),
                                self._gaz_emisyonu(sim, d),
                                self._kirici_yuk(sim, d),
                                self._bunker(sim, d),
                                self._sump(sim, d),
                                self._interlock(sim, d)) if b]
        uygun = [b for b in bulgular
                 if sim.t - self.son_soylenen.get(b["baslik"], -9999) >= self.soguma_sn]
        if not uygun:
            return None
        bulgu = min(uygun, key=lambda b: onem.get(b["seviyye"], 3))
        self.son_soylenen[bulgu["baslik"]] = sim.t
        return {"tip": "kocluk", "t": sim.t, "kaynak": "fizik", **bulgu}

    # ------------------------------------------------------------------ kurallar

    def _fan_durdu(self, sim, d) -> dict | None:
        if d.get("fan.ana_1.durum") != "dayandi":
            return None
        return {
            "seviyye": "kritik",
            "baslik": "ANA FAN DURDU",
            "izah": (
                "Ana fan basinc uretmiyor (P_fan = 0 Pa). Atkinson denklemine gore "
                "dP = R*Q^2 oldugundan, surukleyici basinc yoksa sebekedeki debi de "
                "sifira gider. Su anda ocak debisi "
                f"{d.get('fan.ana_1.debi', 0)} m3/s. Tum arinlarda hava akisi durdu; "
                "metan seyrelmedigi icin birikmeye baslayacak."
            ),
            "tovsiye": ("Fani derhal yeniden baslatin. Baslatilamazsa acil durum "
                        "tahliye prosedurunu uygulayin ve ocaga giris yasaklanmalidir."),
        }

    def _kisa_devre(self, sim, d) -> dict | None:
        for k in sim.sebeke.kollar.values():
            if not k.kapi_id:
                continue
            taban = self.taban_R.get(k.id, k.R)
            if taban <= 0 or taban / max(k.R, 1e-9) < KAPI_ORAN:
                continue                                    # kapi hala kapali
            kapi_Q = abs(k.Q)
            # etkilenen arinlari bul
            etkilenen = [(a, self.taban.get(f"arin.{a}.debi", 0), d.get(f"arin.{a}.debi", 0))
                         for a in sim.ch4]
            dusen = [(a, t, y) for a, t, y in etkilenen if t > 0 and (t - y) / t > DEBI_SAPMA]
            if not dusen:
                continue
            a, t0, y0 = min(dusen, key=lambda x: x[2] / max(x[1], 1e-9))
            fan_t = self.taban.get("fan.ana_1.debi", 0)
            fan_y = d.get("fan.ana_1.debi", 0)
            hiz_t = self.taban.get(f"arin.{a}.hiz", 0)
            hiz_y = d.get(f"arin.{a}.hiz", 0)
            imza = ("Fan debisi ARTTI ama arin debisi DUSTU — bu, kisa devrenin klasik "
                    "imzasidir: toplam sebeke direnci dustugu icin fan daha cok hava "
                    "cekiyor, ancak hava arinlara ugramadan donus yoluna kaciyor."
                    if fan_y > fan_t else "")
            tabaka = ""
            if hiz_y < 2.0:
                tabaka = (f" Hava hizi {hiz_y:.2f} m/s ile 2 m/s kritik degerinin altina "
                          "dustu; metan havadan hafif oldugu icin tavanda tabakalasiyor. "
                          "Tavan sensoru ortalamadan YUKSEK okur.")
            return {
                "seviyye": "kritik" if hiz_y < 1.5 else "uyari",
                "baslik": f"{k.kapi_id} acik kaldi — kisa devre",
                "izah": (
                    f"{k.kapi_id} direnci {taban:.0f} -> {k.R:.2f} N*s^2/m^8 dustu. "
                    f"Kapidan {kapi_Q:.0f} m3/s hava kisa devre yapiyor. "
                    f"{a} debisi {t0:.1f} -> {y0:.1f} m3/s "
                    f"(%{(1 - y0 / max(t0, 1e-9)) * 100:.0f} dusus), "
                    f"hava hizi {hiz_t:.2f} -> {hiz_y:.2f} m/s. "
                    f"Fan debisi {fan_t:.0f} -> {fan_y:.0f} m3/s. {imza}{tabaka}"
                ),
                "tovsiye": (f"{k.kapi_id} kapatilmali. Kapandiktan sonra {a} debisinin "
                            f"{t0 * 0.9:.0f} m3/s uzerine donmesini ve CH4'un dusmesini "
                            "dogrulayin."),
            }
        return None

    def _regulator(self, sim, d) -> dict | None:
        for k in sim.sebeke.kollar.values():
            if not k.tenzim_id:
                continue
            taban = self.taban_R.get(k.id, k.R)
            if abs(k.R - taban) / max(taban, 1e-9) < 0.3:
                continue
            a = next((x for x in sim.ch4
                      if self.taban.get(f"arin.{x}.debi", 0) > d.get(f"arin.{x}.debi", 0)), None)
            if a is None:
                return None
            t0 = self.taban.get(f"arin.{a}.debi", 0)
            y0 = d.get(f"arin.{a}.debi", 0)
            if t0 <= 0 or (t0 - y0) / t0 < DEBI_SAPMA:
                return None
            return {
                "seviyye": "uyari",
                "baslik": f"{k.tenzim_id} kisildi — hava yeniden dagildi",
                "izah": (
                    f"{k.tenzim_id} direnci {taban:.2f} -> {k.R:.2f} N*s^2/m^8 yukseldi. "
                    f"Bu kol kisildigi icin {a} debisi {t0:.1f} -> {y0:.1f} m3/s dustu; "
                    "paralel kollardaki arinlar bu havayi kazandi. Sebekede toplam hava "
                    "sabit kalmaz — direnc degistikce Hardy-Cross dengesi yeniden kurulur."
                ),
                "tovsiye": (f"{a} yeterli hava alacak sekilde {k.tenzim_id} acilimini "
                            "artirin veya uretimi bu arindan cekin."),
            }
        return None

    def _gaz_emisyonu(self, sim, d) -> dict | None:
        for a in sim.ch4:
            if sim.gaz_carpani.get(a, 1.0) <= 1.2:
                continue
            debi_t = self.taban.get(f"arin.{a}.debi", 0)
            debi_y = d.get(f"arin.{a}.debi", 0)
            if debi_t > 0 and (debi_t - debi_y) / debi_t > DEBI_SAPMA:
                continue                       # asil sebep debi dususu, kisa devre kurali anlatsin
            return {
                "seviyye": "kritik" if d.get(f"qaz.ch4.{a}", 0) >= 2.0 else "uyari",
                "baslik": f"{a} — gaz emisyonu artti",
                "izah": (
                    f"{a} hava debisi degismedi ({debi_y:.1f} m3/s) ancak CH4 "
                    f"%{d.get(f'qaz.ch4.{a}', 0):.2f} seviyesine cikti. Debi sabitken "
                    "konsantrasyonun yukselmesi, damardan gelen gaz debisinin arttigini "
                    f"gosterir (kaynak tabana gore ~{sim.gaz_carpani[a]:.1f} kat). "
                    "Bu bir havalandirma arizasi degil, bir GAZ KAYNAGI degisimidir."
                ),
                "tovsiye": (f"{a} bolgesinde uretimi durdurun, seyreltme havasini artirin. "
                            "CH4 %2'yi asarsa personel tahliye edilmeli ve elektrik kesilmeli."),
            }
        return None

    def _sump(self, sim, d) -> dict | None:
        pr = sim.proses
        sv = d.get("sump.S1.seviyye", 0)
        if sv < 68:
            return None
        acik = sum(1 for m in (pr.p1, pr.p2) if m.calisiyor)
        from proses import POMPA_DEBI
        net = pr.su_girisi - acik * POMPA_DEBI
        if net <= 0:
            return None
        kalan = (pr.sump_max - pr.sump_m3) / net
        return {
            "seviyye": "kritik" if sv > 88 else "uyari",
            "baslik": "Sump doluyor — pompa kapasitesi yetersiz",
            "izah": (
                f"Ocaktan gelen su {pr.su_girisi * 1000:.0f} L/s, calisan "
                f"{acik} pompanin kapasitesi {acik * POMPA_DEBI * 1000:.0f} L/s. "
                f"Net {net * 1000:.0f} L/s birikim var; seviye %{sv:.0f}. "
                f"Bu hizla yaklasik {kalan / 60:.0f} dakika sonra tasar."
            ),
            "tovsiye": ("Ikinci pompayi (P2) devreye alin. "
                        "HV01 vanasinin acik oldugunu da dogrulayin."),
        }

    def _motor_trip(self, sim, d) -> dict | None:
        """Bir motor trip ettiyse sebebini ve sonucunu acikla."""
        for m in sim.proses.motorlar.values():
            if not m.trip:
                continue
            etki = {
                "CR01": "Kirici durdu; besleyici de interlock ile durdu. Hat beslenmiyor.",
                "CV01": "Bant durdu; kirici bosaltamaz, ust hat interlock ile duracak.",
                "CV02": "Bant durdu; surge bunkeri bosalmiyor, dolarsa ust hat durur.",
                "FE01": "Besleyici durdu; kiriciya malzeme gitmiyor, uretim durdu.",
                "P1": "Pompa durdu; sump seviyesi yukselmeye baslayacak.",
                "P2": "Yedek pompa durdu; tek pompa giris debisini karsilamayabilir.",
            }.get(m.id, "")
            return {
                "seviyye": "kritik",
                "baslik": f"{m.id} ARIZA — {m.trip_sebep}",
                "izah": (f"{m.ad} ({m.id}) trip etti. Sebep: {m.trip_sebep}. "
                         f"Son akim {m.akim:.0f} A, trip esigi {m.trip_a:.0f} A. {etki} "
                         "Trip eden motor kendiliginden calismaz — once RESET gerekir."),
                "tovsiye": (f"{m.id} faceplate'ini acin, ARIZA RESET yapin, "
                            "sonra baslatma sirasina uyarak yeniden devreye alin."),
            }
        return None

    def _kirici_yuk(self, sim, d) -> dict | None:
        cr = sim.proses.cr01
        if not cr.calisiyor:
            return None
        yuk = d.get("motor.CR01.yuk", 0)
        if yuk < 118:
            return None
        return {
            "seviyye": "kritik" if yuk > 145 else "uyari",
            "baslik": "Kirici asiri yukleniyor",
            "izah": (f"CR01 motor akimi {cr.akim:.0f} A — nominalin %{yuk:.0f}'i. "
                     f"Besleyici hizi %{sim.proses.fe01_hiz:.0f}, CSS "
                     f"{sim.proses.cr01_css:.0f} mm. Bu yukte devam ederse "
                     f"{cr.trip_a:.0f} A trip esigine ulasir ve kirici durur."),
            "tovsiye": ("FE01 besleyici hizini dusurun veya CSS aciklıgını artirin. "
                        "Ikisi de kirma yukunu azaltir."),
        }

    def _bunker(self, sim, d) -> dict | None:
        bn = sim.proses.bn02
        if bn.seviye < 80:
            return None
        return {
            "seviyye": "kritik" if bn.seviye >= bn.yuksek else "uyari",
            "baslik": "BN02 surge bunkeri doluyor",
            "izah": (f"Surge bunkeri %{bn.seviye:.0f} dolu. %{bn.yuksek:.0f} seviyesinde "
                     "CV01 interlock ile durur — cunku bosaltacak yer kalmaz. "
                     f"CV02 bandi {d.get('bant.CV02.yuk', 0):.0f} t/h cekiyor, "
                     f"CV01 {d.get('bant.CV01.yuk', 0):.0f} t/h besliyor."),
            "tovsiye": ("CV02'nin calistigini dogrulayin veya FE01 besleyici hizini "
                        "dusurerek giris debisini azaltin."),
        }

    def _interlock(self, sim, d) -> dict | None:
        """Operator interlock nedeniyle reddedilmis bir emir verdiyse acikla."""
        if not sim.son_engel or "INTERLOCK" not in sim.son_engel.upper():
            return None
        return {
            "seviyye": "uyari",
            "baslik": "Interlock komutu reddetti",
            "izah": (f"{sim.son_engel} "
                     "Interlock gorsel bir uyari degil, koruma mantigidir: "
                     "yanlis sirada baslatilan hatta malzeme yigilir ve bant kopar."),
            "tovsiye": ("Baslatma sirasi akistan GERIYE dogrudur: "
                        "CV02 → CV01 → CR01 → FE01."),
        }
