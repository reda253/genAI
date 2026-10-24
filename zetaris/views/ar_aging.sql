-- ar_aging: one row per invoice (docs/contracts.md §2).
--
-- Contract notes:
--   * days_late is measured against paid_date, or against the fixed demo date
--     2026-10-01 while the invoice is unpaid; 0 means on time.
--   * bucket is on_time | 1-30 | 31-60 | 61-90 | 90+.
--
-- The setup script replaces __PG_DATASOURCE__ and __VIEW_CONTAINER__.
CREATE OR REPLACE SCHEMASTORE VIEW ar_aging WITH CONTAINER __VIEW_CONTAINER__ AS
WITH aged AS (
    SELECT
        i.invoice_id,
        i.client_id,
        c.name AS client_name,
        i.amount,
        i.issue_date,
        i.due_date,
        i.paid_date,
        GREATEST(
            0,
            datediff(
                COALESCE(i.paid_date, to_date('2026-10-01')),
                i.due_date
            )
        ) AS days_late,
        i.status
    FROM __PG_DATASOURCE__.invoices i
    JOIN __PG_DATASOURCE__.clients c ON c.client_id = i.client_id
)
SELECT
    invoice_id,
    client_id,
    client_name,
    CAST(amount AS DECIMAL(12, 2)) AS amount,
    issue_date,
    due_date,
    paid_date,
    CAST(days_late AS INT) AS days_late,
    CASE
        WHEN days_late = 0 THEN 'on_time'
        WHEN days_late <= 30 THEN '1-30'
        WHEN days_late <= 60 THEN '31-60'
        WHEN days_late <= 90 THEN '61-90'
        ELSE '90+'
    END AS bucket,
    status
FROM aged;
