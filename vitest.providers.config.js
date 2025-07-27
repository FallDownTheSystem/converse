import { defineConfig } from 'vitest/config';
import { getTestConfig } from './tests/suites.config.js';

const config = getTestConfig('providers');

export default defineConfig({
  test: config.test
});