"""Faz 2 icin mock veri uretir - frontend backend'i beklemesin diye.
Veri UYDURMA DEGIL: gercek fizik motorundan uretiliyor.

Calistir:  python engine/mock_uret.py
Cikti:     web/mock/init_ornek.json , web/mock/tick_ornek.json
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sim import Simulasyon  # noqa: E402

KOK = Path(__file__).resolve().parent.parent
HEDEF = KOK / "web" / "mock"
HEDEF.mkdir(parents=True, exist_ok=True)

# sebeke tanimini da mock klasorune kopyala (arayuz semayi bundan uretir)
import shutil
shutil.copy(KOK / "data" / "sebeke_ocak1.json", HEDEF / "sebeke_ocak1.json")

sim = Simulasyon.olustur()
senaryo = {"id": "S01", "ad": "QAPI 1 acik kaldi - kisa devre", "sure_sn": 300}
(HEDEF / "init_ornek.json").write_text(
    json.dumps(sim.init_mesaji(senaryo), ensure_ascii=False, indent=2), encoding="utf-8")

ticks = []
for t in range(301):
    if t == 45:
        sim.emr("qapi.QAPI_1", "ac")            # ariza enjeksiyonu
    if t == 150:
        sim.gaz_carpani["ARIN_2"] = 2.4         # gaz emisyonu artisi
    sim.adim()
    ticks.append(sim.tick())

(HEDEF / "tick_ornek.json").write_text(
    json.dumps(ticks, ensure_ascii=False), encoding="utf-8")

print(f"init_ornek.json  : {len(sim.init_mesaji(senaryo)['etiketler'])} etiket")
print(f"tick_ornek.json  : {len(ticks)} tick, "
      f"{(HEDEF / 'tick_ornek.json').stat().st_size // 1024} KB")
print("\nOlay akisi:")
for t in (0, 60, 120, 180, 240, 300):
    d = ticks[t]["deyerler"]
    print(f"  t={t:>3}s  CH4_A2=%{d['qaz.ch4.ARIN_2']:<5} A2_hiz={d['arin.ARIN_2.hiz']:<5} "
          f"fan={d['fan.ana_1.debi']:<6} sump=%{d['sump.S1.seviyye']:<5} "
          f"alarm={len(ticks[t]['alarmlar'])}")
print("\nSon durumdaki alarmlar:")
for a in ticks[-1]["alarmlar"]:
    print(f"  P{a['prioritet']}  {a['mesaj']:<42} (t={a['vaxt']}s)")
