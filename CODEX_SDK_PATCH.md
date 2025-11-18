# Codex SDK Patch Documentation

## Bug: `thread.run()` hangs waiting for events after completion

**Affected Version:** @openai/codex-sdk@0.45.0 (and likely earlier versions)

**Location:** `node_modules/@openai/codex-sdk/dist/index.js` line 98-100

### Problem

The SDK's `thread.run()` method internally uses a `for await` loop to process events from `runStreamedInternal()`. When it receives a `turn.completed` event, it sets the usage but **does not break the loop**. This causes the method to hang indefinitely waiting for more events that will never arrive, eventually timing out after 5 minutes.

### Root Cause

```javascript
// BUGGY CODE:
} else if (event.type === "turn.completed") {
  usage = event.usage;
  // Missing break statement!
} else if (event.type === "turn.failed") {
  turnFailure = event.error;
  break; // Only turn.failed has a break
}
```

### Fix Applied

Added `break` statement after `turn.completed` event processing:

```javascript
// FIXED CODE:
} else if (event.type === "turn.completed") {
  usage = event.usage;
  break; // Exit loop after turn completion - no more events expected
} else if (event.type === "turn.failed") {
  turnFailure = event.error;
  break;
}
```

### Impact

This bug affects **synchronous (non-async) usage** of the Codex provider when `DISABLE_ASYNC_TOOLS=true` or when not using the `async: true` parameter.

### Files Modified

1. **`node_modules/@openai/codex-sdk/dist/index.js`** (line 100) - Production fix
2. **`typescript/src/thread.ts`** (line 110) - Reference source fix
3. **`src/async/providerStreamNormalizer.js`** (lines 757, 776, 787) - Our normalizer fix

### Permanent Patch with pnpm

**✅ AUTOMATIC:** This patch is now managed by pnpm and will automatically reapply after any `pnpm install`.

The patch is stored in:

- `patches/@openai__codex-sdk@0.45.0.patch` - The patch file
- `pnpm-lock.yaml` - Contains `patchedDependencies` registry

**No manual intervention needed!** Future `pnpm install` commands will:

1. Install `@openai/codex-sdk@0.45.0`
2. Automatically apply the patch from `patches/`
3. Package works with the fix included

### Removing the Patch

If OpenAI releases a fix in a future version:

```bash
# Upgrade to fixed version
pnpm update @openai/codex-sdk

# Remove the patch (if no longer needed)
pnpm patch-remove @openai/codex-sdk@0.45.0
```

Or manually:

```bash
rm patches/@openai__codex-sdk@0.45.0.patch
pnpm install
```

### Status

- ❌ **Not reported to OpenAI** - Consider opening an issue at https://github.com/openai/codex-sdk
- ✅ **Permanent patch applied** - Managed by pnpm, auto-applies on install
- ✅ **Our normalizer also fixed** - Handles streaming case independently
- ✅ **Both sync and async modes fixed** - Complete solution

### Related

- Task: task-045 (Codex integration)
- Our fix in: `src/async/providerStreamNormalizer.js:708-832`
- Tests: `tests/integration/providers/codex/codex-api.test.js`

### Future Action

When updating the SDK:

1. Check if OpenAI fixed this in their release notes
2. Test without the patch first
3. Reapply patch if still needed
4. Update this documentation
