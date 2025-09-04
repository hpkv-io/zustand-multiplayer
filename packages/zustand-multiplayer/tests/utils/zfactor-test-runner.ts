import type { HPKVApiClient } from '@hpkv/websocket-client';
import { it, expect } from 'vitest';

export const Z_FACTOR_TEST_CASES = [0, 1, 2, 3, 4] as const;

export type ZFactorTestCase = (typeof Z_FACTOR_TEST_CASES)[number];

export interface ZFactorTestOptions {
  testName: string;
  testScenario: (zFactor: number) => Promise<void>;
  zFactors?: readonly ZFactorTestCase[];
}

export function runZFactorTests(options: ZFactorTestOptions): void {
  const { testName, testScenario, zFactors = Z_FACTOR_TEST_CASES } = options;

  zFactors.forEach(zFactor => {
    it(`${testName} for zFactor ${zFactor}`, async () => {
      await testScenario(zFactor);
    });
  });
}

export async function testZFactorPersistenceKeys(
  helperClient: HPKVApiClient,
  namespace: string,
  zFactor: number,
  testSetup: (namespace: string, zFactor: number) => Promise<void>,
  expectations: {
    shouldExist: string[];
    shouldNotExist: string[];
  },
): Promise<boolean> {
  await testSetup(namespace, zFactor);

  for (const key of expectations.shouldExist) {
    const fullKey = `${namespace}-${zFactor}:${key}`;
    await expect(helperClient.get(fullKey)).resolves.toHaveProperty('code', 200);
  }

  for (const key of expectations.shouldNotExist) {
    const fullKey = `${namespace}-${zFactor}:${key}`;
    await expect(helperClient.get(fullKey)).rejects.toThrow('Record not found');
  }

  return true;
}
