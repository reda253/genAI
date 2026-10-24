-- subscription_usage: one row per subscription (docs/contracts.md §2).
--
-- Contract notes:
--   * monthly_cost is the current list price; the bank history carries the
--     actual charges, so first/last come from bank_transactions.
--   * days_since_login is measured against the fixed demo date 2026-10-01.
--   * max_charges_in_a_month > 1 is the duplicate-charge signal (Figma).
--
-- The setup script replaces __PG_DATASOURCE__ and __VIEW_CONTAINER__.
CREATE OR REPLACE SCHEMASTORE VIEW subscription_usage WITH CONTAINER __VIEW_CONTAINER__ AS
WITH charges AS (
    SELECT
        subscription_id,
        `date`,
        -amount AS charged_amount
    FROM __PG_DATASOURCE__.bank_transactions
    WHERE category = 'subscription'
      AND subscription_id IS NOT NULL
),
ordered AS (
    SELECT
        subscription_id,
        charged_amount,
        ROW_NUMBER() OVER (PARTITION BY subscription_id ORDER BY `date` ASC) AS rn_first,
        ROW_NUMBER() OVER (PARTITION BY subscription_id ORDER BY `date` DESC) AS rn_last
    FROM charges
),
first_last AS (
    SELECT
        subscription_id,
        MAX(CASE WHEN rn_first = 1 THEN charged_amount END) AS first_charge_amount,
        MAX(CASE WHEN rn_last = 1 THEN charged_amount END) AS last_charge_amount
    FROM ordered
    GROUP BY subscription_id
),
monthly AS (
    SELECT
        subscription_id,
        to_date(date_trunc('month', `date`)) AS month,
        COUNT(*) AS charges_in_month
    FROM charges
    GROUP BY subscription_id, to_date(date_trunc('month', `date`))
),
max_monthly AS (
    SELECT
        subscription_id,
        MAX(charges_in_month) AS max_charges_in_a_month
    FROM monthly
    GROUP BY subscription_id
),
totals AS (
    SELECT
        subscription_id,
        SUM(charged_amount) AS total_charged
    FROM charges
    GROUP BY subscription_id
)
SELECT
    s.subscription_id,
    s.vendor,
    s.plan,
    CAST(s.monthly_cost AS DECIMAL(10, 2)) AS monthly_cost,
    CAST(COALESCE(fl.first_charge_amount, s.monthly_cost) AS DECIMAL(10, 2)) AS first_charge_amount,
    CAST(COALESCE(fl.last_charge_amount, s.monthly_cost) AS DECIMAL(10, 2)) AS last_charge_amount,
    CAST(
        CASE
            WHEN COALESCE(fl.first_charge_amount, 0) = 0 THEN 0
            ELSE (fl.last_charge_amount - fl.first_charge_amount) * 100.0 / fl.first_charge_amount
        END AS DECIMAL(10, 2)
    ) AS price_change_pct,
    s.last_login_date,
    CAST(
        CASE
            WHEN s.last_login_date IS NULL THEN NULL
            ELSE datediff(to_date('2026-10-01'), s.last_login_date)
        END AS INT
    ) AS days_since_login,
    CAST(COALESCE(mm.max_charges_in_a_month, 0) AS INT) AS max_charges_in_a_month,
    CAST(COALESCE(t.total_charged, 0) AS DECIMAL(12, 2)) AS total_charged
FROM __PG_DATASOURCE__.subscriptions s
LEFT JOIN first_last fl ON fl.subscription_id = s.subscription_id
LEFT JOIN max_monthly mm ON mm.subscription_id = s.subscription_id
LEFT JOIN totals t ON t.subscription_id = s.subscription_id;
