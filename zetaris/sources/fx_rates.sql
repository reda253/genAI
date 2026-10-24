-- Public FX source: EUR -> MAD reference rate for the demo date (display only).
--
-- The API is keyless and returns one JSON object:
--   {"date":"2026-10-01","eur":{"mad":10.99916935,...}}
-- Zetaris infers `eur` as a struct, so the view can read eur.mad directly.
--
-- The free endpoint exposes one reference date, not a range. fx_rates repeats
-- that reference rate for every date in the contract window so the web can
-- convert any transaction date; MAD never enters the database or the agents.
--
-- Attribution: currency-api (https://github.com/fawazahmed0/exchange-api),
-- data via jsDelivr. The setup script substitutes __FX_ENDPOINT__.
CREATE LIGHTNING DATABASE fx_rest DESCRIBE BY "EUR MAD reference rates for display";

CREATE LIGHTNING REST TABLE eur_reference FROM fx_rest REQUEST(
    endpoint "__FX_ENDPOINT__",
    method "get",
    response_type "json",
    http_encoding "URLENCODED",
    insecure_ssl "false"
) HEADER (
) BODY ();

CREATE OR REPLACE SCHEMASTORE VIEW fx_rates WITH CONTAINER __VIEW_CONTAINER__ AS
WITH reference AS (
    SELECT
        to_date(`date`) AS reference_date,
        CAST(eur.mad AS DECIMAL(12, 6)) AS rate
    FROM fx_rest.eur_reference
),
days AS (
    SELECT explode(sequence(
        to_date('2026-03-31'),
        to_date('2026-10-01'),
        interval 1 day
    )) AS `date`
)
SELECT
    d.`date`,
    'EUR' AS base,
    'MAD' AS quote,
    r.rate
FROM days d
CROSS JOIN reference r;
