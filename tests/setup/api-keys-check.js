/**
 * API Keys Check Setup
 * 
 * This setup file validates that required API keys are available
 * for real API integration tests.
 */

import dotenv from 'dotenv'
import { logger } from '../../src/utils/logger.js'

// Ensure environment variables are loaded
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: '.env.test' })
  dotenv.config({ override: false })
} else {
  dotenv.config()
}

// Check for API keys
const apiKeys = {
  openai: process.env.OPENAI_API_KEY,
  xai: process.env.XAI_API_KEY,
  google: process.env.GOOGLE_API_KEY
}

const availableProviders = Object.entries(apiKeys)
  .filter(([_, key]) => key && key.length > 0)
  .map(([provider]) => provider)

const missingProviders = Object.entries(apiKeys)
  .filter(([_, key]) => !key || key.length === 0)
  .map(([provider]) => provider)

if (availableProviders.length === 0) {
  logger.warn('[api-keys-check] No API keys found. All real API tests will be skipped.')
  logger.warn('[api-keys-check] To run real API tests, set at least one of: OPENAI_API_KEY, XAI_API_KEY, GOOGLE_API_KEY')
} else {
  logger.info(`[api-keys-check] Available providers: ${availableProviders.join(', ')}`)
  
  if (missingProviders.length > 0) {
    logger.info(`[api-keys-check] Missing providers (tests will be skipped): ${missingProviders.join(', ')}`)
  }
}

// Validate API key formats
if (apiKeys.openai && !apiKeys.openai.startsWith('sk-')) {
  logger.warn('[api-keys-check] OpenAI API key format appears invalid (should start with "sk-")')
}

if (apiKeys.xai && !apiKeys.xai.startsWith('xai-')) {
  logger.warn('[api-keys-check] XAI API key format appears invalid (should start with "xai-")')
}

if (apiKeys.google && apiKeys.google.length < 20) {
  logger.warn('[api-keys-check] Google API key format appears invalid (should be longer)')
}

// Export for test access
export const hasOpenAI = !!(apiKeys.openai && apiKeys.openai.startsWith('sk-'))
export const hasXAI = !!(apiKeys.xai && apiKeys.xai.startsWith('xai-'))
export const hasGoogle = !!(apiKeys.google && apiKeys.google.length > 20)
export const hasAnyProvider = hasOpenAI || hasXAI || hasGoogle
export const providerCount = [hasOpenAI, hasXAI, hasGoogle].filter(Boolean).length

logger.info(`[api-keys-check] Setup complete. Provider count: ${providerCount}`)