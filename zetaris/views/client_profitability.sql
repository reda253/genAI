-- client_profitability: one row per client per month (docs/contracts.md §2).
--
-- Contract notes:
--   * hours_logged counts billable time logs only.
--   * hours_billed counts time logs in that month with a non-null invoice_id.
--   * revenue_invoiced is attributed to the WORK month (the month of the time
--     logs linked to the invoice), not the invoice issue month.
--   * revenue_received is attributed to the payment month.
--
-- The setup script replaces __PG_DATASOURCE__ and __VIEW_CONTAINER__.
CREATE OR REPLACE SCHEMASTORE VIEW client_profitability WITH CONTAINER __VIEW_CONTAINER__ AS
WITH months AS (
    SELECT explode(array(
        to_date('2026-04-01'), to_date('2026-05-01'), to_date('2026-06-01'),
        to_date('2026-07-01'), to_date('2026-08-01'), to_date('2026-09-01')
    )) AS month
),
logged AS (
    SELECT
        client_id,
        to_date(date_trunc('month', `date`)) AS month,
        SUM(hours) AS hours_logged,
        SUM(CASE WHEN invoice_id IS NOT NULL THEN hours ELSE 0 END) AS hours_billed
    FROM __PG_DATASOURCE__.time_logs
    WHERE billable = true
      AND `date` >= to_date('2026-04-01')
      AND `date` < to_date('2026-10-01')
    GROUP BY client_id, to_date(date_trunc('month', `date`))
),
invoice_work_month AS (
    SELECT
        i.invoice_id,
        i.client_id,
        i.amount,
        to_date(date_trunc('month', MIN(tl.`date`))) AS month
    FROM __PG_DATASOURCE__.invoices i
    JOIN __PG_DATASOURCE__.time_logs tl ON tl.invoice_id = i.invoice_id
    GROUP BY i.invoice_id, i.client_id, i.amount
),
invoiced AS (
    SELECT client_id, month, SUM(amount) AS revenue_invoiced
    FROM invoice_work_month
    GROUP BY client_id, month
),
received AS (
    SELECT
        client_id,
        to_date(date_trunc('month', paid_date)) AS month,
        SUM(amount) AS revenue_received
    FROM __PG_DATASOURCE__.invoices
    WHERE paid_date IS NOT NULL
    GROUP BY client_id, to_date(date_trunc('month', paid_date))
)
SELECT
    c.client_id,
    c.name AS client_name,
    m.month,
    CAST(COALESCE(l.hours_logged, 0) AS DECIMAL(10, 2)) AS hours_logged,
    CAST(COALESCE(l.hours_billed, 0) AS DECIMAL(10, 2)) AS hours_billed,
    CAST(COALESCE(l.hours_logged, 0) - COALESCE(l.hours_billed, 0) AS DECIMAL(10, 2)) AS unbilled_hours,
    CAST(
        CASE
            WHEN COALESCE(l.hours_logged, 0) = 0 THEN 0
            ELSE (COALESCE(l.hours_logged, 0) - COALESCE(l.hours_billed, 0)) * 100.0 / l.hours_logged
        END AS DECIMAL(10, 2)
    ) AS unbilled_pct,
    CAST(c.hourly_rate AS DECIMAL(10, 2)) AS hourly_rate,
    CAST(c.market_rate AS DECIMAL(10, 2)) AS market_rate,
    CAST(
        CASE
            WHEN COALESCE(l.hours_logged, 0) = 0 THEN 0
            ELSE COALESCE(iv.revenue_invoiced, 0) / l.hours_logged
        END AS DECIMAL(10, 2)
    ) AS effective_rate,
    CAST(COALESCE(iv.revenue_invoiced, 0) AS DECIMAL(12, 2)) AS revenue_invoiced,
    CAST(COALESCE(rc.revenue_received, 0) AS DECIMAL(12, 2)) AS revenue_received
FROM __PG_DATASOURCE__.clients c
CROSS JOIN months m
LEFT JOIN logged l
    ON l.client_id = c.client_id AND l.month = m.month
LEFT JOIN invoiced iv
    ON iv.client_id = c.client_id AND iv.month = m.month
LEFT JOIN received rc
    ON rc.client_id = c.client_id AND rc.month = m.month;
