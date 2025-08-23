---
id: task-010
title: Implement streaming support in Google GenAI provider
status: To Do
assignee: []
created_date: '2025-08-23 15:15'
updated_date: '2025-08-23 18:32'
labels:
  - async
  - providers
  - google
  - streaming
dependencies: []
---

## Description

Add streaming capabilities to the Google GenAI provider using generateContentStream() method for internal streaming consumption in async execution. Supports all Gemini models (2.0-flash, 2.5-flash, 2.5-pro) with special handling for thinking mode and grounding features. Returns AsyncGenerator compatible with ProviderStreamNormalizer. Maintains backwards compatibility with existing sync behavior.
## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Extend Google provider invoke() method to support stream parameter
- [ ] #2 Implement streaming using generateContentStream() from @google/genai SDK
- [ ] #3 Support for all Gemini models (2.0-flash, 2.0-flash-lite, 2.5-flash, 2.5-pro)
- [ ] #4 Handle thinking mode streaming for models that support it (2.5-flash, 2.5-pro)
- [ ] #5 Support web search grounding in streaming mode (googleSearch tool)
- [ ] #6 AsyncGenerator return type yielding streaming chunks when stream=true
- [ ] #7 Proper error handling with retry logic for streaming failures
- [ ] #8 Unit tests covering streaming modes, thinking mode, and grounding features
<!-- AC:END -->

## Implementation Plan Reference

Refer to **Async Execution System Architecture Plan** (`backlog/docs/doc-001 - Async-Execution-System-Architecture-Plan.md`) for:
- Complete system architecture and component relationships
- Visual diagrams showing class structure, execution flow, and sequence diagrams
- Integration patterns with existing MCP server infrastructure
- Caching strategy, error handling, and testing approaches
- Context for how this task fits into the overall async execution system

## Implementation Plan

**Architecture Approach:**
- Extend existing Google provider invoke() method with streaming via generateContentStream()
- Support all Gemini models with thinking mode and grounding capabilities
- Return AsyncGenerator when stream=true, maintain existing response when stream=false
- Handle Google-specific features (thinking mode, web search grounding, multimodal input)
- Integrate with existing retry logic and error handling patterns

**Key Files to Modify:**
- `src/providers/google.js` - Add streaming support to existing invoke() method
- `tests/providers/google.test.js` - Add streaming test cases with thinking mode scenarios

**Architecture Reference Points:**
- `src/providers/google.js:332-504` - Current invoke() method structure and error patterns
- `src/providers/google.js:295-320` - Existing retry logic with exponential backoff
- `src/providers/google.js:417-427` - Thinking mode configuration patterns
- Package.json:98 - @google/genai SDK version (1.12.0) with streaming support

**Google GenAI SDK Streaming Implementation Details:**

**AsyncGenerator Pattern:**
```javascript
// Use generateContentStream() method from @google/generative-ai
const stream = await genAI.getGenerativeModel({ model: resolvedModel })
  .generateContentStream({
    contents: geminiContents,
    generationConfig: streamConfig
  });

// AsyncGenerator pattern for consuming stream
for await (const chunk of stream) {
  const processed = processGeminiStreamChunk(chunk);
  yield processed;
}
```

**Enhanced Error Handling with ApiError Class:**
```javascript
import { GoogleGenerativeAIError, GoogleGenerativeAIResponseError } from '@google/generative-ai';

try {
  const stream = await genAI.generateContentStream(params);
  // Process stream
} catch (error) {
  if (error instanceof GoogleGenerativeAIError) {
    // Handle API-specific errors
    const errorInfo = {
      code: error.status || 'UNKNOWN_ERROR',
      message: error.message,
      recoverable: isStreamingErrorRetryable(error),
      retryAfter: error.status === 429 ? parseRetryAfter(error) : null
    };
    yield { type: 'error', data: errorInfo };
  } else if (error instanceof GoogleGenerativeAIResponseError) {
    // Handle response parsing errors
    yield {
      type: 'error',
      data: {
        code: 'RESPONSE_PARSE_ERROR',
        message: error.message,
        recoverable: false
      }
    };
  } else {
    // Handle generic errors
    yield {
      type: 'error',
      data: {
        code: 'STREAMING_ERROR',
        message: error.message,
        recoverable: true
      }
    };
  }
}
```

**Streaming Chunk Structure and Processing:**
```javascript
function processGeminiStreamChunk(chunk, modelConfig) {
  const candidate = chunk.candidates?.[0];
  if (!candidate) return null;
  
  // Text content delta
  if (candidate.content?.parts) {
    const textPart = candidate.content.parts.find(part => part.text);
    if (textPart) {
      return {
        type: 'delta',
        data: {
          content: textPart.text,
          role: 'assistant'
        }
      };
    }
  }
  
  // Thinking mode content (Gemini 2.5 models)
  if (candidate.content?.parts && modelConfig.supportsThinking) {
    const thinkingPart = candidate.content.parts.find(part => part.thoughtsAndComments);
    if (thinkingPart) {
      return {
        type: 'thinking',
        data: {
          thoughts: thinkingPart.thoughtsAndComments,
          visible: false
        }
      };
    }
  }
  
  // Usage information
  if (chunk.usageMetadata) {
    return {
      type: 'usage',
      data: {
        inputTokens: chunk.usageMetadata.promptTokenCount || 0,
        outputTokens: chunk.usageMetadata.candidatesTokenCount || 0,
        totalTokens: chunk.usageMetadata.totalTokenCount || 0
      }
    };
  }
  
  // Web search grounding metadata
  if (chunk.candidates?.[0]?.groundingMetadata) {
    return {
      type: 'grounding',
      data: {
        webSearchQueries: chunk.candidates[0].groundingMetadata.webSearchQueries,
        groundingSupports: chunk.candidates[0].groundingMetadata.groundingSupports,
        searchEntryPoints: chunk.candidates[0].groundingMetadata.searchEntryPoint
      }
    };
  }
  
  // Safety ratings and finish reason
  if (candidate.finishReason) {
    return {
      type: 'finish',
      data: {
        finishReason: candidate.finishReason,
        safetyRatings: candidate.safetyRatings
      }
    };
  }
  
  return null;
}
```

**Rate Limiting and Retry Strategies:**
```javascript
// Enhanced rate limiting for streaming
const STREAMING_RATE_LIMITS = {
  'gemini-2.0-flash': { rpm: 2000, tpm: 2000000 },
  'gemini-2.5-flash': { rpm: 1500, tpm: 1000000 },
  'gemini-2.5-pro': { rpm: 50, tpm: 32000 }
};

// Streaming-specific retry logic
async function retryStreamingWithBackoff(streamFn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await streamFn();
    } catch (error) {
      if (!isStreamingErrorRetryable(error) || attempt === maxRetries) {
        throw error;
      }
      
      const delay = calculateStreamingBackoff(attempt, error);
      await sleep(delay);
    }
  }
}

function isStreamingErrorRetryable(error) {
  const retryableCodes = [429, 500, 502, 503, 504, 'RESOURCE_EXHAUSTED', 'UNAVAILABLE'];
  return retryableCodes.includes(error.status) || 
         retryableCodes.includes(error.code) ||
         error.message?.includes('timeout');
}

function calculateStreamingBackoff(attempt, error) {
  // Exponential backoff with jitter
  const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
  const jitter = Math.random() * 0.1 * baseDelay;
  
  // Rate limit specific delays
  if (error.status === 429) {
    const retryAfter = parseRetryAfter(error) || 60000;
    return Math.max(retryAfter, baseDelay) + jitter;
  }
  
  return baseDelay + jitter;
}
```

**Authentication with Developer API and Vertex AI:**
```javascript
// Developer API authentication
const developerGenAI = new GoogleGenAI({
  apiKey: config.apiKeys.google,
  apiVersion: 'v1beta', // Required for streaming
  baseUrl: 'https://generativelanguage.googleapis.com'
});

// Vertex AI authentication  
const vertexGenAI = new GoogleGenAI({
  project: config.providers.googlecloudproject,
  location: config.providers.googlecloudlocation || 'us-central1',
  apiVersion: 'v1beta',
  credentials: {
    // Service account key or ADC
    type: 'service_account',
    project_id: config.providers.googlecloudproject,
    private_key: config.providers.googlecloudprivatekey,
    client_email: config.providers.googlecloudclientemail
  }
});

// Model access patterns differ between APIs
const getModelInstance = (genAI, modelName, useVertexAI) => {
  if (useVertexAI) {
    // Vertex AI model naming
    return genAI.getGenerativeModel({ 
      model: `publishers/google/models/${modelName}`
    });
  } else {
    // Developer API model naming
    return genAI.getGenerativeModel({ 
      model: modelName
    });
  }
};
```

**Model-Specific Streaming Capabilities Matrix:**
```javascript
const STREAMING_CAPABILITIES = {
  'gemini-2.0-flash-exp': {
    supportsStreaming: true,
    supportsThinking: true,
    supportsGrounding: true,
    maxStreamingTokens: 8192,
    streamingLatency: 'ultra-low'
  },
  'gemini-2.0-flash-thinking-exp-1219': {
    supportsStreaming: true,
    supportsThinking: true,
    supportsGrounding: false,
    maxStreamingTokens: 32768,
    streamingLatency: 'low'
  },
  'gemini-2.5-flash': {
    supportsStreaming: true,
    supportsThinking: true,
    supportsGrounding: true,
    maxStreamingTokens: 8192,
    streamingLatency: 'low'
  },
  'gemini-2.5-flash-002': {
    supportsStreaming: true,
    supportsThinking: false,
    supportsGrounding: true,
    maxStreamingTokens: 8192,
    streamingLatency: 'low'
  },
  'gemini-2.5-pro': {
    supportsStreaming: true,
    supportsThinking: true,
    supportsGrounding: true,
    maxStreamingTokens: 8192,
    streamingLatency: 'medium'
  },
  'gemini-1.5-pro': {
    supportsStreaming: true,
    supportsThinking: false,
    supportsGrounding: false,
    maxStreamingTokens: 2048,
    streamingLatency: 'high'
  }
};

// Runtime capability checking
function validateStreamingCapability(modelName, requestedFeatures) {
  const capabilities = STREAMING_CAPABILITIES[modelName];
  if (!capabilities?.supportsStreaming) {
    throw new Error(`Model ${modelName} does not support streaming`);
  }
  
  if (requestedFeatures.thinking && !capabilities.supportsThinking) {
    console.warn(`Model ${modelName} does not support thinking mode in streaming`);
  }
  
  if (requestedFeatures.grounding && !capabilities.supportsGrounding) {
    throw new Error(`Model ${modelName} does not support grounding in streaming mode`);
  }
  
  return capabilities;
}
```

**Google Provider Streaming Extension:**
```javascript
export const googleProvider = {
  async invoke(messages, options = {}) {
    // Extract stream parameter
    const { stream = false, ...otherOptions } = options;
    
    if (!stream) {
      // Existing synchronous behavior - NO CHANGES
      return await invokeSync(messages, options);
    }
    
    // New streaming behavior
    return invokeStreamingGenerator(messages, options);
  }
};

// New streaming generator function
async function* invokeStreamingGenerator(messages, options) {
  const {
    model = 'gemini-2.5-flash',
    temperature = 0.7,
    maxTokens = null,
    reasoning_effort = 'medium',
    use_websearch = false,
    config,
    ...otherOptions
  } = options;
  
  // Initialize Google GenAI client (same as existing)
  const useVertexAI = config?.providers?.googlegenaiusevertexai;
  let genAI;
  
  if (useVertexAI) {
    // Vertex AI configuration
    genAI = new GoogleGenAI({
      vertexai: true,
      project: config.providers.googlecloudproject,
      location: config.providers.googlecloudlocation,
      apiVersion: config.providers.googleapiversion || 'v1beta'
    });
  } else {
    // Gemini Developer API
    genAI = new GoogleGenAI({
      apiKey: config.apiKeys.google,
      apiVersion: config.providers.googleapiversion || 'v1beta'
    });
  }
  
  const resolvedModel = resolveModelName(model);
  const modelConfig = SUPPORTED_MODELS[resolvedModel] || {};
  
  try {
    // Validate streaming capabilities
    const capabilities = validateStreamingCapability(resolvedModel, {
      thinking: reasoning_effort !== 'minimal',
      grounding: use_websearch
    });
    
    // Create streaming configuration
    const streamConfig = buildStreamingConfig(resolvedModel, modelConfig, options);
    const geminiContents = convertMessagesToGemini(messages);
    
    yield { type: 'start', data: { provider: 'google', model: resolvedModel } };
    
    // Execute with retry wrapper
    const modelInstance = getModelInstance(genAI, resolvedModel, useVertexAI);
    const stream = await retryStreamingWithBackoff(async () => {
      return await modelInstance.generateContentStream({
        contents: geminiContents,
        generationConfig: streamConfig,
        safetySettings: buildSafetySettings(),
        tools: use_websearch ? [{ googleSearch: {} }] : undefined
      });
    });
    
    let accumulatedText = '';
    let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    
    // Process streaming chunks
    for await (const chunk of stream) {
      const processed = processGeminiStreamChunk(chunk, capabilities);
      
      if (processed?.type === 'delta' && processed.data.content) {
        accumulatedText += processed.data.content;
        yield processed;
      } else if (processed?.type === 'thinking' && capabilities.supportsThinking) {
        // Handle thinking mode output for supported models
        yield processed;
      } else if (processed?.type === 'usage') {
        usage = processed.data;
        yield processed;
      } else if (processed?.type === 'grounding' && capabilities.supportsGrounding) {
        // Handle web search grounding metadata
        yield processed;
      } else if (processed?.type === 'finish') {
        yield processed;
      }
    }
    
    // Final completion
    yield {
      type: 'end',
      data: {
        finishReason: 'STOP',
        finalContent: accumulatedText,
        usage: usage
      }
    };
    
  } catch (error) {
    yield {
      type: 'error',
      data: {
        error: error.code || 'API_ERROR',
        message: error.message,
        recoverable: isStreamingErrorRetryable(error),
        retryAfter: error.status === 429 ? parseRetryAfter(error) : null
      }
    };
  }
}
```

**Integration Points:**
- ProviderStreamNormalizer (task 5): Consumes Google streaming events for unified format
- JobRunner (task 3): Real-time progress updates during background execution
- Chat/Consensus tools: Thinking mode progress visibility for supported models

**Testing Strategy:**
- Mock Google GenAI streaming responses for all model types
- Test thinking mode streaming for 2.5-flash and 2.5-pro
- Test grounding integration with web search
- Test retry logic with various error scenarios (429, 500, timeouts)
- Verify Vertex AI vs Developer API streaming compatibility
- Test AsyncGenerator pattern compliance
- Test error recovery and graceful degradation
- Test `processGeminiStreamChunk()` function with all chunk types
- Test streaming-specific retry logic and rate limiting
- Test model capability validation and runtime checking

**Dependencies:**
- @google/genai SDK 1.12.0+ with streaming support
- Existing Google provider retry logic and error handling
- Existing thinking mode configuration patterns
- Enhanced error classes (GoogleGenerativeAIError, GoogleGenerativeAIResponseError)

## Implementation Notes

CRITICAL: Google GenAI streaming must be implemented from scratch as current implementation only has placeholder (_unused_stream parameter). Not all Gemini models support streaming - verify SUPPORTED_MODELS has accurate supportsStreaming flags per model. Gemini 2.0 models may have different streaming patterns than 1.5 models. Implement runtime checking for model streaming capabilities and use generateContentStream() method correctly.
