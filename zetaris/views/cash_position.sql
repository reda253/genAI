-- cash_position: one row per day in the data window (docs/contracts.md §2).
--
-- Contract notes:
--   * inflow / outflow are non-negative; net = inflow - outflow.
--   * balance is the end-of-day running balance.
--   * The 2026-03-31 opening-balance row is included in the running balance
--     but excluded from the rows returned here.
--   * Days with no bank transaction still produce a row (carried balance).
--
-- The setup script replaces __PG_DATASOURCE__ and __VIEW_CONTAINER__.
CREATE OR REPLACE SCHEMASTORE VIEW cash_position WITH CONTAINER __VIEW_CONTAINER__ AS
WITH days AS (
    SELECT explode(sequence(
        to_date('2026-04-01'),
        to_date('2026-09-30'),
        interval 1 day
    )) AS `date`
),
daily AS (
    SELECT
        `date`,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS inflow,
        SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS outflow,
        SUM(amount) AS net
    FROM __PG_DATASOURCE__.bank_transactions
    WHERE `date` >= to_date('2026-04-01')
      AND `date` <= to_date('2026-09-30')
    GROUP BY `date`
),
opening AS (
    SELECT COALESCE(SUM(amount), 0) AS opening_balance
    FROM __PG_DATASOURCE__.bank_transactions
    WHERE `date` < to_date('2026-04-01')
),
running AS (
    SELECT
        d.`date`,
        COALESCE(dl.inflow, 0) AS inflow,
        COALESCE(dl.outflow, 0) AS outflow,
        COALESCE(dl.net, 0) AS net
    FROM days d
    LEFT JOIN daily dl ON dl.`date` = d.`date`
)
SELECT
    r.`date`,
    CAST(r.inflow AS DECIMAL(12, 2)) AS inflow,
    CAST(r.outflow AS DECIMAL(12, 2)) AS outflow,
    CAST(r.net AS DECIMAL(12, 2)) AS net,
    CAST(
        o.opening_balance
        + SUM(r.net) OVER (ORDER BY r.`date` ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
        AS DECIMAL(12, 2)
    ) AS balance
FROM running r
CROSS JOIN opening o;
