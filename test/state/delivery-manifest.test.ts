import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Exec } from "../../src/core/exec.ts";
import { loadDeliveryManifest } from "../../src/state/delivery-manifest.ts";

test("tracked manifest loads from nested cwd with exact identity and content freshness", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "devsys-manifest-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet", root]);
  mkdirSync(join(root, "docs/delivery"), { recursive: true });
  mkdirSync(join(root, "nested"));
  const manifest = {
    version: 1,
    issue: { repository: "o/r", number: 7 },
    pullRequests: [{ repository: "o/r", number: 1 }],
    manualRequirements: [],
  };
  const path = join(root, "docs/delivery/7.json");
  writeFileSync(path, JSON.stringify(manifest));
  execFileSync("git", ["-C", root, "add", "docs"]);
  const exec: Exec = async (command, args, options) => ({
    code: 0,
    stdout: execFileSync(command, args, { cwd: options?.cwd, encoding: "utf8" }),
    stderr: "",
  });
  const deps = {
    exec,
    cwd: join(root, "nested"),
    repository: "o/r",
    number: 7,
    manifestDir: "docs/delivery",
    required: true,
  };
  const first = await loadDeliveryManifest(deps);
  assert.ok(first.ok, JSON.stringify(first));
  assert.equal(first.value?.path, path);
  assert.deepEqual(first.value?.manifest, manifest);
  writeFileSync(path, `${JSON.stringify(manifest)}\n`);
  const second = await loadDeliveryManifest(deps);
  assert.ok(second.ok);
  assert.notEqual(first.value?.hash, second.value?.hash);
});

test("manifest tracking treats pathspec metacharacters literally", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-manifest-literal-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet", cwd]);
  const manifest = {
    version: 1,
    issue: { repository: "o/r", number: 7 },
    pullRequests: [{ repository: "o/r", number: 1 }],
    manualRequirements: [],
  };
  for (const dir of ["docs/delivery[prod]", "docs/deliveryp"]) {
    mkdirSync(join(cwd, dir), { recursive: true });
    writeFileSync(join(cwd, dir, "7.json"), JSON.stringify(manifest));
  }
  execFileSync("git", ["-C", cwd, "add", "docs/deliveryp/7.json"]);
  const exec: Exec = async (command, args, options) => {
    try {
      return {
        code: 0,
        stdout: execFileSync(command, args, {
          cwd: options?.cwd,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
        stderr: "",
      };
    } catch {
      return { code: 1, stdout: "", stderr: "untracked" };
    }
  };
  const deps = {
    exec,
    cwd,
    repository: "o/r",
    number: 7,
    manifestDir: "docs/delivery[prod]",
    required: true,
  };
  const untracked = await loadDeliveryManifest(deps);
  assert.equal(untracked.ok, false, "a tracked glob match is not the literal manifest");
  if (!untracked.ok) assert.match(untracked.error.message, /Git-tracked/);
  execFileSync("git", [
    "--literal-pathspecs",
    "-C",
    cwd,
    "add",
    "--",
    "docs/delivery[prod]/7.json",
  ]);
  const tracked = await loadDeliveryManifest(deps);
  assert.ok(tracked.ok, JSON.stringify(tracked));
  assert.equal(tracked.value?.path, join(cwd, "docs/delivery[prod]/7.json"));
});

test("manifest safety contracts", async (suite) => {
  function fixture(t: import("node:test").TestContext) {
    const cwd = mkdtempSync(join(tmpdir(), "devsys-manifest-safety-"));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    execFileSync("git", ["init", "--quiet", cwd]);
    mkdirSync(join(cwd, "docs/delivery"), { recursive: true });
    const path = join(cwd, "docs/delivery/7.json");
    const manifest = {
      version: 1,
      issue: { repository: "o/r", number: 7 },
      pullRequests: [{ repository: "o/r", number: 1 }],
      manualRequirements: [],
    };
    writeFileSync(path, JSON.stringify(manifest));
    execFileSync("git", ["-C", cwd, "add", "docs"]);
    const exec: Exec = async (command, args, options) => {
      assert.equal(command, "git");
      try {
        return {
          code: 0,
          stdout: execFileSync(command, args, {
            cwd: options?.cwd,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          }),
          stderr: "",
        };
      } catch {
        return { code: 1, stdout: "", stderr: "untracked" };
      }
    };
    return {
      path,
      cwd,
      manifest,
      deps: {
        exec,
        cwd,
        repository: "o/r",
        number: 7,
        manifestDir: "docs/delivery",
        required: true,
      },
    };
  }
  const mutations: Record<string, (host: ReturnType<typeof fixture>) => void> = {
    malformed: (host) => writeFileSync(host.path, "{bad"),
    "unknown version": (host) =>
      writeFileSync(host.path, JSON.stringify({ ...host.manifest, version: 2 })),
    "unknown/secret fields": (host) =>
      writeFileSync(
        host.path,
        JSON.stringify({ ...host.manifest, cachedStatus: "satisfied", token: "not-a-real-secret" }),
      ),
    "unknown ref fields": (host) =>
      writeFileSync(
        host.path,
        JSON.stringify({
          ...host.manifest,
          pullRequests: [{ repository: "o/r", number: 1, cachedStatus: "satisfied" }],
        }),
      ),
    "issue identity": (host) =>
      writeFileSync(
        host.path,
        JSON.stringify({ ...host.manifest, issue: { repository: "other/repo", number: 7 } }),
      ),
    "empty refs": (host) =>
      writeFileSync(host.path, JSON.stringify({ ...host.manifest, pullRequests: [] })),
    "duplicate refs": (host) =>
      writeFileSync(
        host.path,
        JSON.stringify({
          ...host.manifest,
          pullRequests: [
            { repository: "o/r", number: 1 },
            { repository: "O/R", number: 1 },
          ],
        }),
      ),
    "unsafe PR number": (host) =>
      writeFileSync(
        host.path,
        JSON.stringify({
          ...host.manifest,
          pullRequests: [{ repository: "o/r", number: 9007199254740992 }],
        }),
      ),
    "invalid UTF-8": (host) => writeFileSync(host.path, Buffer.from([0xff, 0xfe])),
    oversized: (host) => writeFileSync(host.path, " ".repeat(32 * 1024 + 1)),
    untracked: (host) => {
      execFileSync("git", ["-C", host.cwd, "rm", "--cached", "docs/delivery/7.json"]);
    },
    directory: (host) => {
      unlinkSync(host.path);
      mkdirSync(host.path);
    },
    "final symlink": (host) => {
      unlinkSync(host.path);
      symlinkSync(join(host.cwd, "outside.json"), host.path);
    },
    "parent symlink": (host) => {
      rmSync(join(host.cwd, "docs/delivery"), { recursive: true });
      symlinkSync(tmpdir(), join(host.cwd, "docs/delivery"));
    },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    await suite.test(
      `rejects ${name}, even when optional with caller refs available`,
      async (t) => {
        const host = fixture(t);
        mutate(host);
        const result = await loadDeliveryManifest({ ...host.deps, required: false });
        assert.equal(result.ok, false, name);
        if (!result.ok) assert.match(result.error.message, /No writes attempted/);
      },
    );
  }
  await suite.test(
    "only optional absence is tolerated; directory escapes and invalid identity are never tolerated",
    async (t) => {
      const host = fixture(t);
      unlinkSync(host.path);
      assert.deepEqual(await loadDeliveryManifest({ ...host.deps, required: false }), {
        ok: true,
        value: null,
      });
      assert.equal((await loadDeliveryManifest(host.deps)).ok, false);
      for (const manifestDir of [
        "/absolute",
        "../escape",
        "docs/../escape",
        "docs\\delivery",
        "docs//delivery",
        "docs/./delivery",
        "docs\0delivery",
      ]) {
        assert.equal(
          (await loadDeliveryManifest({ ...host.deps, manifestDir })).ok,
          false,
          manifestDir,
        );
      }
      assert.equal((await loadDeliveryManifest({ ...host.deps, number: 0 })).ok, false);
      assert.equal(
        (await loadDeliveryManifest({ ...host.deps, manifestDir: undefined } as never)).ok,
        false,
      );
    },
  );
});
