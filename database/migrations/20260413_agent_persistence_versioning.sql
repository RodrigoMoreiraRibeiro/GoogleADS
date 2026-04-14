-- Evolucao da persistencia de agentes e versionamento de insights
-- Data: 2026-04-13

START TRANSACTION;

ALTER TABLE insight_runs
    ADD COLUMN google_ads_account_id BIGINT UNSIGNED NULL AFTER client_id,
    ADD COLUMN baseline_start DATE NULL AFTER period_end,
    ADD COLUMN baseline_end DATE NULL AFTER baseline_start,
    ADD COLUMN comparison_label VARCHAR(120) NULL AFTER baseline_end,
    ADD COLUMN previous_run_id BIGINT UNSIGNED NULL AFTER triggered_by_user_id,
    ADD COLUMN orchestrator_run_uuid CHAR(36) NULL AFTER previous_run_id,
    ADD COLUMN run_hash CHAR(64) NULL AFTER orchestrator_run_uuid,
    ADD COLUMN summary_json JSON NULL AFTER status,
    ADD KEY idx_insight_runs_account_period (tenant_id, google_ads_account_id, period_start, period_end),
    ADD KEY idx_insight_runs_orchestrator (orchestrator_run_uuid),
    ADD CONSTRAINT fk_insight_runs_account FOREIGN KEY (google_ads_account_id) REFERENCES google_ads_accounts(id),
    ADD CONSTRAINT fk_insight_runs_previous FOREIGN KEY (previous_run_id) REFERENCES insight_runs(id);

ALTER TABLE insights
    ADD COLUMN confidence_band ENUM('low', 'moderate', 'high', 'very_high') NULL AFTER severity,
    ADD COLUMN alternative_hypotheses_json JSON NULL AFTER primary_hypothesis,
    ADD COLUMN source_agent_names_json JSON NULL AFTER alternative_hypotheses_json,
    ADD COLUMN hypothesis_status ENUM('confirmed', 'plausible', 'weak', 'insufficient_evidence') NULL AFTER source_agent_names_json,
    ADD COLUMN blocked_claims_json JSON NULL AFTER evidence_json,
    ADD COLUMN next_steps_json JSON NULL AFTER blocked_claims_json,
    ADD COLUMN review_notes_json JSON NULL AFTER next_steps_json,
    ADD COLUMN latest_version_id BIGINT UNSIGNED NULL AFTER current_version_number,
    ADD COLUMN latest_run_id BIGINT UNSIGNED NULL AFTER latest_version_id,
    ADD KEY idx_insights_latest_version (latest_version_id),
    ADD KEY idx_insights_latest_run (latest_run_id),
    ADD CONSTRAINT fk_insights_latest_run FOREIGN KEY (latest_run_id) REFERENCES insight_runs(id);

ALTER TABLE insight_versions
    ADD COLUMN confidence_band ENUM('low', 'moderate', 'high', 'very_high') NULL AFTER confidence_score,
    ADD COLUMN source_agent_names_json JSON NULL AFTER risk_level,
    ADD COLUMN hypothesis_status ENUM('confirmed', 'plausible', 'weak', 'insufficient_evidence') NULL AFTER source_agent_names_json,
    ADD COLUMN review_notes_json JSON NULL AFTER hypothesis_status;

CREATE TABLE insight_run_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id BIGINT UNSIGNED NOT NULL,
    client_id BIGINT UNSIGNED NOT NULL,
    google_ads_account_id BIGINT UNSIGNED NULL,
    insight_run_id BIGINT UNSIGNED NOT NULL,
    insight_id BIGINT UNSIGNED NOT NULL,
    insight_version_id BIGINT UNSIGNED NULL,
    insight_key CHAR(64) NOT NULL,
    scope_type ENUM('account', 'campaign', 'device', 'geo', 'schedule', 'keyword', 'search_term', 'tracking') NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id VARCHAR(120) NOT NULL,
    category VARCHAR(64) NOT NULL,
    severity ENUM('info', 'warning', 'critical') NOT NULL,
    hypothesis_status ENUM('confirmed', 'plausible', 'weak', 'insufficient_evidence') NULL,
    priority_score DECIMAL(6, 2) NOT NULL,
    confidence_score DECIMAL(6, 4) NOT NULL,
    run_change_type ENUM('new', 'updated', 'unchanged') NOT NULL DEFAULT 'unchanged',
    payload_hash CHAR(64) NOT NULL,
    content_hash CHAR(64) NOT NULL,
    title VARCHAR(191) NOT NULL,
    payload_json JSON NOT NULL,
    generated_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_insight_run_items_run_key (insight_run_id, insight_key),
    KEY idx_insight_run_items_lookup (tenant_id, client_id, insight_run_id, category),
    KEY idx_insight_run_items_account (tenant_id, google_ads_account_id, generated_at),
    KEY idx_insight_run_items_insight (insight_id, insight_version_id),
    CONSTRAINT fk_insight_run_items_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT fk_insight_run_items_client FOREIGN KEY (client_id) REFERENCES clients(id),
    CONSTRAINT fk_insight_run_items_account FOREIGN KEY (google_ads_account_id) REFERENCES google_ads_accounts(id),
    CONSTRAINT fk_insight_run_items_run FOREIGN KEY (insight_run_id) REFERENCES insight_runs(id),
    CONSTRAINT fk_insight_run_items_insight FOREIGN KEY (insight_id) REFERENCES insights(id),
    CONSTRAINT fk_insight_run_items_version FOREIGN KEY (insight_version_id) REFERENCES insight_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE agent_run_outputs
    ADD COLUMN insight_run_id BIGINT UNSIGNED NULL AFTER agent_run_id,
    ADD COLUMN output_status VARCHAR(32) NULL AFTER payload_schema_version,
    ADD COLUMN summary_text TEXT NULL AFTER output_hash,
    ADD COLUMN candidate_entity_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER output_json,
    ADD KEY idx_agent_run_outputs_run (insight_run_id, created_at),
    ADD CONSTRAINT fk_agent_run_outputs_insight_run FOREIGN KEY (insight_run_id) REFERENCES insight_runs(id);

ALTER TABLE agent_findings
    ADD COLUMN support_agent_names_json JSON NOT NULL AFTER primary_hypothesis,
    ADD COLUMN hypothesis_status ENUM('confirmed', 'plausible', 'weak', 'insufficient_evidence') NOT NULL DEFAULT 'plausible' AFTER alternative_hypotheses_json,
    ADD COLUMN review_notes_json JSON NOT NULL AFTER tags_json;

UPDATE insights
SET latest_run_id = insight_run_id
WHERE latest_run_id IS NULL;

UPDATE insights i
INNER JOIN insight_versions iv
    ON iv.insight_id = i.id
   AND iv.version_number = i.current_version_number
SET i.latest_version_id = iv.id
WHERE i.latest_version_id IS NULL;

ALTER TABLE insights
    ADD CONSTRAINT fk_insights_latest_version FOREIGN KEY (latest_version_id) REFERENCES insight_versions(id);

COMMIT;
