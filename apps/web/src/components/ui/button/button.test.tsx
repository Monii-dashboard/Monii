import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Button } from ".";

describe("Button", () => {
  test("renders a medium native button by default", () => {
    const markup = renderToStaticMarkup(<Button type="primary">Save</Button>);

    expect(markup).toContain('<button class="');
    expect(markup).toContain("min-h-10");
    expect(markup).toContain('type="button"');
    expect(markup).toContain(">Save</button>");
  });

  test("forwards form, submit, autofocus, and disabled attributes", () => {
    const markup = renderToStaticMarkup(
      <Button autoFocus behavior="submit" disabled form="profile" type="secondary">
        Submit
      </Button>,
    );

    expect(markup).toContain('autofocus=""');
    expect(markup).toContain('form="profile"');
    expect(markup).toContain('type="submit"');
    expect(markup).toContain('disabled=""');
  });

  test("renders an anchor with its href and requested size", () => {
    const markup = renderToStaticMarkup(
      <Button href="/accounts" size="large" type="secondary">
        Accounts
      </Button>,
    );

    expect(markup).toContain('<a class="');
    expect(markup).toContain('href="/accounts"');
    expect(markup).toContain("min-h-12");
  });

  test("marks pending buttons disabled and pending links aria-disabled and untabbable", () => {
    const buttonMarkup = renderToStaticMarkup(
      <Button pending type="primary">
        Saving
      </Button>,
    );
    const linkMarkup = renderToStaticMarkup(
      <Button href="/accounts" pending type="primary">
        Loading
      </Button>,
    );

    expect(buttonMarkup).toContain('aria-busy="true"');
    expect(buttonMarkup).toContain('disabled=""');
    expect(buttonMarkup).toContain("animate-spin");
    expect(linkMarkup).toContain('aria-disabled="true"');
    expect(linkMarkup).toContain('tabindex="-1"');
  });
});
