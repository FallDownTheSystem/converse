/**
 * Integration test for OpenAI reasoning summaries
 */

import { describe, it, expect } from 'vitest';
import { withHTTPTestServer } from '../utils/HTTPMCPServerManager.js';
import { testWithApiKeys } from '../utils/conditionalTest.js';
import { parseStatusResponse } from '../utils/responseParser.js';

describe('OpenAI Reasoning Summaries', () => {
  testWithApiKeys({
    requiredProviders: ['OPENAI'],
    requireAll: true,
  })(
    'should show thinking summaries during reasoning phase',
    async () => {
      await withHTTPTestServer(async (client, manager) => {
        console.log('🧠 Testing OpenAI Reasoning Summaries...');

        // Start async chat with complex reasoning task and max effort
        const asyncResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: `You are tasked with solving this complex logic puzzle that requires deep reasoning:

Three friends Alice, Bob, and Charlie each have a different favorite color (red, blue, green) and a different pet (cat, dog, bird). Using these clues, determine who has which pet and favorite color:

1. The person who likes red has a dog
2. Alice doesn't have a bird
3. The person with the cat likes blue
4. Charlie doesn't like green
5. Bob doesn't have a dog
6. The person who likes green has a bird

Think through this step by step, considering all possibilities and eliminating contradictions systematically. Show your reasoning process clearly.`,
            model: 'gpt-5', // Use reasoning model
            reasoning_effort: 'high', // High reasoning effort
            async: true,
          },
        });

        expect(asyncResult.isError).toBeFalsy();
        expect(asyncResult.continuation?.id).toBeTruthy();
        console.log(`✅ Started async job: ${asyncResult.continuation.id}`);

        let sawThinking = false;
        let sawStatus = false;
        let completed = false;

        // Check status repeatedly to catch both thinking and streaming phases
        for (let i = 0; i < 20 && !completed; i++) {
          await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait 3 seconds between checks

          const statusResult = await client.callTool({
            name: 'check_status',
            arguments: {
              continuation_id: asyncResult.continuation.id,
            },
          });

          expect(statusResult.isError).toBeFalsy();
          const statusText = statusResult.content[0].text;
          const status = parseStatusResponse(statusText);

          console.log(`\n📊 Status Check ${i + 1} (${3 * (i + 1)}s elapsed):`);
          console.log('='.repeat(80));
          console.log(statusText);
          console.log('='.repeat(80));

          // Check for "Thinking:" line (reasoning summaries or fallback)
          if (statusText.includes('Thinking:')) {
            sawThinking = true;
            console.log('🧠 Found Thinking status!');
          }

          // Check for "Status:" line (streaming summaries)
          if (statusText.includes('Status:')) {
            sawStatus = true;
            console.log('📝 Found Status summary!');
          }

          // Stop if completed
          if (status.status === 'completed') {
            completed = true;
            console.log('🎉 Job completed!');
            break;
          }
        }

        // Verify we saw either thinking or status updates
        expect(completed).toBe(true);
        expect(sawThinking || sawStatus).toBe(true);

        if (sawThinking) {
          console.log('✅ Successfully captured reasoning/thinking phase');
        }
        if (sawStatus) {
          console.log('✅ Successfully captured streaming status phase');
        }
      }, 300000); // 5 minute timeout for reasoning models
    },
    300000,
  );
});
