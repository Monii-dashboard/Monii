DO $$
BEGIN
  CREATE ROLE monii_runtime NOLOGIN;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
GRANT monii_runtime TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA financial, ingestion, reconciliation, wealth TO monii_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA financial, ingestion, reconciliation, wealth TO monii_runtime;
--> statement-breakpoint
GRANT UPDATE ON TABLE
  financial.accounts,
  financial.institutions,
  ingestion.account_identity_claims,
  ingestion.connections,
  ingestion.external_accounts,
  ingestion.external_institutions,
  ingestion.source_instances,
  ingestion.synchronization_runs,
  reconciliation.account_match_assessments,
  wealth.account_policies
TO monii_runtime;
--> statement-breakpoint
COMMENT ON TABLE financial.accounts IS 'monii:model-table:mutable-no-delete';
COMMENT ON TABLE financial.institutions IS 'monii:model-table:mutable-no-delete';
COMMENT ON TABLE financial.account_merges IS 'monii:model-table:append-only';
COMMENT ON TABLE financial.account_valuation_candidates IS 'monii:model-table:append-only';
COMMENT ON TABLE ingestion.source_instances IS 'monii:model-table:mutable-no-delete';
COMMENT ON TABLE ingestion.external_institutions IS 'monii:model-table:mutable-no-delete';
COMMENT ON TABLE ingestion.connections IS 'monii:model-table:mutable-no-delete';
COMMENT ON TABLE ingestion.external_accounts IS 'monii:model-table:mutable-no-delete';
COMMENT ON TABLE ingestion.synchronization_runs IS 'monii:model-table:controlled-lifecycle';
COMMENT ON TABLE ingestion.synchronization_connection_results IS 'monii:model-table:append-only';
COMMENT ON TABLE ingestion.external_account_observations IS 'monii:model-table:append-only';
COMMENT ON TABLE ingestion.reported_account_valuations IS 'monii:model-table:append-only';
COMMENT ON TABLE ingestion.synchronization_account_results IS 'monii:model-table:append-only';
COMMENT ON TABLE ingestion.account_identity_claims IS 'monii:model-table:mutable-no-delete';
COMMENT ON TABLE reconciliation.account_match_assessments IS 'monii:model-table:mutable-no-delete';
COMMENT ON TABLE wealth.account_policies IS 'monii:model-table:mutable-no-delete';
COMMENT ON TABLE wealth.snapshots IS 'monii:model-table:append-only';
COMMENT ON TABLE wealth.snapshot_account_decisions IS 'monii:model-table:append-only';
--> statement-breakpoint
CREATE FUNCTION public.monii_reject_table_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is not permitted on %.%', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '55000';
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.monii_reject_table_mutation() FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.monii_validate_synchronization_run_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.source_instance_id IS DISTINCT FROM NEW.source_instance_id
    OR OLD.action_id IS DISTINCT FROM NEW.action_id
    OR OLD.started_at IS DISTINCT FROM NEW.started_at
  THEN
    RAISE EXCEPTION 'immutable synchronization run fields cannot be updated'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.status <> 'running' OR NEW.status = 'running' THEN
    RAISE EXCEPTION 'invalid synchronization run transition from % to %', OLD.status, NEW.status
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.monii_validate_synchronization_run_transition() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER monii_append_only_guard
BEFORE UPDATE OR DELETE OR TRUNCATE ON financial.account_merges
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_append_only_guard
BEFORE UPDATE OR DELETE OR TRUNCATE ON financial.account_valuation_candidates
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_append_only_guard
BEFORE UPDATE OR DELETE OR TRUNCATE ON ingestion.external_account_observations
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_append_only_guard
BEFORE UPDATE OR DELETE OR TRUNCATE ON ingestion.reported_account_valuations
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_append_only_guard
BEFORE UPDATE OR DELETE OR TRUNCATE ON ingestion.synchronization_account_results
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_append_only_guard
BEFORE UPDATE OR DELETE OR TRUNCATE ON ingestion.synchronization_connection_results
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_append_only_guard
BEFORE UPDATE OR DELETE OR TRUNCATE ON wealth.snapshots
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_append_only_guard
BEFORE UPDATE OR DELETE OR TRUNCATE ON wealth.snapshot_account_decisions
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_no_delete_guard
BEFORE DELETE OR TRUNCATE ON financial.accounts
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_no_delete_guard
BEFORE DELETE OR TRUNCATE ON financial.institutions
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_no_delete_guard
BEFORE DELETE OR TRUNCATE ON ingestion.account_identity_claims
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_no_delete_guard
BEFORE DELETE OR TRUNCATE ON ingestion.connections
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_no_delete_guard
BEFORE DELETE OR TRUNCATE ON ingestion.external_accounts
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_no_delete_guard
BEFORE DELETE OR TRUNCATE ON ingestion.external_institutions
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_no_delete_guard
BEFORE DELETE OR TRUNCATE ON ingestion.source_instances
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_no_delete_guard
BEFORE DELETE OR TRUNCATE ON ingestion.synchronization_runs
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_no_delete_guard
BEFORE DELETE OR TRUNCATE ON reconciliation.account_match_assessments
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_no_delete_guard
BEFORE DELETE OR TRUNCATE ON wealth.account_policies
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_synchronization_run_transition_guard
BEFORE UPDATE ON ingestion.synchronization_runs
FOR EACH ROW EXECUTE FUNCTION public.monii_validate_synchronization_run_transition();
