import { buildCurrentWealthView, type CurrentWealth } from "../current-wealth";
import { loadCurrentWealthState } from "../internal/load-current-wealth-state";

export async function getCurrentWealth(
  now = new Date(),
): Promise<CurrentWealth> {
  return buildCurrentWealthView(await loadCurrentWealthState(), now);
}
