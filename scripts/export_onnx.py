#!/usr/bin/env python3
"""Export Granite TTM r3 to ONNX so the playground can forecast a visitor's own data in the browser.

The browser runs the same open weights with ONNX Runtime Web. Nothing the visitor uploads leaves
their machine. Six context and horizon pairs cover sub-daily, daily, weekly and monthly data, and
short series. Each model returns its point forecast and its own quantiles.

The decomposed r3 models take a robust median inside their trend filter. The ONNX op library has no
median, so the export swaps in a sort based median that returns exactly the same value (the lower of
the two middle values, as torch.median does). The swap is checked for equality, and every exported
model is checked against the untouched PyTorch model on a test series. That series and its expected
output are saved next to the model so the page can be tested end to end.

Runs in GitHub Actions (see .github/workflows/onnx.yml). A variant that fails is logged and skipped.
"""
import glob
import json
import os
import pathlib
import sys
import time
import traceback
from datetime import datetime, timezone

import numpy as np
import torch
import torch.nn.functional as F

OUT = pathlib.Path("models")
OUT.mkdir(parents=True, exist_ok=True)
LOG = open(OUT / "log.txt", "w")
REPO = "ibm-granite/granite-timeseries-ttm-r3"
# file name, model revision on the Hugging Face repo
VARIANTS = [
    ("ttm-r3-512-96", "512-96-dec-512-r3"),
    ("ttm-r3-180-60", "180-60-dec-180-r3"),
    ("ttm-r3-90-30", "90-30-dec-90-r3"),
    ("ttm-r3-512-30", "512-30-dec-90-r3"),
    ("ttm-r3-156-16", "156-16-dec-52-r3"),
    ("ttm-r3-52-16", "52-16-dec-52-r3"),
]
ONLY = [v for v in os.environ.get("ONLY", "").split(",") if v]
MAX_IR = 10  # ONNX Runtime Web 1.20 reads IR version 10


def log(*a):
    msg = " ".join(str(x) for x in a)
    print(msg, flush=True)
    LOG.write(msg + "\n")
    LOG.flush()


def median_dim1(t):
    """torch.median(t, dim=1, keepdim=True).values without the median op: sort, take the lower middle."""
    T = t.shape[1]
    k = (T - 1) // 2
    return torch.sort(t, dim=1).values[:, k:k + 1, :]


def patch_trend_filter():
    import tsfm_public.models.tinytimemixer.modeling_tinytimemixer as M

    original = M.robust_lowess_like
    gauss_kernel = M._gaussian_kernel

    def robust_lowess_like(x, frac=0.15, iters=2, eps=1e-8, pad_mode="reflect"):
        B, T, C = x.shape
        w = max(5, int(round(frac * T)))
        if w % 2 == 0:
            w += 1
        w = min(w, T if T % 2 == 1 else T - 1)
        k = gauss_kernel(w, device=x.device, dtype=x.dtype)

        def conv(y, weights=None):
            y_bct = y.permute(0, 2, 1).contiguous().reshape(B * C, 1, T)
            if weights is None:
                num = F.conv1d(F.pad(y_bct, (w // 2, w // 2), mode=pad_mode), k)
                den = F.conv1d(F.pad(torch.ones_like(y_bct), (w // 2, w // 2), mode=pad_mode), k)
            else:
                w_bct = weights.permute(0, 2, 1).contiguous().reshape(B * C, 1, T)
                num = F.conv1d(F.pad(y_bct * w_bct, (w // 2, w // 2), mode=pad_mode), k)
                den = F.conv1d(F.pad(w_bct, (w // 2, w // 2), mode=pad_mode), k)
            return (num / (den + eps)).view(B, C, T).permute(0, 2, 1).contiguous()

        trend = conv(x)
        trend = trend - trend.mean(dim=1, keepdim=True) + x.mean(dim=1, keepdim=True)
        for _ in range(iters):
            resid = x - trend
            resid_c = resid - median_dim1(resid)
            mad = median_dim1(torch.abs(resid_c)) + eps
            u = resid_c / (6.0 * mad)
            wts = (1.0 - torch.clamp(u ** 2, 0.0, 1.0)) ** 2
            trend = conv(x, weights=wts)
            trend = trend - trend.mean(dim=1, keepdim=True) + x.mean(dim=1, keepdim=True)
        return trend, x - trend

    # the swap must not change a single value
    g = torch.Generator().manual_seed(1)
    worst = 0.0
    for T in (52, 90, 156, 180, 512, 513):
        x = torch.randn(3, T, 1, generator=g) * 3 + torch.linspace(0, 4, T).view(1, T, 1)
        a, _ = original(x)
        b, _ = robust_lowess_like(x)
        worst = max(worst, float((a - b).abs().max()))
    log(f"trend filter swap: max difference {worst:.3g} over six lengths")
    if worst > 1e-5:
        raise RuntimeError("the sort based median does not match torch.median")
    M.robust_lowess_like = robust_lowess_like
    return original


class Wrap(torch.nn.Module):
    """past_values [batch, context, 1] (and freq_token [batch] when used) to forecast [batch, h, 1] and quantiles [batch, q, h, 1]."""

    def __init__(self, model, with_token, with_q):
        super().__init__()
        self.model = model
        self.with_token = with_token
        self.with_q = with_q

    def forward(self, past_values, freq_token=None):
        kw = {"past_values": past_values, "return_loss": False}
        if self.with_token:
            kw["freq_token"] = freq_token
        out = self.model(**kw)
        if self.with_q:
            return out.prediction_outputs, out.quantile_outputs
        return out.prediction_outputs


def export(wrap, args, names, outs, path):
    errors = []
    batch = torch.export.Dim("batch", min=1, max=512)
    dyn = tuple({0: batch} for _ in names)
    attempts = [("dynamic batch", dict(dynamic_shapes=dyn)), ("fixed batch", {})]
    for label, extra in attempts:
        for f in glob.glob("onnx_export_*.md"):
            os.remove(f)
        try:
            torch.onnx.export(wrap, args, str(path), input_names=names, output_names=outs, opset_version=18,
                              dynamo=True, optimize=True, external_data=False, report=True, **extra)
            return label
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            errors.append(label + ": " + msg[-600:])
            log(f"  export ({label}) failed:")
            log("   ", msg[-3000:].replace("\n", "\n    "))
            for f in glob.glob("onnx_export_*.md"):
                txt = pathlib.Path(f).read_text(errors="replace")
                i = txt.find("## Exception summary")
                log("  report " + f + ":\n    " + txt[i if i >= 0 else 0:][:3000].replace("\n", "\n    "))
    raise RuntimeError(" | ".join(errors))


def fix_ir(path):
    import onnx

    m = onnx.load(str(path))
    before = m.ir_version
    if m.ir_version > MAX_IR:
        m.ir_version = MAX_IR
        onnx.save(m, str(path))
    opsets = {o.domain or "ai.onnx": o.version for o in m.opset_import}
    ops = sorted({n.op_type for n in m.graph.node})
    return before, m.ir_version, opsets, ops


def main():
    from tsfm_public.toolkit.get_model import get_model

    import onnxruntime as ort

    try:
        from tsfm_public.toolkit.time_series_preprocessor import DEFAULT_FREQUENCY_MAPPING as FREQ
        FREQ = {str(k): int(v) for k, v in dict(FREQ).items()}
    except Exception as e:  # noqa: BLE001
        log("frequency mapping unavailable:", repr(e)[:200])
        FREQ = None

    patch_trend_filter()
    manifest = {"built": datetime.now(timezone.utc).isoformat(), "repo": REPO, "license": "Apache-2.0",
                "torch": torch.__version__, "onnxruntime": ort.__version__, "freq_tokens": FREQ, "variants": []}
    for name, rev in VARIANTS:
        if ONLY and name not in ONLY:
            continue
        t0 = time.time()
        try:
            ctx_req, h_req = int(rev.split("-")[0]), int(rev.split("-")[1])
            log(f"{name}: loading {rev}")
            model = get_model(REPO, context_length=ctx_req, prediction_length=h_req, model_revision=rev)
            model.eval()
            cfg = model.config
            C = int(cfg.context_length)
            with_token = bool(getattr(cfg, "resolution_prefix_tuning", False))
            with torch.no_grad():
                probe = model(past_values=torch.randn(2, C, 1), return_loss=False)
            with_q = getattr(probe, "quantile_outputs", None) is not None
            qlev = [float(q) for q in (getattr(cfg, "quantile_levels", None) or [])] if with_q else []
            log(f"  {type(model).__name__}, context {C}, horizon {int(cfg.prediction_length)}, freq token {with_token}, "
                f"quantiles {qlev if with_q else 'none'}")
            wrap = Wrap(model, with_token, with_q).eval()
            names = ["past_values"]
            args = (torch.randn(2, C, 1),)
            if with_token:
                names.append("freq_token")
                args = (args[0], torch.zeros(2, dtype=torch.long))
            outs = ["forecast"] + (["quantiles"] if with_q else [])
            path = OUT / f"{name}.onnx"
            how = export(wrap, args, names, outs, path)
            ir0, ir1, opsets, ops = fix_ir(path)
            log(f"  exported ({how}), IR {ir0} -> {ir1}, opsets {opsets}, {len(ops)} op types")

            so = ort.SessionOptions()
            so.intra_op_num_threads = 1
            sess = ort.InferenceSession(str(path), so, providers=["CPUExecutionProvider"])
            fixed = how == "fixed batch"
            rng = np.random.RandomState(0)
            t = np.arange(C)
            series = (50 + 10 * np.sin(2 * np.pi * t / 24) + 4 * np.sin(2 * np.pi * t / 168) + 0.02 * t
                      + rng.randn(C)).astype(np.float32)
            tok = int((FREQ or {}).get("h", 0)) if with_token else None

            def feeds_for(batch):
                f = {"past_values": np.stack(batch).reshape(len(batch), C, 1).astype(np.float32)}
                if with_token:
                    f["freq_token"] = np.full(len(batch), tok, dtype=np.int64)
                return f

            n_b = 2
            got = sess.run(None, feeds_for([series] * n_b if fixed else [series]))
            y_onnx = got[0][:1]
            q_onnx = got[1][:1] if with_q else None
            with torch.no_grad():
                targs = [torch.from_numpy(series.reshape(1, C, 1))]
                if with_token:
                    targs.append(torch.tensor([tok], dtype=torch.long))
                ref = Wrap(model, with_token, with_q)(*targs)
            y_t = (ref[0] if with_q else ref).numpy()
            diff = float(np.abs(y_onnx - y_t).max())
            qdiff = float(np.abs(q_onnx - ref[1].numpy()).max()) if with_q else None
            H = int(y_onnx.shape[1])
            bdiff = None
            if not fixed:
                y2 = sess.run(None, feeds_for([series, series[::-1].copy(), series * 2]))[0]
                bdiff = float(np.abs(y2[0] - y_onnx[0]).max())
            n = 20
            t1 = time.perf_counter()
            for _ in range(n):
                sess.run(None, feeds_for([series] * (n_b if fixed else 1)))
            ms = (time.perf_counter() - t1) * 1000 / n
            params = int(sum(p.numel() for p in model.parameters()))
            entry = {"name": name, "revision": rev, "file": path.name, "ctx": C, "h": H, "freq_token": with_token,
                     "test_freq_token": tok, "quantiles": qlev, "batch": "fixed 2" if fixed else "dynamic",
                     "bytes": path.stat().st_size, "params": params, "export": how,
                     "max_abs_diff_vs_torch": round(diff, 6),
                     "quantile_diff_vs_torch": None if qdiff is None else round(qdiff, 6),
                     "batch_diff": None if bdiff is None else round(bdiff, 6), "cpu_ms_1_thread": round(ms, 2)}
            manifest["variants"].append(entry)
            refj = {"name": name, "revision": rev, "freq_token": tok,
                    "input": [round(float(v), 5) for v in series],
                    "output": [round(float(v), 5) for v in y_onnx.reshape(-1)]}
            if with_q:
                refj["quantiles"] = [[round(float(v), 5) for v in row] for row in q_onnx[0, :, :, 0]]
            (OUT / f"{name}.ref.json").write_text(json.dumps(refj))
            log(f"{name}: ok, {params:,} params, {path.stat().st_size / 1e6:.2f} MB, diff {diff:.2e}, "
                f"quantile diff {qdiff if qdiff is None else f'{qdiff:.2e}'}, batch diff {bdiff}, {ms:.1f} ms, "
                f"{time.time() - t0:.0f} s")
        except Exception as e:  # noqa: BLE001
            log(f"{name}: FAILED {repr(e)[:600]}")
            log(traceback.format_exc()[-3000:])
    for f in glob.glob("onnx_export_*"):
        try:
            os.remove(f)
        except OSError:
            pass
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    log("done,", len(manifest["variants"]), "variants")
    return 0 if manifest["variants"] else 1


if __name__ == "__main__":
    sys.exit(main())
