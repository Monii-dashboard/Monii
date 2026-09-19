CREATE SCHEMA "financial";
--> statement-breakpoint
CREATE SCHEMA "ingestion";
--> statement-breakpoint
CREATE SCHEMA "reconciliation";
--> statement-breakpoint
CREATE SCHEMA "wealth";
--> statement-breakpoint
CREATE TABLE "financial"."account_merges" (
	"merged_account_id" uuid NOT NULL,
	"canonical_account_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"merged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_merges_pkey" PRIMARY KEY("merged_account_id"),
	CONSTRAINT "account_merges_distinct_accounts" CHECK ("financial"."account_merges"."merged_account_id" <> "financial"."account_merges"."canonical_account_id"),
	CONSTRAINT "account_merges_reason_valid" CHECK ("financial"."account_merges"."reason" in ('confirmed_external_identity', 'operator_confirmed'))
);
--> statement-breakpoint
CREATE TABLE "financial"."account_valuation_candidates" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"valuation_method" text NOT NULL,
	"valuation_basis" text NOT NULL,
	"amount" numeric(24, 8) NOT NULL,
	"currency" text,
	"effective_at" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_valuation_candidates_pkey" PRIMARY KEY("id"),
	CONSTRAINT "account_valuation_candidates_id_account_unique" UNIQUE("id","account_id"),
	CONSTRAINT "account_valuation_candidates_id_basis_unique" UNIQUE("id","valuation_basis"),
	CONSTRAINT "account_valuation_candidates_method_valid" CHECK ("financial"."account_valuation_candidates"."valuation_method" = 'reported'),
	CONSTRAINT "account_valuation_candidates_basis_valid" CHECK ("financial"."account_valuation_candidates"."valuation_basis" in ('balance', 'estimated_value')),
	CONSTRAINT "account_valuation_candidates_currency_valid" CHECK ("financial"."account_valuation_candidates"."currency" is null or "financial"."account_valuation_candidates"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "financial"."accounts" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid,
	"name" text,
	"category" text NOT NULL,
	"purpose" text NOT NULL,
	"management_mode" text DEFAULT 'external' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_pkey" PRIMARY KEY("id"),
	CONSTRAINT "accounts_category_valid" CHECK ("financial"."accounts"."category" in ('cash', 'investment', 'unknown')),
	CONSTRAINT "accounts_purpose_valid" CHECK ("financial"."accounts"."purpose" in ('personal', 'business', 'unknown')),
	CONSTRAINT "accounts_management_mode_valid" CHECK ("financial"."accounts"."management_mode" = 'external')
);
--> statement-breakpoint
CREATE TABLE "financial"."institutions" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_pkey" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "ingestion"."account_identity_claims" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"external_account_id" uuid NOT NULL,
	"claim_type" text NOT NULL,
	"key_version" text NOT NULL,
	"fingerprint" text NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"first_observed_run_id" uuid NOT NULL,
	"last_observed_run_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_identity_claims_pkey" PRIMARY KEY("id"),
	CONSTRAINT "account_identity_claims_type_valid" CHECK ("ingestion"."account_identity_claims"."claim_type" in ('iban', 'account_number', 'reported_name'))
);
--> statement-breakpoint
CREATE TABLE "ingestion"."connections" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"source_instance_id" uuid NOT NULL,
	"external_institution_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_pkey" PRIMARY KEY("id"),
	CONSTRAINT "connections_id_source_unique" UNIQUE("id","source_instance_id"),
	CONSTRAINT "connections_external_id_not_blank" CHECK (length(trim("ingestion"."connections"."external_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "ingestion"."external_account_observations" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"source_instance_id" uuid NOT NULL,
	"synchronization_run_id" uuid NOT NULL,
	"external_account_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_valid_at" timestamp with time zone,
	"reported_lifecycle" text NOT NULL,
	"reported_currency" text,
	CONSTRAINT "external_account_observations_pkey" PRIMARY KEY("id"),
	CONSTRAINT "external_account_observations_provenance_unique" UNIQUE("id","synchronization_run_id","external_account_id","source_instance_id"),
	CONSTRAINT "external_account_observations_id_account_unique" UNIQUE("id","account_id"),
	CONSTRAINT "external_account_observations_lifecycle_valid" CHECK ("ingestion"."external_account_observations"."reported_lifecycle" in ('active', 'disabled', 'deleted', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "ingestion"."external_accounts" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"source_instance_id" uuid NOT NULL,
	"connection_id" uuid,
	"external_id" text NOT NULL,
	"reported_name" text,
	"reported_type" text,
	"normalized_type_support" text NOT NULL,
	"lifecycle" text DEFAULT 'unknown' NOT NULL,
	"lifecycle_changed_at" timestamp with time zone,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_accounts_pkey" PRIMARY KEY("id"),
	CONSTRAINT "external_accounts_id_source_unique" UNIQUE("id","source_instance_id"),
	CONSTRAINT "external_accounts_id_account_unique" UNIQUE("id","account_id"),
	CONSTRAINT "external_accounts_lifecycle_valid" CHECK ("ingestion"."external_accounts"."lifecycle" in ('active', 'disabled', 'deleted', 'unknown')),
	CONSTRAINT "external_accounts_type_support_valid" CHECK ("ingestion"."external_accounts"."normalized_type_support" in ('supported', 'known_unsupported', 'unrecognized')),
	CONSTRAINT "external_accounts_external_id_not_blank" CHECK (length(trim("ingestion"."external_accounts"."external_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "ingestion"."external_institutions" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"source_instance_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"reported_name" text,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_institutions_pkey" PRIMARY KEY("id"),
	CONSTRAINT "external_institutions_id_source_unique" UNIQUE("id","source_instance_id"),
	CONSTRAINT "external_institutions_external_id_not_blank" CHECK (length(trim("ingestion"."external_institutions"."external_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "ingestion"."reported_account_valuations" (
	"valuation_candidate_id" uuid NOT NULL,
	"external_account_observation_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"valuation_basis" text NOT NULL,
	CONSTRAINT "reported_account_valuations_pkey" PRIMARY KEY("valuation_candidate_id")
);
--> statement-breakpoint
CREATE TABLE "ingestion"."source_instances" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"source_key" text NOT NULL,
	"adapter_key" text NOT NULL,
	"name" text NOT NULL,
	"external_subject_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_instances_pkey" PRIMARY KEY("id"),
	CONSTRAINT "source_instances_source_key_not_blank" CHECK (length(trim("ingestion"."source_instances"."source_key")) > 0),
	CONSTRAINT "source_instances_adapter_key_not_blank" CHECK (length(trim("ingestion"."source_instances"."adapter_key")) > 0)
);
--> statement-breakpoint
CREATE TABLE "ingestion"."synchronization_account_results" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"source_instance_id" uuid NOT NULL,
	"synchronization_run_id" uuid NOT NULL,
	"external_account_id" uuid NOT NULL,
	"external_account_observation_id" uuid,
	"status" text NOT NULL,
	"error_kind" text,
	"error_code" text,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "synchronization_account_results_pkey" PRIMARY KEY("id"),
	CONSTRAINT "synchronization_account_results_status_valid" CHECK ("ingestion"."synchronization_account_results"."status" in ('succeeded', 'provider_error', 'malformed', 'not_seen')),
	CONSTRAINT "synchronization_account_results_observation_shape_valid" CHECK (("ingestion"."synchronization_account_results"."status" = 'succeeded' and "ingestion"."synchronization_account_results"."external_account_observation_id" is not null) or ("ingestion"."synchronization_account_results"."status" <> 'succeeded' and "ingestion"."synchronization_account_results"."external_account_observation_id" is null))
);
--> statement-breakpoint
CREATE TABLE "ingestion"."synchronization_connection_results" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"source_instance_id" uuid NOT NULL,
	"synchronization_run_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"status" text NOT NULL,
	"reported_active" boolean DEFAULT true NOT NULL,
	"reported_state" text,
	"retry_after" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"error_kind" text,
	"error_code" text,
	"successful_account_count" integer DEFAULT 0 NOT NULL,
	"failed_account_count" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "synchronization_connection_results_pkey" PRIMARY KEY("id"),
	CONSTRAINT "synchronization_connection_results_status_valid" CHECK ("ingestion"."synchronization_connection_results"."status" in ('succeeded', 'partial', 'failed')),
	CONSTRAINT "synchronization_connection_results_counts_nonnegative" CHECK ("ingestion"."synchronization_connection_results"."successful_account_count" >= 0 and "ingestion"."synchronization_connection_results"."failed_account_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ingestion"."synchronization_runs" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"source_instance_id" uuid NOT NULL,
	"action_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"error_kind" text,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "synchronization_runs_pkey" PRIMARY KEY("id"),
	CONSTRAINT "synchronization_runs_id_source_unique" UNIQUE("id","source_instance_id"),
	CONSTRAINT "synchronization_runs_status_valid" CHECK ("ingestion"."synchronization_runs"."status" in ('running', 'succeeded', 'partial', 'failed')),
	CONSTRAINT "synchronization_runs_terminal_shape_valid" CHECK (("ingestion"."synchronization_runs"."status" = 'running' and "ingestion"."synchronization_runs"."finished_at" is null) or ("ingestion"."synchronization_runs"."status" <> 'running' and "ingestion"."synchronization_runs"."finished_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "reconciliation"."account_match_assessments" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"left_external_account_id" uuid NOT NULL,
	"right_external_account_id" uuid NOT NULL,
	"classification" text NOT NULL,
	"evidence" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"conflict_detected_at" timestamp with time zone,
	"first_detected_synchronization_run_id" uuid,
	"last_detected_synchronization_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_match_assessments_pkey" PRIMARY KEY("id"),
	CONSTRAINT "account_match_assessments_ordered_pair" CHECK ("reconciliation"."account_match_assessments"."left_external_account_id"::text < "reconciliation"."account_match_assessments"."right_external_account_id"::text),
	CONSTRAINT "account_match_assessments_classification_valid" CHECK ("reconciliation"."account_match_assessments"."classification" in ('confirmed_duplicate', 'likely_duplicate', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "wealth"."account_policies" (
	"account_id" uuid NOT NULL,
	"inclusion_policy" text DEFAULT 'automatic' NOT NULL,
	"selected_valuation_method" text DEFAULT 'reported' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_policies_pkey" PRIMARY KEY("account_id"),
	CONSTRAINT "account_policies_inclusion_valid" CHECK ("wealth"."account_policies"."inclusion_policy" in ('automatic', 'include', 'exclude')),
	CONSTRAINT "account_policies_valuation_method_valid" CHECK ("wealth"."account_policies"."selected_valuation_method" = 'reported')
);
--> statement-breakpoint
CREATE TABLE "wealth"."snapshot_account_decisions" (
	"snapshot_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"account_name" text,
	"institution_id" uuid,
	"institution_name" text,
	"account_category" text NOT NULL,
	"account_purpose" text NOT NULL,
	"account_management_mode" text NOT NULL,
	"inclusion_policy" text NOT NULL,
	"selected_valuation_method" text NOT NULL,
	"selected_valuation_basis" text,
	"evaluated_valuation_candidate_id" uuid,
	"evaluated_amount" numeric(24, 8),
	"evaluated_currency" text,
	"selected_valuation_effective_at" timestamp with time zone,
	"selected_valuation_recorded_at" timestamp with time zone,
	"latest_data_recorded_at" timestamp with time zone,
	"decision" text NOT NULL,
	"contributed_amount" numeric(24, 8),
	"duplicate_adjusted_amount" numeric(24, 8),
	"duplicate_group_id" uuid,
	"duplicate_role" text DEFAULT 'none' NOT NULL,
	"identity_conflict" boolean DEFAULT false NOT NULL,
	"refresh_uncertain" boolean DEFAULT false NOT NULL,
	CONSTRAINT "snapshot_account_decisions_snapshot_id_account_id_pk" PRIMARY KEY("snapshot_id","account_id"),
	CONSTRAINT "snapshot_account_decisions_decision_valid" CHECK ("wealth"."snapshot_account_decisions"."decision" in ('included', 'excluded_by_policy', 'excluded_business', 'excluded_external_lifecycle', 'excluded_archived', 'excluded_merged', 'missing_selected_valuation', 'unknown_account_category', 'known_unsupported_account', 'missing_currency', 'unsupported_currency')),
	CONSTRAINT "snapshot_account_decisions_category_valid" CHECK ("wealth"."snapshot_account_decisions"."account_category" in ('cash', 'investment', 'unknown')),
	CONSTRAINT "snapshot_account_decisions_purpose_valid" CHECK ("wealth"."snapshot_account_decisions"."account_purpose" in ('personal', 'business', 'unknown')),
	CONSTRAINT "snapshot_account_decisions_management_mode_valid" CHECK ("wealth"."snapshot_account_decisions"."account_management_mode" = 'external'),
	CONSTRAINT "snapshot_account_decisions_inclusion_valid" CHECK ("wealth"."snapshot_account_decisions"."inclusion_policy" in ('automatic', 'include', 'exclude')),
	CONSTRAINT "snapshot_account_decisions_method_valid" CHECK ("wealth"."snapshot_account_decisions"."selected_valuation_method" = 'reported'),
	CONSTRAINT "snapshot_account_decisions_basis_valid" CHECK ("wealth"."snapshot_account_decisions"."selected_valuation_basis" is null or "wealth"."snapshot_account_decisions"."selected_valuation_basis" in ('balance', 'estimated_value')),
	CONSTRAINT "snapshot_account_decisions_currency_valid" CHECK ("wealth"."snapshot_account_decisions"."evaluated_currency" is null or "wealth"."snapshot_account_decisions"."evaluated_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "snapshot_account_decisions_contribution_shape_valid" CHECK (("wealth"."snapshot_account_decisions"."decision" = 'included' and "wealth"."snapshot_account_decisions"."contributed_amount" is not null and "wealth"."snapshot_account_decisions"."evaluated_valuation_candidate_id" is not null) or ("wealth"."snapshot_account_decisions"."decision" <> 'included' and "wealth"."snapshot_account_decisions"."contributed_amount" is null))
);
--> statement-breakpoint
CREATE TABLE "wealth"."snapshots" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"reason" text NOT NULL,
	"causation_id" uuid NOT NULL,
	"action_id" text NOT NULL,
	"synchronization_run_id" uuid,
	"calculation_policy_version" text DEFAULT 'v1' NOT NULL,
	"reporting_currency" text DEFAULT 'EUR' NOT NULL,
	"headline_amount" numeric(24, 8) NOT NULL,
	"duplicate_adjusted_estimate_amount" numeric(24, 8) NOT NULL,
	"likely_duplicate_group_count" integer DEFAULT 0 NOT NULL,
	"is_complete" boolean NOT NULL,
	"contributing_account_count" integer NOT NULL,
	"missing_account_count" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snapshots_pkey" PRIMARY KEY("id"),
	CONSTRAINT "snapshots_reason_valid" CHECK ("wealth"."snapshots"."reason" in ('synchronization', 'account_policy_changed', 'account_reconciliation')),
	CONSTRAINT "snapshots_reason_shape_valid" CHECK (("wealth"."snapshots"."reason" = 'synchronization' and "wealth"."snapshots"."synchronization_run_id" is not null) or ("wealth"."snapshots"."reason" in ('account_policy_changed', 'account_reconciliation') and "wealth"."snapshots"."synchronization_run_id" is null)),
	CONSTRAINT "snapshots_reporting_currency_valid" CHECK ("wealth"."snapshots"."reporting_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "snapshots_counts_nonnegative" CHECK ("wealth"."snapshots"."contributing_account_count" >= 0 and "wealth"."snapshots"."missing_account_count" >= 0 and "wealth"."snapshots"."likely_duplicate_group_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "financial"."account_merges" ADD CONSTRAINT "account_merges_merged_account_id_accounts_id_fk" FOREIGN KEY ("merged_account_id") REFERENCES "financial"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial"."account_merges" ADD CONSTRAINT "account_merges_canonical_account_id_accounts_id_fk" FOREIGN KEY ("canonical_account_id") REFERENCES "financial"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial"."account_valuation_candidates" ADD CONSTRAINT "account_valuation_candidates_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "financial"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial"."accounts" ADD CONSTRAINT "accounts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "financial"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."account_identity_claims" ADD CONSTRAINT "account_identity_claims_external_account_fk" FOREIGN KEY ("external_account_id") REFERENCES "ingestion"."external_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."account_identity_claims" ADD CONSTRAINT "account_identity_claims_first_run_fk" FOREIGN KEY ("first_observed_run_id") REFERENCES "ingestion"."synchronization_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."account_identity_claims" ADD CONSTRAINT "account_identity_claims_last_run_fk" FOREIGN KEY ("last_observed_run_id") REFERENCES "ingestion"."synchronization_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."connections" ADD CONSTRAINT "connections_source_instance_id_source_instances_id_fk" FOREIGN KEY ("source_instance_id") REFERENCES "ingestion"."source_instances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."connections" ADD CONSTRAINT "connections_external_institution_source_fk" FOREIGN KEY ("external_institution_id","source_instance_id") REFERENCES "ingestion"."external_institutions"("id","source_instance_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."external_account_observations" ADD CONSTRAINT "external_account_observations_run_source_fk" FOREIGN KEY ("synchronization_run_id","source_instance_id") REFERENCES "ingestion"."synchronization_runs"("id","source_instance_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."external_account_observations" ADD CONSTRAINT "external_account_observations_account_source_fk" FOREIGN KEY ("external_account_id","source_instance_id") REFERENCES "ingestion"."external_accounts"("id","source_instance_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."external_account_observations" ADD CONSTRAINT "external_account_observations_account_identity_fk" FOREIGN KEY ("external_account_id","account_id") REFERENCES "ingestion"."external_accounts"("id","account_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."external_accounts" ADD CONSTRAINT "external_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "financial"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."external_accounts" ADD CONSTRAINT "external_accounts_source_instance_id_source_instances_id_fk" FOREIGN KEY ("source_instance_id") REFERENCES "ingestion"."source_instances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."external_accounts" ADD CONSTRAINT "external_accounts_connection_source_fk" FOREIGN KEY ("connection_id","source_instance_id") REFERENCES "ingestion"."connections"("id","source_instance_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."external_institutions" ADD CONSTRAINT "external_institutions_source_instance_id_source_instances_id_fk" FOREIGN KEY ("source_instance_id") REFERENCES "ingestion"."source_instances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."external_institutions" ADD CONSTRAINT "external_institutions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "financial"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."reported_account_valuations" ADD CONSTRAINT "reported_valuations_candidate_account_fk" FOREIGN KEY ("valuation_candidate_id","account_id") REFERENCES "financial"."account_valuation_candidates"("id","account_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."reported_account_valuations" ADD CONSTRAINT "reported_valuations_candidate_basis_fk" FOREIGN KEY ("valuation_candidate_id","valuation_basis") REFERENCES "financial"."account_valuation_candidates"("id","valuation_basis") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."reported_account_valuations" ADD CONSTRAINT "reported_valuations_observation_account_fk" FOREIGN KEY ("external_account_observation_id","account_id") REFERENCES "ingestion"."external_account_observations"("id","account_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."synchronization_account_results" ADD CONSTRAINT "sync_account_results_run_source_fk" FOREIGN KEY ("synchronization_run_id","source_instance_id") REFERENCES "ingestion"."synchronization_runs"("id","source_instance_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."synchronization_account_results" ADD CONSTRAINT "sync_account_results_external_account_source_fk" FOREIGN KEY ("external_account_id","source_instance_id") REFERENCES "ingestion"."external_accounts"("id","source_instance_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."synchronization_account_results" ADD CONSTRAINT "sync_account_results_observation_provenance_fk" FOREIGN KEY ("external_account_observation_id","synchronization_run_id","external_account_id","source_instance_id") REFERENCES "ingestion"."external_account_observations"("id","synchronization_run_id","external_account_id","source_instance_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."synchronization_connection_results" ADD CONSTRAINT "sync_connection_results_run_source_fk" FOREIGN KEY ("synchronization_run_id","source_instance_id") REFERENCES "ingestion"."synchronization_runs"("id","source_instance_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."synchronization_connection_results" ADD CONSTRAINT "sync_connection_results_connection_source_fk" FOREIGN KEY ("connection_id","source_instance_id") REFERENCES "ingestion"."connections"("id","source_instance_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion"."synchronization_runs" ADD CONSTRAINT "synchronization_runs_source_instance_id_source_instances_id_fk" FOREIGN KEY ("source_instance_id") REFERENCES "ingestion"."source_instances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation"."account_match_assessments" ADD CONSTRAINT "account_matches_left_external_account_fk" FOREIGN KEY ("left_external_account_id") REFERENCES "ingestion"."external_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation"."account_match_assessments" ADD CONSTRAINT "account_matches_right_external_account_fk" FOREIGN KEY ("right_external_account_id") REFERENCES "ingestion"."external_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation"."account_match_assessments" ADD CONSTRAINT "account_matches_first_synchronization_run_fk" FOREIGN KEY ("first_detected_synchronization_run_id") REFERENCES "ingestion"."synchronization_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation"."account_match_assessments" ADD CONSTRAINT "account_matches_last_synchronization_run_fk" FOREIGN KEY ("last_detected_synchronization_run_id") REFERENCES "ingestion"."synchronization_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wealth"."account_policies" ADD CONSTRAINT "account_policies_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "financial"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wealth"."snapshot_account_decisions" ADD CONSTRAINT "snapshot_account_decisions_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "wealth"."snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wealth"."snapshot_account_decisions" ADD CONSTRAINT "snapshot_account_decisions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "financial"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wealth"."snapshot_account_decisions" ADD CONSTRAINT "snapshot_account_decisions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "financial"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wealth"."snapshot_account_decisions" ADD CONSTRAINT "snapshot_decisions_valuation_candidate_fk" FOREIGN KEY ("evaluated_valuation_candidate_id") REFERENCES "financial"."account_valuation_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wealth"."snapshots" ADD CONSTRAINT "snapshots_synchronization_run_id_synchronization_runs_id_fk" FOREIGN KEY ("synchronization_run_id") REFERENCES "ingestion"."synchronization_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_merges_canonical_account_idx" ON "financial"."account_merges" USING btree ("canonical_account_id");--> statement-breakpoint
CREATE INDEX "account_valuation_candidates_selection_idx" ON "financial"."account_valuation_candidates" USING btree ("account_id","valuation_method","valuation_basis","effective_at","recorded_at");--> statement-breakpoint
CREATE INDEX "accounts_institution_idx" ON "financial"."accounts" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_identity_claims_value_unique" ON "ingestion"."account_identity_claims" USING btree ("external_account_id","claim_type","key_version","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "account_identity_claims_current_unique" ON "ingestion"."account_identity_claims" USING btree ("external_account_id","claim_type","key_version") WHERE "ingestion"."account_identity_claims"."is_current";--> statement-breakpoint
CREATE INDEX "account_identity_claims_lookup_idx" ON "ingestion"."account_identity_claims" USING btree ("claim_type","key_version","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_source_external_unique" ON "ingestion"."connections" USING btree ("source_instance_id","external_id");--> statement-breakpoint
CREATE INDEX "connections_external_institution_idx" ON "ingestion"."connections" USING btree ("external_institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_account_observations_run_account_unique" ON "ingestion"."external_account_observations" USING btree ("synchronization_run_id","external_account_id");--> statement-breakpoint
CREATE INDEX "external_account_observations_external_account_time_idx" ON "ingestion"."external_account_observations" USING btree ("external_account_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "external_accounts_source_external_unique" ON "ingestion"."external_accounts" USING btree ("source_instance_id","external_id");--> statement-breakpoint
CREATE INDEX "external_accounts_account_idx" ON "ingestion"."external_accounts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "external_accounts_connection_idx" ON "ingestion"."external_accounts" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_institutions_source_external_unique" ON "ingestion"."external_institutions" USING btree ("source_instance_id","external_id");--> statement-breakpoint
CREATE INDEX "external_institutions_institution_idx" ON "ingestion"."external_institutions" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reported_account_valuations_observation_basis_unique" ON "ingestion"."reported_account_valuations" USING btree ("external_account_observation_id","valuation_basis");--> statement-breakpoint
CREATE UNIQUE INDEX "source_instances_source_key_unique" ON "ingestion"."source_instances" USING btree ("source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "source_instances_adapter_subject_unique" ON "ingestion"."source_instances" USING btree ("adapter_key","external_subject_id") WHERE "ingestion"."source_instances"."external_subject_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "synchronization_account_results_run_account_unique" ON "ingestion"."synchronization_account_results" USING btree ("synchronization_run_id","external_account_id");--> statement-breakpoint
CREATE INDEX "synchronization_account_results_account_finished_idx" ON "ingestion"."synchronization_account_results" USING btree ("external_account_id","finished_at");--> statement-breakpoint
CREATE UNIQUE INDEX "synchronization_connection_results_run_connection_unique" ON "ingestion"."synchronization_connection_results" USING btree ("synchronization_run_id","connection_id");--> statement-breakpoint
CREATE INDEX "synchronization_connection_results_connection_finished_idx" ON "ingestion"."synchronization_connection_results" USING btree ("connection_id","finished_at");--> statement-breakpoint
CREATE UNIQUE INDEX "synchronization_runs_source_running_unique" ON "ingestion"."synchronization_runs" USING btree ("source_instance_id") WHERE "ingestion"."synchronization_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "synchronization_runs_source_started_idx" ON "ingestion"."synchronization_runs" USING btree ("source_instance_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "account_match_assessments_pair_unique" ON "reconciliation"."account_match_assessments" USING btree ("left_external_account_id","right_external_account_id");--> statement-breakpoint
CREATE INDEX "account_match_assessments_right_account_idx" ON "reconciliation"."account_match_assessments" USING btree ("right_external_account_id");--> statement-breakpoint
CREATE INDEX "snapshot_account_decisions_account_idx" ON "wealth"."snapshot_account_decisions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "snapshot_account_decisions_candidate_idx" ON "wealth"."snapshot_account_decisions" USING btree ("evaluated_valuation_candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshots_causation_unique" ON "wealth"."snapshots" USING btree ("causation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshots_synchronization_run_unique" ON "wealth"."snapshots" USING btree ("synchronization_run_id") WHERE "wealth"."snapshots"."synchronization_run_id" is not null;--> statement-breakpoint
CREATE INDEX "snapshots_recorded_idx" ON "wealth"."snapshots" USING btree ("recorded_at");