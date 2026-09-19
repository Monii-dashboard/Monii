-- Generated from ModelTable declarations. Do not edit by hand.
-- monii-model-table-policy-sha256:88b5cad528cc72dc392ebc0bca7a40a6e8fe0506c6924e9ebda72dd3500c709b
DO $$
BEGIN
  CREATE ROLE "monii_runtime"
    NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
ALTER ROLE "monii_runtime"
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
--> statement-breakpoint
GRANT "monii_runtime" TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "financial", "ingestion", "reconciliation", "wealth" TO "monii_runtime";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.monii_reject_table_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION '% is not permitted on %.%', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '55000';
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.monii_reject_table_mutation() FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.monii_reject_immutable_field_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  immutable_column text;
BEGIN
  FOR immutable_column IN
    SELECT jsonb_array_elements_text(TG_ARGV[0]::jsonb)
  LOOP
    IF (to_jsonb(OLD) -> immutable_column) IS DISTINCT FROM
       (to_jsonb(NEW) -> immutable_column)
    THEN
      RAISE EXCEPTION 'immutable field % cannot be updated on %.%', immutable_column, TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = '55000';
    END IF;
  END LOOP;

  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.monii_reject_immutable_field_update() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "financial"."account_merges" FROM "monii_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "financial"."account_merges" TO "monii_runtime";
--> statement-breakpoint
COMMENT ON TABLE "financial"."account_merges" IS 'monii:model-table:v1:append-only:97af48620474761b';
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_append_only_guard ON "financial"."account_merges";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_no_delete_guard ON "financial"."account_merges";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON "financial"."account_merges";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_write_guard ON "financial"."account_merges";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON "financial"."account_merges";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON "financial"."account_merges";
--> statement-breakpoint
CREATE TRIGGER monii_model_table_write_guard
BEFORE UPDATE OR DELETE OR TRUNCATE ON "financial"."account_merges"
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "financial"."account_valuation_candidates" FROM "monii_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "financial"."account_valuation_candidates" TO "monii_runtime";
--> statement-breakpoint
COMMENT ON TABLE "financial"."account_valuation_candidates" IS 'monii:model-table:v1:append-only:cbe3f6d9047e137e';
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_append_only_guard ON "financial"."account_valuation_candidates";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_no_delete_guard ON "financial"."account_valuation_candidates";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON "financial"."account_valuation_candidates";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_write_guard ON "financial"."account_valuation_candidates";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON "financial"."account_valuation_candidates";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON "financial"."account_valuation_candidates";
--> statement-breakpoint
CREATE TRIGGER monii_model_table_write_guard
BEFORE UPDATE OR DELETE OR TRUNCATE ON "financial"."account_valuation_candidates"
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "financial"."accounts" FROM "monii_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "financial"."accounts" TO "monii_runtime";
--> statement-breakpoint
COMMENT ON TABLE "financial"."accounts" IS 'monii:model-table:v1:mutable-no-delete:3846bd43d724f5ec';
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_append_only_guard ON "financial"."accounts";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_no_delete_guard ON "financial"."accounts";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON "financial"."accounts";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_write_guard ON "financial"."accounts";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON "financial"."accounts";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON "financial"."accounts";
--> statement-breakpoint
CREATE TRIGGER monii_model_table_write_guard
BEFORE DELETE OR TRUNCATE ON "financial"."accounts"
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_model_table_immutable_guard
BEFORE UPDATE ON "financial"."accounts"
FOR EACH ROW EXECUTE FUNCTION public.monii_reject_immutable_field_update('["id","created_at"]');
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "financial"."institutions" FROM "monii_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "financial"."institutions" TO "monii_runtime";
--> statement-breakpoint
COMMENT ON TABLE "financial"."institutions" IS 'monii:model-table:v1:mutable-no-delete:2f6b2075fc8c5e1e';
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_append_only_guard ON "financial"."institutions";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_no_delete_guard ON "financial"."institutions";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON "financial"."institutions";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_write_guard ON "financial"."institutions";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON "financial"."institutions";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON "financial"."institutions";
--> statement-breakpoint
CREATE TRIGGER monii_model_table_write_guard
BEFORE DELETE OR TRUNCATE ON "financial"."institutions"
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_model_table_immutable_guard
BEFORE UPDATE ON "financial"."institutions"
FOR EACH ROW EXECUTE FUNCTION public.monii_reject_immutable_field_update('["id","created_at"]');
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "ingestion"."account_identity_claims" FROM "monii_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "ingestion"."account_identity_claims" TO "monii_runtime";
--> statement-breakpoint
COMMENT ON TABLE "ingestion"."account_identity_claims" IS 'monii:model-table:v1:mutable-no-delete:ba4ae99066fedbb4';
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_append_only_guard ON "ingestion"."account_identity_claims";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_no_delete_guard ON "ingestion"."account_identity_claims";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON "ingestion"."account_identity_claims";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_write_guard ON "ingestion"."account_identity_claims";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON "ingestion"."account_identity_claims";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON "ingestion"."account_identity_claims";
--> statement-breakpoint
CREATE TRIGGER monii_model_table_write_guard
BEFORE DELETE OR TRUNCATE ON "ingestion"."account_identity_claims"
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_model_table_immutable_guard
BEFORE UPDATE ON "ingestion"."account_identity_claims"
FOR EACH ROW EXECUTE FUNCTION public.monii_reject_immutable_field_update('["id","external_account_id","claim_type","key_version","fingerprint","first_observed_run_id","created_at"]');
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "ingestion"."connections" FROM "monii_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "ingestion"."connections" TO "monii_runtime";
--> statement-breakpoint
COMMENT ON TABLE "ingestion"."connections" IS 'monii:model-table:v1:mutable-no-delete:852165429f1157cc';
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_append_only_guard ON "ingestion"."connections";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_no_delete_guard ON "ingestion"."connections";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON "ingestion"."connections";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_write_guard ON "ingestion"."connections";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON "ingestion"."connections";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON "ingestion"."connections";
--> statement-breakpoint
CREATE TRIGGER monii_model_table_write_guard
BEFORE DELETE OR TRUNCATE ON "ingestion"."connections"
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_model_table_immutable_guard
BEFORE UPDATE ON "ingestion"."connections"
FOR EACH ROW EXECUTE FUNCTION public.monii_reject_immutable_field_update('["id","source_instance_id","external_id","created_at"]');
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "ingestion"."external_account_observations" FROM "monii_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "ingestion"."external_account_observations" TO "monii_runtime";
--> statement-breakpoint
COMMENT ON TABLE "ingestion"."external_account_observations" IS 'monii:model-table:v1:append-only:18e0712a903cb0a8';
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_append_only_guard ON "ingestion"."external_account_observations";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_no_delete_guard ON "ingestion"."external_account_observations";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON "ingestion"."external_account_observations";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_write_guard ON "ingestion"."external_account_observations";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON "ingestion"."external_account_observations";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON "ingestion"."external_account_observations";
--> statement-breakpoint
CREATE TRIGGER monii_model_table_write_guard
BEFORE UPDATE OR DELETE OR TRUNCATE ON "ingestion"."external_account_observations"
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "ingestion"."external_accounts" FROM "monii_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "ingestion"."external_accounts" TO "monii_runtime";
--> statement-breakpoint
COMMENT ON TABLE "ingestion"."external_accounts" IS 'monii:model-table:v1:mutable-no-delete:1976e95c294989f1';
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_append_only_guard ON "ingestion"."external_accounts";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_no_delete_guard ON "ingestion"."external_accounts";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON "ingestion"."external_accounts";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_write_guard ON "ingestion"."external_accounts";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON "ingestion"."external_accounts";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON "ingestion"."external_accounts";
--> statement-breakpoint
CREATE TRIGGER monii_model_table_write_guard
BEFORE DELETE OR TRUNCATE ON "ingestion"."external_accounts"
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_model_table_immutable_guard
BEFORE UPDATE ON "ingestion"."external_accounts"
FOR EACH ROW EXECUTE FUNCTION public.monii_reject_immutable_field_update('["id","account_id","source_instance_id","external_id","first_observed_at"]');
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "ingestion"."external_institutions" FROM "monii_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "ingestion"."external_institutions" TO "monii_runtime";
--> statement-breakpoint
COMMENT ON TABLE "ingestion"."external_institutions" IS 'monii:model-table:v1:mutable-no-delete:4e30a7426ceb2fea';
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_append_only_guard ON "ingestion"."external_institutions";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_no_delete_guard ON "ingestion"."external_institutions";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON "ingestion"."external_institutions";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_write_guard ON "ingestion"."external_institutions";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON "ingestion"."external_institutions";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON "ingestion"."external_institutions";
--> statement-breakpoint
CREATE TRIGGER monii_model_table_write_guard
BEFORE DELETE OR TRUNCATE ON "ingestion"."external_institutions"
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_model_table_immutable_guard
BEFORE UPDATE ON "ingestion"."external_institutions"
FOR EACH ROW EXECUTE FUNCTION public.monii_reject_immutable_field_update('["id","source_instance_id","institution_id","external_id","first_observed_at"]');
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "ingestion"."reported_account_valuations" FROM "monii_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "ingestion"."reported_account_valuations" TO "monii_runtime";
--> statement-breakpoint
COMMENT ON TABLE "ingestion"."reported_account_valuations" IS 'monii:model-table:v1:append-only:fcd6ebcd3b248101';
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_append_only_guard ON "ingestion"."reported_account_valuations";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_no_delete_guard ON "ingestion"."reported_account_valuations";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON "ingestion"."reported_account_valuations";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_write_guard ON "ingestion"."reported_account_valuations";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON "ingestion"."reported_account_valuations";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON "ingestion"."reported_account_valuations";
--> statement-breakpoint
CREATE TRIGGER monii_model_table_write_guard
BEFORE UPDATE OR DELETE OR TRUNCATE ON "ingestion"."reported_account_valuations"
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "ingestion"."source_instances" FROM "monii_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "ingestion"."source_instances" TO "monii_runtime";
--> statement-breakpoint
COMMENT ON TABLE "ingestion"."source_instances" IS 'monii:model-table:v1:mutable-no-delete:fc878e84fb5cf6e2';
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_append_only_guard ON "ingestion"."source_instances";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_no_delete_guard ON "ingestion"."source_instances";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON "ingestion"."source_instances";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_write_guard ON "ingestion"."source_instances";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON "ingestion"."source_instances";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON "ingestion"."source_instances";
--> statement-breakpoint
CREATE TRIGGER monii_model_table_write_guard
BEFORE DELETE OR TRUNCATE ON "ingestion"."source_instances"
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_model_table_immutable_guard
BEFORE UPDATE ON "ingestion"."source_instances"
FOR EACH ROW EXECUTE FUNCTION public.monii_reject_immutable_field_update('["id","source_key","created_at"]');
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "ingestion"."synchronization_account_results" FROM "monii_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "ingestion"."synchronization_account_results" TO "monii_runtime";
--> statement-breakpoint
COMMENT ON TABLE "ingestion"."synchronization_account_results" IS 'monii:model-table:v1:append-only:580d237f4758ed64';
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_append_only_guard ON "ingestion"."synchronization_account_results";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_no_delete_guard ON "ingestion"."synchronization_account_results";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON "ingestion"."synchronization_account_results";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_write_guard ON "ingestion"."synchronization_account_results";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON "ingestion"."synchronization_account_results";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON "ingestion"."synchronization_account_results";
--> statement-breakpoint
CREATE TRIGGER monii_model_table_write_guard
BEFORE UPDATE OR DELETE OR TRUNCATE ON "ingestion"."synchronization_account_results"
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "ingestion"."synchronization_connection_results" FROM "monii_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "ingestion"."synchronization_connection_results" TO "monii_runtime";
--> statement-breakpoint
COMMENT ON TABLE "ingestion"."synchronization_connection_results" IS 'monii:model-table:v1:append-only:c959c34f8aef65f0';
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_append_only_guard ON "ingestion"."synchronization_connection_results";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_no_delete_guard ON "ingestion"."synchronization_connection_results";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON "ingestion"."synchronization_connection_results";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_write_guard ON "ingestion"."synchronization_connection_results";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON "ingestion"."synchronization_connection_results";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON "ingestion"."synchronization_connection_results";
--> statement-breakpoint
CREATE TRIGGER monii_model_table_write_guard
BEFORE UPDATE OR DELETE OR TRUNCATE ON "ingestion"."synchronization_connection_results"
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "ingestion"."synchronization_runs" FROM "monii_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "ingestion"."synchronization_runs" TO "monii_runtime";
--> statement-breakpoint
COMMENT ON TABLE "ingestion"."synchronization_runs" IS 'monii:model-table:v1:mutable-no-delete:537147ffea12d107';
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_append_only_guard ON "ingestion"."synchronization_runs";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_no_delete_guard ON "ingestion"."synchronization_runs";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON "ingestion"."synchronization_runs";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_write_guard ON "ingestion"."synchronization_runs";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON "ingestion"."synchronization_runs";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON "ingestion"."synchronization_runs";
--> statement-breakpoint
CREATE TRIGGER monii_model_table_write_guard
BEFORE DELETE OR TRUNCATE ON "ingestion"."synchronization_runs"
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_model_table_immutable_guard
BEFORE UPDATE ON "ingestion"."synchronization_runs"
FOR EACH ROW EXECUTE FUNCTION public.monii_reject_immutable_field_update('["id","source_instance_id","action_id","started_at"]');
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "reconciliation"."account_match_assessments" FROM "monii_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "reconciliation"."account_match_assessments" TO "monii_runtime";
--> statement-breakpoint
COMMENT ON TABLE "reconciliation"."account_match_assessments" IS 'monii:model-table:v1:mutable-no-delete:7ce615d1a5fcb6dd';
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_append_only_guard ON "reconciliation"."account_match_assessments";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_no_delete_guard ON "reconciliation"."account_match_assessments";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON "reconciliation"."account_match_assessments";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_write_guard ON "reconciliation"."account_match_assessments";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON "reconciliation"."account_match_assessments";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON "reconciliation"."account_match_assessments";
--> statement-breakpoint
CREATE TRIGGER monii_model_table_write_guard
BEFORE DELETE OR TRUNCATE ON "reconciliation"."account_match_assessments"
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_model_table_immutable_guard
BEFORE UPDATE ON "reconciliation"."account_match_assessments"
FOR EACH ROW EXECUTE FUNCTION public.monii_reject_immutable_field_update('["id","left_external_account_id","right_external_account_id","first_detected_synchronization_run_id","created_at"]');
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "wealth"."account_policies" FROM "monii_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "wealth"."account_policies" TO "monii_runtime";
--> statement-breakpoint
COMMENT ON TABLE "wealth"."account_policies" IS 'monii:model-table:v1:mutable-no-delete:11e9997557fc6882';
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_append_only_guard ON "wealth"."account_policies";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_no_delete_guard ON "wealth"."account_policies";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON "wealth"."account_policies";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_write_guard ON "wealth"."account_policies";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON "wealth"."account_policies";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON "wealth"."account_policies";
--> statement-breakpoint
CREATE TRIGGER monii_model_table_write_guard
BEFORE DELETE OR TRUNCATE ON "wealth"."account_policies"
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
CREATE TRIGGER monii_model_table_immutable_guard
BEFORE UPDATE ON "wealth"."account_policies"
FOR EACH ROW EXECUTE FUNCTION public.monii_reject_immutable_field_update('["account_id","created_at"]');
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "wealth"."snapshot_account_decisions" FROM "monii_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "wealth"."snapshot_account_decisions" TO "monii_runtime";
--> statement-breakpoint
COMMENT ON TABLE "wealth"."snapshot_account_decisions" IS 'monii:model-table:v1:append-only:77ebaa821c16dd5c';
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_append_only_guard ON "wealth"."snapshot_account_decisions";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_no_delete_guard ON "wealth"."snapshot_account_decisions";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON "wealth"."snapshot_account_decisions";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_write_guard ON "wealth"."snapshot_account_decisions";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON "wealth"."snapshot_account_decisions";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON "wealth"."snapshot_account_decisions";
--> statement-breakpoint
CREATE TRIGGER monii_model_table_write_guard
BEFORE UPDATE OR DELETE OR TRUNCATE ON "wealth"."snapshot_account_decisions"
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "wealth"."snapshots" FROM "monii_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "wealth"."snapshots" TO "monii_runtime";
--> statement-breakpoint
COMMENT ON TABLE "wealth"."snapshots" IS 'monii:model-table:v1:append-only:b41d881d8d71b181';
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_append_only_guard ON "wealth"."snapshots";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_no_delete_guard ON "wealth"."snapshots";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON "wealth"."snapshots";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_write_guard ON "wealth"."snapshots";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON "wealth"."snapshots";
--> statement-breakpoint
DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON "wealth"."snapshots";
--> statement-breakpoint
CREATE TRIGGER monii_model_table_write_guard
BEFORE UPDATE OR DELETE OR TRUNCATE ON "wealth"."snapshots"
FOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.monii_validate_lifecycle_transition();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.monii_validate_synchronization_run_transition();
