CREATE TABLE "account_identity_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_source_reference_id" uuid NOT NULL,
	"claim_type" text NOT NULL,
	"key_version" text NOT NULL,
	"fingerprint" text NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"first_seen_run_id" uuid NOT NULL,
	"last_seen_run_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_identity_claims_type_valid" CHECK ("account_identity_claims"."claim_type" in ('iban', 'account_number', 'source_name'))
);
--> statement-breakpoint
CREATE TABLE "account_identity_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"left_account_source_reference_id" uuid NOT NULL,
	"right_account_source_reference_id" uuid NOT NULL,
	"classification" text NOT NULL,
	"evidence" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"conflict_detected_at" timestamp with time zone,
	"first_detected_run_id" uuid NOT NULL,
	"last_detected_run_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_identity_matches_ordered_pair" CHECK ("account_identity_matches"."left_account_source_reference_id"::text < "account_identity_matches"."right_account_source_reference_id"::text),
	CONSTRAINT "account_identity_matches_classification_valid" CHECK ("account_identity_matches"."classification" in ('confirmed_duplicate', 'likely_duplicate', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "account_sync_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synchronization_run_id" uuid NOT NULL,
	"account_source_reference_id" uuid NOT NULL,
	"account_observation_id" uuid,
	"status" text NOT NULL,
	"error_kind" text,
	"error_code" text,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_sync_results_status_valid" CHECK ("account_sync_results"."status" in ('succeeded', 'provider_error', 'malformed', 'not_seen')),
	CONSTRAINT "account_sync_results_observation_shape_valid" CHECK (("account_sync_results"."status" = 'succeeded' and "account_sync_results"."account_observation_id" is not null) or ("account_sync_results"."status" <> 'succeeded' and "account_sync_results"."account_observation_id" is null))
);
--> statement-breakpoint
ALTER TABLE "connection_sync_results" DROP CONSTRAINT "connection_sync_results_status_valid";--> statement-breakpoint
ALTER TABLE "wealth_snapshot_contributions" DROP CONSTRAINT "wealth_snapshot_contributions_decision_valid";--> statement-breakpoint
ALTER TABLE "wealth_snapshots" DROP CONSTRAINT "wealth_snapshots_counts_nonnegative";--> statement-breakpoint
DROP INDEX "account_source_references_preferred_unique";--> statement-breakpoint
ALTER TABLE "connection_sync_results" ADD COLUMN "source_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_sync_results" ADD COLUMN "source_next_try_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connection_sync_results" ADD COLUMN "successful_account_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_sync_results" ADD COLUMN "failed_account_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "merged_into_account_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "merged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "merge_reason" text;--> statement-breakpoint
ALTER TABLE "wealth_snapshot_contributions" ADD COLUMN "adjusted_amount" numeric(24, 8);--> statement-breakpoint
ALTER TABLE "wealth_snapshot_contributions" ADD COLUMN "duplicate_role" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "wealth_snapshot_contributions" ADD COLUMN "reported_amount" numeric(24, 8);--> statement-breakpoint
ALTER TABLE "wealth_snapshot_contributions" ADD COLUMN "reported_currency" text;--> statement-breakpoint
ALTER TABLE "wealth_snapshot_contributions" ADD COLUMN "identity_conflict" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "wealth_snapshots" ADD COLUMN "candidate_adjusted_total_amount" numeric(24, 8);--> statement-breakpoint
ALTER TABLE "wealth_snapshots" ADD COLUMN "likely_duplicate_group_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "account_identity_claims" ADD CONSTRAINT "account_identity_claims_account_source_reference_id_account_source_references_id_fk" FOREIGN KEY ("account_source_reference_id") REFERENCES "public"."account_source_references"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_identity_claims" ADD CONSTRAINT "account_identity_claims_first_seen_run_id_synchronization_runs_id_fk" FOREIGN KEY ("first_seen_run_id") REFERENCES "public"."synchronization_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_identity_claims" ADD CONSTRAINT "account_identity_claims_last_seen_run_id_synchronization_runs_id_fk" FOREIGN KEY ("last_seen_run_id") REFERENCES "public"."synchronization_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_identity_matches" ADD CONSTRAINT "account_identity_matches_left_account_source_reference_id_account_source_references_id_fk" FOREIGN KEY ("left_account_source_reference_id") REFERENCES "public"."account_source_references"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_identity_matches" ADD CONSTRAINT "account_identity_matches_right_account_source_reference_id_account_source_references_id_fk" FOREIGN KEY ("right_account_source_reference_id") REFERENCES "public"."account_source_references"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_identity_matches" ADD CONSTRAINT "account_identity_matches_first_detected_run_id_synchronization_runs_id_fk" FOREIGN KEY ("first_detected_run_id") REFERENCES "public"."synchronization_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_identity_matches" ADD CONSTRAINT "account_identity_matches_last_detected_run_id_synchronization_runs_id_fk" FOREIGN KEY ("last_detected_run_id") REFERENCES "public"."synchronization_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_sync_results" ADD CONSTRAINT "account_sync_results_synchronization_run_id_synchronization_runs_id_fk" FOREIGN KEY ("synchronization_run_id") REFERENCES "public"."synchronization_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_sync_results" ADD CONSTRAINT "account_sync_results_account_source_reference_id_account_source_references_id_fk" FOREIGN KEY ("account_source_reference_id") REFERENCES "public"."account_source_references"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_sync_results" ADD CONSTRAINT "account_sync_results_account_observation_id_account_observations_id_fk" FOREIGN KEY ("account_observation_id") REFERENCES "public"."account_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_identity_claims_value_unique" ON "account_identity_claims" USING btree ("account_source_reference_id","claim_type","key_version","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "account_identity_claims_current_unique" ON "account_identity_claims" USING btree ("account_source_reference_id","claim_type","key_version") WHERE "account_identity_claims"."is_current";--> statement-breakpoint
CREATE INDEX "account_identity_claims_lookup_idx" ON "account_identity_claims" USING btree ("claim_type","key_version","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "account_identity_matches_pair_unique" ON "account_identity_matches" USING btree ("left_account_source_reference_id","right_account_source_reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_sync_results_run_reference_unique" ON "account_sync_results" USING btree ("synchronization_run_id","account_source_reference_id");--> statement-breakpoint
CREATE INDEX "account_sync_results_reference_finished_idx" ON "account_sync_results" USING btree ("account_source_reference_id","finished_at");--> statement-breakpoint
INSERT INTO "account_sync_results" (
	"synchronization_run_id",
	"account_source_reference_id",
	"account_observation_id",
	"status",
	"error_kind",
	"error_code",
	"finished_at"
)
SELECT
	"synchronization_run_id",
	"account_source_reference_id",
	CASE WHEN "source_error_code" IS NULL THEN "id" ELSE NULL END,
	CASE WHEN "source_error_code" IS NULL THEN 'succeeded' ELSE 'provider_error' END,
	CASE WHEN "source_error_code" IS NULL THEN NULL ELSE 'provider_account' END,
	"source_error_code",
	"retrieved_at"
FROM "account_observations";--> statement-breakpoint
UPDATE "wealth_snapshots"
SET "candidate_adjusted_total_amount" = "known_total_amount";--> statement-breakpoint
ALTER TABLE "wealth_snapshots"
ALTER COLUMN "candidate_adjusted_total_amount" SET NOT NULL;--> statement-breakpoint
UPDATE "wealth_snapshot_contributions"
SET
	"adjusted_amount" = "amount",
	"reported_amount" = "amount",
	"reported_currency" = CASE WHEN "amount" IS NULL THEN NULL ELSE 'EUR' END;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_merged_into_account_id_financial_accounts_id_fk" FOREIGN KEY ("merged_into_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "synchronization_runs_source_running_unique" ON "synchronization_runs" USING btree ("data_source_id") WHERE "synchronization_runs"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "wealth_snapshots_sync_run_unique" ON "wealth_snapshots" USING btree ("synchronization_run_id") WHERE "wealth_snapshots"."synchronization_run_id" is not null;--> statement-breakpoint
ALTER TABLE "account_observations" DROP COLUMN "source_error_code";--> statement-breakpoint
ALTER TABLE "account_source_references" DROP COLUMN "is_preferred";--> statement-breakpoint
ALTER TABLE "connection_sync_results" ADD CONSTRAINT "connection_sync_results_counts_nonnegative" CHECK ("connection_sync_results"."successful_account_count" >= 0 and "connection_sync_results"."failed_account_count" >= 0);--> statement-breakpoint
ALTER TABLE "connection_sync_results" ADD CONSTRAINT "connection_sync_results_status_valid" CHECK ("connection_sync_results"."status" in ('succeeded', 'partial', 'failed'));--> statement-breakpoint
ALTER TABLE "wealth_snapshot_contributions" ADD CONSTRAINT "wealth_snapshot_contributions_duplicate_role_valid" CHECK ("wealth_snapshot_contributions"."duplicate_role" in ('none', 'representative', 'excluded_from_adjusted'));--> statement-breakpoint
ALTER TABLE "wealth_snapshot_contributions" ADD CONSTRAINT "wealth_snapshot_contributions_decision_valid" CHECK ("wealth_snapshot_contributions"."decision" in ('contributing', 'excluded_operator', 'excluded_professional', 'excluded_source', 'missing_value', 'unknown_type', 'unsupported', 'unsupported_currency'));--> statement-breakpoint
ALTER TABLE "wealth_snapshots" ADD CONSTRAINT "wealth_snapshots_counts_nonnegative" CHECK ("wealth_snapshots"."contributing_account_count" >= 0 and "wealth_snapshots"."missing_account_count" >= 0 and "wealth_snapshots"."likely_duplicate_group_count" >= 0);
