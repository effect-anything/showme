#!/usr/bin/env node

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { main } from "./cli.ts";

NodeRuntime.runMain(main);
