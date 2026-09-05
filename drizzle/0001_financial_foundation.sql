CREATE TABLE "account_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synchronization_run_id" uuid NOT NULL,
	"account_source_reference_id" uuid NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_valid_at" timestamp with time zone,
	"source_lifecycle" text NOT NULL,
	"source_error_code" text,
	"currency" text,
	"balance_amount" numeric(24, 8),
	"estimated_value_amount" numeric(24, 8),
	CONSTRAINT "account_observations_source_lifecycle_valid" CHECK ("account_observations"."source_lifecycle" in ('active', 'disabled', 'deleted', 'unknown')),
	CONSTRAINT "account_observations_currency_valid" CHECK ("account_observations"."currency" is null or "account_observations"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "account_source_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"data_source_id" uuid NOT NULL,
	"source_connection_id" uuid,
	"external_id" text NOT NULL,
	"source_name" text NOT NULL,
	"source_type" text,
	"lifecycle" text DEFAULT 'unknown' NOT NULL,
	"lifecycle_changed_at" timestamp with time zone,
	"is_preferred" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_source_references_lifecycle_valid" CHECK ("account_source_references"."lifecycle" in ('active', 'disabled', 'deleted', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "connection_sync_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synchronization_run_id" uuid NOT NULL,
	"source_connection_id" uuid NOT NULL,
	"status" text NOT NULL,
	"source_state" text,
	"source_updated_at" timestamp with time zone,
	"error_kind" text,
	"error_code" text,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_sync_results_status_valid" CHECK ("connection_sync_results"."status" in ('succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"display_name" text NOT NULL,
	"external_subject_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_sources_key_not_blank" CHECK (length(trim("data_sources"."key")) > 0),
	CONSTRAINT "data_sources_kind_not_blank" CHECK (length(trim("data_sources"."kind")) > 0)
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"kind" text NOT NULL,
	"usage" text NOT NULL,
	"wealth_inclusion" text DEFAULT 'automatic' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_accounts_kind_valid" CHECK ("financial_accounts"."kind" in ('cash', 'investment', 'unsupported', 'unknown')),
	CONSTRAINT "financial_accounts_usage_valid" CHECK ("financial_accounts"."usage" in ('private', 'professional', 'unknown')),
	CONSTRAINT "financial_accounts_wealth_inclusion_valid" CHECK ("financial_accounts"."wealth_inclusion" in ('automatic', 'include', 'exclude'))
);
--> statement-breakpoint
CREATE TABLE "institution_source_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"data_source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"source_name" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institution_source_references_external_id_not_blank" CHECK (length(trim("institution_source_references"."external_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_display_name_not_blank" CHECK (length(trim("institutions"."display_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "source_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_source_id" uuid NOT NULL,
	"institution_source_reference_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_connections_external_id_not_blank" CHECK (length(trim("source_connections"."external_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "synchronization_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_source_id" uuid NOT NULL,
	"action_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"error_kind" text,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "synchronization_runs_status_valid" CHECK ("synchronization_runs"."status" in ('running', 'succeeded', 'partial', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "wealth_snapshot_contributions" (
	"wealth_snapshot_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"latest_observation_id" uuid,
	"value_observation_id" uuid,
	"decision" text NOT NULL,
	"basis" text,
	"amount" numeric(24, 8),
	CONSTRAINT "wealth_snapshot_contributions_wealth_snapshot_id_account_id_pk" PRIMARY KEY("wealth_snapshot_id","account_id"),
	CONSTRAINT "wealth_snapshot_contributions_decision_valid" CHECK ("wealth_snapshot_contributions"."decision" in ('contributing', 'excluded_operator', 'excluded_professional', 'excluded_source', 'missing_value', 'unknown_type', 'unsupported')),
	CONSTRAINT "wealth_snapshot_contributions_basis_valid" CHECK ("wealth_snapshot_contributions"."basis" is null or "wealth_snapshot_contributions"."basis" in ('balance', 'estimated_value')),
	CONSTRAINT "wealth_snapshot_contributions_value_shape_valid" CHECK ((
        "wealth_snapshot_contributions"."decision" = 'contributing'
        and "wealth_snapshot_contributions"."amount" is not null
        and "wealth_snapshot_contributions"."basis" is not null
        and "wealth_snapshot_contributions"."value_observation_id" is not null
      ) or (
        "wealth_snapshot_contributions"."decision" <> 'contributing'
        and "wealth_snapshot_contributions"."amount" is null
        and "wealth_snapshot_contributions"."basis" is null
        and "wealth_snapshot_contributions"."value_observation_id" is null
      ))
);
--> statement-breakpoint
CREATE TABLE "wealth_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" text NOT NULL,
	"synchronization_run_id" uuid,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"known_total_amount" numeric(24, 8) NOT NULL,
	"is_complete" boolean NOT NULL,
	"contributing_account_count" integer NOT NULL,
	"missing_account_count" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wealth_snapshots_trigger_valid" CHECK ("wealth_snapshots"."trigger" in ('sync', 'inclusion_change')),
	CONSTRAINT "wealth_snapshots_currency_eur" CHECK ("wealth_snapshots"."currency" = 'EUR'),
	CONSTRAINT "wealth_snapshots_counts_nonnegative" CHECK ("wealth_snapshots"."contributing_account_count" >= 0 and "wealth_snapshots"."missing_account_count" >= 0)
);
--> statement-breakpoint
DROP TABLE "dummy";--> statement-breakpoint
ALTER TABLE "account_observations" ADD CONSTRAINT "account_observations_synchronization_run_id_synchronization_runs_id_fk" FOREIGN KEY ("synchronization_run_id") REFERENCES "public"."synchronization_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_observations" ADD CONSTRAINT "account_observations_account_source_reference_id_account_source_references_id_fk" FOREIGN KEY ("account_source_reference_id") REFERENCES "public"."account_source_references"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_source_references" ADD CONSTRAINT "account_source_references_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_source_references" ADD CONSTRAINT "account_source_references_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_source_references" ADD CONSTRAINT "account_source_references_source_connection_id_source_connections_id_fk" FOREIGN KEY ("source_connection_id") REFERENCES "public"."source_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_sync_results" ADD CONSTRAINT "connection_sync_results_synchronization_run_id_synchronization_runs_id_fk" FOREIGN KEY ("synchronization_run_id") REFERENCES "public"."synchronization_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_sync_results" ADD CONSTRAINT "connection_sync_results_source_connection_id_source_connections_id_fk" FOREIGN KEY ("source_connection_id") REFERENCES "public"."source_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_source_references" ADD CONSTRAINT "institution_source_references_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_source_references" ADD CONSTRAINT "institution_source_references_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_connections" ADD CONSTRAINT "source_connections_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_connections" ADD CONSTRAINT "source_connections_institution_source_reference_id_institution_source_references_id_fk" FOREIGN KEY ("institution_source_reference_id") REFERENCES "public"."institution_source_references"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synchronization_runs" ADD CONSTRAINT "synchronization_runs_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wealth_snapshot_contributions" ADD CONSTRAINT "wealth_snapshot_contributions_wealth_snapshot_id_wealth_snapshots_id_fk" FOREIGN KEY ("wealth_snapshot_id") REFERENCES "public"."wealth_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wealth_snapshot_contributions" ADD CONSTRAINT "wealth_snapshot_contributions_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wealth_snapshot_contributions" ADD CONSTRAINT "wealth_snapshot_contributions_latest_observation_id_account_observations_id_fk" FOREIGN KEY ("latest_observation_id") REFERENCES "public"."account_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wealth_snapshot_contributions" ADD CONSTRAINT "wealth_snapshot_contributions_value_observation_id_account_observations_id_fk" FOREIGN KEY ("value_observation_id") REFERENCES "public"."account_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wealth_snapshots" ADD CONSTRAINT "wealth_snapshots_synchronization_run_id_synchronization_runs_id_fk" FOREIGN KEY ("synchronization_run_id") REFERENCES "public"."synchronization_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_observations_run_reference_unique" ON "account_observations" USING btree ("synchronization_run_id","account_source_reference_id");--> statement-breakpoint
CREATE INDEX "account_observations_reference_retrieved_idx" ON "account_observations" USING btree ("account_source_reference_id","retrieved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "account_source_references_external_unique" ON "account_source_references" USING btree ("data_source_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_source_references_preferred_unique" ON "account_source_references" USING btree ("account_id") WHERE "account_source_references"."is_preferred";--> statement-breakpoint
CREATE INDEX "account_source_references_connection_idx" ON "account_source_references" USING btree ("source_connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connection_sync_results_run_connection_unique" ON "connection_sync_results" USING btree ("synchronization_run_id","source_connection_id");--> statement-breakpoint
CREATE INDEX "connection_sync_results_connection_finished_idx" ON "connection_sync_results" USING btree ("source_connection_id","finished_at");--> statement-breakpoint
CREATE UNIQUE INDEX "data_sources_key_unique" ON "data_sources" USING btree ("key");--> statement-breakpoint
CREATE INDEX "financial_accounts_institution_idx" ON "financial_accounts" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "institution_source_references_external_unique" ON "institution_source_references" USING btree ("data_source_id","external_id");--> statement-breakpoint
CREATE INDEX "institution_source_references_institution_idx" ON "institution_source_references" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_connections_external_unique" ON "source_connections" USING btree ("data_source_id","external_id");--> statement-breakpoint
CREATE INDEX "source_connections_institution_reference_idx" ON "source_connections" USING btree ("institution_source_reference_id");--> statement-breakpoint
CREATE INDEX "synchronization_runs_source_started_idx" ON "synchronization_runs" USING btree ("data_source_id","started_at");--> statement-breakpoint
CREATE INDEX "wealth_snapshot_contributions_account_idx" ON "wealth_snapshot_contributions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "wealth_snapshots_recorded_idx" ON "wealth_snapshots" USING btree ("recorded_at");
