// R3-04 acceptance tests (initiative 0004): `sendersOf` says how a named
// sender's lines arrived, so "Sizes added by" can end a line with
// ", through the order form" or ", from a pasted list". Spec:
// backlog/R3-04-paste-ordered-by-column.md (Logic). Pseudonyms only.
import { describe, expect, it } from "vitest";
import { sendersOf } from "./label";

type Line = Parameters<typeof sendersOf>[0][number];
const line = (o: Partial<Line> & { createdAt: number }): Line => ({
  source: "captain",
  ...o,
});

describe("sendersOf: via (R3-04)", () => {
  it("a named captain line with no email is via paste", () => {
    const [rob] = sendersOf([
      line({ submitterName: "Rob", createdAt: 1 }),
      line({ submitterName: "Rob", createdAt: 2 }),
    ]);
    expect(rob).toMatchObject({ name: "Rob", isYou: false, via: "paste" });
    expect(rob.lines).toHaveLength(2);
  });

  it("a fan-source line is via form, with or without an email", () => {
    const [a, b] = sendersOf([
      line({ source: "fan", submitterName: "Riley", submitterEmail: "riley@example.com", createdAt: 1 }),
      line({ source: "fan", submitterName: "Sam", createdAt: 2 }),
    ]);
    expect(a.via).toBe("form");
    expect(b.via).toBe("form");
  });

  it("a line with an email is via form even if its source says captain", () => {
    const [s] = sendersOf([
      line({ submitterName: "Riley", submitterEmail: "riley@example.com", createdAt: 1 }),
    ]);
    expect(s.via).toBe("form");
  });

  it("the suffix follows source/email, never the name", () => {
    const [s] = sendersOf([
      line({ source: "fan", submitterName: "from a pasted list", createdAt: 1 }),
    ]);
    expect(s.via).toBe("form");
  });

  it("the captain's unnamed lines are still 'you' and come first", () => {
    const senders = sendersOf([
      line({ submitterName: "Rob", createdAt: 1 }),
      line({ createdAt: 2 }),
    ]);
    expect(senders.map((s) => s.isYou)).toEqual([true, false]);
    expect(senders[1].via).toBe("paste");
  });
});
