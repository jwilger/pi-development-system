import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { defaultMatrix } from "../../src/core/models.ts";
import {
  CONFIG_FILE,
  configErrorText,
  loadConfig,
  parseConfig,
  USER_CONFIG_FILE,
} from "../../src/state/config.ts";

const value = (text: string) => {
  const r = parseConfig(text);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
const failure = (text: string) => {
  const r = parseConfig(text);
  if (r.ok) throw new Error("expected a config error");
  return r.error;
};

test("an empty file yields the defaults", () => {
  const c = value("");
  assert.equal(c.delivery.mode, "trunk");
  assert.equal(c.delivery.trunk, "main");
  assert.equal(c.delivery.remote, "origin");
  assert.equal(c.review.requiredCleanRounds, 1);
  assert.equal(c.review.thinkingLevel, "high");
  assert.equal(c.tracker.kind, "repo-files");
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
thinking_level = "xhigh"
[tracker]
kind = "github"
repo = "o/n"
[profiles]
override = ["typescript"]
[verifier]
max_per_session = 2
`);
  assert.equal(c.delivery.mode, "pull-request");
  assert.equal(c.delivery.trunk, "master");
  assert.equal(c.delivery.remote, "origin");
  assert.equal(c.review.requiredCleanRounds, 2);
  assert.equal(c.review.thinkingLevel, "xhigh");
  assert.equal(c.tracker.repo, "o/n");
  assert.deepEqual(c.profiles.override, ["typescript"]);
  assert.equal(c.verifier.maxPerSession, 2);
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
  assert.equal(failure("[verifier]\nmax_per_session = 0\n").key, "verifier.max_per_session");
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
  const missing = await loadConfig(dir, { userDir: null });
  assert.ok(missing.ok && missing.value.delivery.mode === "trunk");
  await writeFile(join(dir, CONFIG_FILE), '[delivery]\nmode = "local-only"\n');
  const present = await loadConfig(dir, { userDir: null });
  assert.ok(present.ok && present.value.delivery.mode === "local-only");
  await writeFile(join(dir, CONFIG_FILE), '[delivery]\nmode = "x"\n');
  assert.equal((await loadConfig(dir, { userDir: null })).ok, false);
});

test("an unknown @slot reference is a config error", () => {
  const r = parseConfig('version = 1\n[models]\nfast = ["@nope"]\n');
  assert.equal(r.ok, false);
});

test("a routing key that names no difficulty or risk is an error", () => {
  assert.equal(
    failure('[routing]\n"complex/hgh" = ["strong", "high"]\n').key,
    "routing.complex/hgh",
  );
  assert.equal(failure('[routing]\n"complex" = ["strong", "high"]\n').key, "routing.complex");
});

test("review.thinking_level must be a thinking level pi accepts", () => {
  assert.equal(failure('[review]\nthinking_level = "maximum"\n').key, "review.thinking_level");
});

test("a user config's [models] candidates go ahead of the repo's for that slot, without duplicates", async () => {
  const repo = await mkdtemp(join(tmpdir(), "devsys-config-"));
  const user = await mkdtemp(join(tmpdir(), "devsys-user-"));
  await writeFile(join(repo, CONFIG_FILE), '[models]\nfast = ["cloud/small", "local/coder"]\n');
  await writeFile(
    join(user, USER_CONFIG_FILE),
    '[models]\nfast = ["local/coder", "local/tiny*"]\n',
  );
  const config = await loadConfig(repo, { userDir: user });
  assert.ok(config.ok);
  assert.deepEqual(config.value.models.fast, ["local/coder", "local/tiny*", "cloud/small"]);
  assert.deepEqual(config.value.models.frontier, defaultMatrix().frontier);
});

test("without a user config file, or with userDir null, the repo matrix is used as is", async () => {
  const repo = await mkdtemp(join(tmpdir(), "devsys-config-"));
  const user = await mkdtemp(join(tmpdir(), "devsys-user-"));
  const absent = await loadConfig(repo, { userDir: user });
  assert.ok(absent.ok);
  assert.deepEqual(absent.value.models, defaultMatrix());
  await writeFile(join(user, USER_CONFIG_FILE), '[models]\nfast = ["local/coder"]\n');
  const ignored = await loadConfig(repo, { userDir: null });
  assert.ok(ignored.ok);
  assert.deepEqual(ignored.value.models, defaultMatrix());
});

test("a user config may hold only version and [models], and its errors name the user file", async () => {
  const repo = await mkdtemp(join(tmpdir(), "devsys-config-"));
  const user = await mkdtemp(join(tmpdir(), "devsys-user-"));
  await writeFile(join(user, USER_CONFIG_FILE), '[delivery]\nmode = "local-only"\n');
  const policy = await loadConfig(repo, { userDir: user });
  assert.ok(!policy.ok);
  assert.equal(
    configErrorText(policy.error),
    `${join(user, USER_CONFIG_FILE)}: unknown key delivery`,
  );
  await writeFile(join(user, USER_CONFIG_FILE), "[models]\nfast = [1]\n");
  const bad = await loadConfig(repo, { userDir: user });
  assert.ok(!bad.ok);
  assert.match(configErrorText(bad.error), /^\/.*development-system\.toml: models\.fast/);
});

test("a repository config error is reported against the repository file", async () => {
  const repo = await mkdtemp(join(tmpdir(), "devsys-config-"));
  await writeFile(join(repo, CONFIG_FILE), '[delivery]\nmode = "x"\n');
  const bad = await loadConfig(repo, { userDir: null });
  assert.ok(!bad.ok);
  assert.match(configErrorText(bad.error), /^\.development-system\.toml: delivery\.mode/);
});
