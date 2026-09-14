"""Uctan uca dogrulama: simulasyon + senaryo + koc + puanlama.

Gercek zamani beklemeden tum zinciri kosar.
Calistir:  python server/test_e2e.py
"""
import sys
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KOK / "engine"))
sys.path.insert(0, str(KOK / "server"))

from koc import Koc                   # noqa: E402
from senaryo import Oturum, Senaryo    # noqa: E402
from sim import Simulasyon             # noqa: E402

GECTI = KALDI = 0


def kontrol(ad, kosul, detay=""):
    global GECTI, KALDI
    if kosul:
        GECTI += 1
        print(f"  [OK]   {ad}  {detay}")
    else:
        KALDI += 1
        print(f"  [HATA] {ad}  {detay}")


def kos(senaryo_id, davranis):
    """davranis: {t: (hedef, emr, deyer)} ve 'ack_gecikme' saniyesi."""
    sim = Simulasyon.olustur()
    koc = Koc(); koc.ogren(sim)
    otr = Oturum(senaryo=Senaryo.yukle(senaryo_id))
    koc_mesajlari, ack_gecikme = [], davranis.get("ack_gecikme")

    while not otr.bitti:
        otr.adim(sim)
        sim.adim(1.0)
        if sim.t in davranis:
            hedef, emr, deyer = davranis[sim.t]
            cevap = sim.emr(hedef, emr, deyer)
            otr.emir_kaydet(sim, hedef, emr, cevap["tip"] == "onay")
        if ack_gecikme is not None:
            for a in list(sim.aktif.values()):
                if not a.tesdiqlendi and sim.t - a.vaxt >= ack_gecikme:
                    otr.ack_kaydet(sim, a.id); sim.ack(a.id)
        k = koc.degerlendir(sim)
        if k:
            koc_mesajlari.append(k)
    return sim, otr, koc_mesajlari


print("=" * 72)
print("UCTAN UCA DOGRULAMA — simulasyon · senaryo · koc · puanlama")
print("=" * 72)

# ══════════════════════════════════════════════════ PROSES INTERLOCK
print("\n1) CEVHER HATTI — interlock mantigi")
s = Simulasyon.olustur()
kontrol("Baslangicta aktif alarm yok", len(s.tick()["alarmlar"]) == 0,
        f"({len(s.tick()['alarmlar'])})")
kontrol("Durmus motor ARIZA sayilmiyor",
        s.deyerler()["motor.CR01.durum"] == "dayandi"
        and s.deyerler()["motor.CR01.ariza"] == 0)

r = s.emr("motor.FE01", "basla")
kontrol("YANLIS sirada baslatma reddedildi (FE01 once)",
        r["tip"] == "xeta" and "INTERLOCK" in r["mesaj"], f"({r.get('mesaj','')[:46]})")

for mid in ("CV02", "CV01", "CR01", "FE01"):
    r = s.emr(f"motor.{mid}", "basla")
    kontrol(f"DOGRU sirada {mid} baslatildi", r["tip"] == "onay",
            "" if r["tip"] == "onay" else r.get("mesaj", ""))

for _ in range(150):
    s.adim()
d = s.deyerler()
kontrol("Kirici yuk altinda (akim 150-450 A)", 150 < d["motor.CR01.akim"] < 450,
        f"({d['motor.CR01.akim']} A)")
kontrol("Bant malzeme tasiyor (>150 t/h)", d["bant.CV01.yuk"] > 150,
        f"({d['bant.CV01.yuk']} t/h)")
kontrol("Uretim artiyor", d["uretim.vardiya.ton"] > 0, f"({d['uretim.vardiya.ton']} t)")

print("\n2) INTERLOCK ZINCIRI — asagi akis durunca ust hat durur")
s.emr("motor.CV02", "dayandir")
for _ in range(400):
    s.adim()
d = s.deyerler()
kontrol("BN02 doldu ve CV01 interlock ile durdu",
        d["motor.CV01.durum"] != "isliyir" or d["bunker.BN02.seviyye"] < 88,
        f"(BN02 %{d['bunker.BN02.seviyye']}, CV01 {d['motor.CV01.durum']})")

print("\n3) TRIP ve RESET")
s2 = Simulasyon.olustur()
for mid in ("CV02", "CV01", "CR01", "FE01"):
    s2.emr(f"motor.{mid}", "basla")
s2.proses.cr01.trip_et("test arizasi")
s2.adim()
kontrol("Trip eden motor ARIZA durumunda", s2.deyerler()["motor.CR01.durum"] == "ariza")
r = s2.emr("motor.CR01", "basla")
kontrol("Trip halinde BASLAT reddedildi", r["tip"] == "xeta", f"({r.get('mesaj','')[:40]})")
kontrol("RESET calisti", s2.emr("motor.CR01", "sifirla")["tip"] == "onay")
kontrol("RESET sonrasi baslatilabiliyor", s2.emr("motor.CR01", "basla")["tip"] == "onay")

print("\n4) POMPA — kuru calisma korumasi")
s3 = Simulasyon.olustur()
s3.proses.sump_m3 = 2.0
r = s3.emr("motor.P2", "basla")
kontrol("Dusuk sumpta pompa baslatilmadi",
        r["tip"] == "xeta" and "kuru" in r["mesaj"].lower(), f"({r.get('mesaj','')[:46]})")
s3.emr("vana.HV01", "bagla")
for _ in range(20):
    s3.adim()
kontrol("Vana kapandi", s3.deyerler()["vana.HV01.durum"] == "bagli")

# ══════════════════════════════════════════════════ SENARYOLAR
print("\n5) S01 — IYI operator (QAPI 1 kapatildi)")
sim_i, otr_i, koc_i = kos("S01", {95: ("qapi.QAPI_1", "bagla", None), "ack_gecikme": 8})
s_i = otr_i.skor(sim_i)
kontrol("Koc kisa devreyi tespit etti",
        any("kisa devre" in k["baslik"] for k in koc_i), f"({len(koc_i)} mesaj)")
kontrol("Dogru mudahale sayildi", s_i["dogru_mudahale"] == 1)
kontrol("Sistem stabilize oldu", s_i["stabilizasyon_sn"] is not None,
        f"(t={s_i['stabilizasyon_sn']}s)")
kontrol("Skor yuksek (>=70)", s_i["toplam"] >= 70, f"({s_i['toplam']}/100)")

print("\n6) S01 — KOTU operator (hicbir sey yapmadi)")
sim_k, otr_k, _ = kos("S01", {})
s_k = otr_k.skor(sim_k)
kontrol("Kacirilan mudahale isaretlendi", s_k["kacirilan_mudahale"] == 1)
kontrol("Skor dusuk (<45)", s_k["toplam"] < 45, f"({s_k['toplam']}/100)")
kontrol("IYI > KOTU", s_i["toplam"] > s_k["toplam"], f"({s_i['toplam']} > {s_k['toplam']})")

print("\n7) S04 — Cevher hattini dogru sirayla devreye alma")
sim_4, otr_4, koc_4 = kos("S04", {40: ("motor.CV02", "basla", None),
                                  55: ("motor.CV01", "basla", None),
                                  70: ("motor.CR01", "basla", None),
                                  85: ("motor.FE01", "basla", None),
                                  "ack_gecikme": 5})
s_4 = otr_4.skor(sim_4)
kontrol("Dort mudahale de dogru sayildi", s_4["dogru_mudahale"] == 4,
        f"({s_4['dogru_mudahale']}/4)")
kontrol("Hat uretim yapiyor", sim_4.deyerler()["uretim.vardiya.ton"] > 5,
        f"({sim_4.deyerler()['uretim.vardiya.ton']} t)")
kontrol("Skor yuksek (>=70)", s_4["toplam"] >= 70, f"({s_4['toplam']}/100)")

print("\n8) S04 — YANLIS sirada denendi (hepsi reddedilmeli)")
sim_y, otr_y, koc_y = kos("S04", {40: ("motor.FE01", "basla", None),
                                  55: ("motor.CR01", "basla", None)})
kontrol("Interlock kurali koc tarafindan aciklandi",
        any("Interlock" in k["baslik"] for k in koc_y), f"({len(koc_y)} mesaj)")
kontrol("Uretim olmadi", sim_y.deyerler()["uretim.vardiya.ton"] < 1,
        f"({sim_y.deyerler()['uretim.vardiya.ton']} t)")
kontrol("Skor dusuk", otr_y.skor(sim_y)["toplam"] < 60, f"({otr_y.skor(sim_y)['toplam']}/100)")

print("\n9) S05 — Sump tasma riski")
sim_5, otr_5, koc_5 = kos("S05", {90: ("motor.P2", "basla", None), "ack_gecikme": 6})
s_5 = otr_5.skor(sim_5)
kontrol("Koc sump uyarisi verdi",
        any("Sump" in k["baslik"] for k in koc_5), f"({len(koc_5)} mesaj)")
kontrol("P2 devreye alindi", sim_5.deyerler()["motor.P2.durum"] == "isliyir")
kontrol("Sump kontrol altinda (<%80)", sim_5.deyerler()["sump.S1.seviyye"] < 80,
        f"(%{sim_5.deyerler()['sump.S1.seviyye']})")

sim_5k, otr_5k, _ = kos("S05", {"ack_gecikme": 3})
kontrol("Mudahale etmeyen operator daha kotu skor aldi",
        otr_5k.skor(sim_5k)["toplam"] < s_5["toplam"],
        f"({otr_5k.skor(sim_5k)['toplam']} < {s_5['toplam']})")

print("\n10) EGITIM GOREVLERI — senaryolarda tanimli mi?")
for sid in ("S01", "S02", "S03", "S04", "S05"):
    sn = Senaryo.yukle(sid)
    adim = sum(len(g.get("adimlar", [])) for g in sn.gorevler)
    kontrol(f"{sid} gorev/adim tanimli", len(sn.gorevler) >= 1 and adim >= 2,
            f"({len(sn.gorevler)} gorev, {adim} adim, ekran={sn.ekran})")

print("\n" + "-" * 72)
print(f"S01 iyi {s_i['toplam']:>3}/100 · kotu {s_k['toplam']:>3}/100   |   "
      f"S04 dogru {s_4['toplam']:>3}/100 · yanlis {otr_y.skor(sim_y)['toplam']:>3}/100")
print("-" * 72)
print(f"SONUC:  {GECTI} gecti,  {KALDI} kaldi")
print("=" * 72)
sys.exit(1 if KALDI else 0)
