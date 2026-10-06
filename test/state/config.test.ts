import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { defaultMatrix } from "../../src/core/models.ts";
import { CONFIG_FILE, loadConfig, parseConfig } from "../../src/state/config.ts";

const value = (text: string) => {
  const r = parseConfig(text);
  assert.ok(r.ok, r.ok ? "" : r.error.message);
  return r.value;
};
const failure = (text: string) => {
  const r = parseConfig(text);
  assert.ok(!r.ok, "expected a config error");
  return r.error;
};

test("an empty file yields the defaults", () => {
  const c = value("");
  assert.equal(c.delivery.mode, "trunk");
  assert.equal(c.delivery.trunk, "main");
  assert.equal(c.delivery.remote, "origin");
  assert.equal(c.review.requiredCleanRounds, 3);
  assert.equal(c.tracker.kind, "repo-files");
  assert.equal(c.jev.timeoutMs, 4000);
  assert.equal(c.jev.confidenceFloor, 0.6);
  assert.equal(c.verifier.maxPerSession, 6);
  assert.equal(c.cadence.pushMinutes, 60);
  assert.deepEqual(c.models, defaultMatrix());
  assert.deepEqual(c.routing["routine/*"], { slot: "strong", thinkingLevel: "high" });
});

test("values override defaults", () => {
  const c = value(`
version = 1
[delivery]
mode = "pull-request"
trunk = "master"
[review]
required_clean_rounds = 2
[tracker]
kind = "github"
repo = "o/n"
[profiles]
override = ["typescript"]
[jev]
timeout_ms = 1000
`);
  assert.equal(c.delivery.mode, "pull-request");
  assert.equal(c.delivery.trunk, "master");
  assert.equal(c.delivery.remote, "origin");
  assert.equal(c.review.requiredCleanRounds, 2);
  assert.equal(c.tracker.repo, "o/n");
  assert.deepEqual(c.profiles.override, ["typescript"]);
  assert.equal(c.jev.timeoutMs, 1000);
});

test("a [models] table replaces only the slots it names", () => {
  const c = value(`
[models]
strong = ["anthropic/claude-sonnet-*"]
`);
  assert.deepEqual(c.models.strong, ["anthropic/claude-sonnet-*"]);
  assert.deepEqual(c.models.fast, defaultMatrix().fast);
});

test("[routing] entries replace the default table", () => {
  const c = value(`
[routing]
"trivial/*" = ["fast", "low"]
`);
  assert.deepEqual(Object.keys(c.routing), ["trivial/*"]);
  assert.deepEqual(c.routing["trivial/*"], { slot: "fast", thinkingLevel: "low" });
});

test("bad delivery.mode is an error naming the key", () => {
  const e = failure('[delivery]\nmode = "yolo"\n');
  assert.equal(e.key, "delivery.mode");
  assert.match(e.message, /delivery\.mode/);
  assert.match(e.message, /trunk/);
});

test("unknown keys are errors naming the key", () => {
  assert.equal(failure('[delivery]\nmodee = "trunk"\n').key, "delivery.modee");
  assert.equal(failure("[surprise]\nx = 1\n").key, "surprise");
  assert.equal(failure("colour = 1\n").key, "colour");
  assert.equal(failure('[models]\nfrontiers = ["a/b"]\n').key, "models.frontiers");
});

test("wrong value types are errors naming the key", () => {
  assert.equal(
    failure('[review]\nrequired_clean_rounds = "three"\n').key,
    "review.required_clean_rounds",
  );
  assert.equal(
    failure("[review]\nrequired_clean_rounds = 0\n").key,
    "review.required_clean_rounds",
  );
  assert.equal(failure("[jev]\nconfidence_floor = 2\n").key, "jev.confidence_floor");
  assert.equal(failure('[models]\nstrong = "a/b"\n').key, "models.strong");
  assert.equal(failure("[models]\nstrong = []\n").key, "models.strong");
  assert.equal(failure('[models]\nstrong = ["not-a-ref"]\n').key, "models.strong");
  assert.equal(failure('[routing]\n"routine/low" = ["nope", "high"]\n').key, "routing.routine/low");
  assert.equal(
    failure('[routing]\n"routine/low" = ["fast", "turbo"]\n').key,
    "routing.routine/low",
  );
});

test("a missing or unsupported version is an error", () => {
  assert.equal(failure("version = 2\n").key, "version");
});

test("invalid TOML is an error", () => {
  assert.match(failure("this is not toml").message, /TOML/);
});

test("loadConfig returns defaults when the file is absent and parses it when present", async () => {
  const dir = await mkdtemp(join(tmpdir(), "devsys-config-"));
  const missing = await loadConfig(dir);
  assert.ok(missing.ok && missing.value.delivery.mode === "trunk");
  await writeFile(join(dir, CONFIG_FILE), '[delivery]\nmode = "local-only"\n');
  const present = await loadConfig(dir);
  assert.ok(present.ok && present.value.delivery.mode === "local-only");
  await writeFile(join(dir, CONFIG_FILE), '[delivery]\nmode = "x"\n');
  assert.equal((await loadConfig(dir)).ok, false);
});
