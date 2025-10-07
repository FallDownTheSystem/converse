---
id: task-047-implement-codex-provider-and-e2e-tests
title: Implement Codex Provider and E2E Tests
status: "To Do"
created_date: '2025-10-07 12:08'
updated_date: '2025-10-07 12:30'
parent: task-045
subtasks: []
dependencies: [task-046]
---

## Description
<!-- DESCRIPTION:BEGIN -->
Task-046 confirmed that the Codex SDK works in isolation. Now we need to implement a working Codex provider that integrates with our MCP server and verify it works end-to-end through real MCP client/server tests.

**What We're Building:** A Codex provider (`src/providers/codex.js`) that follows our existing provider interface, a stream normalizer for Codex events, and E2E tests that validate Codex works within the full MCP server stack.

**What This Enables:** Once this task is complete, users can call the Chat tool with `model: 'codex'` and get responses from Codex through our MCP server, just like they do with OpenAI, Google, or any other provider.

**What's Deferred:** Advanced validation (concurrency stress tests, platform-specific edge cases, HTTP transport parity, etc.) will be done in task-052 after the full integration is complete. This task focuses on getting a working provider with basic E2E tests.

**Success Criteria:** E2E tests pass for basic chat, streaming, continuation (thread resumption), and async mode using the `codex` model.
<!-- DESCRIPTION:END -->

## Specification
<!-- SPECIFICATION:BEGIN -->

### Provider Requirements

**Must Implement:**
1. Provider interface methods (`invoke`, `validateConfig`, `isAvailable`, `getSupportedModels`, `getModelConfig`)
2. Streaming support (return async generator)
3. Non-streaming support (return complete response)
4. Thread management (create new threads, resume existing threads via continuation_id)
5. AbortSignal support (cancellation)

**Hardcoded Defaults (for now):**
- `sandbox: 'read-only'` - Prevent file modifications by default
- `skipGitRepoCheck: true` - Don't require Git repository
- `approvalPolicy: 'never'` - No interactive prompts in headless mode
- `workingDirectory: process.env.CLIENT_CWD || process.cwd()` - Use client's working directory

**Configuration to defer:** Task-048 will add user-configurable options. For now, hardcode safe defaults.

### Stream Normalizer Requirements

**Must Handle:**
- `thread.started` → `start` event (capture thread_id)
- `item.completed` (type: "agent_message") → `delta` events (accumulate text)
- `item.completed` (type: "reasoning") → filter out (don't send to user)
- `turn.completed` → `end` event (include usage)
- Unknown events → ignore silently (don't crash)

**Reference Implementation:** GPT-5 provided complete `normalizeCodexStream()` code in task-045 Notes section.

### E2E Test Requirements

**Test Pattern:** Follow existing provider tests (e.g., `tests/integration/providers/openai/openai-api.test.js`)

**Must Test:**
1. **Basic Chat** - Call with `model: 'codex'`, verify response
2. **Streaming** - Verify events arrive incrementally
3. **Continuation** - Resume thread with continuation_id, verify context preserved
4. **Async Mode** - Submit with `async: true`, poll check_status, verify completion

**Test Structure:**
```javascript
describe('Codex Provider E2E Tests', () => {
  testWithApiKeys({ requiredProviders: ['CODEX'] })(
    'should work with basic chat',
    async () => {
      await withHTTPTestServer(async (client) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: { prompt: 'What is 2+2?', model: 'codex' }
        });
        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toBeTruthy();
      });
    }
  );
});
```

**Conditional Execution:**
- Tests skip if Codex not available (no ChatGPT login or SDK not installed)
- Use `testWithApiKeys` pattern with graceful skipping

### Acceptance Criteria

**Provider Implementation:**
- ✅ Provider file created: `src/providers/codex.js`
- ✅ Provider registered in `src/providers/index.js`
- ✅ Stream normalizer added to `src/async/providerStreamNormalizer.js`
- ✅ Provider follows existing interface contract
- ✅ Hardcoded defaults are secure (read-only sandbox, no approvals)

**E2E Tests:**
- ✅ Test file created: `tests/integration/providers/codex/codex-api.test.js`
- ✅ Basic chat test passes
- ✅ Streaming test passes
- ✅ Continuation test passes (thread resumption)
- ✅ Async mode test passes
- ✅ Tests skip gracefully when Codex unavailable

**Documentation:**
- ✅ Provider code is well-commented
- ✅ Tests include clear descriptions
- ✅ README notes that Codex requires ChatGPT login

<!-- SPECIFICATION:END -->

## Design
<!-- DESIGN:BEGIN -->

### Implementation Approach

**Follow Existing Patterns:** Study `src/providers/openai.js` and `src/providers/xai.js` as references. Codex is structurally similar (OpenAI SDK, streaming, chat interface).

**Key Difference:** Codex uses threads (persistent sessions) rather than stateless API calls. We map this to our continuation system:
- First call: Create new thread
- Continuation: Resume existing thread by ID
- Store thread ID in continuation metadata

### Provider Implementation

**File:** `src/providers/codex.js`

**Structure:**
```javascript
import { Codex } from '@openai/codex-sdk';

export const codexProvider = {
  name: 'codex',

  async invoke(messages, options) {
    const { stream = false, signal, continuation_id } = options;

    // Get thread ID from continuation if resuming
    const threadId = continuation_id ?
      await getThreadIdFromContinuation(continuation_id) : null;

    const codex = new Codex();

    // Create or resume thread
    const thread = threadId ?
      codex.resumeThread(threadId) :
      codex.startThread({
        workingDirectory: options.workingDirectory || process.env.CLIENT_CWD || process.cwd(),
        skipGitRepoCheck: true,
        sandbox: 'read-only',
        approvalPolicy: 'never'
      });

    // Convert messages to prompt (Codex uses single prompt, not message array)
    const prompt = convertMessagesToPrompt(messages);

    if (stream) {
      return this._createStreamingGenerator(thread, prompt, signal);
    }

    const turn = await thread.run(prompt);
    return {
      content: turn.finalResponse,
      usage: turn.usage,
      metadata: { threadId: thread.id }
    };
  },

  async *_createStreamingGenerator(thread, prompt, signal) {
    const { events } = await thread.runStreamed(prompt);

    for await (const event of events) {
      if (signal?.aborted) throw new Error('Cancelled');
      yield event; // Raw Codex events, will be normalized by streamNormalizer
    }
  },

  validateConfig(config) {
    // Codex uses ChatGPT login (no API key needed)
    return { valid: true };
  },

  isAvailable(config) {
    // Check if @openai/codex-sdk is available
    try {
      require.resolve('@openai/codex-sdk');
      return true;
    } catch {
      return false;
    }
  },

  getSupportedModels() {
    return ['codex', 'gpt-5-codex'];
  },

  getModelConfig(modelName) {
    return {
      supportsStreaming: true,
      supportsImages: false,
      supportsFunctions: false,
      maxTokens: null // Codex manages this internally
    };
  }
};
```

**Helper Functions:**
```javascript
function convertMessagesToPrompt(messages) {
  // For new threads: just use last user message
  // Codex manages conversation history internally
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();
  return lastUserMessage?.content || '';
}

async function getThreadIdFromContinuation(continuationId) {
  const state = await continuationStore.get(continuationId);
  return state?.codexThreadId || null;
}
```

### Stream Normalizer Implementation

**File:** `src/async/providerStreamNormalizer.js`

**Changes:**

1. Add to registry (line ~40):
```javascript
this.normalizers = {
  // ... existing normalizers
  codex: this.normalizeCodexStream.bind(this)
};
```

2. Add normalizer method (complete implementation provided by GPT-5 in task-045 Notes):
```javascript
async *normalizeCodexStream(stream, context) {
  const provider = 'codex';
  const model = context.model || 'codex';
  let accumulatedContent = '';
  let finalUsage = null;
  let threadId = null;

  for await (const event of stream) {
    switch (event?.type) {
      case 'thread.started':
        threadId = event.thread_id;
        yield this.createStartEvent(provider, model, { threadId });
        break;

      case 'item.completed':
        if (event.item?.type === 'agent_message') {
          const text = event.item.text || '';
          accumulatedContent += text;
          yield this.createDeltaEvent(text, provider, model);
        }
        // Ignore reasoning items
        break;

      case 'turn.completed':
        finalUsage = event.usage;
        yield this.createEndEvent({
          content: accumulatedContent,
          stopReason: 'stop',
          usage: finalUsage,
          metadata: { threadId }
        }, provider, model);
        break;

      // Ignore turn.started and unknown events
    }
  }
}
```

### E2E Test Implementation

**File:** `tests/integration/providers/codex/codex-api.test.js`

**Pattern:** Follow `openai-api.test.js` structure exactly

**Test 1: Basic Chat**
```javascript
testWithApiKeys({ requiredProviders: ['CODEX'] })(
  'should work with basic Codex chat',
  async () => {
    await withHTTPTestServer(async (client) => {
      const result = await client.callTool({
        name: 'chat',
        arguments: {
          prompt: 'What is 2+2? Answer with just the number.',
          model: 'codex'
        }
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('4');
    });
  },
  60000
);
```

**Test 2: Streaming**
```javascript
testWithApiKeys({ requiredProviders: ['CODEX'] })(
  'should work with streaming',
  async () => {
    await withHTTPTestServer(async (client) => {
      const result = await client.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Count from 1 to 3.',
          model: 'codex',
          stream: true
        }
      });

      expect(result.isError).toBeFalsy();
      // Verify streaming events received
    });
  },
  60000
);
```

**Test 3: Continuation**
```javascript
testWithApiKeys({ requiredProviders: ['CODEX'] })(
  'should maintain conversation continuity',
  async () => {
    await withHTTPTestServer(async (client) => {
      // First message
      const firstResult = await client.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Remember this number: 42. Just say "Remembered".',
          model: 'codex'
        }
      });

      expect(firstResult.isError).toBeFalsy();
      const conversationId = firstResult.continuation.id;

      // Second message (continuation)
      const secondResult = await client.callTool({
        name: 'chat',
        arguments: {
          prompt: 'What number did I ask you to remember?',
          model: 'codex',
          continuation_id: conversationId
        }
      });

      expect(secondResult.isError).toBeFalsy();
      expect(secondResult.content[0].text).toContain('42');
    });
  },
  60000
);
```

**Test 4: Async Mode**
```javascript
testWithApiKeys({ requiredProviders: ['CODEX'] })(
  'should work with async mode',
  async () => {
    await withHTTPTestServer(async (client) => {
      const result = await client.callTool({
        name: 'chat',
        arguments: {
          prompt: 'What is 10 divided by 2?',
          model: 'codex',
          async: true
        }
      });

      const asyncResponse = parseAsyncResponse(result);
      const jobId = asyncResponse.continuation_id;

      // Poll for completion
      let completed = false;
      let attempts = 0;
      while (!completed && attempts < 30) {
        await new Promise(r => setTimeout(r, 1000));

        const statusResult = await client.callTool({
          name: 'check_status',
          arguments: { continuation_id: jobId }
        });

        const status = parseStatusResponse(statusResult.content[0].text);
        if (status.status === 'completed') {
          expect(status.result).toContain('5');
          completed = true;
        } else if (status.status === 'failed') {
          throw new Error(`Job failed: ${status.error}`);
        }
        attempts++;
      }

      expect(completed).toBe(true);
    });
  },
  90000
);
```

### Conditional Test Helper

**Update:** `tests/utils/conditionalTest.js`

Add Codex detection:
```javascript
export const hasCodex = (() => {
  try {
    require.resolve('@openai/codex-sdk');
    // Could also check for ChatGPT login here
    return true;
  } catch {
    return false;
  }
})();
```

### File Locations Summary

**New Files:**
- `src/providers/codex.js` - Provider implementation (~200 lines)
- `tests/integration/providers/codex/codex-api.test.js` - E2E tests (~150 lines)

**Modified Files:**
- `src/providers/index.js` - Add codex provider to registry
- `src/async/providerStreamNormalizer.js` - Add normalizeCodexStream method
- `tests/utils/conditionalTest.js` - Add hasCodex detection

### What's NOT in This Task

The following are deferred to task-052 (Additional Integration Validation):
- HTTP transport parity testing
- CODEX_HOME override and multi-tenant isolation
- Large-output stress testing (>500KB streams)
- Windows-specific shutdown behavior
- Approval event no-hang validation
- Auth precedence matrix (API key vs ChatGPT login)
- Warm vs cold start profiling
- Platform support matrix (macOS/Linux validation)
- Concurrency stress tests (10+ concurrent)
- Process lifecycle edge cases
- Resource leak detection
- Sandbox mode enforcement validation

**Rationale:** This task gets Codex working. Task-052 validates edge cases after full integration.

<!-- DESIGN:END -->

## TODO
<!-- TODO:BEGIN -->

### Implementation Phase

- [ ] Install Codex SDK dependency: `npm install @openai/codex-sdk`
- [ ] Create `src/providers/codex.js` with provider implementation
  - [ ] Implement `invoke()` method (streaming and non-streaming)
  - [ ] Implement thread management (create/resume)
  - [ ] Implement message-to-prompt conversion
  - [ ] Add AbortSignal support
  - [ ] Implement remaining interface methods
- [ ] Register provider in `src/providers/index.js`
- [ ] Add `normalizeCodexStream()` to `src/async/providerStreamNormalizer.js`
  - [ ] Add to normalizers registry
  - [ ] Implement normalizer method (use GPT-5 code from task-045)
- [ ] Update `tests/utils/conditionalTest.js` with Codex detection

### Testing Phase

- [ ] Create test directory: `tests/integration/providers/codex/`
- [ ] Create `codex-api.test.js` following existing patterns
- [ ] Implement Test 1: Basic chat with `model: 'codex'`
- [ ] Implement Test 2: Streaming
- [ ] Implement Test 3: Continuation (thread resumption)
- [ ] Implement Test 4: Async mode
- [ ] Run tests and verify all pass (or skip gracefully if Codex unavailable)

### Documentation Phase

- [ ] Add code comments to provider implementation
- [ ] Add test descriptions
- [ ] Update README with Codex requirements (ChatGPT login needed)

### Validation Phase

- [ ] Run full test suite: `npm test`
- [ ] Verify provider works in development: `npm run dev`
- [ ] Manual test: Call Chat tool with `model: 'codex'` via MCP client
- [ ] Verify all acceptance criteria met

<!-- TODO:END -->

## Notes
<!-- NOTES:BEGIN -->

### Task Context

This is subtask-047 of parent task-045 (Add OpenAI Codex integration).

**Previous:** Task-046 researched Codex SDK in isolation ✅ Done
**This Task:** Implement working provider + E2E tests
**Next:** Task-048 will add user-configurable options (currently using hardcoded defaults)

### Implementation Guidance

**Use Existing Patterns:**
- Study `src/providers/openai.js` for structure
- Follow `tests/integration/providers/openai/openai-api.test.js` for test patterns
- Codex is similar to XAI provider (both use threads/sessions)

**Thread Management:**
- Codex threads persist in `~/.codex/sessions`
- Store thread ID in continuation metadata, not full message history
- Thread ID becomes available after first `run()` call (accessed via `thread.id`)

**Authentication:**
- Codex uses ChatGPT subscription login (no API key)
- Tests skip if SDK not installed or login not active
- Document in README that ChatGPT login is required

**Hardcoded Defaults:**
```javascript
{
  sandbox: 'read-only',           // Safe default
  skipGitRepoCheck: true,         // Don't require Git
  approvalPolicy: 'never',        // No interactive prompts
  workingDirectory: CLIENT_CWD    // Use client's directory
}
```

These will become configurable in task-048.

### Reference Implementations

**GPT-5 provided complete code** in task-045 Notes section for:
1. `normalizeCodexStream()` implementation
2. Temporary test harness patterns
3. Shutdown path enhancements
4. Process monitoring utilities

Use these as reference, especially the stream normalizer.

### Test Execution

Tests use `testWithApiKeys({ requiredProviders: ['CODEX'] })` pattern:
- If Codex unavailable → tests skip with clear message
- If available → tests run normally
- No test failures when SDK not installed

### What Makes This Task "Done"

✅ Provider implemented and registered
✅ Stream normalizer working
✅ E2E tests pass (or skip gracefully)
✅ Manual testing confirms `model: 'codex'` works
✅ Code is well-commented
✅ README documents ChatGPT login requirement

**Not Required:**
- Advanced configuration (task-048)
- Extensive edge case testing (task-052)
- Platform-specific validation (task-052)
- Production hardening (task-051)

### Relevant Documentation

- `backlog/tasks/task-045-add-openai-codex-integration-to-chat-tool.md` - Parent task
- `backlog/tasks/task-046-research-and-prototype-codex-sdk.md` - Research findings
- `backlog/docs/guides/doc-codex-research-findings.md` - Detailed SDK behavior
- `src/providers/interface.js` - Provider interface contract
- `tests/integration/providers/openai/openai-api.test.js` - Test pattern reference

### Critical Success Factors

1. **Follow existing patterns** - Don't invent new abstractions
2. **Use hardcoded defaults** - Configuration comes in task-048
3. **Test the happy path** - Edge cases in task-052
4. **Make tests conditional** - Skip gracefully when unavailable
5. **Keep it simple** - Get it working first, optimize later

<!-- NOTES:END -->
