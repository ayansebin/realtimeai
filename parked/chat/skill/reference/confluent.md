# Running the models on Confluent Cloud

The models run inside Confluent Cloud for Apache Flink as built-in Flink SQL functions, AI_FORECAST and AI_DETECT_ANOMALIES. There is no model to deploy and no separate ML platform. Switching models is one word: 'ttm', 'flowstate' or 'patchtstfm'.

Status: Early Access on Confluent Cloud on AWS, at no charge during Early Access, for evaluation in development and test environments. Syntax can change. Request access at https://events.confluent.io/early-access-flink-features

## Steps

1. Sign up at https://www.confluent.io/get-started/ (new accounts get free credits for their first 30 days) and request Early Access.
2. In the Cloud Console, open SQL workspaces, create one, and pick AWS and the enabled region. A compute pool is set up for you.
3. Set the catalog to examples and the database to marketplace, and run `SELECT * FROM orders;` to watch sample orders stream in.
4. Forecast revenue every 10 seconds, the next 10 windows. Forecasts start once about 50 windows have arrived.

```sql
SELECT window_time, revenue,
  AI_FORECAST(revenue, window_time,
    JSON_OBJECT('model' VALUE 'ttm', 'horizon' VALUE 10))
  OVER (ORDER BY window_time
        RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS forecast
FROM (
  SELECT window_time, CAST(SUM(price) AS DOUBLE) AS revenue
  FROM TABLE(TUMBLE(TABLE orders, DESCRIPTOR($rowtime), INTERVAL '10' SECOND))
  GROUP BY window_start, window_end, window_time
);
```

5. Flag every window outside the 95% range:

```sql
SELECT window_time, revenue,
  AI_DETECT_ANOMALIES(revenue, window_time,
    JSON_OBJECT('model' VALUE 'ttm', 'confidencePercentage' VALUE 95.0))
  OVER (ORDER BY window_time
        RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS anomaly
FROM (
  SELECT window_time, CAST(SUM(price) AS DOUBLE) AS revenue
  FROM TABLE(TUMBLE(TABLE orders, DESCRIPTOR($rowtime), INTERVAL '10' SECOND))
  GROUP BY window_start, window_end, window_time
);
```

6. On your own topic, writing the result to a new table:

```sql
CREATE TABLE my_forecast AS
SELECT $rowtime AS ts, my_value,
  AI_FORECAST(CAST(my_value AS DOUBLE), $rowtime,
    JSON_OBJECT('model' VALUE 'ttm', 'horizon' VALUE 12))
  OVER (ORDER BY $rowtime
        RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS forecast
FROM my_topic;
```

AI_FORECAST returns a row holding a forecast array of (timestamp, mean, q10, q50, q90) plus metadata. Options include model, horizon, minContextSize and maxContextSize. AI_DETECT_ANOMALIES returns fields including is_anomaly, actual_value, forecast_value, lower_bound, upper_bound and timestamp, with the option confidencePercentage.

Docs: https://docs.confluent.io/cloud/current/ai/builtin-functions/forecast.html and https://docs.confluent.io/cloud/current/ai/builtin-functions/detect-anomalies.html
