import { render, waitFor, RenderResult } from '@testing-library/react';
import React from 'react';

/**
 * Renders UI components and waits for any pending async updates to complete
 * to prevent React act() warnings. Useful for components that have
 * asynchronous state updates that don't originate from user interactions.
 *
 * @param ui The React element to render
 * @param timeout Optional timeout for waiting (defaults to 1000ms)
 * @returns The render result from react-testing-library
 */
export async function renderWithAsyncUpdates(
  ui: React.ReactElement,
  timeout = 1000,
): Promise<RenderResult> {
  const renderResult = render(ui);

  // Wait for all pending updates to complete
  await waitFor(
    () => {
      // Empty callback just waits for pending updates
    },
    { timeout },
  );

  return renderResult;
}
