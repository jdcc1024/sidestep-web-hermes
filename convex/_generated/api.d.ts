/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _auth from "../_auth.js";
import type * as _designAssets from "../_designAssets.js";
import type * as _designBlocks from "../_designBlocks.js";
import type * as _devSeed from "../_devSeed.js";
import type * as _e2e from "../_e2e.js";
import type * as _migrations from "../_migrations.js";
import type * as _orderItems from "../_orderItems.js";
import type * as _schemaSmokeTest from "../_schemaSmokeTest.js";
import type * as _users from "../_users.js";
import type * as admin from "../admin.js";
import type * as crons from "../crons.js";
import type * as designs from "../designs.js";
import type * as intakes from "../intakes.js";
import type * as jerseyRunActions from "../jerseyRunActions.js";
import type * as jerseyRuns from "../jerseyRuns.js";
import type * as orderEntries from "../orderEntries.js";
import type * as orderItems from "../orderItems.js";
import type * as orders from "../orders.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _auth: typeof _auth;
  _designAssets: typeof _designAssets;
  _designBlocks: typeof _designBlocks;
  _devSeed: typeof _devSeed;
  _e2e: typeof _e2e;
  _migrations: typeof _migrations;
  _orderItems: typeof _orderItems;
  _schemaSmokeTest: typeof _schemaSmokeTest;
  _users: typeof _users;
  admin: typeof admin;
  crons: typeof crons;
  designs: typeof designs;
  intakes: typeof intakes;
  jerseyRunActions: typeof jerseyRunActions;
  jerseyRuns: typeof jerseyRuns;
  orderEntries: typeof orderEntries;
  orderItems: typeof orderItems;
  orders: typeof orders;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
