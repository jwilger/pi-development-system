import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { ToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { createDevelopmentSystem } from "../../extensions/development-system.ts";
import { timeoutAsFailure } from "../../src/core/exec.ts";
import { isParseError } from "../../src/core/types.ts";
import { registerArchitectureGuard } from "../../src/gates/architecture-guard.ts";
import { createSessionState, parseDevsysState } from "../../src/state/session-state.ts";
import { offlineSession } from "../harness/offline-session.ts";

for (const authority of ["refs/remotes/origin/main", false] as const) {
  for (const [gitSettings, refused] of [
    [
      [
        ["push.recurseSubmodules", "false"],
        ["submodule.recurse", "true"],
      ],
      false,
    ],
    [
      [
        ["push.recurseSubmodules", "check"],
        ["submodule.recurse", "true"],
      ],
      false,
    ],
    [[["push.recurseSubmodules", "no"]], false],
    [[["push.recurseSubmodules", "off"]], false],
    [[["push.recurseSubmodules", "0"]], false],
    [[["submodule.recurse", "false"]], false],
    [[["push.recurseSubmodules", "unsupported"]], true],
    [[["submodule.recurse", "invalid-boolean"]], true],
  ] as const) {
    test(`non-publishing recursion semantics ${JSON.stringify(gitSettings)}; authority=${authority !== false}`, async (t) => {
      const command = "git push origin HEAD:feature/repair";
      const { host, executions, results, persisted } = await publicationSession(t, [command], {
        authority,
        gitSettings,
      });
      assert.deepEqual(host.errors, []);
      assert.equal(results.length, 1);
      assert.equal(results[0]?.isError, refused, JSON.stringify(results[0]?.content));
      assert.deepEqual(executions, refused ? [] : [command]);
      assert.ok(!isParseError(persisted));
      assert.deepEqual(persisted.reviews ?? [], []);
    });
  }
}

for (const authority of ["refs/remotes/origin/main", false] as const) {
  for (const configKey of ["push.recurseSubmodules", "submodule.recurse"] as const) {
    for (const configRead of [
      "failure",
      "timeout",
      "throw",
      "malformed",
      "absence-with-error",
    ] as const) {
      test(`indeterminate ${configKey} ${configRead} fails closed; authority=${authority !== false}`, async (t) => {
        const { host, executions, results, persisted } = await publicationSession(
          t,
          ["git push origin HEAD:feature/repair"],
          { authority, configKey, configRead },
        );
        assert.deepEqual(host.errors, []);
        assert.equal(results.length, 1);
        assert.equal(results[0]?.isError, true, JSON.stringify(results[0]?.content));
        assert.match(JSON.stringify(results[0]?.content), /architecture-publication-config/);
        assert.deepEqual(executions, []);
        assert.ok(!isParseError(persisted));
        assert.deepEqual(persisted.reviews ?? [], []);
        assert.equal(persisted.lastPushAt, undefined);
      });
    }
  }
}

for (const authority of ["refs/remotes/origin/main", false] as const) {
  for (const gitSettings of [
    [["push.followTags", "true"]],
    [["push.recurseSubmodules", "on-demand"]],
    [["submodule.recurse", "true"]],
    [
      ["push.followTags", "false"],
      ["push.recurseSubmodules", "check"],
      ["submodule.recurse", "true"],
    ],
  ] as const) {
    test(`legacy GIT_CONFIG cannot hide repository settings ${JSON.stringify(gitSettings)}; authority=${authority !== false}`, async (t) => {
      const { host, executions, results, persisted } = await publicationSession(
        t,
        ["git push origin HEAD:feature/repair"],
        { authority, legacyConfig: true, gitSettings },
      );
      for (const [key, value] of gitSettings) {
        const repository = spawnSync(
          "git",
          ["config", "--file", join(host.root, ".git/config"), "--get", key],
          { cwd: host.root, encoding: "utf8" },
        );
        assert.equal(repository.status, 0, repository.stderr);
        assert.equal(repository.stdout.trim(), value);
        const redirected = spawnSync("git", ["config", "--get", key], {
          cwd: host.root,
          encoding: "utf8",
          env: { ...process.env, GIT_CONFIG: join(host.root, "alternate.gitconfig") },
        });
        assert.equal(redirected.status, 1);
        assert.equal(redirected.stdout, "");
        assert.equal(redirected.stderr, "");
      }
      assert.deepEqual(host.errors, []);
      assert.equal(results.length, 1);
      assert.equal(results[0]?.isError, true, JSON.stringify(results[0]?.content));
      assert.match(JSON.stringify(results[0]?.content), /architecture-publication-config/);
      assert.deepEqual(executions, []);
      assert.ok(!isParseError(persisted));
      assert.deepEqual(persisted.reviews ?? [], []);
      assert.equal(persisted.lastPushAt, undefined);
    });
  }
  test(`empty inherited GIT_CONFIG selector fails closed; authority=${authority !== false}`, async (t) => {
    const { host, executions, results, persisted } = await publicationSession(
      t,
      ["git push origin HEAD:feature/repair"],
      { authority, legacyConfig: "empty" },
    );
    assert.deepEqual(host.errors, []);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.isError, true, JSON.stringify(results[0]?.content));
    assert.match(JSON.stringify(results[0]?.content), /architecture-publication-config/);
    assert.deepEqual(executions, []);
    assert.ok(!isParseError(persisted));
    assert.deepEqual(persisted.reviews ?? [], []);
    assert.equal(persisted.lastPushAt, undefined);
  });
  for (const environmentRead of [
    "failure",
    "timeout",
    "throw",
    "malformed",
    "absence-with-error",
  ] as const) {
    test(`indeterminate configuration-source ${environmentRead} fails closed; authority=${authority !== false}`, async (t) => {
      const { host, executions, results, persisted } = await publicationSession(
        t,
        ["git push origin HEAD:feature/repair"],
        { authority, environmentRead },
      );
      assert.deepEqual(host.errors, []);
      assert.equal(results.length, 1);
      assert.equal(results[0]?.isError, true, JSON.stringify(results[0]?.content));
      assert.match(JSON.stringify(results[0]?.content), /architecture-publication-config/);
      assert.deepEqual(executions, []);
      assert.ok(!isParseError(persisted));
      assert.deepEqual(persisted.reviews ?? [], []);
      assert.equal(persisted.lastPushAt, undefined);
    });
  }
}

test("production topic refuses inherited legacy GIT_CONFIG masking follow-tags", async (t) => {
  const { host, executions, results, persisted } = await publicationSession(
    t,
    ["git push origin HEAD:feature/repair"],
    { legacyConfig: true, followTags: "true" },
  );
  const redirected = spawnSync("git", ["config", "--bool", "--get", "push.followTags"], {
    cwd: host.root,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG: join(host.root, "alternate.gitconfig") },
  });
  assert.equal(redirected.status, 1);
  assert.equal(redirected.stdout, "");
  assert.equal(redirected.stderr, "");
  assert.deepEqual(host.errors, []);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.isError, true, JSON.stringify(results[0]?.content));
  assert.match(JSON.stringify(results[0]?.content), /architecture-publication-config/);
  assert.deepEqual(executions, []);
  assert.ok(!isParseError(persisted));
  assert.deepEqual(persisted.reviews ?? [], []);
  assert.equal(persisted.lastPushAt, undefined);
});

function configReadFixture(kind: string | undefined) {
  switch (kind) {
    case "throw":
      throw new Error("fixture configuration unavailable");
    case "failure":
      return { code: 128, stdout: "", stderr: "fixture configuration unavailable", killed: false };
    case "absence-with-error":
      return { code: 1, stdout: "", stderr: "fixture read error", killed: false };
    case "timeout":
      return { code: 0, stdout: "false\n", stderr: "", killed: true };
    case "malformed":
      return { code: 0, stdout: "unknown\n", stderr: "", killed: false };
    default:
      return undefined;
  }
}

function publicationReadFixture(
  command: string,
  args: readonly string[],
  options: { environmentRead?: string; configRead?: string; configKey?: string },
) {
  if (command === "node") return configReadFixture(options.environmentRead);
  if (command === "git" && args.includes(options.configKey ?? "push.followTags"))
    return configReadFixture(options.configRead);
  return undefined;
}

function signFixture(git: (...args: string[]) => string, root: string) {
  const key = join(root, "fixture-signing-key");
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  writeFileSync(key, privateKey.export({ type: "pkcs1", format: "pem" }), { mode: 0o600 });
  const { e, n } = publicKey.export({ format: "jwk" });
  if (e === undefined || n === undefined) throw new Error("fixture RSA public key unavailable");
  // OpenSSH public-key fields are length-prefixed; positive mpints need a leading
  // zero when their high bit is set. Git performs the actual SSH signing/verification.
  const fields = [
    Buffer.from("ssh-rsa"),
    ...[e, n].map((part) => {
      const bytes = Buffer.from(part, "base64url");
      return (bytes[0] ?? 0) & 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes;
    }),
  ];
  const publicBytes = Buffer.concat(
    fields.map((field) => {
      const length = Buffer.alloc(4);
      length.writeUInt32BE(field.length);
      return Buffer.concat([length, field]);
    }),
  );
  const publicText = `ssh-rsa ${publicBytes.toString("base64")}\n`;
  writeFileSync(`${key}.pub`, publicText);
  const signers = join(root, "allowed-signers");
  writeFileSync(signers, `fixture@example.invalid ${publicText}`);
  git("config", "gpg.ssh.allowedSignersFile", signers);
  git("config", "gpg.format", "ssh");
  git("config", "user.signingkey", key);
  git("config", "commit.gpgsign", "true");
}

function commitPublicationFixture(
  git: (...args: string[]) => string,
  root: string,
  adopted: string,
  options: { signed?: boolean; merge?: boolean; message?: string },
) {
  if (options.signed) signFixture(git, root);
  const message =
    options.message ??
    "fix: preserve PR policy\n\nTopic publication is not final trunk delivery and must keep the PR-only boundary.";
  git("commit", "-m", message);
  if (options.merge) {
    const side = git("commit-tree", `${adopted}^{tree}`, "-p", adopted, "-m", message);
    // Construct genuine multi-parent history without executing a merge or a push.
    const merged = git(
      "commit-tree",
      ...(options.signed ? ["-S"] : []),
      "HEAD^{tree}",
      "-p",
      "HEAD",
      "-p",
      side,
      "-m",
      "Merge fixture branches",
    );
    git("update-ref", "HEAD", merged);
  }
}

async function publicationSession(
  t: TestContext,
  commands: readonly (string | Pick<ToolCall, "name" | "arguments">)[],
  options: {
    mode?: "pull-request" | "trunk" | "local-only";
    remote?: string;
    trunk?: string;
    authority?: string | false;
    followTags?: string;
    configSource?: "local" | "include" | "environment";
    legacyConfig?: boolean | "empty";
    environmentRead?: "failure" | "timeout" | "throw" | "malformed" | "absence-with-error";
    configRead?: "failure" | "timeout" | "throw" | "malformed" | "absence-with-error";
    configKey?: "push.followTags" | "push.recurseSubmodules" | "submodule.recurse";
    gitSettings?: readonly (readonly [string, string])[];
    message?: string;
    transportFails?: boolean;
    invalidResult?: boolean;
    signed?: boolean;
    merge?: boolean;
  } = {},
) {
  const executions: string[] = [];
  const host = await offlineSession(
    t,
    (pi) => {
      const exec = pi.exec.bind(pi);
      pi.exec = async (command, args, execOptions) => {
        const fixture = publicationReadFixture(command, args, options);
        if (fixture !== undefined) return fixture;
        if (options.legacyConfig) {
          return exec(
            "env",
            [
              `GIT_CONFIG=${options.legacyConfig === "empty" ? "" : join(execOptions?.cwd ?? "", "alternate.gitconfig")}`,
              command,
              ...args,
            ],
            execOptions,
          );
        }
        if (command === "git" && options.configSource === "environment") {
          return exec(
            "env",
            [
              "GIT_CONFIG_COUNT=1",
              "GIT_CONFIG_KEY_0=push.followTags",
              `GIT_CONFIG_VALUE_0=${options.followTags ?? "false"}`,
              command,
              ...args,
            ],
            execOptions,
          );
        }
        return exec(command, args, execOptions);
      };
      createDevelopmentSystem(pi);
      pi.registerTool({
        name: "bash",
        label: "fixture publication",
        description: "Harmless fake push transport; never contacts a remote",
        parameters: Type.Object({ command: Type.String() }),
        async execute(_id, input) {
          executions.push(input.command);
          return {
            content: [{ type: "text", text: "fake publication transport" }],
            details: undefined,
            isError: options.transportFails === true,
          };
        },
      });
    },
    (_context, request) => {
      const command = commands[request];
      return command === undefined
        ? []
        : [
            {
              type: "toolCall",
              id: `publication-${request}`,
              ...(typeof command === "string" ? { name: "bash", arguments: { command } } : command),
            },
          ];
    },
    (root) => {
      const git = (...args: string[]) => {
        const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
        if (result.status !== 0) throw new Error(result.stderr);
        return result.stdout.trim();
      };
      git("init", "-b", "main");
      git("config", "user.name", "Fixture");
      git("config", "user.email", "fixture@example.invalid");
      // Ordinary fixtures do not use the operator's signing key. Signed fixtures deliberately
      // enable signature display to exercise the production machine-output boundary.
      git("config", "commit.gpgsign", "false");
      git("config", "log.showSignature", options.signed ? "true" : "false");
      writeFileSync(
        join(root, "ARCHITECTURE.md"),
        "# Architecture\n\nPreserve immutable history.\n",
      );
      git("add", ".");
      git("commit", "-m", "test: establish prospective boundary");
      const adopted = git("rev-parse", "HEAD");
      const remote = options.remote ?? "origin";
      const trunk = options.trunk ?? "main";
      git("update-ref", `refs/remotes/${remote}/${trunk}`, adopted);
      if (options.invalidResult) {
        const result = git(
          "commit-tree",
          `${adopted}^{tree}`,
          "-p",
          adopted,
          "-m",
          "test: proposed result drops topic changes",
        );
        git("update-ref", "refs/heads/invalid-result", result);
      }
      git("checkout", "-b", "feature/source");
      writeFileSync(join(root, "topic.txt"), "local topic work\n");
      git("add", ".");
      commitPublicationFixture(git, root, adopted, options);
      if (options.configSource === "include") {
        const included = join(root, "included.gitconfig");
        writeFileSync(included, `[push]\nfollowTags = ${options.followTags ?? "false"}\n`);
        git("config", "include.path", included);
      } else if (options.configSource !== "environment" && options.followTags !== undefined) {
        git("config", "push.followTags", options.followTags);
      }
      for (const [key, value] of options.gitSettings ?? []) git("config", key, value);
      if (options.legacyConfig) writeFileSync(join(root, "alternate.gitconfig"), "");
      // A reachable annotated tag would be implicitly published if followTags were enabled.
      git(
        "-c",
        "tag.gpgSign=false",
        "tag",
        "-a",
        "publication-fixture",
        "-m",
        "fixture annotation",
      );
      const architecture =
        options.authority === false
          ? ""
          : `[architecture]\ntrunk_ref = "${options.authority ?? `refs/remotes/${remote}/${trunk}`}"\nadopted_at = "${adopted}"\n`;
      writeFileSync(
        join(root, ".development-system.toml"),
        `[delivery]\nmode = "${options.mode ?? "pull-request"}"\nremote = "${remote}"\ntrunk = "${trunk}"\n${architecture}`,
      );
      return root;
    },
  );
  await host.session.prompt("Publish the owner-authorized topic; do not deliver to trunk.");
  const results = host.session.messages.flatMap((message) =>
    message.role === "toolResult" ? [message] : [],
  );
  const entry = host.session.sessionManager
    .getBranch()
    .findLast((item) => item.type === "custom" && item.customType === "devsys-state");
  const persisted = parseDevsysState(entry?.type === "custom" ? entry.data : undefined);
  return { host, executions, results, persisted };
}

test("production PR-topic publication reaches harmless transport without delivery review", async (t) => {
  const command = "git push origin HEAD:feature/repair";
  const { host, executions, results } = await publicationSession(t, [command]);
  assert.deepEqual(host.errors, []);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.isError, false, JSON.stringify(results[0]?.content));
  assert.deepEqual(executions, [command]);
});

test("signed production topic commit still requires rationale with signature display enabled", async (t) => {
  const { host, executions, results } = await publicationSession(
    t,
    ["git push origin HEAD:feature/repair"],
    { signed: true, message: "fix: tidy" },
  );
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: host.root, encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  };
  assert.match(git("cat-file", "commit", "HEAD"), /gpgsig -----BEGIN SSH SIGNATURE-----/);
  assert.equal(git("config", "--bool", "--get", "log.showSignature"), "true");
  const verified = spawnSync("git", ["verify-commit", "HEAD"], {
    cwd: host.root,
    encoding: "utf8",
  });
  assert.equal(verified.status, 0, verified.stderr);
  assert.match(verified.stderr, /Good.*signature/i);
  assert.deepEqual(host.errors, []);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.isError, true, JSON.stringify(results[0]?.content));
  assert.match(JSON.stringify(results[0]?.content), /commit.rationale/);
  assert.deepEqual(executions, []);
});

for (const authority of [undefined, false] as const) {
  test(`production topic refuses effective followTags=true with authority=${authority !== false}`, async (t) => {
    const { host, executions, results, persisted } = await publicationSession(
      t,
      ["git push origin HEAD:feature/repair"],
      { ...(authority === false ? { authority } : {}), followTags: "true" },
    );
    assert.deepEqual(host.errors, []);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.isError, true, JSON.stringify(results[0]?.content));
    assert.match(JSON.stringify(results[0]?.content), /architecture-publication-config/);
    assert.deepEqual(executions, []);
    assert.ok(!isParseError(persisted));
    assert.deepEqual(persisted.reviews ?? [], []);
    assert.equal(persisted.lastPushAt, undefined);
  });
}

for (const authority of ["refs/remotes/origin/main", false] as const) {
  for (const [followTags, refused] of [
    [undefined, false],
    ["false", false],
    ["no", false],
    ["off", false],
    ["0", false],
    ["", false],
    ["yes", true],
    ["on", true],
    ["1", true],
    ["-2", true],
    ["not-a-boolean", true],
  ] as const) {
    test(`effective followTags=${String(followTags)} obeys Git boolean semantics; authority=${authority !== false}`, async (t) => {
      const command = "git push origin HEAD:feature/repair";
      const { host, executions, results, persisted } = await publicationSession(t, [command], {
        authority,
        ...(followTags === undefined ? {} : { followTags }),
      });
      assert.deepEqual(host.errors, []);
      assert.equal(results.length, 1);
      assert.equal(results[0]?.isError, refused, JSON.stringify(results[0]?.content));
      assert.deepEqual(executions, refused ? [] : [command]);
      if (refused)
        assert.match(JSON.stringify(results[0]?.content), /architecture-publication-config/);
      assert.ok(!isParseError(persisted));
      assert.deepEqual(persisted.reviews ?? [], []);
      assert.equal(typeof persisted.lastPushAt, refused ? "undefined" : "string");
    });
  }
  for (const configSource of ["include", "environment"] as const) {
    for (const followTags of ["true", "false"] as const) {
      test(`effective ${configSource} followTags=${followTags}; authority=${authority !== false}`, async (t) => {
        const command = "git push origin HEAD:feature/repair";
        const { host, executions, results, persisted } = await publicationSession(t, [command], {
          authority,
          configSource,
          followTags,
        });
        assert.deepEqual(host.errors, []);
        assert.equal(results.length, 1);
        assert.equal(
          results[0]?.isError,
          followTags === "true",
          JSON.stringify(results[0]?.content),
        );
        assert.deepEqual(executions, followTags === "true" ? [] : [command]);
        assert.ok(!isParseError(persisted));
        assert.deepEqual(persisted.reviews ?? [], []);
        assert.equal(typeof persisted.lastPushAt, followTags === "true" ? "undefined" : "string");
      });
    }
  }
  for (const configRead of [
    "failure",
    "timeout",
    "throw",
    "malformed",
    "absence-with-error",
  ] as const) {
    test(`indeterminate followTags ${configRead} fails closed; authority=${authority !== false}`, async (t) => {
      const { host, executions, results, persisted } = await publicationSession(
        t,
        ["git push origin HEAD:feature/repair"],
        { authority, configRead },
      );
      assert.deepEqual(host.errors, []);
      assert.equal(results.length, 1);
      assert.equal(results[0]?.isError, true, JSON.stringify(results[0]?.content));
      assert.match(JSON.stringify(results[0]?.content), /architecture-publication-config/);
      assert.deepEqual(executions, []);
      assert.ok(!isParseError(persisted));
      assert.deepEqual(persisted.reviews ?? [], []);
      assert.equal(persisted.lastPushAt, undefined);
    });
  }
}

for (const authority of ["refs/remotes/origin/main", false] as const) {
  for (const gitSettings of [
    [["push.recurseSubmodules", "on-demand"]],
    [["push.recurseSubmodules", "only"]],
    [["submodule.recurse", "true"]],
  ] as const) {
    test(`topic refuses implicit cross-repository publication ${JSON.stringify(gitSettings)}; authority=${authority !== false}`, async (t) => {
      const { host, executions, results, persisted } = await publicationSession(
        t,
        ["git push origin HEAD:feature/repair"],
        { authority, gitSettings },
      );
      assert.deepEqual(host.errors, []);
      assert.equal(results.length, 1);
      assert.equal(results[0]?.isError, true, JSON.stringify(results[0]?.content));
      assert.match(JSON.stringify(results[0]?.content), /architecture-publication-config/);
      assert.deepEqual(executions, []);
      assert.ok(!isParseError(persisted));
      assert.deepEqual(persisted.reviews ?? [], []);
      assert.equal(persisted.lastPushAt, undefined);
    });
  }
}

for (const [merge, message, reason] of [
  [false, undefined, undefined],
  [true, undefined, undefined],
  [
    false,
    "fix: explain signing because signatures must not hide attribution\n\nCo-Authored-By: Fixture <fixture@example.invalid>",
    /commit.forbidden-trailer/,
  ],
] as const) {
  test(`signed production topic retains rationale, merge and attribution semantics; merge=${merge}, refused=${reason !== undefined}`, async (t) => {
    const command = "git push origin HEAD:feature/repair";
    const { host, executions, results, persisted } = await publicationSession(t, [command], {
      signed: true,
      merge,
      ...(message === undefined ? {} : { message }),
    });
    assert.deepEqual(host.errors, []);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.isError, reason !== undefined, JSON.stringify(results[0]?.content));
    assert.deepEqual(executions, reason === undefined ? [command] : []);
    if (reason !== undefined) assert.match(JSON.stringify(results[0]?.content), reason);
    assert.ok(!isParseError(persisted));
    assert.deepEqual(persisted.reviews ?? [], []);
  });
}

test("PR publication refuses namespace-ambiguous configured trunk even when authority repeats it", async (t) => {
  const { host, executions, results } = await publicationSession(t, ["git push origin HEAD:main"], {
    trunk: "refs/heads/main",
  });
  assert.deepEqual(host.errors, []);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.isError, true, JSON.stringify(results[0]?.content));
  assert.deepEqual(executions, []);
});

for (const mode of ["trunk", "local-only"] as const) {
  test(`production ${mode} mode still refuses topic publication`, async (t) => {
    const { host, executions, results } = await publicationSession(
      t,
      ["git push origin HEAD:feature/repair"],
      { mode },
    );
    assert.deepEqual(host.errors, []);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.isError, true);
    assert.deepEqual(executions, []);
  });
}

for (const authority of [
  "refs/remotes/origin/feature/repair",
  "refs/remotes/other/main",
  "refs/heads/main",
]) {
  test(`production topic publication refuses conflicting or ambiguous authority ${authority}`, async (t) => {
    const { host, executions, results } = await publicationSession(
      t,
      ["git push origin HEAD:feature/repair"],
      { authority },
    );
    assert.deepEqual(host.errors, []);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.isError, true);
    assert.match(JSON.stringify(results[0]?.content), /architecture-push-target/);
    assert.deepEqual(executions, []);
  });
}

test("production topic publication uses configured remote and trunk rather than default names", async (t) => {
  const command = "git push upstream HEAD:main";
  const { host, executions, results } = await publicationSession(t, [command], {
    remote: "upstream",
    trunk: "stable",
  });
  assert.deepEqual(host.errors, []);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.isError, false, JSON.stringify(results[0]?.content));
  assert.deepEqual(executions, [command]);
});

const refusedPublications = [
  "git push other HEAD:feature/repair",
  "git push origin HEAD:main",
  "git push origin HEAD:refs/heads/main",
  "git push origin HEAD:refs/heads/feature/repair",
  "git push origin HEAD:refs/tags/repair",
  "git push origin HEAD:heads/main",
  "git push origin HEAD:tags/repair",
  "git push origin HEAD:remotes/origin/main",
  "git push origin HEAD:HEAD",
  "git push origin HEAD:feature//repair",
  "git push origin HEAD:feature/../main",
  "git push origin HEAD:feature/.hidden",
  "git push origin HEAD:feature/repair.",
  "git push origin HEAD:feature/repair.lock",
  "git push origin HEAD:feature.lock/repair",
  "git push origin HEAD:feature/a..b",
  "git push --force origin HEAD:feature/repair",
  "git push -f origin HEAD:feature/repair",
  "git push --force-with-lease origin HEAD:feature/repair",
  "git push --force-if-includes origin HEAD:feature/repair",
  "git push origin +HEAD:feature/repair",
  "git push origin :feature/repair",
  "git push origin --delete feature/repair",
  "git push origin HEAD:feature/repair HEAD:other",
  "git push origin HEAD:feature/repair --tags",
  "git push origin --tags",
  "git push origin --all",
  "git push origin --mirror",
  "git push origin :",
  "git push origin HEAD:feature/*",
  "git push origin HEAD:feature/repair && git push origin HEAD:other",
  "git push origin HEAD:feature/repair; true",
  "git commit -m 'fix: hidden history' && git push origin HEAD:feature/repair",
  "git push origin HEAD:$TOPIC",
  'git push origin "$SOURCE":feature/repair',
  "git push origin HEAD:$(echo feature/repair)",
  "git -C ../other push origin HEAD:feature/repair",
  "cd ../other && git push origin HEAD:feature/repair",
  "git push origin feature/source:feature/repair",
  "git push origin HEAD~1:feature/repair",
  "git push -u origin HEAD:feature/repair",
  "git push origin HEAD",
  "git push origin",
];
for (const command of refusedPublications) {
  test(`production PR-topic path refuses ${command}`, async (t) => {
    const { host, executions, results } = await publicationSession(t, [command]);
    assert.deepEqual(host.errors, []);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.isError, true, command);
    assert.deepEqual(executions, [], command);
  });
}

test("PR-topic option refusal explains a topic-preserving retry", async (t) => {
  const { host, executions, results } = await publicationSession(t, [
    "git push -u origin HEAD:feature/repair",
  ]);
  assert.deepEqual(host.errors, []);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.isError, true);
  const diagnostic = JSON.stringify(results[0]?.content);
  assert.match(diagnostic, /architecture-command-shape/);
  assert.match(diagnostic, /HEAD:TOPIC/);
  assert.match(diagnostic, /pull-request mode/);
  assert.match(diagnostic, /remove extra options/i);
  assert.match(diagnostic, /keeping the intended destination/);
  assert.deepEqual(executions, []);
});

for (const [message, reason] of [
  [
    "fix: publish safely because topic commits must honor the message policy\n\nCo-Authored-By: Fixture <fixture@example.invalid>",
    /commit.forbidden-trailer/,
  ],
  ["fix: tidy", /commit.rationale/],
] as const) {
  test(`eligible production PR-topic publication still enforces ${reason}`, async (t) => {
    const { host, executions, results } = await publicationSession(
      t,
      ["git push origin HEAD:feature/repair"],
      { message },
    );
    assert.deepEqual(host.errors, []);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.isError, true, JSON.stringify(results[0]?.content));
    assert.match(JSON.stringify(results[0]?.content), reason);
    assert.deepEqual(executions, []);
  });
}

for (const transportFails of [false, true]) {
  test(`topic transport failure=${transportFails} preserves push-state semantics and creates no delivery credit`, async (t) => {
    const { host, results, persisted } = await publicationSession(
      t,
      ["git push origin HEAD:feature/repair"],
      { transportFails },
    );
    assert.deepEqual(host.errors, []);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.isError, transportFails);
    assert.ok(!isParseError(persisted));
    assert.deepEqual(persisted.reviews ?? [], [], "publication must not create review receipts");
    assert.equal(typeof persisted.lastPushAt, transportFails ? "undefined" : "string");
  });
}

test("topic publication does not authorize trunk delivery, opaque PR merge or a tree-dropping proposed squash", async (t) => {
  const publication = "git push origin HEAD:feature/repair";
  const { host, executions, results, persisted } = await publicationSession(
    t,
    [
      publication,
      "git push origin HEAD:main",
      "gh pr merge 17 --squash",
      {
        name: "devsys_review_start",
        arguments: {
          slice: "topic-repair",
          architectureBoundary: "delivery",
          resulting: ["refs/heads/invalid-result"],
        },
      },
    ],
    { invalidResult: true },
  );
  assert.deepEqual(host.errors, []);
  assert.equal(results.length, 4);
  assert.deepEqual(
    results.map((result) => result.isError),
    [false, true, true, true],
  );
  assert.deepEqual(executions, [publication]);
  assert.match(JSON.stringify(results[1]?.content), /architecture-semantic-review-required/);
  assert.match(JSON.stringify(results[2]?.content), /architecture-resulting-history-unavailable/);
  assert.match(
    JSON.stringify(results[3]?.content),
    /architecture-history-shape.*preserve the entire pending source tree/,
  );
  assert.ok(!isParseError(persisted));
  assert.deepEqual(persisted.reviews ?? [], []);
});

const commitMessage = "'feat: preserve decision history because records must remain trustworthy'";
const cases = [
  { paired: false, command: `git commit -m ${commitMessage}`, allowed: false, production: false },
  { paired: false, command: `git commit -m ${commitMessage}`, allowed: false, production: true },
  { paired: true, command: `git commit -m ${commitMessage}`, allowed: false },
  { paired: true, command: `git add . && git commit -m ${commitMessage}`, allowed: false },
  { paired: true, command: `git commit -am ${commitMessage}`, allowed: false },
  { paired: true, command: `git -C . commit -m ${commitMessage}`, allowed: false },
  {
    paired: false,
    command: `JEV_OVERRIDE='Owner approved version' git commit -m ${commitMessage}`,
    allowed: false,
    production: true,
  },
  {
    paired: true,
    command: `JEV_OVERRIDE='Owner approved version' git commit -m ${commitMessage}`,
    allowed: false,
    reason: /architecture-semantic-review-required/,
  },
  ...[
    "JEV_OVERRIDE=''",
    'JEV_OVERRIDE=""',
    "JEV_OVERRIDE='   '",
    "JEV_OVERRIDE=approved",
    'JEV_OVERRIDE="$HOME"',
    'JEV_OVERRIDE="$(echo approved)"',
    'JEV_OVERRIDE="`echo approved`"',
    'JEV_OVERRIDE="escaped\\\\value"',
    "OTHER='approved'",
    "GIT_INDEX_FILE='alternate'",
    "JEV_OVERRIDE='approved' GIT_INDEX_FILE='alternate'",
    "JEV_OVERRIDE='approved' JEV_OVERRIDE='again'",
    "env JEV_OVERRIDE='approved'",
    "export JEV_OVERRIDE='approved';",
  ].map((prefix) => ({
    paired: true,
    command: `${prefix} git commit -m ${commitMessage}`,
    allowed: false,
    reason: /architecture-command-shape/,
  })),
  ...[
    `git commit -am ${commitMessage}`,
    `git -C . commit -m ${commitMessage}`,
    `git commit --no-verify -m ${commitMessage}`,
    `git commit -m ${commitMessage} && echo extra`,
    `git add . && git commit -m ${commitMessage}`,
  ].map((command) => ({
    paired: true,
    command: `JEV_OVERRIDE='approved' ${command}`,
    allowed: false,
    reason: /architecture-command-shape/,
  })),
  { paired: true, command: "git cherry-pick HEAD", allowed: false },
  { paired: true, command: "git push origin HEAD:main", allowed: false },
  { paired: true, command: "gh pr merge 17 --squash", allowed: false },
];
for (const { paired, command, allowed, production, reason } of cases) {
  test(`pi architecture boundary: ${command}, paired=${paired}, production=${production === true}`, async (t) => {
    let executions = 0;
    let head = "";
    const host = await offlineSession(
      t,
      (pi) => {
        const exec = async (
          binary: string,
          args: string[],
          options?: { cwd?: string; timeout?: number },
        ) => timeoutAsFailure(await pi.exec(binary, args, options));
        if (production) createDevelopmentSystem(pi);
        else registerArchitectureGuard({ pi, exec, state: createSessionState(pi) });
        pi.registerTool({
          name: "bash",
          label: "fixture bash",
          description: "Fixture commit transport",
          parameters: Type.Object({ command: Type.String() }),
          async execute(_id, input, _signal, _update, ctx) {
            executions += 1;
            const result = await exec("sh", ["-c", input.command], { cwd: ctx.cwd });
            return {
              content: [{ type: "text", text: result.stdout + result.stderr }],
              details: undefined,
              isError: result.code !== 0,
            };
          },
        });
      },
      (_context, request) =>
        request === 0
          ? [{ type: "toolCall", id: "commit", name: "bash", arguments: { command } }]
          : [],
      (root) => {
        const git = (...args: string[]) => {
          const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
          assert.equal(result.status, 0, result.stderr);
          return result.stdout.trim();
        };
        git("init", "-b", "main");
        git("config", "user.name", "Fixture");
        git("config", "user.email", "fixture@example.invalid");
        writeFileSync(
          join(root, "ARCHITECTURE.md"),
          "# Architecture\n\nThe boundary protects immutable history.\n",
        );
        git("add", ".");
        git("commit", "-m", "test: establish prospective boundary");
        head = git("rev-parse", "HEAD");
        git("update-ref", "refs/remotes/origin/main", head);
        writeFileSync(
          join(root, ".development-system.toml"),
          `[architecture]\ntrunk_ref = "refs/remotes/origin/main"\nadopted_at = "${head}"\n`,
        );
        mkdirSync(join(root, "docs/adr"), { recursive: true });
        writeFileSync(
          join(root, "docs/adr/0001-history.md"),
          "# History\n\n- **Status:** accepted\n\nPreserve rationale.\n",
        );
        if (paired)
          writeFileSync(
            join(root, "ARCHITECTURE.md"),
            "# Architecture\n\nThe boundary protects immutable history and rejects unpaired decisions.\n",
          );
        git("add", ".");
        return root;
      },
    );
    await host.session.prompt("Commit the staged decision.");
    assert.deepEqual(host.errors, []);
    assert.equal(executions, allowed ? 1 : 0);
    const results = host.session.messages.flatMap((message) =>
      message.role === "toolResult" ? [message] : [],
    );
    assert.equal(results.length, 1);
    assert.equal(results[0]?.isError, !allowed);
    if (production)
      assert.match(JSON.stringify(results[0]?.content), /architecture-update-required/);
    if (reason) assert.match(JSON.stringify(results[0]?.content), reason);
    const current = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: host.root,
      encoding: "utf8",
    }).stdout.trim();
    assert.equal(current === head, !allowed);
  });
}
