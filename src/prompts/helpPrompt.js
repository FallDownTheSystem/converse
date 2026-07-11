/**
 * Help Prompt Implementation
 *
 * Provides comprehensive help documentation for the Converse MCP Server.
 * Auto-generates documentation from code structures (CONFIG_SCHEMA, tool schemas, provider models).
 */

import { getProviders } from '../providers/index.js';
import { getTools } from '../tools/index.js';
import { CONFIG_SCHEMA } from '../config.js';

/**
 * Sample values for generating realistic tool examples.
 * Structure comes from schema, content from curated values here.
 */
const SAMPLE_VALUES = {
  prompt: 'Explain the authentication flow in this codebase',
  files: ['src/auth.js'],
  images: ['./diagram.png'],
  models: ['codex', 'gemini', 'claude'],
  mode: 'consensus',
  continuation_id: 'conv_abc123',
  reasoning_effort: 'medium',
  async: false,
  export: false,
  full_history: false,
};

/**
 * Safely get models from a provider (handles CLI providers that may throw)
 * @param {object} provider - Provider object
 * @param {string} name - Provider name for logging
 * @returns {object} Models map or empty object on error
 */
function safeGetModels(provider, name) {
  try {
    return provider?.getSupportedModels() || {};
  } catch (error) {
    // CLI providers may throw if not installed - silently skip
    return {};
  }
}

/**
 * Generate environment variables documentation from CONFIG_SCHEMA.
 * Sorted alphabetically within categories, compact one-liner format.
 * @returns {string} Formatted markdown section
 */
function generateEnvironmentVariablesSection() {
  const categoryTitles = {
    server: 'Server Configuration',
    transport: 'Transport Configuration',
    apiKeys: 'API Keys (at least one required)',
    providers: 'Provider Configuration',
    mcp: 'MCP Configuration',
    summarization: 'Summarization Configuration',
    async: 'Async Configuration',
  };

  let output = '';

  for (const [category, vars] of Object.entries(CONFIG_SCHEMA)) {
    const title = categoryTitles[category] || category;
    output += `### ${title}\n`;

    // Sort variables alphabetically within category
    const sortedVars = Object.entries(vars).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );

    for (const [varName, schema] of sortedVars) {
      const tags = [];

      // Add required tag
      if (schema.required) {
        tags.push('Required');
      }

      // Add secret tag for API keys
      if (schema.secret) {
        tags.push('Secret');
      }

      // Add default value
      if (schema.default !== undefined && schema.default !== null) {
        tags.push(`Default: ${JSON.stringify(schema.default)}`);
      }

      const tagStr = tags.length > 0 ? ` (${tags.join(', ')})` : '';
      output += `- \`${varName}\`${tagStr}: ${schema.description}\n`;
    }

    output += '\n';
  }

  return output;
}

/**
 * Generate tool example JSON from input schema using SAMPLE_VALUES.
 * @param {string} toolName - Name of the tool
 * @param {object} inputSchema - Tool's input schema
 * @returns {string} Formatted JSON example in markdown code block
 */
function generateToolExamplesFromSchema(toolName, inputSchema) {
  if (!inputSchema || !inputSchema.properties) {
    return '';
  }

  const { properties, required = [] } = inputSchema;
  const example = {};

  // Include required parameters first
  for (const name of required) {
    if (properties[name]) {
      example[name] = SAMPLE_VALUES[name] ?? getDefaultForType(properties[name]);
    }
  }

  // For the chat tool, show one example per mode for richer documentation.
  if (toolName === 'chat') {
    const chatExample = { prompt: SAMPLE_VALUES.prompt, models: ['auto'] };
    if (properties.files) chatExample.files = SAMPLE_VALUES.files;
    const consensusExample = {
      prompt: SAMPLE_VALUES.prompt,
      models: SAMPLE_VALUES.models,
      mode: 'consensus',
    };
    const roundtableExample = {
      prompt: SAMPLE_VALUES.prompt,
      models: SAMPLE_VALUES.models,
      mode: 'roundtable',
    };
    return [
      '```json',
      '// mode "chat" (default) — independent parallel answers',
      JSON.stringify(chatExample, null, 2),
      '```',
      '```json',
      '// mode "consensus" — ≥2 models answer, then refine',
      JSON.stringify(consensusExample, null, 2),
      '```',
      '```json',
      '// mode "roundtable" — sequential turn-based dialogue',
      JSON.stringify(roundtableExample, null, 2),
      '```',
    ].join('\n');
  }

  if (toolName === 'check_status' || toolName === 'cancel_job') {
    if (properties.continuation_id)
      example.continuation_id = SAMPLE_VALUES.continuation_id;
  }

  return `\`\`\`json\n${JSON.stringify(example, null, 2)}\n\`\`\``;
}

/**
 * Get a default value based on JSON schema type.
 * @param {object} prop - Property schema
 * @returns {any} Default value
 */
function getDefaultForType(prop) {
  if (prop.default !== undefined) return prop.default;
  if (prop.enum && prop.enum.length > 0) return prop.enum[0];

  switch (prop.type) {
  case 'string':
    return 'example';
  case 'number':
    return 0;
  case 'boolean':
    return false;
  case 'array':
    return [];
  case 'object':
    return {};
  default:
    return null;
  }
}

/**
 * Generate factual model categorization lists (no subjective tips).
 * Categories: context window, web search, thinking mode, image support.
 * @param {object} allModels - Map of provider name to models
 * @returns {string} Formatted markdown section with sorted model lists
 */
function generateModelCategories(allModels) {
  // Flatten all models with provider info
  const models = [];
  for (const [providerName, providerModels] of Object.entries(allModels)) {
    for (const [modelId, config] of Object.entries(providerModels)) {
      models.push({
        id: modelId,
        provider: providerName,
        ...config,
      });
    }
  }

  // Sort helper - alphabetically by model ID
  const sortByModelId = (a, b) => a.id.localeCompare(b.id);

  let output = '## Model Categories\n\n';

  // Group by context window
  output += '### Models by Context Window\n\n';

  const windowGroups = {
    '1M+ tokens': models.filter((m) => m.contextWindow >= 1000000),
    '400K+ tokens': models.filter(
      (m) => m.contextWindow >= 400000 && m.contextWindow < 1000000,
    ),
    '200K+ tokens': models.filter(
      (m) => m.contextWindow >= 200000 && m.contextWindow < 400000,
    ),
    'Under 200K tokens': models.filter((m) => m.contextWindow < 200000),
  };

  for (const [groupName, groupModels] of Object.entries(windowGroups)) {
    if (groupModels.length > 0) {
      output += `**${groupName}:**\n`;
      for (const m of groupModels.sort(sortByModelId)) {
        output += `- ${m.id} (${m.provider}) - ${m.contextWindow.toLocaleString()} tokens\n`;
      }
      output += '\n';
    }
  }

  // Models with Web Search
  const webSearchModels = models
    .filter((m) => m.supportsWebSearch)
    .sort(sortByModelId);
  if (webSearchModels.length > 0) {
    output += '### Models with Web Search\n';
    for (const m of webSearchModels) {
      output += `- ${m.id} (${m.provider})\n`;
    }
    output += '\n';
  }

  // Models with Thinking Mode
  const thinkingModels = models
    .filter((m) => m.supportsThinking)
    .sort(sortByModelId);
  if (thinkingModels.length > 0) {
    output += '### Models with Thinking Mode\n';
    for (const m of thinkingModels) {
      output += `- ${m.id} (${m.provider})\n`;
    }
    output += '\n';
  }

  // Models with Image Support
  const imageModels = models
    .filter((m) => m.supportsImages)
    .sort(sortByModelId);
  if (imageModels.length > 0) {
    output += '### Models with Image Support\n';
    for (const m of imageModels) {
      output += `- ${m.id} (${m.provider})\n`;
    }
    output += '\n';
  }

  return output;
}

/**
 * Generate configuration tips from tool parameter schemas.
 * Extracts enum values and ranges directly from schema.
 * @param {object} tools - Map of tool name to tool implementation
 * @returns {string} Formatted markdown section
 */
function generateConfigurationTips(tools) {
  let output = '## Configuration Tips\n\n';

  // Get chat tool schema for parameter info
  const chatSchema = tools.chat?.inputSchema?.properties || {};

  // Modes
  if (chatSchema.mode) {
    output += '### Modes\n';
    output += '- **chat** (default): 1..N models answer independently in parallel\n';
    output += '- **consensus**: ≥2 models answer, then refine after seeing each other\n';
    output += '- **roundtable**: models answer sequentially in the given order, each building on the transcript\n';
    output += '\n';
  }

  // Reasoning Effort
  if (chatSchema.reasoning_effort) {
    const effortSchema = chatSchema.reasoning_effort;
    output += '### Reasoning Effort (for supported models)\n';
    if (effortSchema.enum) {
      for (const value of effortSchema.enum) {
        const descriptions = {
          none: 'No reasoning, fastest response (GPT-5.1+ only)',
          minimal: 'Quick responses with minimal reasoning',
          low: 'Light analysis, simple problems',
          medium: 'Balanced reasoning (default)',
          high: 'Deep analysis, complex problems',
          max: 'Maximum reasoning capability',
        };
        output += `- **${value}**: ${descriptions[value] || value}\n`;
      }
    }
    output += '\n';
  }

  // File Context
  output += '### File Context\n';
  output +=
    '- **IMPORTANT**: Always use the `files` parameter to share code/file content instead of copying into the prompt\n';
  output +=
    '- Using `files` provides better formatting, line numbers, and preserves full context\n';
  output +=
    '- Supports multiple file formats: code files, text, markdown, JSON, etc.\n';
  output +=
    '- Line ranges supported: `file.txt{10:50}` for lines 10-50, `file.txt{100:}` for line 100 onwards\n';
  output += '- Files are automatically chunked if too large\n';
  output +=
    '- Images are base64 encoded and sent to models that support vision\n\n';

  // Continuation IDs
  output += '### Continuation IDs\n';
  output += '- Automatically generated for new conversations\n';
  output += '- Returned in the response for continuing conversations\n';
  output += '- Conversations expire after 24 hours of inactivity\n\n';

  return output;
}

/**
 * Generate comprehensive help content dynamically based on current providers
 * @param {object} config - Configuration object (optional)
 */
export function generateHelpContent(config = null) {
  const providers = getProviders();

  // Collect all models from all providers (including CLI providers with safe access)
  const allModels = {
    openai: providers.openai?.getSupportedModels() || {},
    google: providers.google?.getSupportedModels() || {},
    xai: providers.xai?.getSupportedModels() || {},
    anthropic: providers.anthropic?.getSupportedModels() || {},
    mistral: providers.mistral?.getSupportedModels() || {},
    deepseek: providers.deepseek?.getSupportedModels() || {},
    openrouter: providers.openrouter?.getSupportedModels() || {},
    // CLI providers - use safeGetModels (may throw if CLI not installed)
    codex: safeGetModels(providers.codex, 'codex'),
    claude: safeGetModels(providers.claude, 'claude'),
    'gemini-cli': safeGetModels(providers['gemini-cli'], 'gemini-cli'),
  };

  // Limit OpenRouter models if dynamic models enabled (could have hundreds)
  if (allModels.openrouter && Object.keys(allModels.openrouter).length > 20) {
    const entries = Object.entries(allModels.openrouter).slice(0, 20);
    allModels.openrouter = Object.fromEntries(entries);
  }

  // Format provider models for display
  const formatProviderModels = (providerName, models) => {
    if (!models || Object.keys(models).length === 0) return '';

    let output = `\n### ${providerName.toUpperCase()} Models\n\n`;

    for (const [modelId, config] of Object.entries(models)) {
      output += `**${modelId}** - ${config.friendlyName}\n`;
      output += `- Description: ${config.description}\n`;
      output += `- Context Window: ${config.contextWindow.toLocaleString()} tokens\n`;
      output += `- Max Output: ${config.maxOutputTokens.toLocaleString()} tokens\n`;
      output += '- Features: ';

      const features = [];
      if (config.supportsStreaming) features.push('Streaming');
      if (config.supportsImages) features.push('Images');
      if (config.supportsWebSearch) features.push('Web Search');
      if (config.supportsThinking) features.push('Thinking Mode');
      if (config.supportsResponsesAPI) features.push('Responses API');

      output += features.join(', ') + '\n';

      if (config.aliases && config.aliases.length > 0) {
        output += `- Aliases: ${config.aliases.join(', ')}\n`;
      }

      output += '\n';
    }

    return output;
  };

  // Get tools and format their documentation
  const tools = getTools(config);
  const formatToolParameters = (inputSchema) => {
    if (!inputSchema || !inputSchema.properties) return '';

    const params = [];
    const { properties, required = [] } = inputSchema;

    for (const [name, prop] of Object.entries(properties)) {
      const isRequired = required.includes(name);
      const defaultValue =
        prop.default !== undefined
          ? ` (default: ${JSON.stringify(prop.default)})`
          : '';
      params.push(
        `- **${name}** (${isRequired ? 'required' : 'optional'}, ${prop.type}): ${prop.description}${defaultValue}`,
      );
    }

    return params.join('\n');
  };

  const toolsSection = Object.entries(tools)
    .map(([name, tool], index) => {
      const example = generateToolExamplesFromSchema(name, tool.inputSchema);
      return `### ${index + 1}. ${name.charAt(0).toUpperCase() + name.slice(1)} Tool
${tool.description}

**Parameters:**
${formatToolParameters(tool.inputSchema)}

**Example Usage:**
${example}`;
    })
    .join('\n\n');

  const helpContent = `# Converse MCP Server - Comprehensive Guide

Welcome to the Converse MCP Server! This guide provides detailed information about all available tools, parameters, providers, and models.

## Available Tools

${toolsSection}

## Provider Models
${formatProviderModels('OpenAI', allModels.openai)}
${formatProviderModels('Google Gemini', allModels.google)}
${formatProviderModels('X.AI (Grok)', allModels.xai)}
${formatProviderModels('Anthropic', allModels.anthropic)}
${formatProviderModels('Mistral', allModels.mistral)}
${formatProviderModels('DeepSeek', allModels.deepseek)}
${formatProviderModels('OpenRouter', allModels.openrouter)}
${formatProviderModels('Codex', allModels.codex)}
${formatProviderModels('Claude CLI', allModels.claude)}
${formatProviderModels('Gemini (Antigravity CLI)', allModels['gemini-cli'])}

${generateModelCategories(allModels)}

${generateConfigurationTips(tools)}

## Best Practices

1. **Model Selection**
   - Use "auto" to let the system choose based on availability
   - Specify models when you need specific capabilities
   - Consider cost vs performance tradeoffs

2. **Choosing a Mode**
   - Use **chat** for a single answer or independent parallel answers
   - Use **consensus** to have ≥2 models cross-check and refine each other
   - Use **roundtable** for a sequential discussion where each model builds on the last

3. **Context Management**
   - Include only relevant files to avoid token limits
   - Use descriptive prompts to guide model focus
   - Leverage continuation IDs for multi-turn conversations (you may switch modes on resume)

4. **Error Handling**
   - Check for API key configuration if providers fail
   - Monitor token usage to avoid context limits
   - Use appropriate timeout settings for long-running queries

## Environment Variables

${generateEnvironmentVariablesSection()}

## CLI-Based Providers (Special Authentication)

These providers use local CLI tools and don't require API keys:

- **codex**: Requires ChatGPT login or CODEX_API_KEY environment variable
- **claude**: Requires \`claude login\` command (Claude Code CLI authentication)
- **gemini-cli**: Requires the Antigravity CLI (\`agy\`) installed and authenticated via Google OAuth (run \`agy\` once interactively to log in)

## Need More Help?

- Check the documentation at: https://github.com/FallDownTheSystem/converse
- Report issues at: https://github.com/FallDownTheSystem/converse/issues`;

  return helpContent;
}

/**
 * Help prompt handler function
 * @param {object} args - Prompt arguments (unused)
 * @param {object} config - Configuration object (optional)
 */
export async function helpPromptHandler(args = {}, config = null) {
  const fullHelp = generateHelpContent(config);

  return {
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Please provide the following comprehensive help guide for the Converse MCP Server to the user. Share all of this information with them:\n\n${fullHelp}`,
        },
      },
    ],
  };
}

/**
 * Help prompt metadata
 */
export const helpPromptMetadata = {
  name: 'help',
  description:
    'Comprehensive guide for Converse MCP Server - tools, models, parameters, and configuration',
  arguments: [],
};
