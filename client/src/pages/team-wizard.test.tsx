/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TeamWizard from './team-wizard';

// Mock wouter
vi.mock('wouter', () => ({
  useLocation: () => ['/create', vi.fn()],
}));

// Mock toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock queryClient module
vi.mock('@/lib/queryClient', () => ({
  queryClient: new QueryClient(),
  apiRequest: vi.fn(),
}));

// Mock asset import
vi.mock('@assets/b8bc77e2-60e2-4834-9e6b-e7ea3b744612_1767318501377.png', () => ({
  default: 'mock-logo.png',
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe('TeamWizard - Group Name Enter Key Submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function navigateToNameStep(user: ReturnType<typeof userEvent.setup>) {
    // Step 1: Select group category (tabletop)
    const tabletopButton = screen.getByText('Tabletop Gaming');
    await user.click(tabletopButton);

    // Click Next
    const nextButton = screen.getByTestId('button-next');
    await user.click(nextButton);

    // Step 2: Select game system (D&D)
    const dndButton = screen.getByText('Dungeons & Dragons');
    await user.click(dndButton);

    // Click Next to get to name step
    await user.click(screen.getByTestId('button-next'));
  }

  it('should advance to next step when Enter is pressed with valid input', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamWizard />);

    await navigateToNameStep(user);

    // Should be on the name step
    expect(screen.getByText('Give your group a name')).toBeInTheDocument();

    // Type a group name
    const input = screen.getByTestId('input-team-name');
    await user.type(input, 'The Dragon Slayers');

    // Press Enter
    await user.keyboard('{Enter}');

    // Should advance to schedule step
    expect(screen.getByText('Set your default schedule')).toBeInTheDocument();
  });

  it('should NOT advance when Enter is pressed with empty input', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamWizard />);

    await navigateToNameStep(user);

    // Should be on the name step
    expect(screen.getByText('Give your group a name')).toBeInTheDocument();

    // Focus the input but don't type anything
    const input = screen.getByTestId('input-team-name');
    await user.click(input);

    // Press Enter with empty input
    await user.keyboard('{Enter}');

    // Should still be on the name step (not advanced)
    expect(screen.getByText('Give your group a name')).toBeInTheDocument();
  });

  it('should NOT advance when Enter is pressed with whitespace-only input', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamWizard />);

    await navigateToNameStep(user);

    // Type only whitespace
    const input = screen.getByTestId('input-team-name');
    await user.type(input, '   ');

    // Press Enter
    await user.keyboard('{Enter}');

    // Should still be on the name step
    expect(screen.getByText('Give your group a name')).toBeInTheDocument();
  });

  it('should behave identically to clicking Next button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamWizard />);

    await navigateToNameStep(user);

    // Type a group name
    const input = screen.getByTestId('input-team-name');
    await user.type(input, 'Test Group');

    // Click Next button instead of pressing Enter
    const nextButton = screen.getByTestId('button-next');
    await user.click(nextButton);

    // Should advance to schedule step (same behavior as Enter)
    expect(screen.getByText('Set your default schedule')).toBeInTheDocument();
  });

  it('should not skip multiple steps when Enter is pressed multiple times', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamWizard />);

    await navigateToNameStep(user);

    // Type a group name
    const input = screen.getByTestId('input-team-name');
    await user.type(input, 'Test Group');

    // Press Enter multiple times rapidly
    await user.keyboard('{Enter}');

    // Should be on schedule step (step 4), not beyond
    expect(screen.getByText('Set your default schedule')).toBeInTheDocument();

    // Verify we're not on review step
    expect(screen.queryByText('Review your group')).not.toBeInTheDocument();
  });

  it('should allow keyboard-only navigation through the name step', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamWizard />);

    await navigateToNameStep(user);

    // Tab to focus the input
    await user.tab();

    // Type group name
    await user.keyboard('Keyboard Warriors');

    // Press Enter to submit
    await user.keyboard('{Enter}');

    // Should advance to next step
    expect(screen.getByText('Set your default schedule')).toBeInTheDocument();
  });
});
