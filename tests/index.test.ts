import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Command from "effect/unstable/cli/Command";

import { cli } from "../src/cli.ts";

it.layer(NodeServices.layer)("todo", (it) => {
  it.effect(
    "help",
    Effect.fn(function* () {
      const runCommand = Command.runWith(cli, { version: "1.0.0" });

      // Test normal execution
      // yield* runCommand(["--name", "Alice", "--count", "2"]);

      // Test help display
      yield* runCommand(["--help"]);
    }),
  );

  it.effect(
    "version",
    Effect.fn(function* () {
      const runCommand = Command.runWith(cli, { version: "1.0.0" });

      // Test version display
      yield* runCommand(["--version"]);
    }),
  );
});
