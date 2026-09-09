import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import type { Wealth } from "@/features/wealth/lib/dashboard-model";
import { formatMoney } from "@/features/wealth/lib/format";

export function DataNotices({ wealth }: { wealth: Wealth }) {
  const hasPossibleOverlap = wealth.likelyDuplicateGroupCount > 0;
  if (wealth.isComplete && !hasPossibleOverlap) return null;

  return (
    <aside aria-label="Data notes" className="mt-4 grid gap-3">
      {!wealth.isComplete ? (
        <Banner
          actions={
            <Button href="#account-signals" size="small" type="secondary">
              Review account status
            </Button>
          }
          description="Accounts without a usable value remain visible, and unknown values are never counted as zero."
          title="Completeness"
          type="critical"
        />
      ) : null}
      {hasPossibleOverlap ? (
        <Banner
          actions={
            <Button href="#account-signals" size="small" type="secondary">
              Review possible overlaps
            </Button>
          }
          description={
            <>
              Adjusted estimate {formatMoney(wealth.duplicateAdjustedEstimateAmount)} ·
              possible range {formatMoney(wealth.possibleTotalMinimum)}–
              {formatMoney(wealth.possibleTotalMaximum)}.
            </>
          }
          title="Possible overlap"
          type="caution"
        />
      ) : null}
    </aside>
  );
}
