#!/usr/bin/env python3
"""Build the playground data.

Public datasets (CC BY 4.0 or public domain) and seeded synthetic ones are sliced to a
few thousand points. For every dataset the Granite Time Series models produce real
zero-shot forecasts at several origins (TTM r3, FlowState r1.1, PatchTST-FM r2) and TSPulse r1
scores every point for anomalies. Everything lands in data/pg/*.json for the site.

Runs in GitHub Actions (see .github/workflows/playground.yml). Every step is best effort:
a dataset or a model that fails is logged and skipped, the rest still ships.
"""
import io
import json
import math
import pathlib
import sys
import time
import traceback
import urllib.request
import zipfile

import numpy as np
import pandas as pd

OUT = pathlib.Path("data/pg")
OUT.mkdir(parents=True, exist_ok=True)
LOGF = open(OUT / "log.txt", "w")


def log(*a):
    msg = " ".join(str(x) for x in a)
    print(msg, flush=True)
    LOGF.write(msg + "\n")
    LOGF.flush()


def fetch(url, timeout=180):
    req = urllib.request.Request(url, headers={"User-Agent": "realtimeintelligence.io playground builder"})
    return urllib.request.urlopen(req, timeout=timeout).read()


def unzip_first(data, suffix):
    z = zipfile.ZipFile(io.BytesIO(data))
    for n in z.namelist():
        if n.lower().endswith(suffix):
            return z.read(n)
    raise FileNotFoundError(suffix)


def regularize(s, freq):
    s = s[~s.index.duplicated(keep="last")].sort_index()
    s = s.asfreq(freq)
    s = s.interpolate(limit_direction="both")
    return s.astype(float)


def r4(v):
    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
        return None
    return float(f"{float(v):.5g}")


# ------------------------------------------------------------------ datasets
# cfg per frequency class: context, horizon, number of origins
CLASS = {
    "sub": {"ctx": 2048, "h": 96, "k": 10, "ttm_rev": "2048-96-r3", "ttm_h": 96},
    "day": {"ctx": 512, "h": 30, "k": 8, "ttm_rev": "512-30-dec-90-r3", "ttm_h": 30},
    "mon": {"ctx": 156, "h": 12, "k": 6, "ttm_rev": "156-16-dec-52-r3", "ttm_h": 16},
}


def slice_len(cls):
    c = CLASS[cls]
    return c["ctx"] + c["h"] * c["k"] + c["h"]


DATASETS = []


def dataset(**meta):
    def deco(fn):
        meta["load"] = fn
        DATASETS.append(meta)
        return fn

    return deco


UCI = "https://archive.ics.uci.edu/static/public/"


@dataset(id="steel", name="Steel plant energy", domain="Manufacturing", kind="public", cls="sub", freq="15min",
         season=96, unit="kWh", fs_scale=0.25, ttm_freq="15min",
         source={"name": "Steel Industry Energy Consumption, UCI Machine Learning Repository (DAEWOO Steel, Gwangyang)",
                 "url": "https://archive.ics.uci.edu/dataset/851/steel+industry+energy+consumption", "license": "CC BY 4.0"},
         blurb="Energy drawn by a steel plant every 15 minutes through 2018. Shifts, weekends and load types show up as rhythm.")
def load_steel():
    raw = fetch(UCI + "851/steel+industry+energy+consumption.zip")
    df = pd.read_csv(io.BytesIO(unzip_first(raw, ".csv")))
    ts = pd.to_datetime(df["date"], dayfirst=True)
    s = pd.Series(df["Usage_kWh"].values, index=ts)
    return regularize(s, "15min")


@dataset(id="traffic", name="Interstate traffic volume", domain="Transport", kind="public", cls="sub", freq="h",
         season=24, unit="vehicles / h", fs_scale=1.0, ttm_freq="h",
         source={"name": "Metro Interstate Traffic Volume, UCI Machine Learning Repository (MN DoT, I-94 westbound)",
                 "url": "https://archive.ics.uci.edu/dataset/492/metro+interstate+traffic+volume", "license": "CC BY 4.0"},
         blurb="Hourly westbound traffic on I-94 between Minneapolis and St Paul. Two rush hours a day, quiet weekends, holidays.")
def load_traffic():
    raw = fetch(UCI + "492/metro+interstate+traffic+volume.zip")
    df = pd.read_csv(io.BytesIO(unzip_first(raw, ".csv")))
    ts = pd.to_datetime(df["date_time"])
    s = pd.Series(df["traffic_volume"].values, index=ts)
    return regularize(s, "h")


@dataset(id="bikes", name="Bike sharing demand", domain="Retail and mobility", kind="public", cls="sub", freq="h",
         season=24, unit="rentals / h", fs_scale=1.0, ttm_freq="h",
         source={"name": "Bike Sharing Dataset, UCI Machine Learning Repository (Capital Bikeshare, Washington DC)",
                 "url": "https://archive.ics.uci.edu/dataset/275/bike+sharing+dataset", "license": "CC BY 4.0"},
         blurb="Hourly rentals across a city bike system in 2012. Commute peaks on weekdays, one broad hump on weekends, weather in between.")
def load_bikes():
    raw = fetch(UCI + "275/bike+sharing+dataset.zip")
    z = zipfile.ZipFile(io.BytesIO(raw))
    name = [n for n in z.namelist() if n.endswith("hour.csv")][0]
    df = pd.read_csv(io.BytesIO(z.read(name)))
    ts = pd.to_datetime(df["dteday"]) + pd.to_timedelta(df["hr"], unit="h")
    s = pd.Series(df["cnt"].values, index=ts)
    return regularize(s, "h")


@dataset(id="grid", name="Grid demand, New South Wales", domain="Energy", kind="public", cls="sub", freq="30min",
         season=48, unit="MW", fs_scale=0.5, ttm_freq="30min",
         source={"name": "Australian Electricity Demand Dataset, Monash Time Series Forecasting Archive (AEMO data)",
                 "url": "https://zenodo.org/records/4659727", "license": "CC BY 4.0"},
         blurb="Half-hourly electricity demand for New South Wales. Morning and evening peaks, a weekly rhythm, weather on top.")
def load_grid():
    raw = fetch("https://zenodo.org/records/4659727/files/australian_electricity_demand_dataset.zip?download=1")
    txt = unzip_first(raw, ".tsf").decode("utf-8", "ignore")
    lines = txt.split("\n")
    i = next(k for k, l in enumerate(lines) if l.strip().lower() == "@data")
    row = lines[i + 1].strip()
    name, start, vals = row.split(":", 2)
    start = pd.to_datetime(start.strip(), format="%Y-%m-%d %H-%M-%S")
    v = np.array([float(x) if x != "?" else np.nan for x in vals.split(",")])
    s = pd.Series(v, index=pd.date_range(start, periods=len(v), freq="30min"))
    return regularize(s, "30min")


@dataset(id="retail", name="US retail sales", domain="Retail", kind="public", cls="mon", freq="MS",
         season=12, unit="$ millions", fs_scale=2.0, ttm_freq="M",
         source={"name": "Advance Retail Sales: Retail Trade (RSXFS), US Census Bureau via FRED",
                 "url": "https://fred.stlouisfed.org/series/RSXFS", "license": "Public domain (US government data)"},
         blurb="Monthly US retail trade sales since 1992. Trend, a strong December, the 2008 dip and the 2020 shock.")
def load_retail():
    raw = fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=RSXFS")
    df = pd.read_csv(io.BytesIO(raw))
    df.columns = ["date", "v"]
    df = df[df["v"] != "."]
    s = pd.Series(df["v"].astype(float).values, index=pd.to_datetime(df["date"]))
    return regularize(s, "MS")


@dataset(id="wti", name="WTI crude oil price", domain="Markets", kind="public", cls="day", freq="B",
         season=1, unit="$ / barrel", fs_scale=0.0656, ttm_freq="D",
         source={"name": "Crude Oil Prices: West Texas Intermediate (DCOILWTICO), US EIA via FRED",
                 "url": "https://fred.stlouisfed.org/series/DCOILWTICO", "license": "Public domain (US government data)"},
         blurb="Daily spot price of WTI crude. No seasonality to lean on, so the band is the whole story.")
def load_wti():
    raw = fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILWTICO")
    df = pd.read_csv(io.BytesIO(raw))
    df.columns = ["date", "v"]
    df = df[df["v"] != "."]
    s = pd.Series(df["v"].astype(float).values, index=pd.to_datetime(df["date"]))
    return regularize(s, "B")


@dataset(id="subway", name="NYC subway ridership", domain="Transport", kind="public", cls="day", freq="D",
         season=7, unit="riders / day", fs_scale=3.43, ttm_freq="D",
         source={"name": "MTA Daily Ridership Data: Beginning 2020, New York State Open Data",
                 "url": "https://data.ny.gov/Transportation/MTA-Daily-Ridership-Data-Beginning-2020/vxuj-8kew", "license": "Open data (NY State terms of use)"},
         blurb="Daily subway riders since 2020. A hard weekly cycle, holidays, and the long climb back after the pandemic.")
def load_subway():
    raw = fetch("https://data.ny.gov/resource/vxuj-8kew.csv?$limit=5000&$order=date")
    df = pd.read_csv(io.BytesIO(raw))
    col = [c for c in df.columns if "subway" in c.lower() and "ridership" in c.lower()][0]
    s = pd.Series(df[col].astype(float).values, index=pd.to_datetime(df["date"]))
    return regularize(s, "D")


# ---- synthetic, seeded, with ground truth labels
def synth_base(n, step, rng):
    return np.arange(n)


@dataset(id="syn-kiln", name="Kiln shell temperature", domain="Manufacturing", kind="synthetic", cls="sub", freq="min",
         season=240, unit="°C", fs_scale=0.1, ttm_freq="min",
         source={"name": "Synthetic, seeded (numpy, seed 42)", "url": "", "license": "CC0"},
         blurb="A rotary kiln at one-minute resolution: a four-hour feed cycle, slow drift, and three injected faults with known ground truth.")
def load_kiln():
    rng = np.random.default_rng(42)
    n = slice_len("sub")
    t = np.arange(n)
    y = 1420 + 9 * np.sin(2 * np.pi * t / 240) + 3 * np.sin(2 * np.pi * t / 61) + 0.004 * (t - n / 2)
    y = y + np.cumsum(rng.normal(0, 0.12, n)) * 0.6 + rng.normal(0, 0.9, n)
    labels = []
    # variance burst
    a, b = 1500, 1540
    y[a:b] += rng.normal(0, 7, b - a)
    labels.append([a, b, "noise burst"])
    # spike
    a, b = 2600, 2606
    y[a:b] += 38
    labels.append([a, b, "spike"])
    # level shift
    a, b = 2900, 3010
    y[a:b] -= 14
    labels.append([a, b, "level shift"])
    s = pd.Series(y, index=pd.date_range("2026-03-02", periods=n, freq="min"))
    return s, labels


@dataset(id="syn-sku", name="Store SKU demand", domain="Retail", kind="synthetic", cls="sub", freq="h",
         season=168, unit="units / h", fs_scale=1.0, ttm_freq="h",
         source={"name": "Synthetic, seeded (numpy, seed 7)", "url": "", "license": "CC0"},
         blurb="Hourly sales of one SKU in one store: opening hours, a weekend lift, two promotions and a stockout, all labeled.")
def load_sku():
    rng = np.random.default_rng(7)
    n = slice_len("sub")
    t = np.arange(n)
    hour = t % 24
    dow = (t // 24) % 7
    open_ = ((hour >= 8) & (hour < 21)).astype(float)
    day = 1 + 0.9 * np.exp(-((hour - 12) ** 2) / 18) + 1.4 * np.exp(-((hour - 18) ** 2) / 8)
    week = 1 + 0.35 * (dow >= 5)
    lam = 6 * open_ * day * week
    labels = []
    for a, b in [(700, 748), (1900, 1948)]:
        lam[a:b] *= 1.7
        labels.append([a, b, "promotion"])
    y = rng.poisson(lam).astype(float)
    a, b = 2500, 2530
    y[a:b] = 0
    labels.append([a, b, "stockout"])
    s = pd.Series(y, index=pd.date_range("2026-01-05", periods=n, freq="h"))
    return s, labels


@dataset(id="syn-cards", name="Card authorizations", domain="Banking", kind="synthetic", cls="sub", freq="5min",
         season=288, unit="authorizations / 5 min", fs_scale=0.0833, ttm_freq="5min",
         source={"name": "Synthetic, seeded (numpy, seed 11)", "url": "", "license": "CC0"},
         blurb="Authorizations through one issuer gateway every five minutes: a daily cycle, lunch and evening peaks, and two fraud bursts with ground truth.")
def load_cards():
    rng = np.random.default_rng(11)
    n = slice_len("sub")
    t = np.arange(n)
    tod = (t % 288) / 288
    base = 320 + 260 * np.clip(np.sin(np.pi * (tod - 0.2) / 0.75), 0, None) + 90 * np.exp(-((tod - 0.52) ** 2) / 0.002) + 120 * np.exp(-((tod - 0.78) ** 2) / 0.003)
    lam = base * (1 + 0.08 * np.sin(2 * np.pi * t / (288 * 7)))
    labels = []
    for a, b in [(1210, 1236), (2650, 2672)]:
        lam[a:b] *= 2.6
        labels.append([a, b, "fraud burst"])
    y = rng.poisson(lam).astype(float)
    s = pd.Series(y, index=pd.date_range("2026-02-02", periods=n, freq="5min"))
    return s, labels


@dataset(id="syn-api", name="API latency p95", domain="Technology", kind="synthetic", cls="sub", freq="5min",
         season=288, unit="ms", fs_scale=0.0833, ttm_freq="5min",
         source={"name": "Synthetic, seeded (numpy, seed 3)", "url": "", "license": "CC0"},
         blurb="p95 latency of one service every five minutes: load follows the day, a slow memory leak, and two incidents with ground truth.")
def load_api():
    rng = np.random.default_rng(3)
    n = slice_len("sub")
    t = np.arange(n)
    tod = (t % 288) / 288
    y = 180 + 70 * np.clip(np.sin(np.pi * (tod - 0.25) / 0.6), 0, None) + rng.gamma(4, 3, n)
    leak = (t % 1000) * 0.06
    y = y + leak
    labels = []
    for a, b in [(900, 935), (2300, 2345)]:
        y[a:b] *= 3.2 + rng.normal(0, 0.2, b - a)
        labels.append([a, b, "incident"])
    s = pd.Series(y, index=pd.date_range("2026-04-06", periods=n, freq="5min"))
    return s, labels


# ------------------------------------------------------------------ models
try:
    import torch  # noqa: E402

    torch.set_num_threads(max(1, torch.get_num_threads()))
except Exception:  # local dry runs without torch
    torch = None
DEVICE = "cpu"
_models = {}


def ttm_model(rev, h):
    key = ("ttm", rev)
    if key not in _models:
        from tsfm_public.toolkit.get_model import get_model

        ctx = int(rev.split("-")[0])
        _models[key] = get_model("ibm-granite/granite-timeseries-ttm-r3", context_length=ctx, prediction_length=h,
                                 model_revision=rev)
    return _models[key]


def flowstate_model(scale):
    key = ("flowstate", scale)
    if key not in _models:
        from tsfm_public import FlowStateForPrediction

        _models[key] = FlowStateForPrediction.from_pretrained("ibm-granite/granite-timeseries-flowstate-r1",
                                                              revision="r1.1", batch_first=True, scale_factor=scale)
    return _models[key]


def patchtstfm_model():
    key = ("patchtstfm",)
    if key not in _models:
        from tsfm_public import PatchTSTFMForPrediction

        _models[key] = PatchTSTFMForPrediction.from_pretrained("ibm-granite/granite-timeseries-patchtst-fm-r2")
    return _models[key]


def tspulse_model():
    key = ("tspulse",)
    if key not in _models:
        from tsfm_public.models.tspulse import TSPulseForReconstruction

        _models[key] = TSPulseForReconstruction.from_pretrained("ibm-granite/granite-timeseries-tspulse-r1",
                                                                num_input_channels=1, revision="main", mask_type="user")
    return _models[key]


def windows_df(values, index, origins, ctx):
    frames = []
    for i, o in enumerate(origins):
        frames.append(pd.DataFrame({"id": str(i), "ts": index[o - ctx:o], "y": values[o - ctx:o]}))
    return pd.concat(frames, ignore_index=True)


def run_pipeline(pipe, df, k, h):
    t0 = time.perf_counter()
    out = pipe(df)
    ms = (time.perf_counter() - t0) * 1000 / k
    out = out.sort_values("id", key=lambda s: s.astype(int)) if "id" in out.columns else out
    point, lo, hi = [], [], []
    for _, row in out.iterrows():
        p = row.get("y_prediction_q0.5", None)
        if p is None or (isinstance(p, float) and math.isnan(p)):
            p = row["y_prediction"]
        point.append([r4(v) for v in list(p)[:h]])
        if "y_prediction_q0.1" in out.columns:
            lo.append([r4(v) for v in list(row["y_prediction_q0.1"])[:h]])
            hi.append([r4(v) for v in list(row["y_prediction_q0.9"])[:h]])
    return point, lo, hi, ms


def forecast_ttm(meta, values, index, origins, cls):
    from tsfm_public import TimeSeriesForecastingPipeline

    c = CLASS[cls]
    model = ttm_model(c["ttm_rev"], c["ttm_h"])
    ctx = int(model.config.context_length)
    df = windows_df(values, index, origins, ctx)
    kw = dict(model=model, id_columns=["id"], timestamp_column="ts", target_columns=["y"], context_length=ctx,
              prediction_length=int(model.config.prediction_length), batch_size=16, impute_method=None, device=DEVICE,
              freq=meta["freq"])
    try:
        pipe = TimeSeriesForecastingPipeline(quantile_levels=[0.1, 0.5, 0.9], **kw)
        return run_pipeline(pipe, df, len(origins), c["h"]) + (ctx,)
    except Exception as e:  # quantiles unsupported on this revision
        log("  ttm quantiles unavailable, point only:", repr(e)[:160])
        pipe = TimeSeriesForecastingPipeline(**kw)
        return run_pipeline(pipe, df, len(origins), c["h"]) + (ctx,)


def forecast_flowstate(meta, values, index, origins, cls):
    from tsfm_public import TimeSeriesForecastingPipeline
    from tsfm_public.toolkit.time_series_preprocessor import TimeSeriesPreprocessor

    c = CLASS[cls]
    ctx, h = c["ctx"], c["h"]
    model = flowstate_model(meta["fs_scale"])
    df = windows_df(values, index, origins, ctx)
    tsp = TimeSeriesPreprocessor(target_columns=["y"], timestamp_column="ts", id_columns=["id"], context_length=ctx,
                                 prediction_length=h, scaling=True, encode_categorical=False, scaler_type="standard")
    tsp.train(df)
    pipe = TimeSeriesForecastingPipeline(model=model, prediction_length=h, context_length=ctx, max_context_length=ctx,
                                         target_columns=["y"], id_columns=["id"], timestamp_column="ts", impute_method=None,
                                         batch_size=8, device=DEVICE, feature_extractor=tsp, freq=meta["freq"])
    return run_pipeline(pipe, df, len(origins), h) + (ctx,)


def forecast_patchtstfm(meta, values, index, origins, cls):
    from tsfm_public import TimeSeriesForecastingPipeline

    c = CLASS[cls]
    ctx, h = c["ctx"], c["h"]
    model = patchtstfm_model()
    df = windows_df(values, index, origins, ctx)
    pipe = TimeSeriesForecastingPipeline(model=model, id_columns=["id"], timestamp_column="ts", target_columns=["y"],
                                         max_context_length=int(model.config.context_length), context_length=ctx,
                                         prediction_length=h, impute_method=None, quantile_levels=[0.1, 0.5, 0.9],
                                         batch_size=4, device=DEVICE, freq=meta["freq"])
    return run_pipeline(pipe, df, len(origins), h) + (ctx,)


def forecast_snaive(meta, values, index, origins, cls):
    c = CLASS[cls]
    h, m = c["h"], max(1, int(meta["season"]))
    point = []
    for o in origins:
        f = [values[o - m + (j % m)] for j in range(h)]
        point.append([r4(v) for v in f])
    return point, [], [], 0.0, m


MODELS = [
    ("ttm", "TTM r3", forecast_ttm),
    ("flowstate", "FlowState r1.1", forecast_flowstate),
    ("patchtstfm", "PatchTST-FM r2", forecast_patchtstfm),
    ("snaive", "Seasonal naive", forecast_snaive),
]


def anomaly_tspulse(values, index):
    from tsfm_public.toolkit.ad_helpers import AnomalyScoreMethods
    from tsfm_public.toolkit.time_series_anomaly_detection_pipeline import TimeSeriesAnomalyDetectionPipeline

    model = tspulse_model()
    pipe = TimeSeriesAnomalyDetectionPipeline(model, timestamp_column="ts", target_columns=["y"],
                                              prediction_mode=[AnomalyScoreMethods.TIME_RECONSTRUCTION.value,
                                                               AnomalyScoreMethods.FREQUENCY_RECONSTRUCTION.value],
                                              aggregation_length=64, aggr_function="max", smoothing_length=8,
                                              least_significant_scale=0.01, least_significant_score=0.1)
    df = pd.DataFrame({"ts": index, "y": values})
    t0 = time.perf_counter()
    res = pipe(df, batch_size=128, predictive_score_smoothing=False)
    ms = (time.perf_counter() - t0) * 1000
    score = res["anomaly_score"].astype(float).fillna(0).clip(0, 1).round(3).tolist()
    return score, ms


# ------------------------------------------------------------------ main
def mase_scale(values, o, ctx, m):
    seg = values[o - ctx:o]
    m = max(1, min(m, len(seg) - 1))
    d = np.abs(seg[m:] - seg[:-m])
    return float(np.mean(d)) if len(d) else 1.0


def build(meta, only=None):
    did = meta["id"]
    log(f"== {did}")
    loaded = meta["load"]()
    labels = []
    if isinstance(loaded, tuple):
        s, labels = loaded
    else:
        s = loaded
    cls = meta["cls"]
    n = slice_len(cls)
    s = s.dropna()
    if len(s) < n:
        n = len(s)
    s = s.iloc[-n:]
    values = s.values.astype(float)
    index = s.index
    c = CLASS[cls]
    ctx, h, k = c["ctx"], c["h"], c["k"]
    last = n - h
    first = ctx
    origins = [int(round(x)) for x in np.linspace(first, last, k)] if last > first else [last]
    out = {
        "id": did, "name": meta["name"], "domain": meta["domain"], "kind": meta["kind"], "blurb": meta["blurb"],
        "source": meta["source"], "unit": meta["unit"], "freq": meta["freq"], "season": meta["season"],
        "start": index[0].isoformat(), "n": int(n), "values": [r4(v) for v in values],
        "labels": labels,
        "fc": {"ctx": ctx, "h": h, "origins": origins,
               "scale": [r4(mase_scale(values, o, ctx, meta["season"])) for o in origins], "models": {}},
        "ad": {},
    }
    for key, label, fn in MODELS:
        if only and key not in only and key != "snaive":
            continue
        t0 = time.time()
        try:
            point, lo, hi, ms, used_ctx = fn(meta, values, index, origins, cls)
            out["fc"]["models"][key] = {"label": label, "status": "ok", "ms": r4(ms), "ctx": int(used_ctx),
                                        "point": point, "lo": lo, "hi": hi}
            log(f"  {key}: ok, {ms:.1f} ms per forecast, {time.time() - t0:.1f} s total")
        except Exception as e:
            out["fc"]["models"][key] = {"label": label, "status": "error", "error": repr(e)[:300]}
            log(f"  {key}: FAILED {repr(e)[:300]}")
            log(traceback.format_exc()[-1200:])
    if (not only or "tspulse" in only) and n >= 1536:
        try:
            score, ms = anomaly_tspulse(values, index)
            out["ad"]["tspulse"] = {"label": "TSPulse r1", "status": "ok", "ms": r4(ms), "score": score}
            log(f"  tspulse: ok, {ms:.0f} ms for {n} points")
        except Exception as e:
            out["ad"]["tspulse"] = {"label": "TSPulse r1", "status": "error", "error": repr(e)[:300]}
            log(f"  tspulse: FAILED {repr(e)[:300]}")
            log(traceback.format_exc()[-1200:])
    (OUT / f"{did}.json").write_text(json.dumps(out, separators=(",", ":")))
    return out


def main():
    only = set(sys.argv[1].split(",")) if len(sys.argv) > 1 and sys.argv[1] else None
    want = set(sys.argv[2].split(",")) if len(sys.argv) > 2 and sys.argv[2] else None
    index = []
    for meta in DATASETS:
        if want and meta["id"] not in want:
            continue
        try:
            out = build(meta, only)
        except Exception as e:
            log(f"  dataset {meta['id']} FAILED: {repr(e)[:300]}")
            log(traceback.format_exc()[-1500:])
            continue
        v = np.array([x if x is not None else np.nan for x in out["values"]], dtype=float)
        step = max(1, len(v) // 120)
        spark = [r4(x) for x in v[::step][:120]]
        index.append({
            "id": out["id"], "name": out["name"], "domain": out["domain"], "kind": out["kind"], "blurb": out["blurb"],
            "freq": out["freq"], "n": out["n"], "unit": out["unit"], "source": out["source"], "spark": spark,
            "forecast": [k for k, m in out["fc"]["models"].items() if m.get("status") == "ok" and k != "snaive"],
            "anomaly": out["ad"].get("tspulse", {}).get("status") == "ok",
            "labels": len(out["labels"]),
        })
    (OUT / "index.json").write_text(json.dumps({"built": pd.Timestamp.utcnow().isoformat(), "datasets": index},
                                               separators=(",", ":")))
    log("done:", [d["id"] for d in index])


if __name__ == "__main__":
    main()
