PRAGMA foreign_keys = ON;

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  org_name TEXT NOT NULL,
  external_report_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  period_begin INTEGER NOT NULL CHECK (period_begin >= 0),
  period_end INTEGER NOT NULL CHECK (period_end >= 0 AND period_begin <= period_end),
  policy_p TEXT NOT NULL CHECK (policy_p IN ('none', 'quarantine', 'reject')),
  policy_sp TEXT CHECK (policy_sp IS NULL OR policy_sp IN ('none', 'quarantine', 'reject')),
  policy_pct INTEGER NOT NULL CHECK (policy_pct BETWEEN 0 AND 100),
  policy_adkim TEXT NOT NULL CHECK (policy_adkim IN ('r', 's')),
  policy_aspf TEXT NOT NULL CHECK (policy_aspf IN ('r', 's')),
  imported_at INTEGER NOT NULL CHECK (imported_at >= 0),
  imported_by TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE
);

CREATE TABLE report_records (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  source_ip TEXT NOT NULL,
  message_count INTEGER NOT NULL CHECK (message_count > 0),
  disposition TEXT NOT NULL CHECK (disposition IN ('none', 'quarantine', 'reject')),
  evaluated_dkim TEXT NOT NULL CHECK (evaluated_dkim IN ('pass', 'fail')),
  evaluated_spf TEXT NOT NULL CHECK (evaluated_spf IN ('pass', 'fail')),
  classification TEXT NOT NULL CHECK (classification IN ('pass', 'review', 'fail')),
  dmarc_pass INTEGER NOT NULL CHECK (dmarc_pass IN (0, 1)),
  header_from TEXT NOT NULL,
  envelope_from TEXT,
  envelope_to TEXT
);

CREATE TABLE dkim_results (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES report_records(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  selector TEXT,
  result TEXT NOT NULL CHECK (result IN ('none', 'pass', 'fail', 'policy', 'neutral', 'temperror', 'permerror')),
  human_result TEXT
);

CREATE TABLE spf_results (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES report_records(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  scope TEXT CHECK (scope IS NULL OR scope IN ('mfrom', 'helo')),
  result TEXT NOT NULL CHECK (result IN ('none', 'neutral', 'pass', 'fail', 'softfail', 'temperror', 'permerror'))
);

CREATE TABLE policy_overrides (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES report_records(id) ON DELETE CASCADE,
  override_type TEXT NOT NULL CHECK (override_type IN ('forwarded', 'sampled_out', 'trusted_forwarder', 'mailing_list', 'local_policy', 'other')),
  comment TEXT
);

CREATE INDEX reports_domain_period_idx ON reports(domain, period_begin, period_end);
CREATE INDEX reports_imported_at_idx ON reports(imported_at DESC);
CREATE INDEX report_records_report_id_idx ON report_records(report_id);
CREATE INDEX report_records_source_ip_idx ON report_records(source_ip);
CREATE INDEX report_records_classification_idx ON report_records(classification);
CREATE INDEX dkim_results_record_id_idx ON dkim_results(record_id);
CREATE INDEX spf_results_record_id_idx ON spf_results(record_id);
CREATE INDEX policy_overrides_record_id_idx ON policy_overrides(record_id);
