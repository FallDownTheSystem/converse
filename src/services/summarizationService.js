/**
 * SummarizationService
 *
 * Centralized service for AI-powered text summarization operations.
 * Provides title generation, streaming summaries, and final summaries
 * with graceful fallback when disabled or on errors.
 */

import { createLogger } from '../utils/logger.js';
import { debugLog, debugError } from '../utils/console.js';

import { resolveModelSpec } from '../utils/modelRouting.js';

const logger = createLogger('summarization');

// Fast models for summarization tasks, tried in order (GPT-5-nano first for
// speed). Namespaced so each names exactly one provider.
export const FAST_MODELS = [
  'openai:gpt-5-nano',
  'google:gemini-2.5-flash',
  'xai:grok-4.5',
  'anthropic:claude-haiku-4-5-20251001',
  'mistral:mistral-small-2603',
  'deepseek:deepseek-v4-flash',
  'openrouter:z-ai/glm-5.2',
];

export class SummarizationService {
  constructor(providers, config) {
    this.providers = providers;
    this.config = config;
    // Use config to determine if summarization is enabled
    this.enabled = config.summarization?.enabled ?? false;
    // Store configured model preference
    this.configuredModel = config.summarization?.model || null;

    debugLog(
      `SummarizationService initialized - enabled: ${this.enabled}, model: ${this.configuredModel || 'auto-select'}`,
    );
  }

  /**
   * Generate a title from a prompt (max 50 characters)
   * @param {string} prompt - The user prompt to generate a title from
   * @param {string} model - Optional model override
   * @returns {Promise<string>} Generated title or fallback text snippet
   */
  async generateTitle(prompt, model = null) {
    if (!this.enabled || !prompt) {
      return this._fallbackTitle(prompt);
    }

    try {
      // Select fast model if not specified
      const selected = this._resolve(model || this._selectFastModel());
      if (!selected) {
        debugLog('Summarization: No available model for title generation');
        return this._fallbackTitle(prompt);
      }
      const { provider, resolvedModel: selectedModel } = selected;

      // Create messages for title generation
      const messages = [
        {
          role: 'system',
          content:
            'Generate a concise title (max 50 characters) that captures the essence of the user\'s request. Return ONLY the title text, no quotes or formatting.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ];

      // Invoke provider with minimal reasoning for speed
      const response = await provider.invoke(messages, {
        model: selectedModel,
        maxTokens: 200, // Increased to prevent incomplete responses
        reasoning_effort: 'minimal', // Use minimal reasoning for fast summaries
        config: this.config,
      });

      if (response && response.content) {
        // Ensure title is within 60 characters
        const title = response.content.trim().substring(0, 60);
        debugLog(`Summarization: Generated title - "${title}"`);
        return title;
      }

      return this._fallbackTitle(prompt);
    } catch (error) {
      debugError('Summarization: Error generating title', error);
      logger.error('Title generation failed', { error });
      return this._fallbackTitle(prompt);
    }
  }

  /**
   * Generate a streaming summary showing gist + current focus
   * @param {string} content - The full content to summarize
   * @param {string} currentFocus - The current area being worked on
   * @param {string} model - Optional model override
   * @returns {Promise<string>} Generated summary or fallback text
   */
  async generateStreamingSummary(content, currentFocus, model = null) {
    if (!this.enabled || !content) {
      return this._fallbackStreamingSummary(content, currentFocus);
    }

    try {
      // Select fast model if not specified
      const selected = this._resolve(model || this._selectFastModel());
      if (!selected) {
        debugLog('Summarization: No available model for streaming summary');
        return this._fallbackStreamingSummary(content, currentFocus);
      }
      const { provider, resolvedModel: selectedModel } = selected;

      // Create messages for streaming summary
      const messages = [
        {
          role: 'system',
          content:
            'Generate a single continuous status description of what the AI is doing from the perspective of the AI. Start with the main task/topic, then use transition phrases like "Currently exploring", "Currently investigating", "Now examining", "Now writing about", "Now discussing" to describe the current focus. Return ONLY the status text in one flowing sentence, no labels or formatting. Example: "Writing a technical review of database architecture with focus on scalability and performance. Currently exploring connection pooling strategies and their impact on resource utilization."',
        },
        {
          role: 'user',
          content: `Full content so far:\n${content}\n\n---\nLast section (current focus):\n${currentFocus}\n\nProvide a single status description from the perspective of the AI as if you were generating it, that flows naturally from the overall task to the current focus.`,
        },
      ];

      // Invoke provider with minimal reasoning for speed
      const response = await provider.invoke(messages, {
        model: selectedModel,
        maxTokens: 300, // Increased to prevent incomplete responses
        reasoning_effort: 'minimal', // Use minimal reasoning for fast summaries
        config: this.config,
      });

      if (response && response.content) {
        // Remove any newlines and extra spaces from the summary
        const summary = response.content
          .trim()
          .replace(/\n+/g, ' ')
          .replace(/\s+/g, ' ');
        debugLog('Summarization: Generated streaming summary');
        return summary;
      }

      return this._fallbackStreamingSummary(content, currentFocus);
    } catch (error) {
      debugError('Summarization: Error generating streaming summary', error);
      logger.error('Streaming summary generation failed', { error });
      return this._fallbackStreamingSummary(content, currentFocus);
    }
  }

  /**
   * Generate a final summary (1-2 sentences) for completed response
   * @param {string} content - The full content to summarize
   * @param {string} model - Optional model override
   * @returns {Promise<string>} Generated summary or fallback text
   */
  async generateFinalSummary(content, model = null) {
    if (!this.enabled || !content) {
      return this._fallbackFinalSummary(content);
    }

    try {
      // Select fast model if not specified
      const selected = this._resolve(model || this._selectFastModel());
      if (!selected) {
        debugLog('Summarization: No available model for final summary');
        return this._fallbackFinalSummary(content);
      }
      const { provider, resolvedModel: selectedModel } = selected;

      // Create messages for final summary
      const messages = [
        {
          role: 'system',
          content:
            'Generate a concise summary (1-2 sentences) that captures the key points and outcome of the content. Be direct and informative.',
        },
        {
          role: 'user',
          content,
        },
      ];

      // Invoke provider with minimal reasoning for speed
      const response = await provider.invoke(messages, {
        model: selectedModel,
        maxTokens: 250, // Increased to prevent incomplete responses
        reasoning_effort: 'minimal', // Use minimal reasoning for fast summaries
        config: this.config,
      });

      if (response && response.content) {
        const summary = response.content.trim();
        debugLog('Summarization: Generated final summary');
        return summary;
      }

      return this._fallbackFinalSummary(content);
    } catch (error) {
      debugError('Summarization: Error generating final summary', error);
      logger.error('Final summary generation failed', { error });
      return this._fallbackFinalSummary(content);
    }
  }

  /**
   * Route a model spec to its first available provider.
   * @private
   * @returns {{ provider: object, providerName: string, resolvedModel: string }|null}
   */
  _resolve(spec) {
    const resolution = resolveModelSpec(spec, this.providers, this.config);
    if (resolution.status !== 'ok') {
      debugLog(`Summarization: ${resolution.error}`);
      return null;
    }
    return resolution;
  }

  /**
   * Select the best available fast model
   * @private
   */
  _selectFastModel() {
    // If a model is configured, try to use it first
    if (this.configuredModel) {
      const resolution = resolveModelSpec(this.configuredModel, this.providers, this.config);
      if (resolution.status === 'ok') {
        debugLog(
          `Summarization: Using configured model ${this.configuredModel} from ${resolution.providerName}`,
        );
        return this.configuredModel;
      }
      debugLog(
        `Summarization: Configured model ${this.configuredModel} not available, falling back to auto-selection`,
      );
    }

    // Return the first fast model whose provider is available
    for (const fastModel of FAST_MODELS) {
      if (resolveModelSpec(fastModel, this.providers, this.config).status === 'ok') {
        debugLog(`Summarization: Selected fast model ${fastModel}`);
        return fastModel;
      }
    }

    // Fallback to default or configured model (gpt-5-nano is fastest)
    const fallbackModel = this.configuredModel || 'gpt-5-nano';
    debugLog(
      `Summarization: No fast model available, using ${fallbackModel} as fallback`,
    );
    return fallbackModel;
  }

  /**
   * Fallback title generation using text snippet
   * @private
   */
  _fallbackTitle(prompt) {
    if (!prompt) return 'Untitled';
    // Take first 50 characters of prompt
    const title = prompt.substring(0, 50).trim();
    debugLog(`Summarization: Using fallback title - "${title}"`);
    return title || 'Untitled';
  }

  /**
   * Fallback streaming summary using text snippets
   * @private
   */
  _fallbackStreamingSummary(content, currentFocus) {
    if (!content) return 'Processing...';

    const contentSnippet = content.substring(0, 100).trim();
    const focusSnippet = currentFocus
      ? ` Currently: ${currentFocus.substring(0, 50)}`
      : '';

    const summary = `${contentSnippet}...${focusSnippet}`;
    debugLog('Summarization: Using fallback streaming summary');
    return summary;
  }

  /**
   * Fallback final summary using text snippet
   * @private
   */
  _fallbackFinalSummary(content) {
    if (!content) return 'Completed.';

    // Take first 150 characters as summary
    const summary = content.substring(0, 150).trim() + '...';
    debugLog('Summarization: Using fallback final summary');
    return summary;
  }

  /**
   * Enable or disable the service
   * @param {boolean} enabled - Whether the service should be enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    logger.info(`Summarization service ${enabled ? 'enabled' : 'disabled'}`);
  }
}
