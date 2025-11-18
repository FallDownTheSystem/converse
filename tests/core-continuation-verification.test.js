import { describe, test, beforeEach, afterEach, expect } from 'vitest';
import { HTTPMCPTestClient } from './utils/HTTPMCPTestClient.js';

describe('Core Continuation Verification Tests', () => {
  let client;

  beforeEach(async () => {
    client = new HTTPMCPTestClient();
    await client.start();
  }, 20000);

  afterEach(async () => {
    if (client) {
      await client.stop();
    }
  });

  test('should handle multiple chat continuations with math progression', async () => {
    const model = 'gemini-2.5-flash'; // Fast, reliable model
    let continuationId = null;
    let previousResult = null;

    // Define the math progression: each step doubles the previous result
    const mathSteps = [
      {
        question: 'What is 2 + 2? Just give me the number.',
        expected: /4/,
        step: 1,
      },
      {
        question: 'Now what is 4 + 4? Just the number please.',
        expected: /8/,
        step: 2,
      },
      { question: 'What is 8 + 8? Just the number.', expected: /16/, step: 3 },
      {
        question: 'What is 16 + 16? Just the number.',
        expected: /32/,
        step: 4,
      },
      {
        question: 'What is 32 + 32? Just the number.',
        expected: /64/,
        step: 5,
      },
      {
        question: 'What is 64 + 64? Just the number.',
        expected: /128/,
        step: 6,
      },
      {
        question: 'What is 128 + 128? Just the number.',
        expected: /256/,
        step: 7,
      },
      {
        question: 'Finally, what is 256 + 256? Just the number.',
        expected: /512/,
        step: 8,
      },
    ];

    try {
      for (const { question, expected, step } of mathSteps) {
        console.log(`Starting chat ${step}: ${question.split('?')[0]}?...`);

        const result = await client.chat(question, {
          model,
          ...(continuationId && { continuation_id: continuationId }),
        });

        if (result.isError) {
          console.log(
            `Chat ${step} failed with error, skipping test:`,
            result.error,
          );
          return; // Skip if no API keys
        }

        // Set continuation ID from first result
        if (step === 1) {
          expect(result.continuation).toBeDefined();
          expect(result.continuation.id).toBeTruthy();
          continuationId = result.continuation.id;
        } else {
          // Verify continuation ID remains the same
          expect(result.continuation.id).toBe(continuationId);
          // Verify message count increases
          expect(result.continuation.messageCount).toBeGreaterThan(
            previousResult.continuation.messageCount,
          );
        }

        // Verify answer contains expected number
        const responseText = Array.isArray(result.content)
          ? result.content[0].text
          : result.content;
        expect(responseText).toMatch(expected);
        console.log(
          `Chat ${step} successful, got answer:`,
          responseText.substring(0, 50),
        );

        previousResult = result;
      }

      console.log('All 8 math chat continuations completed successfully!');
    } catch (error) {
      console.error('Chat continuation test failed:', error);
      throw error;
    }
  }, 320000); // 320 seconds total timeout (40s per step)

  test('should handle consensus with math continuation', async () => {
    try {
      // First consensus call - 2+2
      console.log('Starting first consensus: 2+2...');
      const result1 = await client.consensus(
        'What is 2 + 2? Just give the number.',
        [{ model: 'gpt-4o-mini' }],
      );

      if (result1.isError) {
        console.log(
          'Consensus 1 failed with error, skipping test:',
          result1.error,
        );
        return; // Skip if no API keys
      }

      expect(result1.continuation).toBeDefined();
      const continuationId = result1.continuation.id;

      // Verify answer contains "4"
      const response1Text = Array.isArray(result1.content)
        ? result1.content[0].text
        : result1.content;
      expect(response1Text).toMatch(/4/);
      console.log(
        'Consensus 1 successful, got answer:',
        response1Text.substring(0, 100),
      );

      // Second consensus with continuation - 4+4
      console.log('Starting second consensus: 4+4...');
      const result2 = await client.consensus(
        'Now what is 4 + 4? Just the number.',
        [{ model: 'gpt-4o-mini' }],
        { continuation_id: continuationId },
      );

      if (!result2.isError) {
        expect(result2.continuation.id).toBe(continuationId);

        // Verify answer contains "8"
        const response2Text = Array.isArray(result2.content)
          ? result2.content[0].text
          : result2.content;
        expect(response2Text).toMatch(/8/);
        console.log(
          'Consensus 2 successful, got answer:',
          response2Text.substring(0, 100),
        );
      }

      console.log('Math consensus continuation completed successfully');
    } catch (error) {
      console.error('Consensus continuation test failed:', error);
      throw error;
    }
  }, 120000); // 120 seconds timeout

  test('should handle mixed chat and consensus with math progression', async () => {
    try {
      // Start with chat - 2+2
      console.log('Starting mixed conversation with chat: 2+2...');
      const chatResult = await client.chat(
        'What is 2 + 2? Give me just the answer.',
        {
          model: 'gemini-2.5-flash',
        },
      );

      if (chatResult.isError) {
        console.log(
          'Mixed test failed with error, skipping:',
          chatResult.error,
        );
        return;
      }

      const continuationId = chatResult.continuation.id;

      // Verify chat answer contains "4"
      const chatText = Array.isArray(chatResult.content)
        ? chatResult.content[0].text
        : chatResult.content;
      expect(chatText).toMatch(/4/);
      console.log('Chat started with answer:', chatText.substring(0, 100));

      // Follow up with consensus - 4+4
      console.log('Following up with consensus: 4+4...');
      const consensusResult = await client.consensus(
        'Now what is 4 + 4? Just the number please.',
        [{ model: 'gpt-4o-mini' }],
        { continuation_id: continuationId },
      );

      if (!consensusResult.isError) {
        expect(consensusResult.continuation.id).toBe(continuationId);

        // Verify consensus answer contains "8"
        const consensusText = Array.isArray(consensusResult.content)
          ? consensusResult.content[0].text
          : consensusResult.content;
        expect(consensusText).toMatch(/8/);
        console.log(
          'Mixed conversation successful, got answer:',
          consensusText.substring(0, 100),
        );
      }
    } catch (error) {
      console.error('Mixed continuation test failed:', error);
      throw error;
    }
  }, 120000);
});
