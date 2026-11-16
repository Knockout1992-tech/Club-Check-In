INSERT INTO public.retention_policies
 (policy_key,record_type,retention_value,retention_unit,action,enabled,enforcement_enabled,notes,policy_version,updated_at,updated_by)
VALUES
 ('pdm_case_records','Personal Data Management case records',NULL,NULL,'review',true,false,
  'No case-record retention period has been approved or configured. Keep these records under manual review; do not automatically delete or anonymise them until the club documents and approves a retention period.',
  1,now(),'system_admin')
ON CONFLICT (policy_key) DO UPDATE SET
 record_type=excluded.record_type,retention_value=NULL,retention_unit=NULL,action='review',
 enabled=true,enforcement_enabled=false,notes=excluded.notes,
 policy_version=public.retention_policies.policy_version+1,updated_at=now(),updated_by='system_admin';