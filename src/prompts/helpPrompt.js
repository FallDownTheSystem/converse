/**
 * Help Prompt Implementation
 *
 * Provides comprehensive help documentation for the Converse MCP Server
 */

import { getProviders } from '../providers/index.js';
import { getTools } from '../tools/index.js';

/**
 * Generate comprehensive help content dynamically based on current providers
 */
export function generateHelpContent() {
  const providers = getProviders();

  // Collect all models from all providers
  const allModels = {
    openai: providers.openai?.getSupportedModels() || {},
    google: providers.google?.getSupportedModels() || {},
    xai: providers.xai?.getSupportedModels() || {},
    anthropic: providers.anthropic?.getSupportedModels() || {},
    mistral: providers.mistral?.getSupportedModels() || {},
    deepseek: providers.deepseek?.getSupportedModels() || {},
    openrouter: providers.openrouter?.getSupportedModels() || {}
  };

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
      if (config.supportsTemperature) features.push('Temperature');
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
  const tools = getTools();
  const formatToolParameters = (inputSchema) => {
    if (!inputSchema || !inputSchema.properties) return '';
    
    let params = [];
    const { properties, required = [] } = inputSchema;
    
    for (const [name, prop] of Object.entries(properties)) {
      const isRequired = required.includes(name);
      const defaultValue = prop.default !== undefined ? ` (default: ${JSON.stringify(prop.default)})` : '';
      params.push(`- **${name}** (${isRequired ? 'required' : 'optional'}, ${prop.type}): ${prop.description}${defaultValue}`);
    }
    
    return params.join('\n');
  };

  const formatToolExample = (toolName) => {
    if (toolName === 'chat') {
      return `\`\`\`json
{
  "prompt": "Explain the code in main.js",
  "model": "o3",
  "files": ["C:\\\\Users\\\\username\\\\project\\\\main.js"],
  "temperature": 0.7,
  "use_websearch": false
}
\`\`\``;
    } else if (toolName === 'consensus') {
      return `\`\`\`json
{
  "prompt": "Should we use microservices architecture for our new project?",
  "models": [
    {"model": "o3"},
    {"model": "gemini-2.5-pro"},
    {"model": "grok-4-0709"}
  ],
  "files": ["./requirements.md", "C:\\\\Users\\\\username\\\\architecture.md"],
  "enable_cross_feedback": true,
  "temperature": 0.3
}
\`\`\``;
    }
    return '';
  };

  const toolsSection = Object.entries(tools).map(([name, tool], index) => {
    return `### ${index + 1}. ${name.charAt(0).toUpperCase() + name.slice(1)} Tool
${tool.description}

**Parameters:**
${formatToolParameters(tool.inputSchema)}

**Example Usage:**
${formatToolExample(name)}`;
  }).join('\n\n');

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

## Model Selection Tips

### For Complex Reasoning Tasks
- **Most Intelligent**: o3, o3-pro, gemini-2.5-pro, grok-4
- **Fast & Smart**: o3-mini, o4-mini, gemini-2.5-flash
- **Budget-Friendly**: gpt-4o-mini, gemini-2.0-flash-lite

### For Quick Responses
- **Ultra-Fast**: gemini-2.5-flash, gemini-2.0-flash, gpt-4o-mini
- **Good Balance**: o4-mini, grok-3-fast

### For Large Context Windows
- **1M+ Tokens**: gpt-4.1 (1M), all Gemini models (1M)
- **256K Tokens**: grok-4 series
- **200K Tokens**: o3 series, o4-mini

### Special Features
- **Web Search**: o3 series, o4-mini, gpt-4 series, gemini models with grounding, grok-4
- **Thinking Mode**: o3 series (reasoning_effort), gemini models (thinking budget)
- **Image Support**: All models except gemini-2.0-flash-lite and grok-3 series

## Configuration Tips

### Temperature Settings
- **0.0-0.3**: Factual, deterministic responses
- **0.4-0.7**: Balanced creativity and accuracy (recommended)
- **0.8-1.2**: Creative writing, brainstorming
- **1.3-2.0**: Highly experimental, unpredictable

### Reasoning Effort (for supported models)
- **minimal**: Quick responses with minimal reasoning
- **low**: Light analysis, simple problems
- **medium**: Balanced reasoning (default)
- **high**: Deep analysis, complex problems
- **max**: Maximum reasoning capability

### File Context
- Supports multiple file formats: code files, text, markdown, JSON, etc.
- Use git-bash style paths on Windows: \`/c/Users/username/file.txt\`
- Files are automatically chunked if too large
- Images are base64 encoded and sent to models that support vision

### Continuation IDs
- Automatically generated for new conversations
- Returned in the response for continuing conversations
- Conversations expire after 24 hours of inactivity

## Best Practices

1. **Model Selection**
   - Use "auto" to let the system choose based on availability
   - Specify models when you need specific capabilities
   - Consider cost vs performance tradeoffs

2. **Consensus Tool**
   - Mix different model types for diverse perspectives
   - Enable cross-feedback for refined responses
   - Use lower temperature for more consistent consensus

3. **Context Management**
   - Include only relevant files to avoid token limits
   - Use descriptive prompts to guide model focus
   - Leverage continuation IDs for multi-turn conversations

4. **Error Handling**
   - Check for API key configuration if providers fail
   - Monitor token usage to avoid context limits
   - Use appropriate timeout settings for long-running queries

## Environment Variables

### API Keys (at least one required):
- \`OPENAI_API_KEY\`: For OpenAI models
- \`GOOGLE_API_KEY\`: For Google Gemini models
- \`XAI_API_KEY\`: For X.AI Grok models
- \`ANTHROPIC_API_KEY\`: For Anthropic Claude models
- \`MISTRAL_API_KEY\`: For Mistral models
- \`DEEPSEEK_API_KEY\`: For DeepSeek models
- \`OPENROUTER_API_KEY\`: For OpenRouter models

### OpenRouter Configuration:
- \`OPENROUTER_REFERER\`: OpenRouter referer header for compliance (required for OpenRouter)
- \`OPENROUTER_TITLE\`: OpenRouter X-Title header for request tracking (optional)
- \`OPENROUTER_DYNAMIC_MODELS\`: Enable dynamic model discovery via OpenRouter endpoints API (default: false). Must be set to true to use models in \`provider/model\` format (e.g., \`anthropic/claude-3.5-sonnet\`). When enabled, fetches actual model capabilities from API.

### Server Configuration:
- \`MAX_MCP_OUTPUT_TOKENS\`: Maximum response size (default: 25000)
- \`LOG_LEVEL\`: Logging verbosity (debug, info, warn, error)
- \`PORT\`: HTTP server port (default: 3157)
- \`HTTP_ENABLED\`: Enable HTTP transport (default: true)
- \`HTTP_RATE_LIMIT_ENABLED\`: Enable rate limiting (default: false)
- \`HTTP_RATE_LIMIT_WINDOW\`: Rate limit window in milliseconds (default: 900000 - 15 minutes)
- \`HTTP_RATE_LIMIT_MAX_REQUESTS\`: Maximum requests per window (default: 1000)

Note: Server name and version are automatically read from package.json.

## Need More Help?

- Check the documentation at: https://github.com/FallDownTheSystem/converse
- Report issues at: https://github.com/FallDownTheSystem/converse/issues
- View examples in the \`/examples\` directory`;

  return helpContent;
}

/**
 * Help prompt handler function
 */
export async function helpPromptHandler(args = {}) {
  const { topic } = args;

  const fullHelp = generateHelpContent();

  // If no topic specified, return full help
  if (!topic) {
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Please provide the following comprehensive help guide for the Converse MCP Server to the user. Share all of this information with them:\n\n${fullHelp}`
        }
      }]
    };
  }

  // Extract specific sections based on topic
  const topicLower = topic.toLowerCase();
  let sectionContent = '';

  if (topicLower === 'tools') {
    const toolsMatch = fullHelp.match(/## Available Tools[\s\S]*?(?=##|$)/);
    sectionContent = toolsMatch ? toolsMatch[0] : 'Tools section not found';
  } else if (topicLower === 'models' || topicLower === 'providers') {
    const modelsMatch = fullHelp.match(/## Provider Models[\s\S]*?(?=## Model Selection Tips|$)/);
    sectionContent = modelsMatch ? modelsMatch[0] : 'Models section not found';
  } else if (topicLower === 'parameters') {
    const paramsMatch = fullHelp.match(/## Configuration Tips[\s\S]*?(?=## Best Practices|$)/);
    sectionContent = paramsMatch ? paramsMatch[0] : 'Parameters section not found';
  } else if (topicLower === 'examples') {
    // Extract example usage from both tools
    const examples = fullHelp.match(/\*\*Example Usage:\*\*[\s\S]*?```[\s\S]*?```/g);
    sectionContent = examples ? '## Examples\n\n' + examples.join('\n\n') : 'Examples not found';
  } else {
    sectionContent = `Topic "${topic}" not found. Available topics: tools, models, providers, parameters, examples`;
  }

  return {
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Please share this help information about "${topic}" for the Converse MCP Server with the user:\n\n${sectionContent}`
      }
    }]
  };
}

/**
 * Help prompt metadata
 */
export const helpPromptMetadata = {
  name: 'help',
  description: 'Comprehensive guide for using the Converse MCP Server with all tools, parameters, and models',
  arguments: [
    {
      name: 'topic',
      description: 'Specific topic to get help on (optional). Options: tools, models, providers, parameters, examples',
      required: false
    }
  ]
};
