# Codex SDK

Embed the Codex agent in your workflows and apps.

The TypeScript SDK wraps the bundled `codex` binary. It spawns the CLI and exchanges JSONL events over stdin/stdout.

## Installation

```bash
npm install @openai/codex-sdk
```

Requires Node.js 18+.

## Quickstart

```typescript
import { Codex } from "@openai/codex-sdk";

const codex = new Codex();
const thread = codex.startThread();
const turn = await thread.run("Diagnose the test failure and propose a fix");

console.log(turn.finalResponse);
console.log(turn.items);
```

Call `run()` repeatedly on the same `Thread` instance to continue that conversation.

```typescript
const nextTurn = await thread.run("Implement the fix");
```

### Streaming responses

`run()` buffers events until the turn finishes. To react to intermediate progress—tool calls, streaming responses, and file diffs—use `runStreamed()` instead, which returns an async generator of structured events.

```typescript
const { events } = await thread.runStreamed("Diagnose the test failure and propose a fix");

for await (const event of events) {
  switch (event.type) {
    case "item.completed":
      console.log("item", event.item);
      break;
    case "turn.completed":
      console.log("usage", event.usage);
      break;
  }
}
```

### Structured output

The Codex agent can produce a JSON response that conforms to a specified schema. The schema can be provided for each turn as a plain JSON object.

```typescript
const schema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    status: { type: "string", enum: ["ok", "action_required"] },
  },
  required: ["summary", "status"],
  additionalProperties: false,
} as const;

const turn = await thread.run("Summarize repository status", { outputSchema: schema });
console.log(turn.finalResponse);
```

You can also create a JSON schema from a [Zod schema](https://github.com/colinhacks/zod) using the [`zod-to-json-schema`](https://www.npmjs.com/package/zod-to-json-schema) package and setting the `target` to `"openAi"`.

```typescript
const schema = z.object({
  summary: z.string(),
  status: z.enum(["ok", "action_required"]),
});

const turn = await thread.run("Summarize repository status", {
  outputSchema: zodToJsonSchema(schema, { target: "openAi" }),
});
console.log(turn.finalResponse);
```

### Resuming an existing thread

Threads are persisted in `~/.codex/sessions`. If you lose the in-memory `Thread` object, reconstruct it with `resumeThread()` and keep going.

```typescript
const savedThreadId = process.env.CODEX_THREAD_ID!;
const thread = codex.resumeThread(savedThreadId);
await thread.run("Implement the fix");
```

### Working directory controls

Codex runs in the current working directory by default. To avoid unrecoverable errors, Codex requires the working directory to be a Git repository. You can skip the Git repository check by passing the `skipGitRepoCheck` option when creating a thread. 

```typescript
const thread = codex.startThread({
  workingDirectory: "/path/to/project",
  skipGitRepoCheck: true,
});
```


### Basic streaming example

```typescript
#!/usr/bin/env -S NODE_NO_WARNINGS=1 pnpm ts-node-esm --files

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { Codex } from "@openai/codex-sdk";
import type { ThreadEvent, ThreadItem } from "@openai/codex-sdk";
import { codexPathOverride } from "./helpers.ts";

const codex = new Codex({ codexPathOverride: codexPathOverride() });
const thread = codex.startThread();
const rl = createInterface({ input, output });

const handleItemCompleted = (item: ThreadItem): void => {
  switch (item.type) {
    case "agent_message":
      console.log(`Assistant: ${item.text}`);
      break;
    case "reasoning":
      console.log(`Reasoning: ${item.text}`);
      break;
    case "command_execution": {
      const exitText = item.exit_code !== undefined ? ` Exit code ${item.exit_code}.` : "";
      console.log(`Command ${item.command} ${item.status}.${exitText}`);
      break;
    }
    case "file_change": {
      for (const change of item.changes) {
        console.log(`File ${change.kind} ${change.path}`);
      }
      break;
    }
  }
};

const handleItemUpdated = (item: ThreadItem): void => {
  switch (item.type) {
    case "todo_list": {
      console.log(`Todo:`);
      for (const todo of item.items) {
        console.log(`\t ${todo.completed ? "x" : " "} ${todo.text}`);
      }
      break;
    }
  }
};

const handleEvent = (event: ThreadEvent): void => {
  switch (event.type) {
    case "item.completed":
      handleItemCompleted(event.item);
      break;
    case "item.updated":
    case "item.started":
      handleItemUpdated(event.item);
      break;
    case "turn.completed":
      console.log(
        `Used ${event.usage.input_tokens} input tokens, ${event.usage.cached_input_tokens} cached input tokens, ${event.usage.output_tokens} output tokens.`,
      );
      break;
    case "turn.failed":
      console.error(`Turn failed: ${event.error.message}`);
      break;
  }
};

const main = async (): Promise<void> => {
  try {
    while (true) {
      const inputText = await rl.question(">");
      const trimmed = inputText.trim();
      if (trimmed.length === 0) {
        continue;
      }
      const { events } = await thread.runStreamed(inputText);
      for await (const event of events) {
        handleEvent(event);
      }
    }
  } finally {
    rl.close();
  }
};

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Unexpected error: ${message}`);
  process.exit(1);
});
```