"""
RemoteOps - Bagimsiz cozucu dogrulamasi (cross-check)

NEDEN: "Fiziginiz dogru mu?" sorusuna "test yazdik" demek yeterli degildir.
Ayni denklemi TAMAMEN FARKLI bir sayisal yontemle cozup sonuclari
karsilastirmak, uygulama hatasini yakalamanin en guclu yoludur.

  Yontem A (network.py) : Hardy-Cross  — DONGU tabanli, ardisik duzeltme
  Yontem B (bu dosya)   : Newton-Raphson — DUGUM basinci tabanli, global Jacobian

Iki yontem ayni denklem takimini (Atkinson + Kirchhoff) cozer ama ortak
kod paylasmaz. Ayni sonuca varmalari, cozucunun dogru uygulandigini gosterir.

NOT: network.py icinde de bir Newton-Raphson vardir (sert aglarda otomatik
devreye giren yedek cozucu). Buradaki uygulama ONUNLA KOD PAYLASMAZ — bilerek
ayri yazilmistir. Ortak kod, ortak hata demektir; capraz dogrulamanin anlami
iki uygulamanin bagimsiz olmasidir.

Bu, MFIRE karsilastirmasinin YERINE GECMEZ; onu tamamlar.
MFIRE protokolu icin: docs/dogrulama.md

Calistir:  python engine/dogrulama.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from network import Sebeke  # noqa: E402

YOL = Path(__file__).resolve().parent.parent / "data" / "sebeke_ocak1.json"


def newton_raphson_coz(s: Sebeke, max_iter: int = 200, tol: float = 1e-9):
    """Dugum basinclarini bilinmeyen alan global Newton-Raphson.

    Her kol icin:  Q = sign(dP_net) * sqrt(|dP_net| / R)
    burada dP_net = (P_a - P_b) + P_fan   (fan varsa)

    Dugum denklemi:  f_i = sum(giren Q) - sum(cikan Q) = 0
    Referans dugum (N0 = atmosfer) P = 0 olarak sabitlenir.
    """
    dugumler = [d for d in s.dugumler]
    ref = dugumler[0]
    bilinmeyen = [d for d in dugumler if d != ref]
    idx = {d: i for i, d in enumerate(bilinmeyen)}
    n = len(bilinmeyen)
    P = [0.0] * n

    def basinc(d):
        return 0.0 if d == ref else P[idx[d]]

    def kol_akisi(k, Pa, Pb):
        """Kol debisi ve dQ/d(dP) turevi."""
        dP = Pa - Pb
        if k.fan_id and k.fan_calisiyor:
            # fan a->b yonunde basinc ekler: p0 - k_f*Q^2
            # Q'yu kapali formda cozmek icin: R*Q^2 = dP + p0 - k_f*Q^2
            # => Q = sqrt((dP + p0) / (R + k_f))
            toplam = dP + k.fan_p0
            Ref = k.R + k.fan_k
        else:
            toplam, Ref = dP, k.R
        Ref = max(Ref, 1e-12)
        mutlak = abs(toplam)
        if mutlak < 1e-14:
            return 0.0, 1.0 / (2.0 * (Ref ** 0.5) * 1e-7)
        Q = (1.0 if toplam > 0 else -1.0) * (mutlak / Ref) ** 0.5
        dQ = 1.0 / (2.0 * (Ref * mutlak) ** 0.5)      # d|Q| / d|dP|
        return Q, dQ

    for _ in range(max_iter):
        f = [0.0] * n
        J = [[0.0] * n for _ in range(n)]

        for k in s.kollar.values():
            Pa, Pb = basinc(k.dugum_a), basinc(k.dugum_b)
            Q, dQ = kol_akisi(k, Pa, Pb)
            ia = idx.get(k.dugum_a)
            ib = idx.get(k.dugum_b)
            if ia is not None:
                f[ia] -= Q
                J[ia][ia] -= dQ
                if ib is not None:
                    J[ia][ib] += dQ
            if ib is not None:
                f[ib] += Q
                J[ib][ib] -= dQ
                if ia is not None:
                    J[ib][ia] += dQ

        # Gauss eliminasyonu ile J * dP = -f
        A = [J[i][:] + [-f[i]] for i in range(n)]
        for c in range(n):
            piv = max(range(c, n), key=lambda r: abs(A[r][c]))
            if abs(A[piv][c]) < 1e-18:
                continue
            A[c], A[piv] = A[piv], A[c]
            pv = A[c][c]
            for r in range(n):
                if r == c:
                    continue
                fac = A[r][c] / pv
                if fac:
                    for cc in range(c, n + 1):
                        A[r][cc] -= fac * A[c][cc]
        dP = [0.0] * n
        for i in range(n):
            if abs(A[i][i]) > 1e-18:
                dP[i] = A[i][n] / A[i][i]

        # sonum (damping) - buyuk adimlarda kararliligi korur
        enb = max((abs(x) for x in dP), default=0.0)
        olcek = min(1.0, 200.0 / enb) if enb > 200.0 else 1.0
        for i in range(n):
            P[i] += dP[i] * olcek
        if enb * olcek < tol:
            break

    sonuc = {}
    for k in s.kollar.values():
        Q, _ = kol_akisi(k, basinc(k.dugum_a), basinc(k.dugum_b))
        sonuc[k.id] = Q
    return sonuc


def karsilastir(baslik: str, ayar=None):
    s = Sebeke.yukle(YOL)
    if ayar:
        ayar(s)
    hc = dict(s.coz())
    nr = newton_raphson_coz(s)

    print(f"\n{baslik}")
    print(f"  {'Kol':<5} {'Hardy-Cross':>13} {'Newton-Raph.':>13} {'Fark %':>9}")
    print("  " + "-" * 44)
    enb_fark = 0.0
    for kid in hc:
        a, b = hc[kid], nr[kid]
        payda = max(abs(a), abs(b), 0.5)          # cok kucuk debilerde % anlamsizlasir
        fark = abs(a - b) / payda * 100
        enb_fark = max(enb_fark, fark)
        if abs(a) > 1.0:                           # sadece anlamli kollari yazdir
            print(f"  {kid:<5} {a:>13.3f} {b:>13.3f} {fark:>8.3f}%")
    print(f"  {'':<5} {'EN BUYUK FARK':>27} {enb_fark:>8.3f}%")
    return enb_fark


if __name__ == "__main__":
    print("=" * 60)
    print("BAGIMSIZ COZUCU DOGRULAMASI")
    print("Hardy-Cross (dongu tabanli)  vs  Newton-Raphson (dugum tabanli)")
    print("=" * 60)

    farklar = [
        karsilastir("1) NORMAL REJIM"),
        karsilastir("2) QAPI_1 ACIK (kisa devre)",
                    lambda s: s.kapi_ayarla("QAPI_1", True)),
        karsilastir("3) TENZIM T1 %30 (regulator kisik)",
                    lambda s: s.tenzim_ayarla("T1", 30)),
        karsilastir("4) B04 TAVAN COKMESI (direnc x50)",
                    lambda s: s.kol_direnc_carp("B04", 50)),
    ]

    enb = max(farklar)
    print("\n" + "=" * 60)
    print(f"Tum senaryolarda en buyuk fark: {enb:.4f}%")
    esik = 1.0
    print(f"Kabul esigi: < {esik}%   ->   {'GECTI' if enb < esik else 'KALDI'}")
    print("=" * 60)
    sys.exit(0 if enb < esik else 1)
