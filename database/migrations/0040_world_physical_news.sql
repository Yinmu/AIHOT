-- Additive, opt-in headless news pipeline. No sources or schedules enabled by migration.
CREATE TABLE news_sources (
 source_id text PRIMARY KEY REFERENCES sources(id), allowed boolean NOT NULL DEFAULT true,
 last_success_at timestamptz, last_error text
);
CREATE TABLE news_decisions (
 id bigserial PRIMARY KEY, article_id text NOT NULL REFERENCES articles(id), input_revision integer NOT NULL,
 profile text NOT NULL, policy text NOT NULL, model text, decision text NOT NULL CHECK(decision IN ('select','reject','review')),
 topic text, score numeric, reason_codes jsonb NOT NULL DEFAULT '[]',
 state text NOT NULL CHECK(state IN ('review','rejected','awaiting-summary','ready')),
 title text, summary text, jev_receipt_id bigint REFERENCES receipts(id), summary_receipt_id bigint REFERENCES receipts(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(article_id,input_revision,profile,policy)
);
CREATE TABLE news_reviews (
 id bigserial PRIMARY KEY, decision_id bigint NOT NULL REFERENCES news_decisions(id),
 action text NOT NULL CHECK(action IN ('approve','reject')), reviewer text NOT NULL, reason text NOT NULL,
 event_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX news_reviews_latest ON news_reviews(decision_id,id DESC);
CREATE TABLE news_removals (
 item_id text PRIMARY KEY, reviewer text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
