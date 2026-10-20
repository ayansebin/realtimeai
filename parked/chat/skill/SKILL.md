---
name: granite-time-series
description: Forecast and find anomalies in a time series (CSV, Excel or JSON) with IBM Granite TTM r3, run right here, then show how to run the same models on Confluent Cloud with Flink SQL.
---

# IBM Granite Time Series models

Use this skill when someone shares time series data or asks to forecast it, find anomalies in it, or try IBM Granite Time Series models (TTM, FlowState, PatchTST-FM, TSPulse), including on Confluent Cloud.

It runs **TTM r3** locally with ONNX Runtime. The model is pretrained, so there is no training step: point it at a series and it forecasts. Nothing leaves this environment.

## Steps

1. **Set up once.** Check `python -c "import onnxruntime, pandas, matplotlib"`. If anything is missing, run `pip install onnxruntime pandas matplotlib openpyxl`.
2. **Read the file.** Run `python scripts/ttm.py inspect <file>`. It finds the time column and the number column, works out how often the data is recorded, and fills gaps. If the file has several number columns or a series column (store, SKU, plant, customer), pick the one the person means, or ask when it is not obvious. Pass `--value COLUMN`, `--time COLUMN`, `--series COLUMN=VALUE`, or `--every 15min` when there is no time column.
3. **Forecast.** Run `python scripts/ttm.py forecast <file> [options] --out <dir>`. It writes `forecast.png` and `forecast.csv` (q10, q50, q90 per step) and prints a JSON summary. Show the chart to the person and attach the CSV.
4. **Find anomalies** when asked, or as the natural next step: `python scripts/ttm.py anomalies <file> [options] --out <dir>`. Each point gets a score from 0 to 1 for how far it falls outside TTM r3's own forecast range. Windows above the threshold (default 0.8, change with `--threshold`) are flagged. Show `anomalies.png` and list the flagged windows with times and values.
5. **Offer Confluent.** If they want to run this on live data, give the Flink SQL in `reference/confluent.md`, adapted to their topic and column.

## How to explain the results

- **Lead with the answer** in two to four plain sentences, then one notable thing (the peak, a miss, a flagged window) and one next step.
- **Explain the backtest.** The accuracy numbers come from backtests: at several earlier start points the model saw only the history before that point, and its forecast was checked against what really happened.
  - "average error" is WAPE, the share of total volume it missed.
  - "vs simple guess" compares it with repeating the last cycle (seasonal naive). Better is good, and worse happens on some series, so say so plainly.
  - "in range" is how often the real value landed inside the 10 to 90 band. About 80% means the range is well calibrated.
- **Only quote numbers** from the script output or from `reference/models.md`. Do not invent benchmarks, customers or prices.
- **Say what was assumed.** Mention gaps filled, a guessed step, or a cut to the last 20,000 points.
- **Model sizes.** The script uses the TTM r3 size that fits the data's frequency and length: 1024, 512, 156, 90 or 52 points of history. The 1024 point model downloads once from GitHub. If that download is blocked, it falls back to the 512 point model.
- **Writing style.** Call the family "IBM Granite Time Series models", and use no em dashes or semicolons.

## What else to know

`reference/models.md` has the four models and when each fits. `reference/confluent.md` has the steps and SQL for Confluent Cloud, where the models run as built-in Flink SQL functions in Early Access. More, including a playground and a chat, is at https://realtimeintelligence.io.
