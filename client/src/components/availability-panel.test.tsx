/**
 * @vitest-environment jsdom
 *
 * Stage 2 (scheduling audit S1): the availability panel offers an explicit
 * "I can't make it" response alongside the two available modes.
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AvailabilityPanel from './availability-panel';
import type { Team, UserAvailability } from '@shared/schema';

const team = {
  id: 'team-1',
  name: 'Test Team',
  teamType: 'dnd',
  diceMode: 'polyhedral',
  ownerId: 'user-1',
  recurrenceFrequency: 'weekly',
  dayOfWeek: 4,
  daysOfMonth: null,
  startTime: '19:00',
  timezone: 'America/New_York',
  recurrenceAnchorDate: null,
  minAttendanceThreshold: 2,
  defaultSessionDurationMinutes: 180,
  aiEnabled: false,
  aiEnabledAt: null,
  createdAt: new Date(),
} as Team;

function makeRow(overrides: Partial<UserAvailability> = {}): UserAvailability {
  return {
    id: 'ua-1',
    teamId: 'team-1',
    userId: 'user-1',
    date: new Date('2026-01-15T00:00:00Z'),
    status: 'available',
    startTime: '19:00',
    endTime: '23:00',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as UserAvailability;
}

describe('AvailabilityPanel', () => {
  it('offers regular, custom, and unavailable modes', () => {
    render(
      <AvailabilityPanel
        team={team}
        selectedDate={new Date(2026, 0, 15)}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/Available for regular session time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Specify a custom time range/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/I can't make it/i)).toBeInTheDocument();
  });

  it('saves an available response with the regular window by default', () => {
    const onSave = vi.fn();
    render(
      <AvailabilityPanel
        team={team}
        selectedDate={new Date(2026, 0, 15)}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith({
      status: 'available',
      startTime: '19:00',
      endTime: '23:00', // regular start + 4h default window
    });
  });

  it('saves an unavailable response with no times', () => {
    const onSave = vi.fn();
    render(
      <AvailabilityPanel
        team={team}
        selectedDate={new Date(2026, 0, 15)}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText(/I can't make it/i));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith({ status: 'unavailable' });
  });

  it('opens in unavailable mode for an existing unavailable response', () => {
    render(
      <AvailabilityPanel
        team={team}
        selectedDate={new Date(2026, 0, 15)}
        existingAvailability={makeRow({ status: 'unavailable', startTime: null, endTime: null })}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/I can't make it/i)).toBeChecked();
    // Existing response → Update label + Delete affordance
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
  });
});
