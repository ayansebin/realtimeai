#!/usr/bin/env python3
"""Forecast and score anomalies on a time series with IBM Granite TTM r3, run locally with ONNX Runtime.

    python ttm.py inspect  data.csv                      columns, frequency, length
    python ttm.py forecast data.csv [--time C] [--value C] [--series COL=VAL] [--horizon N] [--out DIR]
    python ttm.py anomalies data.csv [same options] [--threshold 0.8]

Writes a PNG chart and a JSON summary to --out (default ./ttm_out) and prints the summary.
The models are TTM r3 exported to ONNX from ibm-granite/granite-timeseries-ttm-r3 (Apache 2.0), weights in half precision.
"""
import argparse, json, math, os, sys
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, '..', 'models')
SEC = {'min': 60, '2min': 120, '5min': 300, '10min': 600, '15min': 900, '30min': 1800, 'h': 3600, '2h': 7200, '3h': 10800,
       '6h': 21600, '12h': 43200, 'D': 86400, 'W': 604800, 'MS': 2629746, 'QS': 7889238, 'YS': 31556952}
LABEL = {'min': 'every minute', '2min': 'every 2 minutes', '5min': 'every 5 minutes', '10min': 'every 10 minutes', '15min': 'every 15 minutes',
         '30min': 'every 30 minutes', 'h': 'hourly', '2h': 'every 2 hours', '3h': 'every 3 hours', '6h': 'every 6 hours', '12h': 'every 12 hours',
         'D': 'daily', 'W': 'weekly', 'MS': 'monthly', 'QS': 'quarterly', 'YS': 'yearly'}
PANDAS = {'min': 'min', '2min': '2min', '5min': '5min', '10min': '10min', '15min': '15min', '30min': '30min', 'h': 'h', '2h': '2h', '3h': '3h',
          '6h': '6h', '12h': '12h', 'D': 'D', 'W': 'W', 'MS': 'MS', 'QS': 'QS', 'YS': 'YS'}
SEASON = {'min': 60, '2min': 30, '5min': 288, '10min': 144, '15min': 96, '30min': 48, 'h': 24, '2h': 12, '3h': 8, '6h': 4, '12h': 2,
          'D': 7, 'W': 52, 'MS': 12, 'QS': 4, 'YS': 1}
MAXN, MINN = 20000, 68


def fail(msg):
    print(json.dumps({'ok': False, 'error': msg}))
    sys.exit(1)


# ---------- reading the data ----------
def read_table(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in ('.xlsx', '.xlsm', '.xls', '.ods'):
        return pd.read_excel(path)
    if ext == '.json':
        try:
            return pd.read_json(path)
        except ValueError:
            with open(path) as f:
                j = json.load(f)
            for k in ('data', 'values', 'series', 'rows', 'records', 'items', 'observations', 'result'):
                if isinstance(j, dict) and k in j:
                    return pd.DataFrame(j[k])
            return pd.DataFrame(j)
    return pd.read_csv(path, sep=None, engine='python')


def numeric(s):
    if pd.api.types.is_numeric_dtype(s):
        return pd.to_numeric(s, errors='coerce')
    t = s.astype(str).str.strip().str.replace(r'^[$€£¥]|[$€£¥%]$', '', regex=True).str.replace(r'\s', '', regex=True)
    a = pd.to_numeric(t.str.replace(',', '', regex=False), errors='coerce')
    b = pd.to_numeric(t.str.replace('.', '', regex=False).str.replace(',', '.', regex=False), errors='coerce')
    return b if b.notna().sum() > a.notna().sum() else a


def timeish(s):
    if pd.api.types.is_datetime64_any_dtype(s):
        return s
    if pd.api.types.is_numeric_dtype(s):
        v = pd.to_numeric(s, errors='coerce')
        if v.between(1e12, 4e12).mean() > 0.9:
            return pd.to_datetime(v, unit='ms', errors='coerce')
        if v.between(1e9, 4e9).mean() > 0.9:
            return pd.to_datetime(v, unit='s', errors='coerce')
        return pd.Series(pd.NaT, index=s.index)
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        return pd.to_datetime(s, errors='coerce', format='mixed')


def pick_columns(df, time=None, value=None):
    cols = list(df.columns)
    if time is not None and time not in cols:
        fail('No column called %s. Columns: %s' % (time, ', '.join(map(str, cols))))
    if value is not None and value not in cols:
        fail('No column called %s. Columns: %s' % (value, ', '.join(map(str, cols))))
    if time is None:
        best = (0, None)
        for c in cols:
            ok = timeish(df[c]).notna().mean()
            name_hint = 0.1 if any(w in str(c).lower() for w in ('time', 'date', 'ts', 'stamp', 'period', 'day', 'month', 'week', 'hour', 'year')) else 0
            if ok >= 0.8 and ok + name_hint > best[0]:
                best = (ok + name_hint, c)
        time = best[1]
    nums = [c for c in cols if c != time and numeric(df[c]).notna().mean() >= 0.8 and numeric(df[c]).nunique() > 1]
    if value is None:
        plain = [c for c in nums if not any(w in str(c).lower() for w in ('id', 'code', 'zip', 'index', 'year'))]
        value = (plain or nums or [None])[0]
    if value is None:
        fail('No column with numbers found.')
    cats = [c for c in cols if c not in (time, value) and c not in nums and 2 <= df[c].nunique() <= 2000]
    return time, value, nums, cats


def snap(seconds):
    D = 86400
    if 27 * D <= seconds <= 32 * D: return 'MS'
    if 88 * D <= seconds <= 93 * D: return 'QS'
    if 360 * D <= seconds <= 367 * D: return 'YS'
    keys = ['min', '2min', '5min', '10min', '15min', '30min', 'h', '2h', '3h', '6h', '12h', 'D', 'W']
    return min(keys, key=lambda k: abs(math.log(seconds / SEC[k])))


def load_series(path, time=None, value=None, series=None, every=None):
    df = read_table(path)
    if df.empty:
        fail('The file is empty.')
    time, value, nums, cats = pick_columns(df, time, value)
    if series:
        col, _, want = series.partition('=')
        if col not in df.columns:
            fail('No series column called %s.' % col)
        df = df[df[col].astype(str).str.strip() == want.strip()]
        if df.empty:
            fail('No rows where %s is %s.' % (col, want))
    y = numeric(df[value])
    info = {'value_column': str(value), 'other_number_columns': [str(c) for c in nums if c != value][:12],
            'time_column': str(time) if time is not None else None, 'series_columns': [str(c) for c in cats][:6]}
    if time is None:
        v = y.dropna().to_numpy(float)[-MAXN:]
        f = every or 'h'
        return v, pd.date_range('2026-01-01', periods=len(v), freq=PANDAS[f]), f, info | {'note': 'No time column, rows taken in order, %s assumed.' % LABEL[f]}
    t = timeish(df[time])
    s = pd.Series(y.to_numpy(), index=t).dropna()
    s = s[s.index.notna()].sort_index()
    s = s.groupby(level=0).mean()
    if len(s) < 2:
        fail('Fewer than two usable rows.')
    f = every or snap(float(np.median(np.diff(s.index.values).astype('timedelta64[s]').astype(float))))
    if f == 'D' and len(s) >= 10 and not (s.index.dayofweek >= 5).any():
        f = 'B'
    rule = PANDAS.get(f, 'B' if f == 'B' else 'h')
    g = s.resample(rule).mean()
    gaps = int(g.isna().sum())
    g = g.interpolate(limit_direction='both')
    if len(g) > MAXN:
        g = g.iloc[-MAXN:]
        info['note'] = 'Only the last %d points are used.' % MAXN
    info['gaps_filled'] = gaps
    return g.to_numpy(float), g.index, f, info


# ---------- the model ----------
def manifest():
    with open(os.path.join(MODELS, 'manifest.json')) as fh:
        return json.load(fh)


def ladder(freq):
    s = SEC.get(freq, 86400)
    if s < 86400: return ['ttm-r3-1024-96', 'ttm-r3-512-96', 'ttm-r3-90-30', 'ttm-r3-52-16']
    if s <= 86400: return ['ttm-r3-512-30', 'ttm-r3-90-30', 'ttm-r3-52-16']
    return ['ttm-r3-156-16', 'ttm-r3-52-16']


def pick_variant(freq, n):
    vs = {v['name']: v for v in manifest()['variants']}
    lad = [vs[k] for k in ladder('D' if freq == 'B' else freq) if k in vs]
    for rule in (3, 1):
        for v in lad:
            if n >= v['ctx'] + rule * v['h'] and available(v): return v
    return None


def available(v):
    """Bundled models are always there. The larger one is downloaded from GitHub once, and skipped if that fails."""
    path = os.path.join(MODELS, v['file'])
    if os.path.exists(path) and os.path.getsize(path) == v['bytes']:
        return True
    if not v.get('url'):
        return False
    alt = os.path.join(os.path.expanduser('~'), '.cache', 'granite-ttm', v['file'])
    if os.path.exists(alt) and os.path.getsize(alt) == v['bytes']:
        v['file'] = alt; return True
    try:
        import urllib.request
        os.makedirs(os.path.dirname(alt), exist_ok=True)
        urllib.request.urlretrieve(v['url'], alt + '.part')
        if os.path.getsize(alt + '.part') != v['bytes']:
            return False
        os.replace(alt + '.part', alt); v['file'] = alt
        return True
    except Exception:
        return False


_SESS = {}
def run(v, windows):
    import onnxruntime as ort
    if v['name'] not in _SESS:
        o = ort.SessionOptions(); o.intra_op_num_threads = 2
        _SESS[v['name']] = ort.InferenceSession(os.path.join(MODELS, v['file']), o, providers=['CPUExecutionProvider'])
    s = _SESS[v['name']]
    pts, qs = [], []
    for i in range(0, len(windows), 64):
        x = np.stack(windows[i:i + 64]).astype(np.float32)[:, :, None]
        out = s.run(None, {'past_values': x})
        pts.append(out[0][..., 0]); qs.append(out[1][..., 0])
    return np.concatenate(pts), np.concatenate(qs)


def qidx(v):
    lv = v['quantiles']
    return [min(range(len(lv)), key=lambda i: abs(lv[i] - q)) for q in (0.1, 0.5, 0.9)]


def season_of(freq, C):
    m = SEASON.get('D' if freq == 'B' else freq, 1)
    return 5 if freq == 'B' else (m if m < C * 0.8 else 1)


# ---------- forecast with backtests ----------
def forecast(y, idx, freq, horizon=None):
    n = len(y)
    v = pick_variant(freq, n)
    if v is None or n < MINN:
        fail('Needs at least %d points for TTM r3, this series has %d.' % (MINN, n))
    C, h = v['ctx'], v['h']
    K = max(1, min(8, (n - h - C) // h + 1))
    origins = [n - h] if K == 1 else [int(round(C + (n - h - C) * k / (K - 1))) for k in range(K)]
    origins.append(n)
    pt, q = run(v, [y[o - C:o] for o in origins])
    if np.min(y) >= 0:
        q = np.maximum(q, 0)
    lo_i, mid_i, hi_i = qidx(v)
    m = season_of(freq, C)
    rows = []
    for k, o in enumerate(origins[:-1]):
        act = y[o:o + h]
        med = q[k, mid_i, :len(act)]
        nv = np.array([y[o - m + (j % m)] for j in range(len(act))])
        scale = np.mean(np.abs(y[o - C + m:o] - y[o - C:o - m])) if C > m else np.mean(np.abs(np.diff(y[o - C:o])))
        scale = scale or 1.0
        ae, aen = np.abs(act - med), np.abs(act - nv)
        rows.append({'wape': ae.sum() / max(1e-9, np.abs(act).sum()), 'mase': ae.mean() / scale, 'mase_naive': aen.mean() / scale,
                     'cov': float(np.mean((act >= q[k, lo_i, :len(act)]) & (act <= q[k, hi_i, :len(act)])))})
    if np.min(y) >= 0:
        q = np.maximum(q, 0)
    hz = min(horizon or h, h)
    fut = {'q10': q[-1, lo_i, :hz], 'q50': q[-1, mid_i, :hz], 'q90': q[-1, hi_i, :hz]}
    step = pd.tseries.frequencies.to_offset('B' if freq == 'B' else PANDAS[freq])
    times = pd.date_range(idx[-1], periods=hz + 1, freq=step)[1:]
    res = {'model': 'TTM r3 (%s, reads %d points, forecasts %d ahead)' % (v['name'], C, h), 'every': LABEL.get(freq, 'every trading day'),
           'points': n, 'from': str(idx[0]), 'to': str(idx[-1]), 'horizon_steps': hz,
           'forecast_from': str(times[0]), 'forecast_to': str(times[-1])}
    if rows:
        a = {k: float(np.mean([r[k] for r in rows])) for k in rows[0]}
        gain = 1 - a['mase'] / a['mase_naive'] if a['mase_naive'] else float('nan')
        res['backtest'] = {'tests': len(rows), 'average_error_pct': round(100 * a['wape'], 1), 'mase': round(a['mase'], 3),
                           'vs_simple_guess': ('%d%% better' % round(100 * gain)) if gain >= 0 else ('%d%% worse' % round(-100 * gain)),
                           'simple_guess': 'repeats the last cycle of %d steps' % m if m > 1 else 'repeats the last value',
                           'in_range_pct': round(100 * a['cov'])}
    pick = sorted(set(np.linspace(0, hz - 1, min(8, hz)).round().astype(int)))
    res['forecast_sample'] = [{'time': str(times[j]), 'q10': sig(fut['q10'][j]), 'q50': sig(fut['q50'][j]), 'q90': sig(fut['q90'][j])} for j in pick]
    jx, jn = int(np.argmax(fut['q50'])), int(np.argmin(fut['q50']))
    res['forecast_high'] = {'time': str(times[jx]), 'q50': sig(fut['q50'][jx])}
    res['forecast_low'] = {'time': str(times[jn]), 'q50': sig(fut['q50'][jn])}
    return res, v, times, fut


def sig(x, n=4):
    return float('%.*g' % (n, float(x)))


# ---------- anomaly scores from the model's own range ----------
def anomalies(y, freq, threshold=0.8):
    n = len(y)
    v = pick_variant(freq, n)
    if v is None or n < v['ctx'] + 16:
        fail('Too short to score, needs at least %d points.' % ((v['ctx'] if v else 52) + 16))
    C, h = v['ctx'], v['h']
    stride = max(1, min(h, math.ceil((n - C) / 400)))
    os_ = list(range(C, n, stride))
    _, q = run(v, [y[o - C:o] for o in os_])
    lo_i, mid_i, hi_i = qidx(v)
    fl = max(1e-9, float(np.median(np.abs(np.diff(y)))) * 0.75)
    BK = max(1, math.ceil(stride / 8))
    miss = {}
    for k, o in enumerate(os_):
        for j in range(min(stride, n - o)):
            miss.setdefault(j // BK, []).append(y[o + j] - q[k, mid_i, j])
    spread = {b: (np.quantile(np.abs(np.array(e) - np.median(e)), 0.9) / 1.645 if len(e) >= 6 else 0) for b, e in miss.items()}
    z = np.full(n, np.nan)
    for k, o in enumerate(os_):
        for j in range(min(stride, n - o)):
            w = (q[k, hi_i, j] - q[k, lo_i, j]) / 2.563
            z[o + j] = abs(y[o + j] - q[k, mid_i, j]) / max(fl, w, spread.get(j // BK, 0))
    cal = min(4.0, max(1.0, float(np.nanmedian(z)) / 0.6745))
    score = np.where(np.isfinite(z), 1 / (1 + np.exp(-2 * (z / cal - 3))), 0.0)
    wins, a = [], None
    for i in range(n + 1):
        on = i < n and score[i] >= threshold
        if on and a is None: a, peak = i, 0
        if on: peak = max(peak, score[i])
        if not on and a is not None:
            wins.append([a, i, peak]); a = None
    merged = []
    for w in wins:
        if merged and w[0] - merged[-1][1] < 12:
            merged[-1][1] = w[1]; merged[-1][2] = max(merged[-1][2], w[2])
        else:
            merged.append(w)
    return score, merged, v


# ---------- charts ----------
def chart_forecast(path, y, idx, times, fut, title, unit, res):
    import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
    tail = min(len(y), max(3 * len(times), 120))
    fig, ax = plt.subplots(figsize=(11, 4.2), dpi=140)
    ax.plot(idx[-tail:], y[-tail:], color='#161616', lw=1.2, label='history')
    ax.fill_between(times, fut['q10'], fut['q90'], color='#78a9ff', alpha=0.3, lw=0, label='likely range (q10 to q90)')
    ax.plot(times, fut['q50'], color='#0f62fe', lw=2, label='TTM r3 forecast')
    ax.axvline(idx[-1], color='#8d8d8d', ls=':', lw=1)
    b = res.get('backtest')
    ax.set_title(title + (('   ·   %s%% average error, %s than the simple guess, in backtests' % (b['average_error_pct'], b['vs_simple_guess'])) if b else ''), loc='left', fontsize=11)
    ax.set_ylabel(unit); ax.grid(alpha=0.2); ax.legend(loc='upper left', fontsize=8, frameon=False)
    for s in ('top', 'right'): ax.spines[s].set_visible(False)
    fig.tight_layout(); fig.savefig(path); plt.close(fig)


def chart_anomalies(path, y, idx, score, wins, thr, title, unit):
    import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(11, 4.8), dpi=140, sharex=True, gridspec_kw={'height_ratios': [3, 1]})
    a1.plot(idx, y, color='#161616', lw=0.8)
    for a, b, _ in wins:
        for ax in (a1, a2): ax.axvspan(idx[a], idx[min(b, len(idx) - 1)], color='#fa4d56', alpha=0.2, lw=0)
    a2.fill_between(idx, 0, score, color='#ff832b', alpha=0.5, lw=0); a2.axhline(thr, color='#da1e28', ls='--', lw=1)
    a2.set_ylim(0, 1); a2.set_ylabel('score')
    a1.set_title('%s   ·   %d flagged window%s at threshold %.2f' % (title, len(wins), '' if len(wins) == 1 else 's', thr), loc='left', fontsize=11)
    a1.set_ylabel(unit)
    for ax in (a1, a2):
        ax.grid(alpha=0.2)
        for s in ('top', 'right'): ax.spines[s].set_visible(False)
    fig.tight_layout(); fig.savefig(path); plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['inspect', 'forecast', 'anomalies'])
    ap.add_argument('file')
    ap.add_argument('--time'); ap.add_argument('--value'); ap.add_argument('--series', help='COLUMN=VALUE to keep one series')
    ap.add_argument('--every', choices=list(SEC.keys()) + ['B'], help='the step, when there is no time column or to override')
    ap.add_argument('--horizon', type=int); ap.add_argument('--threshold', type=float, default=0.8)
    ap.add_argument('--out', default='ttm_out')
    a = ap.parse_args()
    y, idx, freq, info = load_series(a.file, a.time, a.value, a.series, a.every)
    os.makedirs(a.out, exist_ok=True)
    name = os.path.splitext(os.path.basename(a.file))[0].replace('_', ' ').replace('-', ' ').strip().capitalize()
    title = '%s, %s' % (name, info['value_column'])
    base = {'ok': True, 'file': os.path.basename(a.file), **info, 'every': LABEL.get(freq, 'every trading day'), 'points': len(y),
            'from': str(idx[0]), 'to': str(idx[-1]), 'min': sig(np.min(y)), 'mean': sig(np.mean(y)), 'max': sig(np.max(y)), 'last': sig(y[-1])}
    if a.cmd == 'inspect':
        print(json.dumps(base, indent=1)); return
    if a.cmd == 'forecast':
        res, v, times, fut = forecast(y, idx, freq, a.horizon)
        png = os.path.join(a.out, 'forecast.png')
        chart_forecast(png, y, idx, times, fut, title, info['value_column'], res)
        pd.DataFrame({'time': times, 'q10': fut['q10'], 'q50': fut['q50'], 'q90': fut['q90']}).to_csv(os.path.join(a.out, 'forecast.csv'), index=False)
        out = base | res | {'chart': png, 'csv': os.path.join(a.out, 'forecast.csv')}
    else:
        score, wins, v = anomalies(y, freq, a.threshold)
        png = os.path.join(a.out, 'anomalies.png')
        chart_anomalies(png, y, idx, score, wins, a.threshold, title, info['value_column'])
        pd.DataFrame({'time': idx, 'value': y, 'score': score}).to_csv(os.path.join(a.out, 'anomaly_scores.csv'), index=False)
        top = sorted(wins, key=lambda w: -w[2])[:10]
        out = base | {'model': 'TTM r3 (%s), score = distance outside its own forecast range' % v['name'], 'threshold': a.threshold,
                      'flagged_windows': len(wins),
                      'windows': [{'from': str(idx[w[0]]), 'to': str(idx[max(w[0], w[1] - 1)]), 'peak_score': round(float(w[2]), 2),
                                   'value_at_peak': sig(y[w[0] + int(np.argmax(score[w[0]:w[1]]))])} for w in sorted(top)],
                      'chart': png, 'csv': os.path.join(a.out, 'anomaly_scores.csv')}
    print(json.dumps(out, indent=1, default=str))


if __name__ == '__main__':
    main()
