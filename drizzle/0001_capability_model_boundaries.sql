-- Separate durable reconciliation state from provider ingestion while keeping
-- synchronization provenance optional for independently triggered runs.
CREATE SCHEMA IF NOT EXISTS "reconciliation";--> statement-breakpoint
ALTER TABLE "ingestion"."account_match_assessments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ingestion"."account_match_assessments" SET SCHEMA "reconciliation";
--> statement-breakpoint
ALTER TABLE "reconciliation"."account_match_assessments" RENAME COLUMN "first_detected_run_id" TO "first_detected_synchronization_run_id";--> statement-breakpoint
ALTER TABLE "reconciliation"."account_match_assessments" RENAME COLUMN "last_detected_run_id" TO "last_detected_synchronization_run_id";--> statement-breakpoint
ALTER TABLE "reconciliation"."account_match_assessments" ALTER COLUMN "first_detected_synchronization_run_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reconciliation"."account_match_assessments" ALTER COLUMN "last_detected_synchronization_run_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reconciliation"."account_match_assessments" RENAME CONSTRAINT "account_matches_first_run_fk" TO "account_matches_first_synchronization_run_fk";--> statement-breakpoint
ALTER TABLE "reconciliation"."account_match_assessments" RENAME CONSTRAINT "account_matches_last_run_fk" TO "account_matches_last_synchronization_run_fk";--> statement-breakpoint
ALTER TABLE "wealth"."snapshots" DROP CONSTRAINT "snapshots_reason_valid";--> statement-breakpoint
ALTER TABLE "wealth"."snapshots" DROP CONSTRAINT "snapshots_reason_shape_valid";--> statement-breakpoint
ALTER TABLE "wealth"."snapshots" ADD CONSTRAINT "snapshots_reason_valid" CHECK ("wealth"."snapshots"."reason" in ('synchronization', 'account_policy_changed', 'account_reconciliation'));--> statement-breakpoint
ALTER TABLE "wealth"."snapshots" ADD CONSTRAINT "snapshots_reason_shape_valid" CHECK (("wealth"."snapshots"."reason" = 'synchronization' and "wealth"."snapshots"."synchronization_run_id" is not null) or ("wealth"."snapshots"."reason" in ('account_policy_changed', 'account_reconciliation') and "wealth"."snapshots"."synchronization_run_id" is null));
