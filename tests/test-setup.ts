import { cleanup } from '@testing-library/react';
import * as dotenv from 'dotenv';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom';

// Load environment variables from .env files
dotenv.config();

// Cleanup DOM after each test
afterEach(() => {
  cleanup();
});

// Check for required environment variables and show helpful message
if (!process.env.HPKV_API_KEY) {
  console.warn(
    '\x1b[33m%s\x1b[0m', // Yellow text
    `Warning: HPKV_API_KEY environment variable is not set.
Tests requiring actual HPKV connections will be skipped.
To run all tests, create a .env file with:
HPKV_API_KEY=your-api-key
HPKV_BASE_URL=your-api-url
`,
  );
}
