/**
 * A decorative separator that follows its parent flex container's main axis.
 * In a column it is horizontal; in a row it is vertical.
 */
export function Divider() {
  return (
    <div
      aria-hidden="true"
      className="block self-stretch bg-border-default [flex:0_0_1px]"
    />
  );
}
