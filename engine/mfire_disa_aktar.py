"""Sebekeyi MFIRE / Ventsim'e elle girmek icin CSV tablosu uretir.

MFIRE'in sabit formatli girdi dosyasini tahmin etmek yerine, dogrulanabilir
bir kol tablosu uretiyoruz. Tabloyu MFIRE arayuzune girmek 20 dakikalik istir
ve hata yapilirsa gorulur - dosya formatini yanlis tahmin etmekten guvenlidir.

Calistir:  python engine/mfire_disa_aktar.py
Cikti:     docs/sebeke_kol_tablosu.csv
"""
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from network import Sebeke  # noqa: E402

KOK = Path(__file__).resolve().parent.parent
s = Sebeke.yukle(KOK / "data" / "sebeke_ocak1.json")
s.coz()

hedef = KOK / "docs" / "sebeke_kol_tablosu.csv"
with open(hedef, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["kol_id", "ad", "dugum_a", "dugum_b",
                "R_Ns2_m8", "alan_m2", "uzunluk_m", "tip",
                "fan_p0_Pa", "fan_k",
                "RemoteOps_Q_m3s", "RemoteOps_hiz_ms", "MFIRE_Q_m3s", "fark_yuzde"])
    for k in s.kollar.values():
        w.writerow([k.id, k.ad, k.dugum_a, k.dugum_b,
                    f"{k.R:.4f}", k.alan, "", k.tip,
                    f"{k.fan_p0:.1f}" if k.fan_id else "",
                    f"{k.fan_k:.4f}" if k.fan_id else "",
                    f"{k.Q:.3f}", f"{k.hiz:.3f}", "", ""])

print(f"Yazildi: {hedef}")
print(f"  {len(s.dugumler)} dugum, {len(s.kollar)} kol")
f = s.fan_bilgisi()
print(f"  Normal rejim: {f['debi']:.1f} m3/s, fan {f['basinc']:.0f} Pa")
print("\nMFIRE'da ayni agi kurduktan sonra 'MFIRE_Q_m3s' sutununu doldurun.")
