"""
RemoteOps - Ventilasyon sebekesi cozucu (Hardy-Cross)

Fizik temeli:
    Atkinson kare kanunu:  dP = R * Q * |Q|        [Pa]
    Fan karakteristigi:    P_fan = p0 - k * Q^2    [Pa]
    Kirchhoff 1: her dugumde  sum(Q) = 0
    Kirchhoff 2: her kapali donguda  sum(dP) = 0

Cozum: Hardy-Cross dongu duzeltme yontemi.
    dQ = -sum(H_i) / sum(|dH_i/dQ_i|)

NOT: Darcy-Weisbach DEGIL. Maden ventilasyonunda standart Atkinson denklemidir.
"""

from __future__ import annotations

import json
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path


# --------------------------------------------------------------------------
# Veri yapilari
# --------------------------------------------------------------------------

@dataclass
class Kol:
    """Bir hava kolu (branch)."""
    id: str
    ad: str
    dugum_a: str
    dugum_b: str
    R: float                      # aktif direnc (N*s^2/m^8)
    R_taban: float                # baslangic direnci (sifirlama icin)
    alan: float = 10.0            # m^2
    tip: str = "galeri"
    arin: str | None = None

    # fan: P = p0 - k*Q^2
    fan_id: str | None = None
    fan_p0: float = 0.0
    fan_k: float = 0.0
    fan_calisiyor: bool = True

    # kontrol edilebilir elemanlar
    kapi_id: str | None = None
    kapi_acik_R: float = 0.05
    kapi_bagli_R: float = 5000.0

    tenzim_id: str | None = None
    tenzim_min_R: float = 0.3
    tenzim_max_R: float = 60.0

    # cozum sonucu
    Q: float = 0.0                # m^3/s (dugum_a -> dugum_b yonunde pozitif)

    @property
    def hiz(self) -> float:
        """Hava hizi (m/s)."""
        return abs(self.Q) / self.alan if self.alan > 0 else 0.0

    def basinc_dususu(self) -> float:
        """dP = R*Q*|Q| - P_fan   (fan varsa basinc kazandirir)."""
        dp = self.R * self.Q * abs(self.Q)
        if self.fan_id and self.fan_calisiyor:
            dp -= self.fan_p0 - self.fan_k * self.Q * abs(self.Q)
        return dp

    def turev(self) -> float:
        """|d(dP)/dQ| - Hardy-Cross paydasi icin."""
        d = 2.0 * self.R * abs(self.Q)
        if self.fan_id and self.fan_calisiyor:
            d += 2.0 * self.fan_k * abs(self.Q)
        return d


@dataclass
class Sebeke:
    dugumler: dict[str, str] = field(default_factory=dict)   # id -> ad
    kollar: dict[str, Kol] = field(default_factory=dict)
    donguler: list[list[tuple[str, int]]] = field(default_factory=list)
    gaz_kaynaklari: list[dict] = field(default_factory=list)
    esikler: dict = field(default_factory=dict)
    _son_iterasyon: int = 0
    _son_hata: float = 0.0
    _yontem: str = "hardy-cross"

    # ---------------- yukleme ----------------

    @classmethod
    def yukle(cls, yol: str | Path) -> "Sebeke":
        return cls.sozlukten(json.loads(Path(yol).read_text(encoding="utf-8")))

    @classmethod
    def sozlukten(cls, veri: dict) -> "Sebeke":
        """Dosya yerine dogrudan sozlukten yukler (editor dogrulamasi icin)."""
        s = cls()
        for d in veri["dugumler"]:
            s.dugumler[d["id"]] = d["ad"]

        for k in veri["kollar"]:
            kol = Kol(
                id=k["id"], ad=k["ad"],
                dugum_a=k["from"], dugum_b=k["to"],
                R=float(k["R"]), R_taban=float(k["R"]),
                alan=float(k.get("A", 10.0)),
                tip=k.get("tip", "galeri"),
                arin=k.get("arin"),
            )
            if "fan" in k:
                f = k["fan"]
                kol.fan_id = f["id"]
                kol.fan_p0 = float(f["p0"])
                kol.fan_k = float(f["k"])
            if "kapi" in k:
                c = k["kapi"]
                kol.kapi_id = c["id"]
                kol.kapi_acik_R = float(c["acik_R"])
                kol.kapi_bagli_R = float(c["bagli_R"])
                kol.R = kol.kapi_bagli_R if c.get("varsayilan") == "bagli" else kol.kapi_acik_R
                kol.R_taban = kol.R
            if "tenzim" in k:
                t = k["tenzim"]
                kol.tenzim_id = t["id"]
                kol.tenzim_min_R = float(t["min_R"])
                kol.tenzim_max_R = float(t["max_R"])
            s.kollar[kol.id] = kol

        s.gaz_kaynaklari = veri.get("gaz_kaynaklari", [])
        s.esikler = veri.get("esikler", {})
        s._donguleri_bul()
        return s

    # ---------------- topoloji ----------------

    def _donguleri_bul(self) -> None:
        """Yayilan agac (spanning tree) kur, agac disi her kol bir temel dongu verir."""
        komsu: dict[str, list[tuple[str, str]]] = {d: [] for d in self.dugumler}
        for k in self.kollar.values():
            komsu[k.dugum_a].append((k.dugum_b, k.id))
            komsu[k.dugum_b].append((k.dugum_a, k.id))

        kok = next(iter(self.dugumler))
        ebeveyn: dict[str, tuple[str, str] | None] = {kok: None}
        agac_kollari: set[str] = set()
        kuyruk = deque([kok])
        while kuyruk:
            d = kuyruk.popleft()
            for komsu_d, kol_id in komsu[d]:
                if komsu_d not in ebeveyn:
                    ebeveyn[komsu_d] = (d, kol_id)
                    agac_kollari.add(kol_id)
                    kuyruk.append(komsu_d)

        kopuk = set(self.dugumler) - set(ebeveyn)
        if kopuk:
            raise ValueError(f"Sebeke kopuk! Baglanmayan dugumler: {sorted(kopuk)}")

        def koke_giden_yol(d: str) -> list[str]:
            yol = []
            while ebeveyn[d] is not None:
                ust, kol_id = ebeveyn[d]
                yol.append(kol_id)
                d = ust
            return yol

        self.donguler = []
        for kol in self.kollar.values():
            if kol.id in agac_kollari:
                continue
            # kapali dongu: kol (a->b) + b'den a'ya agac yolu
            ya, yb = koke_giden_yol(kol.dugum_a), koke_giden_yol(kol.dugum_b)
            ortak = set(ya) & set(yb)
            ya = [k for k in ya if k not in ortak]
            yb = [k for k in yb if k not in ortak]

            dongu: list[tuple[str, int]] = [(kol.id, +1)]
            # b -> ... -> ortak ata
            d = kol.dugum_b
            for kol_id in yb:
                kk = self.kollar[kol_id]
                yon = +1 if kk.dugum_a == d else -1
                dongu.append((kol_id, yon))
                d = kk.dugum_b if yon == +1 else kk.dugum_a
            # ortak ata -> ... -> a  (ters yonde)
            for kol_id in reversed(ya):
                kk = self.kollar[kol_id]
                yon = +1 if kk.dugum_a == d else -1
                dongu.append((kol_id, yon))
                d = kk.dugum_b if yon == +1 else kk.dugum_a
            self.donguler.append(dongu)

    # ---------------- cozum ----------------

    def kirchhoff2_kalinti(self) -> float:
        """En buyuk dongu basinc dengesizligi (Pa). Kirchhoff 2 kontrolu."""
        if not self.donguler:
            return 0.0
        return max(abs(sum(y * self.kollar[k].basinc_dususu() for k, y in d))
                   for d in self.donguler)

    def coz(self, max_iter: int = 600, tolerans: float = 1e-5,
            kirchhoff2_esik: float = 0.5) -> dict[str, float]:
        """Hibrit cozucu.

        Once Hardy-Cross. Ag "sert" ise (or. kapali bir hava kapisi R=5000 ile
        kuyu R=0.003 yan yana -> ~10^6 oran) Hardy-Cross cok yavas yakinsar:
        Kirchhoff 1 saglanir ama Kirchhoff 2 saglanmaz. Bu durumda
        Newton-Raphson (dugum basinci) ile cozume gecilir; o yontem bu tur
        sertlige cok daha dayaniklidir.

        Hangi yontemin kullanildigi `self._yontem` alaninda tutulur.
        """
        self._hardy_cross(max_iter, tolerans)
        self._yontem = "hardy-cross"
        if self.kirchhoff2_kalinti() > kirchhoff2_esik:
            onceki = {k.id: k.Q for k in self.kollar.values()}
            try:
                self._newton_raphson()
                self._yontem = "newton-raphson (sert ag)"
            except Exception:
                for k in self.kollar.values():
                    k.Q = onceki[k.id]
        self._son_hata = self.dugum_dengesizligi()
        return {k.id: k.Q for k in self.kollar.values()}

    def _newton_raphson(self, max_iter: int = 300, tol: float = 1e-9) -> None:
        """Dugum basinclarini bilinmeyen alan global Newton-Raphson.

        NOT: engine/dogrulama.py icinde BAGIMSIZ bir uygulama daha vardir.
        O dosya capraz dogrulama icindir ve bilerek bu kodu paylasmaz —
        ortak kod, ortak hata demektir.
        """
        dugumler = list(self.dugumler)
        ref = dugumler[0]
        bilinmeyen = [d for d in dugumler if d != ref]
        idx = {d: i for i, d in enumerate(bilinmeyen)}
        n = len(bilinmeyen)
        P = [0.0] * n

        def basinc(d):
            return 0.0 if d == ref else P[idx[d]]

        def akis(k, Pa, Pb):
            dP = Pa - Pb
            if k.fan_id and k.fan_calisiyor:
                toplam, Ref = dP + k.fan_p0, k.R + k.fan_k
            else:
                toplam, Ref = dP, k.R
            Ref = max(Ref, 1e-12)
            m = abs(toplam)
            if m < 1e-14:
                return 0.0, 1e5
            Q = (1.0 if toplam > 0 else -1.0) * (m / Ref) ** 0.5
            return Q, 1.0 / (2.0 * (Ref * m) ** 0.5)

        for _ in range(max_iter):
            f = [0.0] * n
            J = [[0.0] * n for _ in range(n)]
            for k in self.kollar.values():
                Q, dQ = akis(k, basinc(k.dugum_a), basinc(k.dugum_b))
                ia, ib = idx.get(k.dugum_a), idx.get(k.dugum_b)
                if ia is not None:
                    f[ia] -= Q; J[ia][ia] -= dQ
                    if ib is not None: J[ia][ib] += dQ
                if ib is not None:
                    f[ib] += Q; J[ib][ib] -= dQ
                    if ia is not None: J[ib][ia] += dQ

            A = [J[i][:] + [-f[i]] for i in range(n)]
            for c in range(n):
                piv = max(range(c, n), key=lambda r: abs(A[r][c]))
                if abs(A[piv][c]) < 1e-18:
                    continue
                A[c], A[piv] = A[piv], A[c]
                pv = A[c][c]
                for r in range(n):
                    if r == c: continue
                    fac = A[r][c] / pv
                    if fac:
                        for cc in range(c, n + 1):
                            A[r][cc] -= fac * A[c][cc]
            dP = [A[i][n] / A[i][i] if abs(A[i][i]) > 1e-18 else 0.0 for i in range(n)]
            enb = max((abs(x) for x in dP), default=0.0)
            olcek = min(1.0, 200.0 / enb) if enb > 200.0 else 1.0
            for i in range(n):
                P[i] += dP[i] * olcek
            if enb * olcek < tol:
                break

        for k in self.kollar.values():
            k.Q, _ = akis(k, basinc(k.dugum_a), basinc(k.dugum_b))

    def _hardy_cross(self, max_iter: int = 600, tolerans: float = 1e-5) -> dict[str, float]:
        """Hardy-Cross dongu duzeltmesi."""
        # KRITIK: Hardy-Cross dugum dengesini KORUR ama DUZELTMEZ.
        # Bu yuzden baslangic Kirchhoff-1'i saglamali. Q=0 trivial olarak saglar.
        for k in self.kollar.values():
            k.Q = 0.0

        self._son_iterasyon = max_iter
        for it in range(max_iter):
            enb_dQ = 0.0
            for dongu in self.donguler:
                pay = paydasi = 0.0
                for kol_id, yon in dongu:
                    k = self.kollar[kol_id]
                    pay += yon * k.basinc_dususu()
                    paydasi += k.turev()
                # Q=0 iken turev sifirdir; taban deger yakinsamayi baslatir
                paydasi = max(paydasi, 1.0)
                dQ = -pay / paydasi
                # asiri sicramayi engelle (yakinsama guvenligi)
                dQ = max(-20.0, min(20.0, dQ))
                for kol_id, yon in dongu:
                    self.kollar[kol_id].Q += yon * dQ
                enb_dQ = max(enb_dQ, abs(dQ))

            if enb_dQ < tolerans:
                self._son_iterasyon = it + 1
                break
        return {k.id: k.Q for k in self.kollar.values()}

    def dugum_dengesizligi(self) -> float:
        """En buyuk dugum kutle dengesi hatasi (m^3/s). Kirchhoff 1 kontrolu."""
        denge = {d: 0.0 for d in self.dugumler}
        for k in self.kollar.values():
            denge[k.dugum_a] -= k.Q
            denge[k.dugum_b] += k.Q
        return max(abs(v) for v in denge.values())

    # ---------------- kontrol ----------------

    def kapi_ayarla(self, kapi_id: str, acik: bool) -> bool:
        for k in self.kollar.values():
            if k.kapi_id == kapi_id:
                k.R = k.kapi_acik_R if acik else k.kapi_bagli_R
                return True
        return False

    def kapi_kismen(self, kapi_id: str, acilim_yuzde: float) -> bool:
        """Kismen acik kapi - 'QAPI kismen kapali' senaryosu icin.
        acilim: 100 = tam acik, 0 = tam bagli. Logaritmik interpolasyon."""
        a = max(0.0, min(100.0, acilim_yuzde)) / 100.0
        for k in self.kollar.values():
            if k.kapi_id == kapi_id:
                lo, hi = k.kapi_acik_R, k.kapi_bagli_R
                k.R = hi * (lo / hi) ** a
                return True
        return False

    def tenzim_ayarla(self, tenzim_id: str, acilim_yuzde: float) -> bool:
        a = max(0.0, min(100.0, acilim_yuzde)) / 100.0
        for k in self.kollar.values():
            if k.tenzim_id == tenzim_id:
                lo, hi = k.tenzim_min_R, k.tenzim_max_R
                k.R = hi * (lo / hi) ** a
                return True
        return False

    def fan_ayarla(self, fan_id: str, calisiyor: bool) -> bool:
        for k in self.kollar.values():
            if k.fan_id == fan_id:
                k.fan_calisiyor = calisiyor
                return True
        return False

    def kol_direnc_carp(self, kol_id: str, carpan: float) -> bool:
        """Ariza enjeksiyonu: bir kolun direncini carpanla degistir (cokme, tikanma)."""
        if kol_id in self.kollar:
            self.kollar[kol_id].R = self.kollar[kol_id].R_taban * carpan
            return True
        return False

    def sifirla(self) -> None:
        for k in self.kollar.values():
            k.R = k.R_taban
            k.Q = 0.0
            k.fan_calisiyor = True

    # ---------------- cikti ----------------

    def fan_bilgisi(self) -> dict:
        for k in self.kollar.values():
            if k.fan_id:
                Q = abs(k.Q)
                p = (k.fan_p0 - k.fan_k * Q * Q) if k.fan_calisiyor else 0.0
                return {"id": k.fan_id, "debi": Q, "basinc": max(0.0, p),
                        "calisiyor": k.fan_calisiyor,
                        "guc_kw": max(0.0, p) * Q / 1000.0 / 0.75}
        return {}

    def arin_debileri(self) -> dict[str, float]:
        return {k.arin: abs(k.Q) for k in self.kollar.values() if k.arin}

    def ozet(self) -> str:
        s = [f"{'Kol':<5} {'Ad':<26} {'Q (m3/s)':>10} {'v (m/s)':>9} {'R':>10}"]
        s.append("-" * 64)
        for k in self.kollar.values():
            s.append(f"{k.id:<5} {k.ad[:26]:<26} {k.Q:>10.2f} {k.hiz:>9.2f} {k.R:>10.4f}")
        f = self.fan_bilgisi()
        s.append("-" * 64)
        s.append(f"FAN: Q={f['debi']:.1f} m3/s  P={f['basinc']:.0f} Pa  "
                 f"Guc={f['guc_kw']:.0f} kW")
        s.append(f"Yontem: {self._yontem}   Iterasyon: {self._son_iterasyon}")
        s.append(f"Kirchhoff-1: {self._son_hata:.2e} m3/s   "
                 f"Kirchhoff-2: {self.kirchhoff2_kalinti():.2e} Pa")
        return "\n".join(s)


if __name__ == "__main__":
    import sys

    yol = Path(__file__).resolve().parent.parent / "data" / "sebeke_ocak1.json"
    s = Sebeke.yukle(yol)
    print(f"Dugum: {len(s.dugumler)}  Kol: {len(s.kollar)}  Dongu: {len(s.donguler)}")
    print(f"Beklenen dongu sayisi: {len(s.kollar) - len(s.dugumler) + 1}\n")
    s.coz()
    print(s.ozet())
    if s._son_hata > 1e-3:
        print("\nUYARI: dugum dengesi saglanmadi!")
        sys.exit(1)
