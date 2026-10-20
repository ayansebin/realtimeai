# The IBM Granite Time Series models

All four are open weights on Hugging Face under ibm-granite. They are pretrained across many domains, so they forecast without training on the person's data, and they can also be fine-tuned. TTM r3, FlowState r1.1 and TSPulse r1 are under Apache 2.0, and PatchTST-FM r2 is under OpenMDW 1.0 or Apache 2.0. The library is granite-tsfm on GitHub. Figures marked (site) come from IBM and Confluent materials, as quoted on realtimeintelligence.io.

| Model | Size | History read | Best for |
|---|---|---|---|
| TTM r3 (Tiny Time Mixers) | 1M to 35M parameters (site) | 52 to 2,048 points | Millions of series, millisecond latency on CPU, control variables like price. About 180 forecasts a second on CPU, 800 with Lite (site). NeurIPS 2024. |
| FlowState r1.1 | 18.5M (site) | up to about 4,000 | One model for any sampling rate, from seconds to months. Quantile forecasts, horizon set by the data. ICML 2026. |
| PatchTST-FM r2 | 385M (site) | up to 8,192 | The whole distribution as 99 quantiles. Long complex history, risk and limits. Top commercial-friendly zero-shot model on GIFT-Eval in August 2026 (site). |
| TSPulse r1 | 1M (site) | 512 to about 2,000 | Anomaly scores, labels, embeddings for search by shape, filled gaps. First on TSB-AD for univariate and multivariate anomaly detection (site). ICLR 2026. |

This skill runs TTM r3 only. The other three run on Confluent Cloud and with granite-tsfm.
