-- Ledger Lens schema (docs/contracts.md §1).
--
-- Destructive by design: this file drops and recreates the five dataset
-- tables so a rebuild always starts from an empty, known state.
-- The generated data lives in data/out/ and is loaded by load_postgres.py.
--
-- Apply with:
--   PGPASSWORD=ledger_dev psql -h 127.0.0.1 -p 5433 -U ledger -d ledger_lens -f data/schema.sql
--
-- The whole file runs in one transaction: either every table is created or
-- nothing changes.

BEGIN;

DROP TABLE IF EXISTS bank_transactions, time_logs, invoices, subscriptions, clients CASCADE;

CREATE TABLE clients (
    client_id          text PRIMARY KEY,
    name               text NOT NULL,
    hourly_rate        numeric(10,2) NOT NULL CHECK (hourly_rate > 0),
    market_rate        numeric(10,2) NOT NULL CHECK (market_rate > 0),
    service            text NOT NULL,
    payment_terms_days integer NOT NULL CHECK (payment_terms_days IN (15, 30, 45)),
    start_date         date NOT NULL,
    active             boolean NOT NULL
);

CREATE TABLE subscriptions (
    subscription_id text PRIMARY KEY,
    vendor          text NOT NULL,
    plan            text NOT NULL,
    monthly_cost    numeric(10,2) NOT NULL CHECK (monthly_cost >= 0),
    billing_day     integer NOT NULL CHECK (billing_day BETWEEN 1 AND 28),
    start_date      date NOT NULL,
    cancelled_date  date,
    last_login_date date,
    CHECK (cancelled_date IS NULL OR cancelled_date >= start_date)
);

CREATE TABLE invoices (
    invoice_id   text PRIMARY KEY,
    client_id    text NOT NULL REFERENCES clients (client_id),
    issue_date   date NOT NULL,
    due_date     date NOT NULL,
    paid_date    date,
    hours_billed numeric(6,2) NOT NULL CHECK (hours_billed > 0),
    amount       numeric(10,2) NOT NULL CHECK (amount >= 0),
    status       text NOT NULL CHECK (status IN ('sent', 'paid', 'overdue')),
    CHECK (due_date >= issue_date),
    CHECK (paid_date IS NULL OR paid_date >= issue_date),
    CHECK (
        (status = 'paid' AND paid_date IS NOT NULL)
        OR (status IN ('sent', 'overdue') AND paid_date IS NULL)
    )
);

CREATE TABLE time_logs (
    log_id      text PRIMARY KEY,
    client_id   text NOT NULL REFERENCES clients (client_id),
    date        date NOT NULL,
    hours       numeric(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
    billable    boolean NOT NULL,
    invoice_id  text REFERENCES invoices (invoice_id),
    description text NOT NULL,
    CHECK (invoice_id IS NULL OR billable)
);

CREATE TABLE bank_transactions (
    txn_id          text PRIMARY KEY,
    date            date NOT NULL,
    amount          numeric(10,2) NOT NULL CHECK (amount <> 0),
    counterparty    text NOT NULL,
    category        text NOT NULL CHECK (
        category IN (
            'client_payment', 'subscription', 'software', 'rent',
            'tax', 'travel', 'personal', 'other'
        )
    ),
    invoice_id      text REFERENCES invoices (invoice_id),
    subscription_id text REFERENCES subscriptions (subscription_id),
    description     text NOT NULL,
    CHECK (invoice_id IS NULL OR subscription_id IS NULL)
);

CREATE INDEX idx_time_logs_client_date ON time_logs (client_id, date);
CREATE INDEX idx_time_logs_invoice ON time_logs (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_invoices_client_issue ON invoices (client_id, issue_date);
CREATE INDEX idx_invoices_paid_date ON invoices (paid_date) WHERE paid_date IS NOT NULL;
CREATE INDEX idx_bank_transactions_date ON bank_transactions (date);
CREATE INDEX idx_bank_transactions_invoice ON bank_transactions (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_bank_transactions_subscription ON bank_transactions (subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX idx_subscriptions_vendor ON subscriptions (vendor);

COMMIT;
