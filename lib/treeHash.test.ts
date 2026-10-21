import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { treeHash } from "./treeHash";

// Spec: backlog/PROC-01-e2e-dev-loop.md §1. "Same tree" is `git write-tree` of
// a temporary index after `git add -A`: commits don't change it, tracked edits
// and untracked non-ignored files do, ignored files don't.

let dir: string;
const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: dir,
    encoding: "utf-8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@example.com",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@example.com",
    },
  });
const write = (name: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
  fs.writeFileSync(path.join(dir, name), body);
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), "treehash-"));
  git("init", "-q");
  write(".gitignore", "ignored/\n.e2e-receipt.json\n");
  write("a.txt", "one\n");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("treeHash", () => {
  it("should return a 40-hex hash", () => {
    expect(treeHash(dir)).toMatch(/^[0-9a-f]{40}$/);
  });

  it("should be the same before and after committing the same content", () => {
    write("b.txt", "two\n");
    const before = treeHash(dir);
    git("add", "-A");
    git("commit", "-q", "-m", "add b");
    expect(treeHash(dir)).toBe(before);
  });

  it("should change after a tracked edit and change back when reverted", () => {
    const clean = treeHash(dir);
    write("a.txt", "edited\n");
    expect(treeHash(dir)).not.toBe(clean);
    write("a.txt", "one\n");
    expect(treeHash(dir)).toBe(clean);
  });

  it("should change after a new untracked file that is not ignored", () => {
    const clean = treeHash(dir);
    write("new.txt", "x\n");
    expect(treeHash(dir)).not.toBe(clean);
    fs.rmSync(path.join(dir, "new.txt"));
    expect(treeHash(dir)).toBe(clean);
  });

  it("should change after deleting a tracked file", () => {
    const clean = treeHash(dir);
    fs.renameSync(path.join(dir, "b.txt"), path.join(dir, "b.moved"));
    const moved = treeHash(dir);
    expect(moved).not.toBe(clean);
    fs.rmSync(path.join(dir, "b.moved"));
    expect(treeHash(dir)).not.toBe(moved);
    write("b.txt", "two\n");
    expect(treeHash(dir)).toBe(clean);
  });

  it("should not change for a gitignored file", () => {
    const clean = treeHash(dir);
    write("ignored/log.txt", "noise\n");
    write(".e2e-receipt.json", "{}");
    expect(treeHash(dir)).toBe(clean);
  });

  it("should not touch the real index", () => {
    write("pending.txt", "p\n");
    const before = git("status", "--porcelain");
    treeHash(dir);
    expect(git("status", "--porcelain")).toBe(before);
    expect(before).toContain("?? pending.txt");
    fs.rmSync(path.join(dir, "pending.txt"));
  });
});
