"""
RemoteOps - FastAPI + WebSocket sunucusu

Calistir:
    python -m uvicorn server.main:app --reload --port 8000
Sonra tarayici:
    http://localhost:8000/

Her WebSocket baglantisi = bir egitim oturumu (kendi simulasyonu).
Mesaj formati: contract.md v1.0
"""

from __future__ import annotations

import asyncio
import csv
import json
import sys
import time
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

KOK = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KOK / "engine"))
sys.path.insert(0, str(KOK / "server"))

from koc import Koc               # noqa: E402
from senaryo import Oturum, Senaryo  # noqa: E402
from sim import Simulasyon        # noqa: E402

WEB = KOK / "web"
KAYIT = KOK / "data" / "kayitlar"
KAYIT.mkdir(parents=True, exist_ok=True)

TICK_SN = 1.0
VARSAYILAN_SENARYO = "S01"

app = FastAPI(title="RemoteOps")


@app.middleware("http")
async def onbellek_kapali(request, call_next):
    """Gelistirme sirasinda tarayici ESKI js/css'i onbellekten okuyor ve
    degisiklikler gorunmuyordu. Statik dosyalar icin onbellegi kapatiyoruz."""
    cevap = await call_next(request)
    if request.url.path.endswith((".js", ".css", ".html", ".json", ".svg"))             or request.url.path == "/":
        cevap.headers["Cache-Control"] = "no-store, must-revalidate"
        cevap.headers["Pragma"] = "no-cache"
    return cevap


@app.get("/")
async def kok():
    return FileResponse(WEB / "index.html")


@app.get("/api/senaryolar")
async def senaryolar():
    return Senaryo.liste()


@app.get("/api/semalar")
async def semalar():
    """Mevcut sebeke (sema) tanimlarini listeler."""
    out = []
    for f in sorted((KOK / "data").glob("sebeke_*.json")):
        try:
            v = json.loads(f.read_text(encoding="utf-8"))
            out.append({"id": f.stem.replace("sebeke_", ""),
                        "ad": v.get("ad", f.stem),
                        "dugum": len(v.get("dugumler", [])),
                        "kol": len(v.get("kollar", []))})
        except Exception:
            continue
    return out


@app.get("/api/sebeke/{sid}")
async def sebeke(sid: str):
    """Bir sebeke tanimini dondurur. Arayuz semayi bundan URETIR."""
    f = KOK / "data" / f"sebeke_{Path(sid).name}.json"
    if not f.exists():
        return {"xeta": "sebeke bulunamadi"}
    return json.loads(f.read_text(encoding="utf-8"))


@app.post("/api/sebeke/_dogrula")
async def sebeke_dogrula(tanim: dict):
    """Editorden gelen agi GERCEK fizik motorunda cozer. Kaydetmeden once kontrol."""
    from network import Sebeke as _Sebeke
    try:
        s = _Sebeke.sozlukten(tanim)
        s.coz()
    except Exception as e:
        return {"xeta": f"{type(e).__name__}: {e}"}

    denge = s.dugum_dengesizligi()
    k2 = s.kirchhoff2_kalinti()
    if denge > 1e-6:
        return {"xeta": f"Kirchhoff-1 (dugum dengesi) saglanmadi ({denge:.2e} m3/s). "
                        "Ag muhtemelen kapali devre olusturmuyor."}
    if k2 > 1.0:
        return {"xeta": f"Kirchhoff-2 (dongu basinc dengesi) saglanmadi ({k2:.2f} Pa). "
                        "Cozum yakinsamadi — cok uc direnc oranlari olabilir."}
    f = s.fan_bilgisi()
    uyarilar = []
    if f.get("debi", 0) < 1:
        uyarilar.append("Toplam debi ~0 — fan yok veya devre kapali degil.")
    for k in s.kollar.values():
        if k.tip == "arin":
            if k.hiz < 0.5:
                uyarilar.append(f"{k.arin}: hava hizi {k.hiz:.2f} m/s — yonetmelik alt siniri 0.5")
            elif k.hiz > 8.0:
                uyarilar.append(f"{k.arin}: hava hizi {k.hiz:.2f} m/s — 8 m/s ustu")
    return {
        "ok": True,
        "iterasyon": s._son_iterasyon,
        "yontem": s._yontem,
        "denge": denge,
        "kirchhoff2": k2,
        "fan_debi": round(f.get("debi", 0), 1),
        "fan_basinc": round(f.get("basinc", 0)),
        "fan_guc": round(f.get("guc_kw", 0)),
        "uyarilar": uyarilar,
        "kollar": [{"id": k.id, "ad": k.ad, "Q": round(k.Q, 2), "hiz": round(k.hiz, 2)}
                   for k in s.kollar.values()],
    }


@app.post("/api/sebeke/{sid}")
async def sebeke_kaydet(sid: str, tanim: dict):
    """Editorden gelen sebekeyi kaydeder. Kullanici kendi ocagini olusturabilsin diye."""
    ad = Path(sid).name
    if not ad.replace("_", "").replace("-", "").isalnum():
        return {"xeta": "gecersiz ad"}
    (KOK / "data" / f"sebeke_{ad}.json").write_text(
        json.dumps(tanim, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True, "id": ad}


class OturumDurumu:
    """Bir egitim oturumu: simulasyon + senaryo + koc + kayit."""

    def __init__(self, senaryo_id: str = VARSAYILAN_SENARYO, sebeke_id: str = "ocak1",
                 mod: str = "guided"):
        self.sebeke_id = sebeke_id
        self.mod = mod
        self.sim = Simulasyon.olustur(KOK / "data" / f"sebeke_{Path(sebeke_id).name}.json")
        self.koc = Koc()
        self.koc.ogren(self.sim)
        self.senaryo = Senaryo.yukle(senaryo_id)
        self.oturum = Oturum(senaryo=self.senaryo)
        self.calisiyor = True
        self.gecikmeler: list[float] = []
        ad = f"{senaryo_id}_{time.strftime('%Y%m%d_%H%M%S')}.csv"
        self.kayit_yolu = KAYIT / ad
        self._csv = None
        self._yazici = None

    # -------------------------------------------------------------- kayit
    def kaydet(self, tick: dict) -> None:
        """Her tick CSV'ye yazilir. Ayni dosya sonra REPLAY icin okunur —
        gercek sirket CSV'si de ayni borudan girer, kod degismez."""
        d = tick["deyerler"]
        if self._csv is None:
            self._csv = open(self.kayit_yolu, "w", newline="", encoding="utf-8")
            self._yazici = csv.writer(self._csv)
            self._yazici.writerow(["t"] + list(d.keys()))
        self._yazici.writerow([tick["t"]] + list(d.values()))

    def kapat(self) -> None:
        if self._csv:
            self._csv.close()
            self._csv = None

    # -------------------------------------------------------------- yeniden
    def yeniden_kur(self, senaryo_id: str | None = None) -> None:
        self.kapat()
        sid = senaryo_id or self.senaryo.id
        self.sim = Simulasyon.olustur(
            KOK / "data" / f"sebeke_{Path(self.sebeke_id).name}.json")
        self.koc = Koc()
        self.koc.ogren(self.sim)
        self.senaryo = Senaryo.yukle(sid)
        self.oturum = Oturum(senaryo=self.senaryo)
        self.calisiyor = True
        ad = f"{sid}_{time.strftime('%Y%m%d_%H%M%S')}.csv"
        self.kayit_yolu = KAYIT / ad
        self._csv = self._yazici = None


@app.websocket("/ws")
async def ws_uc(ws: WebSocket):
    await ws.accept()
    # Arayuzde secilen sema ile simulasyonun AYNI ag olmasi sart:
    #   ws://host/ws?sema=ocak2
    sema = ws.query_params.get("sema", "ocak1")
    if not (KOK / "data" / f"sebeke_{Path(sema).name}.json").exists():
        sema = "ocak1"
    mod = ws.query_params.get("mod", "guided")
    if mod not in ("guided", "hints", "independent", "exam"):
        mod = "guided"
    senaryo = ws.query_params.get("senaryo", VARSAYILAN_SENARYO)
    if not (KOK / "scenarios" / f"{Path(senaryo).name}.yaml").exists():
        senaryo = VARSAYILAN_SENARYO
    od = OturumDurumu(senaryo_id=senaryo, sebeke_id=sema, mod=mod)

    async def gonder(m: dict):
        await ws.send_text(json.dumps(m, ensure_ascii=False))

    def init_paketi():
        m = od.sim.init_mesaji({
            "id": od.senaryo.id, "ad": od.senaryo.ad,
            "sure_sn": od.senaryo.sure_sn,
            "aciklama": (od.senaryo.aciklama or "").strip(),
            "ekran": od.senaryo.ekran,
        })
        m["mod"] = od.mod
        # SINAV modunda yonlendirme YOK — adimlar istemciye hic gonderilmez
        m["gorevler"] = [] if od.mod == "exam" else od.senaryo.gorevler
        return m

    await gonder(init_paketi())

    async def dongu():
        """1 Hz simulasyon dongusu."""
        while True:
            t0 = time.perf_counter()
            if od.calisiyor:
                od.oturum.adim(od.sim)
                od.sim.adim(TICK_SN)
                tick = od.sim.tick()
                od.kaydet(tick)
                await gonder(tick)

                k = od.koc.degerlendir(od.sim)
                if k:
                    await gonder(k)

                if od.oturum.bitti:
                    od.calisiyor = False
                    od.kapat()
                    await gonder(od.oturum.bitti_mesaji(od.sim))
            # telemetri gecikmesi olcumu (sunumdaki "<30 ms" iddiasinin dayanagi)
            od.gecikmeler.append((time.perf_counter() - t0) * 1000)
            await asyncio.sleep(max(0.0, TICK_SN - (time.perf_counter() - t0)))

    gorev = asyncio.create_task(dongu())
    try:
        while True:
            m = json.loads(await ws.receive_text())
            tip = m.get("tip")

            if tip == "emr":
                cevap = od.sim.emr(m["hedef"], m["emr"], m.get("deyer"))
                ok = cevap["tip"] == "onay"
                od.oturum.emir_kaydet(od.sim, m["hedef"], m["emr"], ok)
                await gonder(cevap)

            elif tip == "ack":
                od.oturum.ack_kaydet(od.sim, m["alarm_id"])
                od.sim.ack(m["alarm_id"])

            elif tip == "senaryo":
                emr = m.get("emr")
                if emr in ("sifirla", "basla"):
                    if m.get("mod"):
                        od.mod = m["mod"]
                    od.yeniden_kur(m.get("id"))
                    await gonder(init_paketi())
                elif emr == "durdur":
                    od.calisiyor = False
                    await gonder(od.oturum.bitti_mesaji(od.sim, "kullanici_durdurdu"))
            else:
                await gonder({"tip": "xeta", "kod": "GECERSIZ_EMR",
                              "mesaj": f"bilinmeyen mesaj tipi: {tip}"})

    except WebSocketDisconnect:
        pass
    finally:
        gorev.cancel()
        od.kapat()
        if od.gecikmeler:
            g = sorted(od.gecikmeler)
            p50 = g[len(g) // 2]
            p95 = g[int(len(g) * 0.95)]
            print(f"[telemetri] tick isleme suresi  p50={p50:.2f} ms  p95={p95:.2f} ms  "
                  f"({len(g)} tick)")


# statik dosyalar EN SONA - yoksa /ws ve /api yollarini golgeler
app.mount("/", StaticFiles(directory=WEB), name="web")
