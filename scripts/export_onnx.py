#!/usr/bin/env python3
"""Export Granite TTM r3 to ONNX so the playground can forecast a visitor's own data in the browser.

The browser runs the same open weights with ONNX Runtime Web. Nothing the visitor uploads leaves
their machine. Three context and horizon variants cover sub-daily, daily and weekly or monthly data.
Every export is checked against PyTorch on a test series, and that series with its expected output is
saved next to the model so the page can be tested end to end.

Runs in GitHub Actions (see .github/workflows/onnx.yml). A variant that fails is logged and skipped.
"""
import json
import pathlib
import sys
import time
import traceback
from datetime import datetime, timezone

import numpy as np
import torch

OUT = pathlib.Path("models")
OUT.mkdir(parents=True, exist_ok=True)
LOG = open(OUT / "log.txt", "w")
REPO = "ibm-granite/granite-timeseries-ttm-r3"
VARIANTS = [("ttm-r3-512-96", 512, 96), ("ttm-r3-512-30", 512, 30), ("ttm-r3-156-16", 156, 16)]


def log(*a):
    msg = " ".join(str(x) for x in a)
    print(msg, flush=True)
    LOG.write(msg + "\n")
    LOG.flush()


class Wrap(torch.nn.Module):
    """past_values [batch, context, 1] (and freq_token [batch] when the model uses it) to forecast [batch, h, 1]."""

    def __init__(self, model, with_token):
        super().__init__()
        self.model = model
        self.with_token = with_token

    def forward(self, past_values, freq_token=None):
        if self.with_token:
            out = self.model(past_values=past_values, freq_token=freq_token)
        else:
            out = self.model(past_values=past_values)
        return out.prediction_outputs


def export(wrap, args, names, path):
    dyn = {n: {0: "batch"} for n in names}
    dyn["forecast"] = {0: "batch"}
    errors = []
    for dynamo in (False, True):
        try:
            kw = dict(input_names=names, output_names=["forecast"], dynamic_axes=dyn, opset_version=17,
                      do_constant_folding=True)
            try:
                torch.onnx.export(wrap, args, str(path), dynamo=dynamo, **kw)
            except TypeError:  # older torch without the dynamo argument
                if dynamo:
                    raise
                torch.onnx.export(wrap, args, str(path), **kw)
            return "dynamo" if dynamo else "torchscript"
        except Exception as e:  # noqa: BLE001
            errors.append(repr(e)[:400])
            log("  export attempt failed (dynamo=%s): %s" % (dynamo, repr(e)[:300]))
    raise RuntimeError(" | ".join(errors))


def main():
    from tsfm_public.toolkit.get_model import get_model

    import onnxruntime as ort

    try:
        from tsfm_public.toolkit.time_series_preprocessor import DEFAULT_FREQUENCY_MAPPING as FREQ
        FREQ = {str(k): int(v) for k, v in dict(FREQ).items()}
    except Exception as e:  # noqa: BLE001
        log("frequency mapping unavailable:", repr(e)[:200])
        FREQ = None

    manifest = {"built": datetime.now(timezone.utc).isoformat(), "repo": REPO, "license": "Apache-2.0",
                "torch": torch.__version__, "onnxruntime": ort.__version__, "freq_tokens": FREQ, "variants": []}
    for name, ctx, h in VARIANTS:
        t0 = time.time()
        try:
            log(f"{name}: loading context {ctx}, horizon {h}")
            model = get_model(REPO, context_length=ctx, prediction_length=h)
            model.eval()
            cfg = model.config
            C = int(cfg.context_length)
            with_token = bool(getattr(cfg, "resolution_prefix_tuning", False))
            wrap = Wrap(model, with_token).eval()
            x = torch.randn(2, C, 1)
            names = ["past_values"]
            args = (x,)
            if with_token:
                names.append("freq_token")
                args = (x, torch.zeros(2, dtype=torch.long))
            path = OUT / f"{name}.onnx"
            how = export(wrap, args, names, path)

            sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
            rng = np.random.RandomState(0)
            t = np.arange(C)
            series = (50 + 10 * np.sin(2 * np.pi * t / 24) + 4 * np.sin(2 * np.pi * t / 168) + 0.02 * t
                      + rng.randn(C)).astype(np.float32)
            feeds = {"past_values": series.reshape(1, C, 1)}
            tok = None
            if with_token:
                tok = int((FREQ or {}).get("h", 0))
                feeds["freq_token"] = np.array([tok], dtype=np.int64)
            y_onnx = sess.run(None, feeds)[0]
            with torch.no_grad():
                targs = [torch.from_numpy(series.reshape(1, C, 1))]
                if with_token:
                    targs.append(torch.tensor([tok], dtype=torch.long))
                y_torch = wrap(*targs).numpy()
            diff = float(np.abs(y_onnx - y_torch).max())
            H = int(y_onnx.shape[1])
            # batch check: two windows in one call must match two single calls
            feeds2 = {"past_values": np.stack([series, series[::-1].copy()]).reshape(2, C, 1)}
            if with_token:
                feeds2["freq_token"] = np.array([tok, tok], dtype=np.int64)
            y2 = sess.run(None, feeds2)[0]
            bdiff = float(np.abs(y2[0] - y_onnx[0]).max())
            # latency, CPU, one window
            n = 20
            t1 = time.perf_counter()
            for _ in range(n):
                sess.run(None, feeds)
            ms = (time.perf_counter() - t1) * 1000 / n
            params = int(sum(p.numel() for p in model.parameters()))
            entry = {"name": name, "file": path.name, "ctx": C, "h": H, "freq_token": with_token,
                     "test_freq_token": tok, "bytes": path.stat().st_size, "params": params, "exporter": how,
                     "max_abs_diff_vs_torch": round(diff, 6), "batch_diff": round(bdiff, 6), "cpu_ms": round(ms, 2)}
            manifest["variants"].append(entry)
            (OUT / f"{name}.ref.json").write_text(json.dumps({
                "name": name, "freq_token": tok,
                "input": [round(float(v), 5) for v in series],
                "output": [round(float(v), 5) for v in y_onnx.reshape(-1)]}))
            log(f"{name}: ok via {how}, ctx {C}, h {H}, {params:,} params, {path.stat().st_size / 1e6:.1f} MB, "
                f"diff {diff:.2e}, batch diff {bdiff:.2e}, {ms:.1f} ms, {time.time() - t0:.0f} s")
        except Exception as e:  # noqa: BLE001
            log(f"{name}: FAILED {repr(e)[:400]}")
            log(traceback.format_exc()[-2000:])
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    log("done,", len(manifest["variants"]), "variants")
    return 0 if manifest["variants"] else 1


if __name__ == "__main__":
    sys.exit(main())
