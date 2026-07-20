// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import {
  INSPIRATION_LINK_MAX_LENGTH,
  MAX_INSPIRATION_LINKS,
} from "../lib/intake";

const modules = import.meta.glob("./**/*.*s");

const VALID_INTAKE = {
  name: "Sam Captain",
  teamName: "Falcons",
  email: "sam@example.com",
  sport: "Soccer",
  estimatedQuantity: 12,
  designPreference: "needs-help" as const,
  brief: "Need a navy kit with gold trim.",
  newsletterOptIn: false,
};

describe("intakes.submitIntake", () => {
  it("inserts a public intake (no auth required)", async () => {
    const t = convexTest(schema, modules);
    const intakeId = await t.mutation(api.intakes.submitIntake, VALID_INTAKE);
    const row = await t.run((ctx) => ctx.db.get(intakeId));
    expect(row).toMatchObject({
      name: "Sam Captain",
      teamName: "Falcons",
      email: "sam@example.com",
      sport: "Soccer",
      estimatedQuantity: 12,
      designPreference: "needs-help",
      newsletterOptIn: false,
    });
  });

  it("rejects an intake with a malformed email", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.intakes.submitIntake, {
        ...VALID_INTAKE,
        email: "not-an-email",
      }),
    ).rejects.toThrow(/valid email/);
  });

  it("rejects an intake with quantity below the minimum", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.intakes.submitIntake, {
        ...VALID_INTAKE,
        estimatedQuantity: 2,
      }),
    ).rejects.toThrow(/Quantity must be at least/);
  });
});

describe("intakes.submitIntake — inspiration links", () => {
  const DRIVE_LINK = "https://drive.google.com/drive/folders/abc123";
  const DROPBOX_LINK = "https://www.dropbox.com/scl/fo/xyz789";

  it("stores no link field when none are submitted", async () => {
    const t = convexTest(schema, modules);
    const intakeId = await t.mutation(api.intakes.submitIntake, VALID_INTAKE);
    const row = await t.run((ctx) => ctx.db.get(intakeId));
    expect(row?.inspirationLinks).toBeUndefined();
  });

  it("attaches valid share-folder links to the record", async () => {
    const t = convexTest(schema, modules);
    const intakeId = await t.mutation(api.intakes.submitIntake, {
      ...VALID_INTAKE,
      inspirationLinks: [`  ${DRIVE_LINK}  `, DROPBOX_LINK, DRIVE_LINK],
    });
    const row = await t.run((ctx) => ctx.db.get(intakeId));
    // Trimmed and deduped, original order preserved.
    expect(row?.inspirationLinks).toEqual([DRIVE_LINK, DROPBOX_LINK]);
  });

  it("accepts an unrecognised but well-formed https host", async () => {
    const t = convexTest(schema, modules);
    const intakeId = await t.mutation(api.intakes.submitIntake, {
      ...VALID_INTAKE,
      inspirationLinks: ["https://pinterest.ca/board/kits"],
    });
    const row = await t.run((ctx) => ctx.db.get(intakeId));
    expect(row?.inspirationLinks).toEqual(["https://pinterest.ca/board/kits"]);
  });

  it("rejects a malformed link and writes nothing", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.intakes.submitIntake, {
        ...VALID_INTAKE,
        inspirationLinks: ["not a url"],
      }),
    ).rejects.toThrow(/https/i);
    const rows = await t.run((ctx) => ctx.db.query("intakes").collect());
    expect(rows).toHaveLength(0);
  });

  it("rejects a non-https scheme", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.intakes.submitIntake, {
        ...VALID_INTAKE,
        inspirationLinks: ["javascript:alert(1)"],
      }),
    ).rejects.toThrow(/https/i);
  });

  it("rejects more links than the cap", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.intakes.submitIntake, {
        ...VALID_INTAKE,
        inspirationLinks: Array.from(
          { length: MAX_INSPIRATION_LINKS + 1 },
          (_, i) => `https://drive.google.com/drive/folders/f${i}`,
        ),
      }),
    ).rejects.toThrow(/link/i);
  });

  it("rejects a link over the per-URL length cap", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.intakes.submitIntake, {
        ...VALID_INTAKE,
        inspirationLinks: [
          `https://drive.google.com/${"x".repeat(
            INSPIRATION_LINK_MAX_LENGTH,
          )}`,
        ],
      }),
    ).rejects.toThrow(/too long/i);
  });
});

// The admin lead list (2-13). Intake rows carry contact details and briefs,
// so the query is admin-gated even though submission itself is public.
describe("intakes.listIntakes", () => {
  async function seedAdmin(t: ReturnType<typeof convexTest>) {
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "admin",
        email: "admin@example.com",
        name: "Admin",
        isAdmin: true,
        createdAt: Date.now(),
      }),
    );
    return t.withIdentity({ subject: "admin" });
  }

  it("returns submissions newest first", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.intakes.submitIntake, {
      ...VALID_INTAKE,
      teamName: "First",
    });
    await t.mutation(api.intakes.submitIntake, {
      ...VALID_INTAKE,
      teamName: "Second",
    });

    const asAdmin = await seedAdmin(t);
    const leads = await asAdmin.query(api.intakes.listIntakes, {});
    expect(leads.map((l) => l.teamName)).toEqual(["Second", "First"]);
  });

  it("rejects an anonymous caller", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.intakes.listIntakes, {})).rejects.toThrow(
      /Not authenticated/,
    );
  });

  it("rejects a signed-in non-admin caller", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "captain",
        email: "captain@example.com",
        name: "Captain",
        isAdmin: false,
        createdAt: Date.now(),
      }),
    );

    await expect(
      t.withIdentity({ subject: "captain" }).query(api.intakes.listIntakes, {}),
    ).rejects.toThrow(/Admin access required/);
  });
});
