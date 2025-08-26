/**
 * SummarizationService
 *
 * Centralized service for AI-powered text summarization operations.
 * Provides title generation, streaming summaries, and final summaries
 * with graceful fallback when disabled or on errors.
 */

import { createLogger } from '../utils/logger.js';
import { debugLog, debugError } from '../utils/console.js';

// Import mapModelToProvider from chat tool
import { mapModelToProvider } from '../tools/chat.js';

const logger = createLogger('summarization');

// Default fast models for summarization tasks
const FAST_MODELS = {
  openai: 'gpt-4o-mini',
  google: 'gemini-2.5-flash',
  xai: 'grok-4',
  anthropic: 'claude-3-5-haiku-latest',
  mistral: 'mistral-small-latest',
  deepseek: 'deepseek-chat',
  openrouter: 'qwen/qwen-2.5-32b-instruct'
};

// Temperature for consistent summarization
const SUMMARIZATION_TEMPERATURE = 0.3;

export class SummarizationService {
  constructor(providers, config) {
    this.providers = providers;
    this.config = config;
    this.enabled = true; // Can be disabled via config in the future
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
      const selectedModel = model || this._selectFastModel();
      const providerName = mapModelToProvider(selectedModel, this.providers);
      const provider = this.providers[providerName];

      if (!provider || !provider.isAvailable(this.config)) {
        debugLog(`Summarization: Provider ${providerName} not available for title generation`);
        return this._fallbackTitle(prompt);
      }

      // Create messages for title generation
      const messages = [
        {
          role: 'system',
          content: 'Generate a concise title (max 50 characters) that captures the essence of the user\'s request. Return ONLY the title text, no quotes or formatting.'
        },
        {
          role: 'user',
          content: prompt
        }
      ];

      // Invoke provider
      const response = await provider.invoke(messages, {
        model: selectedModel,
        temperature: SUMMARIZATION_TEMPERATURE,
        maxTokens: 50,
        config: this.config
      });

      if (response && response.content) {
        // Ensure title is within 50 character limit
        const title = response.content.trim().substring(0, 50);
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
      const selectedModel = model || this._selectFastModel();
      const providerName = mapModelToProvider(selectedModel, this.providers);
      const provider = this.providers[providerName];

      if (!provider || !provider.isAvailable(this.config)) {
        debugLog(`Summarization: Provider ${providerName} not available for streaming summary`);
        return this._fallbackStreamingSummary(content, currentFocus);
      }

      // Create messages for streaming summary
      const messages = [
        {
          role: 'system',
          content: 'Generate a brief summary (2-3 sentences) that captures the overall gist of the content and highlights what is currently being focused on. Be concise and informative.'
        },
        {
          role: 'user',
          content: `Content: ${content}\n\nCurrent focus: ${currentFocus}`
        }
      ];

      // Invoke provider
      const response = await provider.invoke(messages, {
        model: selectedModel,
        temperature: SUMMARIZATION_TEMPERATURE,
        maxTokens: 150,
        config: this.config
      });

      if (response && response.content) {
        const summary = response.content.trim();
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
      const selectedModel = model || this._selectFastModel();
      const providerName = mapModelToProvider(selectedModel, this.providers);
      const provider = this.providers[providerName];

      if (!provider || !provider.isAvailable(this.config)) {
        debugLog(`Summarization: Provider ${providerName} not available for final summary`);
        return this._fallbackFinalSummary(content);
      }

      // Create messages for final summary
      const messages = [
        {
          role: 'system',
          content: 'Generate a concise summary (1-2 sentences) that captures the key points and outcome of the content. Be direct and informative.'
        },
        {
          role: 'user',
          content
        }
      ];

      // Invoke provider
      const response = await provider.invoke(messages, {
        model: selectedModel,
        temperature: SUMMARIZATION_TEMPERATURE,
        maxTokens: 100,
        config: this.config
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
   * Select the best available fast model
   * @private
   */
  _selectFastModel() {
    // Check which providers are available and return the first fast model
    for (const [providerName, fastModel] of Object.entries(FAST_MODELS)) {
      const provider = this.providers[providerName];
      if (provider && provider.isAvailable(this.config)) {
        debugLog(`Summarization: Selected fast model ${fastModel} from ${providerName}`);
        return fastModel;
      }
    }

    // Fallback to default
    debugLog('Summarization: No fast model available, using default');
    return 'gpt-4o-mini';
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
    const focusSnippet = currentFocus ? ` Currently: ${currentFocus.substring(0, 50)}` : '';

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
