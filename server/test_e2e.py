"""Faz 4 dogrulama: uctan uca senaryo akisi (sunucusuz, hizli).

Simulasyon + senaryo motoru + koc + puanlama zincirini gercek zamani
beklemeden kosar. Iki operator davranisi karsilastirilir:
    IYI  - dogru mudahale, hizli onay
    KOTU - hicbir sey yapmaz (alarmlari gormezden gelir)

Calistir:  python server/test_e2e.py
"""
import sys
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KOK / "engine"))
sys.path.insert(0, str(KOK / "server"))

from koc import Koc                  # noqa: E402
from senaryo import Oturum, Senaryo   # noqa: E402
from sim import Simulasyon            # noqa: E402

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
    koc_mesajlari = []
    ack_gecikme = davranis.get("ack_gecikme")

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
print("FAZ 4 DOGRULAMA - Uctan uca (simulasyon + senaryo + koc + puanlama)")
print("=" * 72)

# ---------------------------------------------------------------- S01 IYI
print("\nS01 — IYI operator (t=95'te QAPI 1 kapatildi, 8 sn'de onay)")
sim_i, otr_i, koc_i = kos("S01", {95: ("qapi.QAPI_1", "bagla", None), "ack_gecikme": 8})
s_i = otr_i.skor(sim_i)
kontrol("Senaryo suresi doldu", sim_i.t >= 300, f"(t={sim_i.t}s)")
kontrol("Ariza enjekte edildi", any(o["tip"] == "ariza" for o in otr_i.olaylar))
kontrol("Koc kisa devreyi tespit etti",
        any("kisa devre" in k["baslik"] for k in koc_i),
        f"({len(koc_i)} koc mesaji)")
kontrol("Dogru mudahale sayildi", s_i["dogru_mudahale"] == 1, f"({s_i['dogru_mudahale']})")
kontrol("Sistem stabilize oldu", s_i["stabilizasyon_sn"] is not None,
        f"(t={s_i['stabilizasyon_sn']}s)")
kontrol("Onay gecikmesi dusuk (<15 sn)", (s_i["ort_ack_gecikme_sn"] or 99) < 15,
        f"({s_i['ort_ack_gecikme_sn']} sn)")
kontrol("Skor yuksek (>=70)", s_i["toplam"] >= 70, f"({s_i['toplam']}/100)")

# ---------------------------------------------------------------- S01 KOTU
print("\nS01 — KOTU operator (hicbir sey yapmadi)")
sim_k, otr_k, koc_k = kos("S01", {})
s_k = otr_k.skor(sim_k)
kontrol("Mudahale edilmedi", s_k["dogru_mudahale"] == 0)
kontrol("Kacirilan mudahale isaretlendi", s_k["kacirilan_mudahale"] == 1,
        f"({s_k['kacirilan_mudahale']})")
kontrol("Sistem stabilize OLMADI", s_k["stabilizasyon_sn"] is None)
kontrol("Skor dusuk (<45)", s_k["toplam"] < 45, f"({s_k['toplam']}/100)")
kontrol("IYI skor > KOTU skor", s_i["toplam"] > s_k["toplam"],
        f"({s_i['toplam']} > {s_k['toplam']})")

# ---------------------------------------------------------------- S02
print("\nS02 — Ana fan durdu (konveyor durduruldu + fan yeniden baslatildi)")
sim_2, otr_2, koc_2 = kos("S02", {55: ("konveyer.K1", "dayandir", None),
                                  70: ("fan.ana_1", "basla", None),
                                  "ack_gecikme": 6})
s_2 = otr_2.skor(sim_2)
kontrol("Koc 'ANA FAN DURDU' uyarisi verdi",
        any("FAN DURDU" in k["baslik"] for k in koc_2))
kontrol("Her iki dogru mudahale sayildi", s_2["dogru_mudahale"] == 2,
        f"({s_2['dogru_mudahale']}/2)")
kontrol("Fan yeniden calisiyor",
        sim_2.deyerler()["fan.ana_1.durum"] == "isliyir")
kontrol("Debi normale dondu (>100 m3/s)",
        sim_2.deyerler()["fan.ana_1.debi"] > 100,
        f"({sim_2.deyerler()['fan.ana_1.debi']} m3/s)")
kontrol("Skor yuksek (>=70)", s_2["toplam"] >= 70, f"({s_2['toplam']}/100)")

# ---------------------------------------------------------------- S03
print("\nS03 — Normallesmis sapma (sadece ACK basan operator)")
sim_3, otr_3, koc_3 = kos("S03", {"ack_gecikme": 3})
s_3 = otr_3.skor(sim_3)
en_yuksek = max(sim_3.deyerler()[f"qaz.ch4.ARIN_2"] for _ in [0])
kontrol("Gaz emisyonu kurali tetiklendi",
        any("gaz emisyonu" in k["baslik"] for k in koc_3),
        f"({len(koc_3)} koc mesaji)")
kontrol("CH4 P1 esigini asti", en_yuksek >= 2.0, f"(%{en_yuksek:.2f})")
kontrol("Sump uyarisi da verildi", any("Sump" in k["baslik"] for k in koc_3))
kontrol("Hizli ACK'e ragmen skor dusuk (<50)", s_3["toplam"] < 50,
        f"({s_3['toplam']}/100) - ONEMLI: ACK basmak mudahale sayilmaz")
kontrol("3 mudahalenin hepsi kacirildi", s_3["kacirilan_mudahale"] == 3,
        f"({s_3['kacirilan_mudahale']}/3)")

# ---------------------------------------------------------------- S03 IYI
print("\nS03 — IYI operator (seyreltme + uretim durdurma + 2. pompa)")
sim_4, otr_4, koc_4 = kos("S03", {110: ("tenzim.T1", "ayarla", 100),
                                  170: ("konveyer.K1", "dayandir", None),
                                  230: ("nasos.P2", "basla", None),
                                  "ack_gecikme": 5})
s_4 = otr_4.skor(sim_4)
kontrol("Uc mudahale de dogru sayildi", s_4["dogru_mudahale"] == 3,
        f"({s_4['dogru_mudahale']}/3)")
kontrol("Sump kontrol altina alindi",
        sim_4.deyerler()["sump.S1.seviyye"] < sim_3.deyerler()["sump.S1.seviyye"],
        f"(%{sim_4.deyerler()['sump.S1.seviyye']} < %{sim_3.deyerler()['sump.S1.seviyye']})")
kontrol("Mudahale eden operator daha yuksek skor aldi",
        s_4["toplam"] > s_3["toplam"], f"({s_4['toplam']} > {s_3['toplam']})")

# ---------------------------------------------------------------- AAR
print("\nAAR (bitti) mesaji")
b = otr_i.bitti_mesaji(sim_i)
kontrol("Skor dagilimi var", "dagilim" in b["skor"])
kontrol("Olay hatti dolu", len(b["olaylar"]) >= 3, f"({len(b['olaylar'])} olay)")
kontrol("Optimal hat var", len(b["optimal"]) >= 1, f"({len(b['optimal'])} adim)")

print("\n" + "-" * 72)
print("Puan karsilastirmasi (ayni senaryo, farkli operator davranisi):")
print(f"  S01 iyi  : {s_i['toplam']:>3}/100   | S01 kotu : {s_k['toplam']:>3}/100")
print(f"  S03 iyi  : {s_4['toplam']:>3}/100   | S03 sadece ACK : {s_3['toplam']:>3}/100")
print("-" * 72)
print(f"SONUC:  {GECTI} gecti,  {KALDI} kaldi")
print("=" * 72)
sys.exit(1 if KALDI else 0)
