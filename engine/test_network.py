"""Faz 1 dogrulama: fizik tutarliligi ve senaryo tepkisi.

Calistir:  python engine/test_network.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from network import Sebeke  # noqa: E402

YOL = Path(__file__).resolve().parent.parent / "data" / "sebeke_ocak1.json"
GECTI, KALDI = 0, 0


def kontrol(ad, kosul, detay=""):
    global GECTI, KALDI
    if kosul:
        GECTI += 1
        print(f"  [OK]   {ad}  {detay}")
    else:
        KALDI += 1
        print(f"  [HATA] {ad}  {detay}")


def ch4_yuzde(s, arin, carpan=1.0):
    """Kararli-hal karisim:  CH4% = kaynak / (hava + kaynak) * 100"""
    for g in s.gaz_kaynaklari:
        if g["arin"] == arin:
            q = s.arin_debileri().get(arin, 0.001)
            kaynak = g["ch4_m3_s"] * carpan
            return kaynak / (q + kaynak) * 100.0
    return 0.0


print("=" * 70)
print("FAZ 1 DOGRULAMA - Ventilasyon sebekesi (Hardy-Cross / Atkinson)")
print("=" * 70)

s = Sebeke.yukle(YOL)

print("\n1) TOPOLOJI")
kontrol("Dongu sayisi = Kol - Dugum + 1",
        len(s.donguler) == len(s.kollar) - len(s.dugumler) + 1,
        f"({len(s.donguler)} dongu)")

print("\n2) KIRCHHOFF 1 - dugum kutle dengesi")
s.coz()
kontrol("Dugum dengesizligi < 1e-6 m3/s", s.dugum_dengesizligi() < 1e-6,
        f"({s.dugum_dengesizligi():.2e})")
kontrol("Yakinsama < 100 iterasyon", s._son_iterasyon < 100,
        f"({s._son_iterasyon} iterasyon)")

print("\n3) KIRCHHOFF 2 - dongu basinc dengesi")
enb = max(abs(sum(y * s.kollar[k].basinc_dususu() for k, y in d)) for d in s.donguler)
kontrol("En buyuk dongu basinc hatasi < 1 Pa", enb < 1.0, f"({enb:.2e} Pa)")

print("\n4) FIZIK MAKULLUGU")
f = s.fan_bilgisi()
kontrol("Ocak toplam debisi 50-250 m3/s", 50 < f["debi"] < 250, f"({f['debi']:.1f} m3/s)")
kontrol("Fan basinci 500-4000 Pa", 500 < f["basinc"] < 4000, f"({f['basinc']:.0f} Pa)")
kontrol("Fan gucu 50-800 kW", 50 < f["guc_kw"] < 800, f"({f['guc_kw']:.0f} kW)")
kontrol("Kuyu hizi < 15 m/s", s.kollar["B01"].hiz < 15.0,
        f"({s.kollar['B01'].hiz:.2f} m/s)")
for k in s.kollar.values():
    if k.tip == "arin":
        kontrol(f"{k.arin} hizi 0.5-8 m/s (yonetmelik siniri)", 0.5 < k.hiz < 8.0,
                f"({k.hiz:.2f} m/s, Q={abs(k.Q):.1f})")
kontrol("Kapali kapidan sizinti < 2 m3/s", abs(s.kollar["B15"].Q) < 2.0,
        f"({abs(s.kollar['B15'].Q):.2f} m3/s)")

print("\n5) NORMAL REJIMDE CH4  (esikler: P3=%1.0  P2=%1.5  P1=%2.0)")
for a in ("ARIN_1", "ARIN_2", "ARIN_3"):
    c = ch4_yuzde(s, a)
    kontrol(f"{a} CH4 normal araligda (<%1.0)", c < 1.0, f"(%{c:.2f})")

# --------------------------------------------------------------------------
print("\n6) SENARYO S01 - QAPI_1 acik kaldi (KISA DEVRE)")
taban = dict(s.arin_debileri())
taban_fan = s.fan_bilgisi()["debi"]
taban_ch4_2 = ch4_yuzde(s, "ARIN_2")

s.kapi_kismen("QAPI_1", 100)
s.coz()
yeni = s.arin_debileri()
yeni_fan = s.fan_bilgisi()["debi"]
yeni_ch4_2 = ch4_yuzde(s, "ARIN_2")
dusus = (1 - yeni["ARIN_1"] / taban["ARIN_1"]) * 100

kontrol("Kapidan kisa devre akisi olustu (>50 m3/s)", abs(s.kollar["B15"].Q) > 50,
        f"({abs(s.kollar['B15'].Q):.1f} m3/s)")
kontrol("ARIN_1 debisi dustu (>%40)", dusus > 40, f"(%{dusus:.0f} dusus)")
# Kisa devrenin imzasi: toplam direnc dustugu icin FAN DEBISI ARTAR,
# ama arina giden hava DUSER. Egitimde ogretilecek en onemli isaret budur.
kontrol("KISA DEVRE IMZASI: fan debisi ARTTI ama arin debisi DUSTU",
        yeni_fan > taban_fan and yeni["ARIN_1"] < taban["ARIN_1"],
        f"(fan {taban_fan:.0f}->{yeni_fan:.0f} | ARIN_1 {taban['ARIN_1']:.1f}->{yeni['ARIN_1']:.1f})")
kontrol("ARIN_2 CH4 P3 esigini (%1.0) gecti", yeni_ch4_2 > 1.0,
        f"(%{taban_ch4_2:.2f} -> %{yeni_ch4_2:.2f})")

print("\n7) SENARYO S03 - Kisa devre + gaz emisyonu artisi (NORMALLESMIS SAPMA)")
ch4_artis = ch4_yuzde(s, "ARIN_2", carpan=2.3)   # gaz cikisi 2.3 kat arttı
kontrol("CH4 P2 esigini (%1.5) gecti", ch4_artis > 1.5, f"(%{ch4_artis:.2f})")
kontrol("CH4 P1 esigini (%2.0) gecti", ch4_artis > 2.0, f"(%{ch4_artis:.2f})")

print("\n8) SENARYO S02 - Ana fan durdu")
s.sifirla(); s.coz()
s.fan_ayarla("ana_1", False)
s.coz()
kontrol("Fan durunca ocak debisi ~0", s.fan_bilgisi()["debi"] < 1.0,
        f"({s.fan_bilgisi()['debi']:.3f} m3/s)")
kontrol("Dugum dengesi hala saglaniyor", s.dugum_dengesizligi() < 1e-6,
        f"({s.dugum_dengesizligi():.2e})")

print("\n9) TENZIM 1 kontrolu")
s.sifirla(); s.coz()
once = dict(s.arin_debileri())
s.tenzim_ayarla("T1", 30); s.coz()          # regulator kisildi
sonra = dict(s.arin_debileri())
kontrol("Regulator kisilinca ARIN_3 hava kaybetti (>%25)",
        (1 - sonra["ARIN_3"] / once["ARIN_3"]) * 100 > 25,
        f"({once['ARIN_3']:.1f} -> {sonra['ARIN_3']:.1f} m3/s)")
kontrol("HAVA YENIDEN DAGILDI: ARIN_1 ve ARIN_2 hava kazandi",
        sonra["ARIN_1"] > once["ARIN_1"] and sonra["ARIN_2"] > once["ARIN_2"],
        f"(A1 {once['ARIN_1']:.1f}->{sonra['ARIN_1']:.1f}, A2 {once['ARIN_2']:.1f}->{sonra['ARIN_2']:.1f})")

print("\n10) SIFIRLAMA - demo 'Reset' dugmesi")
s.sifirla(); s.coz()
kontrol("Taban duruma tam donuldu",
        abs(s.arin_debileri()["ARIN_1"] - taban["ARIN_1"]) < 0.01,
        f"({s.arin_debileri()['ARIN_1']:.2f} vs {taban['ARIN_1']:.2f})")

print("\n" + "=" * 70)
print(f"SONUC:  {GECTI} gecti,  {KALDI} kaldi")
print("=" * 70)
sys.exit(1 if KALDI else 0)
