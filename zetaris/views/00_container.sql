-- SchemaStore container for the four contract views + fx_rates.
-- CREATE SCHEMASTORE CONTAINER has no IF NOT EXISTS; the setup script treats
-- "already exists" as success, so re-runs are safe.
CREATE SCHEMASTORE CONTAINER __VIEW_CONTAINER__;
