import { describe, it, expect, beforeAll, vi } from 'vitest'
import { withHTTPTestServer } from '../utils/HTTPMCPServerManager.js'
import { loadConfig } from '../../src/config.js'
import { logger } from '../../src/utils/logger.js'

// These tests make real API calls - they require valid API keys and will be skipped if not available
describe('Real API Integration Tests', () => {
  let config
  
  // Check environment variables directly for skipIf conditions
  const hasOpenAI = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-'))
  const hasXAI = !!(process.env.XAI_API_KEY && process.env.XAI_API_KEY.startsWith('xai-'))
  const hasGoogle = !!(process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.length > 20)
  const hasAnyApiKey = hasOpenAI || hasXAI || hasGoogle

  beforeAll(async () => {
    try {
      if (!hasAnyApiKey) {
        logger.warn('[real-api-test] No API keys found - real API tests will be skipped')
      } else {
        logger.info('[real-api-test] API keys found - running real API integration tests')
      }
      
      // Load config for test dependencies
      config = await loadConfig()
    } catch (error) {
      logger.error('[real-api-test] Setup failed:', error)
      // Set config to empty object so skipIf conditions work
      config = { apiKeys: {} }
    }
  })

  describe('Chat Tool with Real APIs via HTTP', () => {
    it.skipIf(!hasAnyApiKey)('should complete a simple chat request with available provider via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Hello! Please respond with exactly: "Integration test successful"',
            model: 'auto', // Use first available provider
            temperature: 0.1 // Low temperature for consistent responses
          }
        })

        expect(result).toBeDefined()
        expect(result.isError).toBeFalsy()
        expect(result.content).toBeDefined()
        expect(Array.isArray(result.content)).toBe(true)
        expect(result.content[0].type).toBe('text')
        expect(result.content[0].text).toBeDefined()
        
        // Should contain the expected response
        expect(result.content[0].text.toLowerCase()).toContain('integration test successful')
        
        // Should have continuation metadata
        expect(result.continuation).toBeDefined()
        expect(result.continuation.id).toBeDefined()
        expect(result.continuation.id.startsWith('conv_')).toBe(true)
        
        logger.info('[real-api-test] Chat tool HTTP integration test completed successfully')
      })
    }, 60000) // 60 second timeout for API calls

    it.skipIf(!hasOpenAI)('should work with OpenAI provider specifically via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 2+2? Answer with just the number.',
            model: 'gpt-4o-mini',
            temperature: 0
          }
        })

        expect(result.isError).toBeFalsy()
        expect(result.content[0].text).toContain('4')
        
        logger.info('[real-api-test] OpenAI HTTP integration test completed')
      })
    }, 60000)

    it.skipIf(!hasXAI)('should work with XAI provider specifically via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 3+3? Answer with just the number.',
            model: 'grok',
            temperature: 0
          }
        })

        expect(result.isError).toBeFalsy()
        expect(result.content[0].text).toContain('6')
        
        logger.info('[real-api-test] XAI HTTP integration test completed')
      })
    }, 60000)

    it.skipIf(!hasGoogle)('should work with Google provider specifically via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 5+5? Answer with just the number.',
            model: 'flash',
            temperature: 0
          }
        })

        expect(result.isError).toBeFalsy()
        expect(result.content[0].text).toContain('10')
        
        logger.info('[real-api-test] Google HTTP integration test completed')
      })
    }, 60000)
  })

  describe('Consensus Tool with Real APIs via HTTP', () => {
    it.skipIf(!hasAnyApiKey)('should gather consensus from available providers via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Create models list based on available API keys
        const models = []
        if (hasOpenAI) models.push({ model: 'gpt-4o-mini' })
        if (hasXAI) models.push({ model: 'grok' })
        if (hasGoogle) models.push({ model: 'flash' })
        
        if (models.length === 0) {
          return // Skip if no models available
        }

        const result = await client.callTool({
          name: 'consensus',
          arguments: {
            prompt: 'Is the sky blue? Answer with "Yes" or "No" only.',
            models: models,
            enable_cross_feedback: false, // Disable for faster testing
            temperature: 0
          }
        })

        expect(result).toBeDefined()
        expect(result.isError).toBeFalsy()
        expect(result.content).toBeDefined()
        
        // Parse the consensus result
        const consensusResult = JSON.parse(result.content[0].text)
        expect(consensusResult.status).toBe('consensus_complete')
        expect(consensusResult.models_consulted).toBe(models.length)
        expect(consensusResult.successful_initial_responses).toBeGreaterThan(0)
        expect(consensusResult.phases).toBeDefined()
        expect(consensusResult.phases.initial).toBeDefined()
        
        // Check that we got responses
        consensusResult.phases.initial.forEach(response => {
          expect(response.model).toBeDefined()
          expect(response.status).toBe('success')
          expect(response.response).toBeDefined()
          expect(response.response.toLowerCase()).toContain('yes')
        })
        
        logger.info(`[real-api-test] Consensus HTTP test completed with ${models.length} providers`)
      })
    }, 120000) // 120 second timeout for multiple API calls

    it.skipIf(!hasAnyApiKey || !(hasOpenAI && hasGoogle))('should test cross-feedback with multiple providers via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Only run if we have at least 2 providers
        const models = [
          { model: 'gpt-4o-mini' },
          { model: 'flash' }
        ]

        const result = await client.callTool({
          name: 'consensus',
          arguments: {
            prompt: 'What color is grass? Please be concise.',
            models: models,
            enable_cross_feedback: true,
            temperature: 0.1
          }
        })

        expect(result.isError).toBeFalsy()
        
        const consensusResult = JSON.parse(result.content[0].text)
        expect(consensusResult.phases.initial).toBeDefined()
        expect(consensusResult.phases.refined).toBeDefined()
        expect(consensusResult.refined_responses).toBeGreaterThan(0)
        
        logger.info('[real-api-test] Cross-feedback consensus HTTP test completed')
      })
    }, 180000) // 180 second timeout for cross-feedback
  })

  describe('Conversation Continuity via HTTP', () => {
    it.skipIf(!hasAnyApiKey)('should maintain conversation history across requests via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // First message
        const firstResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Remember this number: 42. Just say "Remembered" to confirm.',
            model: 'auto',
            temperature: 0
          }
        })

        expect(firstResult.isError).toBeFalsy()
        const conversationId = firstResult.continuation.id
        expect(conversationId).toBeDefined()

        // Second message using continuation
        const secondResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What number did I ask you to remember?',
            continuation_id: conversationId,
            model: 'auto',
            temperature: 0
          }
        })

        expect(secondResult.isError).toBeFalsy()
        expect(secondResult.content[0].text).toContain('42')
        
        logger.info('[real-api-test] Conversation continuity HTTP test completed')
      })
    }, 120000)
  })

  describe('Error Handling with Real APIs via HTTP', () => {
    it.skipIf(!hasAnyApiKey)('should handle invalid model names gracefully via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Hello',
            model: 'nonexistent-model-123'
          }
        })

        // Should either succeed with a fallback or fail gracefully
        if (result.isError) {
          expect(result.content).toBeDefined()
          expect(result.content[0]).toBeDefined()
          expect(result.content[0].text).toMatch(/(model|provider|not found|not available)/i)
        }
      })
    })

    it.skipIf(!hasAnyApiKey)('should handle very large prompts appropriately via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const largePrompt = 'This is a very long prompt. '.repeat(1000) + 'Please respond briefly.'
        
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: largePrompt,
            model: 'auto'
          }
        })

        // Should either succeed or fail with context length error
        if (result.isError) {
          expect(result.error.message).toMatch(/(context|length|token|limit)/i)
        } else {
          expect(result.content[0].text).toBeDefined()
        }
      })
    }, 90000)
  })

  describe('Provider-Specific Features via HTTP', () => {
    it.skipIf(!hasGoogle)('should support Google thinking mode via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Think step by step: What is 17 * 23?',
            model: 'gemini-2.5-pro',
            thinking: 'medium'
          }
        })

        expect(result.isError).toBeFalsy()
        expect(result.content[0].text).toBeDefined()
        
        logger.info('[real-api-test] Google thinking mode HTTP test completed')
      })
    }, 90000)

    it.skipIf(!hasOpenAI)('should support OpenAI reasoning effort for O3 via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 2+2?',
            model: 'o3-mini',
            reasoningEffort: 'low'
          }
        })

        // May fail if O3 is not available, that's expected
        if (!result.isError) {
          expect(result.content[0].text).toContain('4')
        }
        
        logger.info('[real-api-test] OpenAI O3 reasoning effort HTTP test completed')
      })
    }, 90000)
  })

  describe('Performance with Real APIs via HTTP', () => {
    it.skipIf(!hasAnyApiKey)('should complete simple requests within reasonable time via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const startTime = Date.now()
        
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Say "OK"',
            model: 'auto'
          }
        })

        const duration = Date.now() - startTime
        
        expect(result.isError).toBeFalsy()
        expect(duration).toBeLessThan(60000) // Should complete within 60 seconds
        
        logger.info(`[real-api-test] Performance HTTP test completed in ${duration}ms`)
      })
    }, 70000)
  })
})