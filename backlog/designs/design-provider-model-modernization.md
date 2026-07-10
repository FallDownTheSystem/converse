---
name: Provider and Model Modernization
description: Design for curated flagship model catalogs and current provider capability handling across xAI, Mistral, DeepSeek, Copilot, and OpenRouter.
created_date: '2026-07-10 23:01'
updated_date: '2026-07-10 23:01'
---

# Provider and Model Modernization

## Overview

Modernize the model catalogs and request/response handling for xAI, Mistral, native DeepSeek, Copilot, and OpenRouter. Public catalogs remain deliberately curated: each provider advertises only current flagship or latest-generation models relevant to Converse, while explicit provider model IDs continue to work where the upstream API accepts them.

OpenRouter uses a hybrid catalog. A small static set gives stable aliases, capabilities, and defaults for leading Chinese models; dynamic metadata lookup allows any explicit OpenRouter model ID without requiring an opt-in environment variable.

## Scope

### Curated models

| Provider | Advertised models | Default |
|---|---|---|
| xAI | `grok-4.5` | `grok-4.5` |
| Mistral | `mistral-medium-3-5`, `mistral-small-2603`, `mistral-large-2512` | `mistral-medium-3-5` |
| DeepSeek | `deepseek-v4-pro`, `deepseek-v4-flash` | `deepseek-v4-pro` |
| Copilot / OpenAI | GPT-5.6 Sol, GPT-5.6 Terra, GPT-5.6 Luna | GPT-5.6 Terra |
| Copilot / Anthropic | Claude Fable 5, Claude Sonnet 5, Claude Opus 4.8 | No change to the provider-wide default |
| Copilot / Google | Gemini 3.1 Pro, Gemini 3.5 Flash | No change to the provider-wide default |
| OpenRouter core | `z-ai/glm-5.2`, `deepseek/deepseek-v4-pro`, `qwen/qwen3.7-max`, `moonshotai/kimi-k2.7-code` | `z-ai/glm-5.2` |
| OpenRouter complementary | `deepseek/deepseek-v4-flash`, `qwen/qwen3.7-plus`, `moonshotai/kimi-k2.6`, `openrouter/auto` | Not applicable |

The implementation must use the exact model identifiers returned by each provider's current catalog. User-facing names above are the required entries; identifier spelling is verified against the official provider source during implementation and locked by catalog tests.

`gpt-5.3-codex` and the retired Codex-specific model line are not added. Mistral specialist and older-generation models are not advertised.

### Capability updates

- xAI maps Converse `reasoning_effort` to the Grok 4.5 reasoning parameter and retains the model's current context metadata.
- Mistral forwards supported adjustable reasoning and normalizes `ThinkChunk` and `TextChunk` output in streaming and non-streaming responses.
- DeepSeek maps supported reasoning levels and recognizes `reasoning_content` without losing final answer text.
- OpenRouter supports standardized reasoning details, opt-in web search, citations, current usage cost, actual-provider metadata, and errors delivered inside a stream.
- OpenRouter's `OPENROUTER_REFERER` header is optional. When configured, it is still sent with the existing application attribution headers.

## Architecture

### Catalog and routing

Create one shared model-routing source for provider defaults, curated aliases, namespace rules, and model-to-provider resolution. `chat`, `consensus`, and other entry points consume this source rather than maintaining separate routing tables.

Resolution order:

1. Honor an explicit provider namespace.
2. Resolve a curated alias to its canonical model ID and provider.
3. Treat a full OpenRouter `provider/model` slug, or an `openrouter:`-prefixed slug, as OpenRouter without requiring `OPENROUTER_DYNAMIC_MODELS=true`.
4. Preserve DeepSeek bare aliases for the native DeepSeek provider. OpenRouter DeepSeek models use their full OpenRouter slug or namespace.
5. Send unknown explicit provider model IDs to the selected provider unchanged. Never silently substitute a default after explicit resolution.
6. Use the provider's curated default only when no model was supplied or an intentional generic alias was selected.

Rolling aliases such as `~moonshotai/kimi-latest` remain explicit opt-in values. They are not promoted to stable friendly aliases because their capabilities can change without a Converse release.

### OpenRouter transport and discovery

Keep the existing OpenAI-compatible inference transport. A full transport migration to the official OpenRouter SDK adds risk without improving the core chat path.

Dynamic model resolution uses OpenRouter's current model metadata endpoint and a bounded cache. The official `@openrouter/sdk` may be used only for metadata discovery if it materially improves typing or pagination over the direct endpoint. If introduced, pin an exact pre-1.0 version and isolate it behind the discovery adapter so it can be upgraded or removed independently. It must not own inference, streaming, retries, or response normalization.

Static entries remain authoritative for friendly aliases and known capability overrides. Fresh dynamic metadata supplements explicit OpenRouter IDs; it does not rewrite the curated catalog.

### Request and response normalization

Provider adapters translate the shared Converse request into provider-specific fields, then emit the existing internal response and streaming event shapes:

```text
tool request
  -> shared model resolver
  -> curated config or OpenRouter metadata lookup
  -> provider-specific request mapping
  -> existing provider transport
  -> reasoning/text/citation/usage/error normalizer
  -> Converse response or event stream
```

Reasoning is kept separate from final answer text throughout normalization. Providers that expose reasoning only as a distinct chunk or field map it to the existing reasoning event/metadata representation. Unsupported reasoning levels are reduced deterministically to the nearest documented provider level; they are not forwarded as invalid values.

OpenRouter normalization retains:

- reasoning details separately from visible answer text;
- citation annotations and web-search result metadata;
- `usage.cost` and the actual upstream provider when present;
- partial text already received before an in-band stream error, with the operation ultimately marked failed rather than successfully completed.

Web search is opt-in through a provider option such as `openrouter:web_search`; upgrading the provider must not add search costs or external retrieval to ordinary requests.

## Backward Compatibility

- Previously advertised explicit model IDs remain pass-through values while their provider still accepts them, but retired models are removed from help text, defaults, and supported-model catalogs.
- Existing provider names and API-key environment variables remain stable.
- Existing full OpenRouter slugs continue to work and no longer depend on `OPENROUTER_DYNAMIC_MODELS`.
- `OPENROUTER_DYNAMIC_MODELS` may be accepted as a deprecated no-op for one compatibility cycle before its documentation is removed.
- `OPENROUTER_REFERER` remains supported but is no longer required for availability validation.
- Unknown explicit IDs fail with the real upstream error. They are never remapped to a similarly named curated model.
- Stored conversations keep their original model IDs. Continuations attempt the stored ID unchanged and surface a clear retirement error if the upstream provider no longer serves it.

## Error Handling

- Static curated models do not depend on a successful metadata request.
- Dynamic OpenRouter discovery distinguishes authentication, rate-limit, timeout, malformed-response, and model-not-found failures. An explicit slug may still proceed to inference with conservative capabilities when discovery is unavailable; an authoritative not-found response fails before inference.
- Discovery uses a short timeout, bounded successful-result cache, and brief negative caching for confirmed missing models. Credentials and response bodies containing provider diagnostics are not cached or logged.
- Stream normalizers detect OpenRouter error objects at any point, preserve safe upstream status/code context, and terminate the stream as failed.
- Mistral unknown chunk types are ignored only when documented as non-content metadata; unexpected content-bearing chunks raise a normalization error.
- Missing reasoning fields are valid. Reasoning parsing must not turn an otherwise valid text response into an empty response.

## Implementation Areas

- Provider catalogs and defaults for xAI, Mistral, DeepSeek, Copilot, and OpenRouter.
- Shared model routing used by chat, consensus, conversation, and help/schema generation.
- Provider request mapping for reasoning and OpenRouter web search.
- Provider response and stream normalizers for reasoning, Mistral chunks, citations, usage cost, actual-provider metadata, and in-band errors.
- OpenRouter metadata discovery adapter and cache.
- Configuration validation and environment documentation.
- User documentation and examples for curated aliases, provider namespaces, and explicit OpenRouter slugs.

Exact source-file edits are determined during implementation after codebase exploration. Existing unrelated modified or untracked files are user work and must remain untouched; staging and commits must be path-scoped to modernization files only.

## Test Strategy

### Unit tests

- Each provider returns exactly its curated catalog and intended default.
- Every friendly alias and namespace resolves to the intended provider and canonical ID from all tool entry points.
- Explicit unknown IDs pass through without fallback; confirmed missing dynamic OpenRouter IDs fail clearly.
- Grok, Mistral, DeepSeek, and OpenRouter reasoning options map to supported request values.
- Mistral `ThinkChunk`/`TextChunk`, DeepSeek `reasoning_content`, and OpenRouter reasoning details normalize in streaming and non-streaming paths.
- OpenRouter citations, web-search metadata, cost, actual-provider metadata, and in-band stream errors are preserved.
- OpenRouter metadata cache covers success, timeout, malformed data, rate limits, negative lookup, and static-catalog fallback.
- Referer omission remains valid and configured attribution headers are retained.

### Integration and regression tests

- Provider contract tests use mocked upstream responses for each new model family.
- Routing parity tests prove chat, consensus, and conversation use the shared resolver.
- Existing continuation, cancellation, async job, usage, and error-shape tests remain green.
- Credential-gated live smoke tests verify catalog identifiers and one minimal request per provider when credentials are available; they are not required in normal CI.
- Run focused provider and routing tests first, followed by lint, type checks, and the full test suite before implementation handoff.

## Documentation

Update provider setup and model-selection documentation to include:

- curated model tables and defaults;
- OpenRouter full-slug and `openrouter:` namespace examples;
- the optional referer and removal of the dynamic-model gate;
- explicit opt-in web search and its possible cost implications;
- reasoning support and provider-specific limitations;
- legacy explicit-ID pass-through without presenting retired models as supported recommendations.

## Non-goals

- Advertising every model exposed by any provider.
- Adding Mistral specialist models or older Mistral generations.
- Adding deprecated Codex-line models, including `gpt-5.3-codex`.
- Migrating OpenRouter inference to `@openrouter/sdk`.
- Automatically following rolling OpenRouter aliases.
- Adding new providers, changing credentials, or redesigning the public Converse response contract.
- Modifying unrelated dirty-worktree files.

## Official Sources

- [xAI Grok 4.5 documentation](https://docs.x.ai/developers/grok-4-5)
- [Mistral model catalog](https://docs.mistral.ai/models/overview)
- [DeepSeek API updates](https://api-docs.deepseek.com/updates/)
- [GitHub Copilot supported models](https://docs.github.com/en/copilot/reference/ai-models/supported-models)
- [OpenRouter model catalog API](https://openrouter.ai/api/v1/models)
- [OpenRouter TypeScript SDK documentation](https://openrouter.ai/docs/sdks/typescript)
- [OpenRouter reasoning tokens documentation](https://openrouter.ai/docs/use-cases/reasoning-tokens)
- [OpenRouter web search documentation](https://openrouter.ai/docs/features/web-search)
