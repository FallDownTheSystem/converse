#!/usr/bin/env node

console.log('Starting basic test...');

try {
  console.log('Testing imports...');

  // Test imports one by one
  import('../../src/config.js')
    .then((configModule) => {
      console.log('✓ Config module imported');

      return configModule.loadConfig();
    })
    .then((config) => {
      console.log('✓ Config loaded successfully');
      console.log(`Environment: ${config.environment.nodeEnv}`);
      console.log(
        `Available providers: ${Object.keys(config.providers).join(', ')}`,
      );

      return import('../../src/tools/index.js');
    })
    .then((toolsModule) => {
      console.log('✓ Tools module imported');

      const tools = toolsModule.getTools();
      console.log(`Available tools: ${Object.keys(tools).join(', ')}`);

      return import('../../src/providers/index.js');
    })
    .then((providersModule) => {
      console.log('✓ Providers module imported');

      const providers = providersModule.getProviders();
      console.log(`Available providers: ${Object.keys(providers).join(', ')}`);

      console.log('\n✓ All basic imports and initializations successful');
      console.log('Basic MCP components are working correctly');
      process.exit(0);
    })
    .catch((error) => {
      console.error('✗ Error during basic test:', error.message);
      console.error('Stack:', error.stack);
      process.exit(1);
    });
} catch (error) {
  console.error('✗ Synchronous error:', error.message);
  process.exit(1);
}
