-- Preserve the model's original decision. Explicit editorial resolutions remain private/auditable.
ALTER TABLE news_decisions ADD COLUMN resolved_decision text CHECK (resolved_decision IN ('select','reject'));
ALTER TABLE news_decisions ADD COLUMN resolved_by text;
ALTER TABLE news_decisions ADD COLUMN resolution_reason text;
ALTER TABLE news_decisions ADD COLUMN resolved_at timestamptz;
ALTER TABLE news_decisions ADD CONSTRAINT news_resolution_complete CHECK (
 (resolved_decision IS NULL AND resolved_by IS NULL AND resolution_reason IS NULL AND resolved_at IS NULL)
 OR (resolved_decision IS NOT NULL AND length(resolved_by)>0 AND length(resolution_reason)>0 AND resolved_at IS NOT NULL)
);
