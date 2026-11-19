-- Enable the approved 24-month personal data request case anonymisation policy.
-- Open cases and records under active retention holds remain excluded by run_retention_job.

UPDATE public.retention_policies
SET enforcement_enabled=true,
    policy_version=policy_version+1,
    updated_at=now(),
    updated_by='system_admin',
    notes='Automatically anonymise identifying case details 24 months after closure. Preserve minimal non-identifying evidence. Open cases and active retention holds are excluded.'
WHERE policy_key='pdm_case_records'
  AND action='anonymise'
  AND retention_value=24
  AND retention_unit='months';
