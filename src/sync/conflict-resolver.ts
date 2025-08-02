import type { Logger } from '../monitoring/logger';
import { generateId, getCurrentTimestamp } from '../utils';

export interface StateChange<TState> {
  partial: TState | Partial<TState> | ((state: TState) => TState | Partial<TState>);
  replace?: boolean;
  timestamp: number;
  id: string;
}

export interface ConflictInfo<TState> {
  field: keyof TState;
  localValue: unknown;
  remoteValue: unknown;
  pendingValue: unknown;
}

export interface ConflictResolution<TState> {
  strategy: ConflictStrategy;
  mergedValues?: Partial<TState>;
}

export type ConflictStrategy = 'keep-remote' | 'keep-local' | 'merge';

export class ConflictResolutionError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ConflictResolutionError';
  }
}

export class ConflictResolver<TState> {
  constructor(private readonly logger: Logger) {}

  detectConflicts(
    staleState: TState,
    currentRemoteState: TState,
    pendingChanges: StateChange<TState>[],
  ): ConflictInfo<TState>[] {
    const conflicts: ConflictInfo<TState>[] = [];

    const remoteStateMap = new Map(Object.entries(currentRemoteState as Record<string, unknown>));
    const staleStateMap = new Map(Object.entries(staleState as Record<string, unknown>));

    for (const change of pendingChanges) {
      const pendingUpdate = this.resolvePartialUpdate(change.partial, staleState);

      for (const [field, pendingValue] of Object.entries(pendingUpdate)) {
        const fieldKey = field as keyof TState;
        const staleValue = staleStateMap.get(String(fieldKey));
        const currentRemoteValue = remoteStateMap.get(String(fieldKey));

        if (staleValue !== currentRemoteValue && pendingValue !== currentRemoteValue) {
          this.logger.debug('State conflict detected', {
            operation: 'conflict-detection',
            field: String(fieldKey),
            localValueType: typeof staleValue,
            remoteValueType: typeof currentRemoteValue,
            pendingValueType: typeof pendingValue,
          });

          conflicts.push({
            field: fieldKey,
            localValue: staleValue,
            remoteValue: currentRemoteValue,
            pendingValue,
          });
        }
      }
    }
    return conflicts;
  }

  resolveConflicts(
    conflicts: ConflictInfo<TState>[],
    pendingChanges: StateChange<TState>[],
    onConflict?: (conflicts: ConflictInfo<TState>[]) => ConflictResolution<TState>,
  ): StateChange<TState>[] {
    if (conflicts.length === 0) {
      return pendingChanges;
    }

    try {
      if (onConflict) {
        const resolution = onConflict(conflicts);
        return this.applyResolutionStrategy(resolution, conflicts, pendingChanges);
      }

      this.logger.warn(
        `No conflict resolver provided, keeping remote values for ${conflicts.length} conflicts`,
        { operation: 'conflict-resolution' },
      );

      return this.filterConflictingChanges(conflicts, pendingChanges);
    } catch (error) {
      this.logger.error(
        'Error during conflict resolution',
        error instanceof Error ? error : new Error(String(error)),
        { operation: 'conflict-resolution' },
      );

      throw new ConflictResolutionError('Failed to resolve conflicts', {
        conflictCount: conflicts.length,
      });
    }
  }

  private resolvePartialUpdate(
    partial: TState | Partial<TState> | ((state: TState) => TState | Partial<TState>),
    state: TState,
  ): Partial<TState> {
    return typeof partial === 'function'
      ? (partial as (state: TState) => TState | Partial<TState>)(state)
      : partial;
  }

  private applyResolutionStrategy(
    resolution: ConflictResolution<TState>,
    conflicts: ConflictInfo<TState>[],
    pendingChanges: StateChange<TState>[],
  ): StateChange<TState>[] {
    switch (resolution.strategy) {
      case 'keep-remote':
        return this.filterConflictingChanges(conflicts, pendingChanges);

      case 'keep-local':
        return pendingChanges;

      case 'merge':
        if (resolution.mergedValues) {
          return [
            {
              partial: resolution.mergedValues,
              replace: false,
              timestamp: getCurrentTimestamp(),
              id: generateId(),
            },
          ];
        }
        this.logger.warn(
          'Merge strategy chosen but no mergedValues provided. Defaulting to keep-remote.',
          { operation: 'conflict-resolution' },
        );
        return this.filterConflictingChanges(conflicts, pendingChanges);
      default:
        this.logger.warn(
          'Invalid conflict resolution strategy provided. Defaulting to keep-remote.',
          {
            operation: 'conflict-resolution',
          },
        );
        return this.filterConflictingChanges(conflicts, pendingChanges);
    }
  }

  private filterConflictingChanges(
    conflicts: ConflictInfo<TState>[],
    pendingChanges: StateChange<TState>[],
  ): StateChange<TState>[] {
    const conflictFields = new Set(conflicts.map(c => c.field));

    return pendingChanges
      .map(change => ({
        ...change,
        partial: this.filterPartialByFields(change.partial, conflictFields),
      }))
      .filter(change => this.hasValidPartial(change.partial));
  }

  private filterPartialByFields(
    partial: TState | Partial<TState> | ((state: TState) => TState | Partial<TState>),
    conflictFields: Set<keyof TState>,
  ): TState | Partial<TState> | ((state: TState) => TState | Partial<TState>) {
    if (typeof partial === 'function') {
      return partial;
    }

    return Object.fromEntries(
      Object.entries(partial as Record<string, unknown>).filter(
        ([field]) => !conflictFields.has(field as keyof TState),
      ),
    ) as Partial<TState>;
  }

  private hasValidPartial(
    partial: TState | Partial<TState> | ((state: TState) => TState | Partial<TState>),
  ): boolean {
    if (typeof partial === 'function') {
      return true;
    }
    return Object.keys(partial as Record<string, unknown>).length > 0;
  }
}
