// L-05 §2/§3 (initiative 0004): the captain closure email talks about the
// order form and links to the order page (Q6 = A). Exact wording is left to
// review, not pinned here.
import { describe, expect, it } from "vitest";
import { renderCaptainClosureEmail } from "./jerseyRunDeadline";

const url = "https://sidestep.design/portal/orders/abc";
const ctx = {
  teamName: "Vancouver Voyagers",
  captainName: "Alex Chen",
  responseCount: 14,
  deadline: Date.parse("2026-06-15T07:00:00.000Z"),
  dashboardUrl: url,
};

describe("renderCaptainClosureEmail (L-05)", () => {
  it("says 'order form', not 'jersey run', in the subject and body", () => {
    const email = renderCaptainClosureEmail(ctx);
    for (const part of [email.subject, email.text, email.html]) {
      expect(part).toMatch(/order form/i);
      expect(part).not.toMatch(/jersey run/i);
    }
  });

  it("links to the order page in both text and html", () => {
    const email = renderCaptainClosureEmail(ctx);
    expect(email.text).toContain(url);
    expect(email.html).toContain(`href="${url}"`);
  });
});
