import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Divider } from "./divider";

describe("Divider", () => {
  test("renders as a decorative flex-axis separator", () => {
    const markup = renderToStaticMarkup(<Divider />);

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("block");
    expect(markup).toContain("self-stretch");
    expect(markup).toContain("[flex:0_0_1px]");
  });
});
