import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { designBlocksValidator } from "./_designBlocks";

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
    // The structured brief (D-02): an ordered list of text / gallery / palette
    // blocks. The array order IS the page order, so a reorder is one patch.
    // Replaces the old single `brief` string — the Overview text block is now
    // the design's primary description, read by every list and card.
    blocks: designBlocksValidator,
    canvaLink: v.optional(v.string()),
    // Silhouette specs live on the design now (moved off the order in O-01)
    // so a reusable design carries its own cut. Optional: a design can be
    // saved before its specs are decided; the design form wires them in O-02.
    jerseyStyle: v.optional(v.string()),
    neckline: v.optional(v.string()),
    sleeveStyle: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  // One row per uploaded file (D-01), replacing the bare `designs.fileIds`
  // array. `filename` + `contentType` are what let the design page render a
  // real thumbnail and tell an image from a PDF; the uploader pair is a
  // provenance snapshot (admin status can change later) that drives the
  // delete rules in lib/designAsset. `isMain` is the owner's explicit pick
  // for the design's representative image — see resolveMainAsset for the
  // fallback when it's unset.
  designAssets: defineTable({
    designId: v.id("designs"),
    storageId: v.id("_storage"),
    filename: v.string(),
    contentType: v.string(),
    isMain: v.boolean(),
    uploadedByUserId: v.id("users"),
    uploadedByAdmin: v.boolean(),
    createdAt: v.number(),
  }).index("by_design", ["designId"]),

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

  orderForms: defineTable({
    orderId: v.id("orders"),
    captainId: v.id("users"),
    // Available sizes the fan can pick from on the public form.
    // Stored on the run (not hard-coded) so captains can scope size
    // options to what they expect their team to need.
    sizeOptions: v.array(v.string()),
    namesMode: v.union(v.literal("open"), v.literal("fixed")),
    customQuestions: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
      }),
    ),
    deadline: v.number(),
    // The order form's own state. The deadline closes it (lazily, see
    // lib/orderForm/lock), and so can the closure cron. It never locks the
    // list: that is the order's "Order Size Confirmed" stage (L-06).
    status: v.union(v.literal("open"), v.literal("closed")),
    createdAt: v.number(),
  })
    .index("by_order", ["orderId"])
    .index("by_captain", ["captainId"]),

  // A size line under a player (initiative 0004; phase 1b, R2-03): its roster
  // entry, a size and a qty, plus who sent it. The printed values live on the
  // entry. `orderId` is denormalised from the entry (immutable) so the order's
  // lines are one `by_order` read; `orderFormId` only records which form a
  // line came through. Soft-deleted via `removedAt`: read through `loadRoster`
  // in _orderItems.ts, the only `by_order` reader, which drops removed lines
  // and lines under a removed entry. The phase-1 flat design / name / number /
  // letter were stripped by `_migrations:stripFlatItemFields`.
  orderItems: defineTable({
    orderId: v.id("orders"),
    rosterEntryId: v.id("rosterEntries"), // the player this line belongs to
    size: v.string(), // a player who needs sizes has no lines
    qty: v.number(), // integer 1..MAX_QTY
    source: v.union(v.literal("captain"), v.literal("fan")), // who created the row
    // Set only by the public form: no captain or admin mutation accepts these.
    submitterName: v.optional(v.string()),
    submitterEmail: v.optional(v.string()), // normalized lowercase
    customAnswers: v.optional(v.record(v.string(), v.string())),
    orderFormId: v.optional(v.id("orderForms")), // provenance only
    removedAt: v.optional(v.number()), // soft delete; restore clears it
    createdAt: v.number(), // display order; migrated rows keep legacy time
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")), // who last changed it (admin after lock)
  })
    .index("by_order", ["orderId"])
    .index("by_entry", ["rosterEntryId"])
    .index("by_submitterEmail", ["submitterEmail"]),

  // A player on one design of one order (0004 phase 1b, R2-01): the printed
  // values. Its sizes are the `orderItems` that point at it. Parented on the
  // order, never the order form. Soft-deleted via `removedAt` (the entry
  // alone; its items are hidden, not touched): read through `loadRoster` in
  // _orderItems.ts, the only `by_order` reader. Design:
  // docs/architecture/0004-roster-sizes.md "Data model".
  rosterEntries: defineTable({
    orderId: v.id("orders"),
    designId: v.id("designs"), // never changes; moving = remove + add
    name: v.optional(v.string()), // name on back (≤ 80)
    number: v.optional(v.string()), // number on back, text: "01" ≠ "1"
    designation: v.optional(v.union(v.literal("C"), v.literal("A"))),
    source: v.union(v.literal("captain"), v.literal("fan")), // who created it
    removedAt: v.optional(v.number()), // soft delete; restore clears it
    createdAt: v.number(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }).index("by_order", ["orderId"]),

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
    // Links to a share folder the customer already keeps (Drive, Dropbox, …).
    // Plain text — we never receive or host their files. See issue 2-14.
    inspirationLinks: v.optional(v.array(v.string())),
    newsletterOptIn: v.optional(v.boolean()),
    submittedAt: v.number(),
  })
    .index("by_submittedAt", ["submittedAt"])
    .index("by_deadline", ["deadline"]),
});
