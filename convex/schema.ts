import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    isAdmin: v.boolean(),
    createdAt: v.number(),
  }).index("by_clerkId", ["clerkId"]),

  designs: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    brief: v.string(),
    canvaLink: v.optional(v.string()),
    fileIds: v.array(v.id("_storage")),
    // Silhouette specs live on the design now (moved off the order in O-01)
    // so a reusable design carries its own cut. Optional: a design can be
    // saved before its specs are decided; the design form wires them in O-02.
    jerseyStyle: v.optional(v.string()),
    neckline: v.optional(v.string()),
    sleeveStyle: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  orders: defineTable({
    captainId: v.id("users"),
    teamName: v.string(),
    sport: v.string(),
    estimatedQuantity: v.number(),
    hasOwnDesign: v.boolean(),
    designIds: v.array(v.id("designs")),
    internalStages: v.array(
      v.object({
        name: v.string(),
        completedAt: v.optional(v.number()),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_captain", ["captainId"]),

  jerseyRuns: defineTable({
    orderId: v.id("orders"),
    captainId: v.id("users"),
    // Available sizes the fan can pick from on the public form.
    // Stored on the run (not hard-coded) so captains can scope size
    // options to what they expect their team to need.
    sizeOptions: v.array(v.string()),
    namesMode: v.union(v.literal("open"), v.literal("fixed")),
    fixedRoster: v.optional(
      v.array(
        v.object({
          name: v.string(),
          number: v.optional(v.string()),
        }),
      ),
    ),
    customQuestions: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
      }),
    ),
    deadline: v.number(),
    // `locked` (added in R-01) freezes the run as the confirmed production
    // basis — the value is here now so the schema accepts it; the lock
    // behaviour (manual + lazy auto-lock, freeze guards) is wired in R-06.
    status: v.union(
      v.literal("open"),
      v.literal("closed"),
      v.literal("locked"),
    ),
    // The confirmed-count snapshot taken at lock time (R-06) — Σ qty and
    // the same grouped by design, same shape as orderEntries.countsByRun,
    // so the order page reads a frozen number instead of a live one once
    // locked. Cleared (not overwritten with zeros) on unlock, since an
    // unlocked run has no frozen basis and live counts apply again.
    lockSnapshot: v.optional(
      v.object({
        lockedAt: v.number(),
        total: v.number(),
        byDesign: v.array(
          v.object({
            designId: v.id("designs"),
            title: v.string(),
            total: v.number(),
          }),
        ),
      }),
    ),
    createdAt: v.number(),
  })
    .index("by_order", ["orderId"])
    .index("by_captain", ["captainId"]),

  // The unified roster model (R-01). A `rosterEntry` is a name+number
  // "player slot" on a design — `Home / #99 Gretzky`. A captain can seed
  // one (source: captain), or a fan order creates/attaches to one
  // (source: fan, in R-02). A roster entry with zero order entries is
  // "not yet filled" — that state is derived, not stored. Carries both
  // `runId` and `orderId` (the run is 1:1 with the order) so readers can
  // load by either without a hop through the run.
  rosterEntries: defineTable({
    runId: v.id("jerseyRuns"),
    orderId: v.id("orders"),
    designId: v.id("designs"),
    name: v.string(),
    number: v.optional(v.string()),
    source: v.union(v.literal("captain"), v.literal("fan")),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_design", ["designId"]),

  // One jersey to produce (R-01): `{size, qty, submitter, source}`.
  // `rosterEntryId` is optional — a blank/bulk line (a spare jersey) has
  // no player slot. `designId` is denormalized from the roster entry so
  // blank lines still group by design and per-design counts (R-04) are a
  // simple group-by on the by_run index. The production total is
  // Σ qty over these rows. `customAnswers` carries the run's custom-question
  // answers (R-02): they describe the submitter, not the jersey, so every
  // line from one submission shares the same record — denormalized onto
  // each entry rather than split into a separate table.
  orderEntries: defineTable({
    runId: v.id("jerseyRuns"),
    designId: v.id("designs"),
    rosterEntryId: v.optional(v.id("rosterEntries")),
    size: v.string(),
    qty: v.number(),
    source: v.union(v.literal("captain"), v.literal("fan")),
    submitterName: v.string(),
    submitterEmail: v.string(),
    customAnswers: v.optional(v.record(v.string(), v.string())),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_rosterEntry", ["rosterEntryId"]),

  jerseyRunResponses: defineTable({
    jerseyRunId: v.id("jerseyRuns"),
    respondentName: v.string(),
    respondentEmail: v.string(),
    jerseyName: v.optional(v.string()),
    jerseyNumber: v.optional(v.string()),
    size: v.string(),
    customAnswers: v.record(v.string(), v.string()),
    submittedAt: v.number(),
  })
    .index("by_jerseyRun", ["jerseyRunId"])
    .index("by_respondentEmail", ["respondentEmail"]),

  intakes: defineTable({
    name: v.string(),
    teamName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    sport: v.string(),
    estimatedQuantity: v.number(),
    designPreference: v.optional(
      v.union(
        v.literal("own-design"),
        v.literal("needs-help"),
        v.literal("undecided"),
      ),
    ),
    usageContext: v.optional(
      v.array(v.union(v.literal("event"), v.literal("league"))),
    ),
    deadline: v.optional(v.number()),
    brief: v.string(),
    questions: v.optional(v.string()),
    newsletterOptIn: v.optional(v.boolean()),
    submittedAt: v.number(),
  })
    .index("by_submittedAt", ["submittedAt"])
    .index("by_deadline", ["deadline"]),
});
