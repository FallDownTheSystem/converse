# Alternative Cloud Provider Integrations for Converse MCP Server

This document outlines alternative API providers for each AI provider currently supported in the Converse MCP Server, along with implementation requirements for adding support.

## Table of Contents
- [Anthropic](#anthropic)
  - [AWS Bedrock](#aws-bedrock)
  - [Google Vertex AI](#google-vertex-ai)
- [OpenAI](#openai)
  - [Azure OpenAI Service](#azure-openai-service)
- [Google](#google)
  - [Vertex AI Platform](#vertex-ai-platform)
- [DeepSeek](#deepseek)
  - [AWS Bedrock](#aws-bedrock-1)
  - [Azure AI Foundry](#azure-ai-foundry)
- [Mistral AI](#mistral-ai)
  - [AWS Bedrock](#aws-bedrock-2)
  - [Azure AI](#azure-ai)
  - [Google Vertex AI](#google-vertex-ai-1)
- [XAI (Grok)](#xai-grok)
  - [Azure AI Foundry](#azure-ai-foundry-1)
- [Implementation Strategy](#implementation-strategy)

## Anthropic

### AWS Bedrock

**Status**: Available and fully managed

**Key Features**:
- Anthropic's client SDKs support Bedrock directly
- Models available: Claude Opus 4, Claude Sonnet 4, and earlier versions
- 200,000 token context window
- 60-minute timeout for inference calls
- Supports both Messages API and Text Completions API

**Implementation Requirements**:
```javascript
// Using Anthropic Bedrock SDK
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';

const client = new AnthropicBedrock({
  awsAccessKey: process.env.AWS_ACCESS_KEY,
  awsSecretKey: process.env.AWS_SECRET_KEY,
  awsRegion: 'us-west-2',
});

// Alternative: Using AWS SDK directly
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
```

**Configuration Needed**:
- AWS credentials (access key, secret key)
- AWS region selection
- Model ID mapping (e.g., `anthropic.claude-opus-4-1-20250805-v1:0`)
- Timeout adjustments (default AWS SDK timeout is 1 minute, needs to be increased to 60 minutes)

### Google Vertex AI

**Status**: Available with FedRAMP High and IL-2 authorization (as of June 2025)

**Key Features**:
- Fully managed, serverless infrastructure
- Supports Claude Opus 4, Claude Sonnet 3.7, and other models
- Integration with Google Cloud services
- Claude Code integration for agent development
- Pay-as-you-go or provisioned throughput pricing

**Implementation Requirements**:
```javascript
// Using Anthropic Vertex SDK
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';

const client = new AnthropicVertex({
  region: 'us-central1',
  projectId: 'my-project-id',
});

// Alternative: With custom GoogleAuth
import { GoogleAuth } from 'google-auth-library';

const client = new AnthropicVertex({
  googleAuth: new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
    keyFile: '/path/to/service-account.json',
  }),
  region: 'us-central1',
  projectId: 'my-project-id',
});
```

**Configuration Needed**:
- Google Cloud project ID
- Location/region selection
- Google Cloud authentication (service account or ADC)
- Model ID mapping for Vertex AI (e.g., `claude-3-5-sonnet-v2@20241022`)

## OpenAI

### Azure OpenAI Service

**Status**: Available with enterprise features

**Key Features**:
- Latest models: o4-mini, o3, gpt-4.1, GPT-4o, and others
- New Responses API combining chat completions and assistants
- Realtime API with WebRTC support
- Private networking and regional availability
- Microsoft Entra ID or API key authentication

**Implementation Requirements**:
```javascript
// Option 1: Using OpenAI client with Azure (Recommended for 2025)
import { AzureOpenAI } from 'openai';

const client = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  apiVersion: '2025-04-01-preview',
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  deployment: 'gpt-4o', // Your deployment name
});

// Option 2: With Azure AD Authentication (Recommended for production)
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { AzureOpenAI } from 'openai';
import '@azure/openai/types';

const credential = new DefaultAzureCredential();
const scope = 'https://cognitiveservices.azure.com/.default';
const azureADTokenProvider = getBearerTokenProvider(credential, scope);

const client = new AzureOpenAI({ 
  azureADTokenProvider, 
  deployment: 'gpt-4o',
  apiVersion: '2025-04-01-preview'
});
```

**Configuration Needed**:
- Azure OpenAI resource name
- API key or Microsoft Entra ID credentials
- API version selection
- Deployment names for models

## Google

### Vertex AI Platform

**Status**: Native platform (not an alternative, but enhanced deployment options)

**Key Features**:
- Regional and global endpoints
- Managed APIs (no deployment required for Gemini models)
- Support for tuned models
- Enterprise-grade security and data residency
- Live API with native audio (30 HD voices in 24 languages)

**Implementation Requirements**:
```javascript
// Using Google Cloud Vertex AI SDK
import { VertexAI } from '@google-cloud/vertexai';

const vertexAI = new VertexAI({
  project: 'your-cloud-project',
  location: 'us-central1'
});

const generativeModel = vertexAI.getGenerativeModel({
  model: 'gemini-2-5-pro-001',
  generationConfig: { maxOutputTokens: 256 },
  systemInstruction: {
    role: 'system',
    parts: [{ text: 'You are a helpful assistant' }]
  }
});

// Alternative: Using Google Gen AI SDK (Unified SDK for 2025)
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  project: 'your-cloud-project',
  location: 'us-central1',
  // Uses Application Default Credentials
});
```

**Configuration Needed**:
- Endpoint type selection (regional vs global)
- Support for custom/tuned models
- Live API configuration
- Google Cloud authentication setup

## DeepSeek

### AWS Bedrock

**Status**: Available as of March 2025 (first cloud provider to offer fully managed)

**Key Features**:
- DeepSeek-R1 available as serverless model
- Available in US East (N. Virginia), US East (Ohio), and US West (Oregon)
- Cross-region inference support
- Enterprise-grade security and monitoring
- Integration with Amazon Bedrock guardrails recommended

**Implementation Requirements**:
```javascript
// Using AWS SDK for Bedrock
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

const command = new InvokeModelCommand({
  modelId: 'deepseek-r1', // Exact model ID from AWS Bedrock
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Hello' }],
    max_tokens: 1024,
  }),
  contentType: 'application/json',
  accept: 'application/json',
});

const response = await client.send(command);
```

### Azure AI Foundry

**Status**: Available as of 2025

**Key Features**:
- Part of Azure AI Foundry platform
- Built-in model evaluation tools
- Red teaming and safety evaluations completed
- SLA, security, and responsible AI commitments

**Implementation Requirements**:
```javascript
// Azure AI Foundry API integration
// Similar pattern to Azure OpenAI
import { AzureAI } from '@azure/ai-inference';

const client = new AzureAI({
  endpoint: process.env.AZURE_AI_ENDPOINT,
  apiKey: process.env.AZURE_AI_API_KEY,
});

// Model deployment through Azure AI Foundry
const response = await client.completions.create({
  model: 'deepseek-r1',
  messages: [{ role: 'user', content: 'Hello' }],
});
```

## Mistral AI

### AWS Bedrock

**Status**: Available with multiple models

**Key Features**:
- Models: Mistral 7B, Mixtral 8x7B, Pixtral Large (multimodal)
- First major cloud to offer Pixtral Large
- Serverless, fully managed
- White-box solutions (weights and code available)
- 50% lower batch inference pricing (as of April 2025)

### Azure AI

**Status**: Available

**Key Features**:
- Part of Azure AI ecosystem
- Integration with Azure services

### Google Vertex AI

**Status**: Available in Model Garden

**Key Features**:
- Available through Vertex AI Model Garden
- Standard Vertex AI features apply

**Implementation Requirements**:
```javascript
// AWS Bedrock integration for Mistral
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

const command = new InvokeModelCommand({
  modelId: 'mistral.mixtral-8x7b-instruct-v0:1', // or 'mistral.mistral-7b-instruct-v0:2'
  body: JSON.stringify({
    prompt: '<s>[INST] Hello [/INST]',
    max_tokens: 512,
    temperature: 0.7,
  }),
  contentType: 'application/json',
  accept: 'application/json',
});

// For Azure/Vertex, Mistral provides their own SDK which works across platforms
import { Mistral } from '@mistralai/mistralai';

const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
  // For cloud platforms, configure the appropriate endpoint
});
```

## XAI (Grok)

### Azure AI Foundry

**Status**: Available as of May 2025

**Key Features**:
- Models: Grok 3 and Grok 3 Mini
- Full Azure SLA support
- Structured outputs with JSON schema support
- Functions and tools for agentic workflows
- Direct Microsoft billing
- OpenAI API format compatibility

**Implementation Requirements**:
```javascript
// Azure AI Foundry integration for Grok
// Uses OpenAI-compatible API format
import { OpenAI } from 'openai';

const client = new OpenAI({
  apiKey: process.env.AZURE_API_KEY,
  baseURL: 'https://YOUR-RESOURCE.openai.azure.com/openai',
  defaultQuery: {
    'api-version': '2025-05-01-preview'
  },
  defaultHeaders: {
    'api-key': process.env.AZURE_API_KEY
  }
});

// Use with deployment name
const response = await client.chat.completions.create({
  model: 'grok-3', // or 'grok-3-mini'
  messages: [{ role: 'user', content: 'Hello' }],
});
```

**Note**: No AWS integration announced as of 2025, but xAI's infrastructure supports potential multi-cloud deployment.

## Implementation Strategy

### 1. Create Platform Abstraction Layer

```javascript
// src/providers/platforms/index.js
class PlatformProvider {
  constructor(provider, platform, config) {
    this.provider = provider; // 'anthropic', 'openai', etc.
    this.platform = platform; // 'native', 'bedrock', 'azure', 'vertex'
    this.config = config;
  }

  async createClient() {
    // Platform-specific client initialization
  }

  async sendRequest(messages, options) {
    // Platform-specific request handling
  }
}
```

### 2. Extend Provider Configuration

```javascript
// Example configuration
{
  "providers": {
    "anthropic": {
      "platform": "bedrock", // or "native", "vertex"
      "bedrock": {
        "awsRegion": "us-west-2",
        "awsAccessKey": "...",
        "awsSecretKey": "..."
      },
      "vertex": {
        "projectId": "...",
        "location": "us-central1"
      }
    }
  }
}
```

### 3. Update Environment Variables

```bash
# Platform selection
ANTHROPIC_PLATFORM=bedrock
OPENAI_PLATFORM=azure
DEEPSEEK_PLATFORM=bedrock
MISTRAL_PLATFORM=bedrock
XAI_PLATFORM=azure

# Platform-specific credentials
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-west-2

AZURE_OPENAI_ENDPOINT=...
AZURE_OPENAI_API_KEY=...

GOOGLE_CLOUD_PROJECT=...
GOOGLE_CLOUD_LOCATION=...
```

### 4. Model Mapping

Create a mapping system for model names across platforms:

```javascript
const MODEL_MAPPINGS = {
  anthropic: {
    bedrock: {
      'claude-opus-4': 'anthropic.claude-opus-4-1-20250805-v1:0',
      'claude-sonnet-4': 'anthropic.claude-sonnet-4-20250514-v1:0'
    },
    vertex: {
      'claude-opus-4': 'claude-opus-4@001',
      'claude-sonnet-4': 'claude-sonnet-4@001'
    }
  }
};
```

### 5. Testing Strategy

- Create integration tests for each platform
- Mock platform-specific responses
- Test failover between platforms
- Verify feature parity across platforms

### 6. Documentation Updates

- Update README with platform configuration
- Add platform-specific examples
- Document limitations and differences
- Provide migration guides

This implementation would allow users to choose their preferred cloud platform for each AI provider, enabling better cost optimization, compliance requirements, and geographic distribution.