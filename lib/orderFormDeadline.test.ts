import { describe, expect, it } from "vitest";
import {
  isFormExpired,
  renderCaptainClosureEmail,
  renderOpsClosureEmail,
} from "./orderFormDeadline";

const NOW = Date.parse("2026-05-22T12:00:00.000Z");

describe("isFormExpired", () => {
  it("returns true for an open run past its deadline", () => {
    expect(
      isFormExpired({ status: "open", deadline: NOW - 1 }, NOW),
    ).toBe(true);
  });

  it("returns false for an open run with a future deadline", () => {
    expect(
      isFormExpired({ status: "open", deadline: NOW + 1000 }, NOW),
    ).toBe(false);
  });

  it("returns false for an already-closed run regardless of deadline", () => {
    expect(
      isFormExpired({ status: "closed", deadline: NOW - 1 }, NOW),
    ).toBe(false);
  });

  it("returns false when deadline equals now (still has the moment)", () => {
    expect(isFormExpired({ status: "open", deadline: NOW }, NOW)).toBe(false);
  });
});

describe("renderCaptainClosureEmail", () => {
  const baseCtx = {
    teamName: "Vancouver Voyagers",
    captainName: "Alex Chen",
    responseCount: 14,
    deadline: Date.parse("2026-06-15T07:00:00.000Z"),
    dashboardUrl: "https://sidestep.design/portal/orders/abc/run/responses",
  };

  it("uses the team name in the subject", () => {
    const email = renderCaptainClosureEmail(baseCtx);
    expect(email.subject).toContain("Vancouver Voyagers");
    expect(email.subject).toContain("closed");
  });

  it("greets the captain by name", () => {
    const email = renderCaptainClosureEmail(baseCtx);
    expect(email.text).toContain("Hi Alex Chen,");
    expect(email.html).toContain("Hi Alex Chen,");
  });

  it("falls back to 'there' when no captain name is available", () => {
    const email = renderCaptainClosureEmail({ ...baseCtx, captainName: "" });
    expect(email.text).toContain("Hi there,");
  });

  it("includes the response count with correct pluralization", () => {
    const plural = renderCaptainClosureEmail(baseCtx);
    expect(plural.text).toContain("14 people submitted");
    const singular = renderCaptainClosureEmail({ ...baseCtx, responseCount: 1 });
    expect(singular.text).toContain("1 person submitted");
    const none = renderCaptainClosureEmail({ ...baseCtx, responseCount: 0 });
    expect(none.text).toContain("0 people submitted");
  });

  it("links to the captain dashboard", () => {
    const email = renderCaptainClosureEmail(baseCtx);
    expect(email.text).toContain(baseCtx.dashboardUrl);
    expect(email.html).toContain(baseCtx.dashboardUrl);
  });

  it("escapes HTML in untrusted fields", () => {
    const email = renderCaptainClosureEmail({
      ...baseCtx,
      teamName: "<script>alert(1)</script>",
      captainName: "Alex \"the kid\"",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("Alex &quot;the kid&quot;");
  });
});

describe("renderOpsClosureEmail", () => {
  const baseCtx = {
    teamName: "Vancouver Voyagers",
    captainName: "Alex Chen",
    responseCount: 14,
    deadline: Date.parse("2026-06-15T07:00:00.000Z"),
    dashboardUrl: "https://sidestep.design/portal/orders/abc/run/responses",
  };

  it("flags the email with a bracketed subject", () => {
    const email = renderOpsClosureEmail(baseCtx);
    expect(email.subject).toBe("[Jersey run closed] Vancouver Voyagers");
  });

  it("lists captain, deadline, and response count in the body", () => {
    const email = renderOpsClosureEmail(baseCtx);
    expect(email.text).toContain("Alex Chen");
    expect(email.text).toContain("Responses: 14");
  });

  it("uses 'Unknown captain' when captain name is empty", () => {
    const email = renderOpsClosureEmail({ ...baseCtx, captainName: "" });
    expect(email.text).toContain("Unknown captain");
  });
});
