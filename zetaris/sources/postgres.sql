-- Register the synthetic Postgres database as a Zetaris datasource.
--
-- Run from zetaris/setup_zetaris.sh, which fills the placeholder values
-- from .env. Never put a real password in this file.
--
-- Notes:
--   * The host must be reachable from INSIDE the Zetaris containers.
--     Docker Desktop: host.docker.internal. Linux: the docker bridge/LAN IP
--     (the setup script picks one; override with ZETARIS_PG_HOST).
--   * Zetaris registers the connection only. REGISTER DATASOURCE TABLES imports
--     the five tables so the views can read <datasource>.<table>.
CREATE DATASOURCE __PG_DATASOURCE__ DESCRIBE BY "Ledger Lens Postgres - synthetic freelancer data" OPTIONS (
    jdbcdriver "org.postgresql.Driver",
    jdbcurl "jdbc:postgresql://__PG_HOST__:__PG_PORT__/__PG_DATABASE__",
    username "__PG_USER__",
    password "__PG_PASSWORD__",
    fetchsize "1000"
);

REGISTER DATASOURCE TABLES FROM __PG_DATASOURCE__;
