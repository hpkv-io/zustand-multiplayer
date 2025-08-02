import type { Logger } from '../monitoring/logger';
import { LogLevel, createLogger } from '../monitoring/logger';
import { PerformanceMonitor } from '../monitoring/profiler';
import { ClientManager } from '../storage/client-manager';
import type { HPKVStorage } from '../storage/hpkv-storage';
import { StorageKeyManager } from '../storage/storage-key-manager';
import { ConflictResolver } from '../sync/conflict-resolver';
import { StateHydrator } from '../sync/state-hydrator';
import { SyncQueueManager } from '../sync/sync-queue-manager';
import type { MultiplayerOptions } from '../types/multiplayer-types';

/**
 * Base interface for services that support lifecycle management
 */
export interface ServiceLifecycle {
  cleanup?(): void;
  destroy?(): void | Promise<void>;
  reset?(): void;
}

/**
 * Service dependencies for the MultiplayerOrchestrator
 */
export interface OrchestratorServices<TState> {
  logger: Logger;
  performanceMonitor: PerformanceMonitor;
  clientManager: ClientManager & ServiceLifecycle;
  conflictResolver: ConflictResolver<TState>;
  stateHydrator: StateHydrator<TState> & { resetHydrationStatus(): void };
  syncQueueManager: SyncQueueManager<TState> & { clearPendingChanges(): void };
  keyManager: StorageKeyManager & { clearCache(): void };
}

/**
 * Enhanced services container with lifecycle management
 */
export interface ServiceContainer<TState> extends OrchestratorServices<TState> {
  /**
   * Performs cleanup of all services
   */
  cleanup(): void;

  /**
   * Performs reset of all services to initial state
   */
  reset(): void;

  /**
   * Gets list of all managed services
   */
  getAllServices(): Array<unknown>;
}

/**
 * Enhanced service container implementation with lifecycle management
 */
class ServiceContainerImpl<TState> implements ServiceContainer<TState> {
  constructor(
    public readonly logger: Logger,
    public readonly performanceMonitor: PerformanceMonitor,
    public readonly clientManager: ClientManager & ServiceLifecycle,
    public readonly conflictResolver: ConflictResolver<TState>,
    public readonly stateHydrator: StateHydrator<TState> & { resetHydrationStatus(): void },
    public readonly syncQueueManager: SyncQueueManager<TState> & { clearPendingChanges(): void },
    public readonly keyManager: StorageKeyManager & { clearCache(): void },
  ) {}

  /**
   * Performs cleanup of all services that support it
   */
  cleanup(): void {
    // Clean up services that have cleanup methods
    this.clientManager.cleanup?.();
    this.keyManager.clearCache?.();
    this.performanceMonitor.cleanup?.();
  }

  /**
   * Performs reset of all services to initial state
   */
  reset(): void {
    this.stateHydrator.resetHydrationStatus();
    this.syncQueueManager.clearPendingChanges();
    this.keyManager.clearCache();
  }

  /**
   * Gets list of all managed services for debugging/monitoring
   */
  getAllServices(): Array<unknown> {
    return [
      this.logger,
      this.performanceMonitor,
      this.clientManager,
      this.conflictResolver,
      this.stateHydrator,
      this.syncQueueManager,
      this.keyManager,
    ];
  }
}

/**
 * Factory for creating orchestrator services with proper dependency injection
 */
export class ServiceFactory {
  /**
   * Creates all services required by the MultiplayerOrchestrator
   */
  static createOrchestratorServices<TState>(
    client: HPKVStorage,
    options: MultiplayerOptions<TState>,
  ): ServiceContainer<TState> {
    // Create core services
    const logger = createLogger(options.logLevel ?? LogLevel.INFO);
    const performanceMonitor = new PerformanceMonitor(options.profiling ?? false);
    const keyManager = new StorageKeyManager(options.namespace, options.zFactor);

    // Create dependent services
    const clientManager = new ClientManager(client, logger);
    const conflictResolver = new ConflictResolver<TState>(logger);
    const stateHydrator = new StateHydrator<TState>(client, logger, performanceMonitor, keyManager);
    const syncQueueManager = new SyncQueueManager<TState>(logger);

    return new ServiceContainerImpl(
      logger,
      performanceMonitor,
      clientManager,
      conflictResolver,
      stateHydrator,
      syncQueueManager,
      keyManager,
    );
  }

  /**
   * Creates a minimal service container for testing or lightweight usage
   */
  static createMinimalServices<TState>(
    client: HPKVStorage,
    options: Partial<MultiplayerOptions<TState>> & { namespace: string },
  ): ServiceContainer<TState> {
    const logger = createLogger(LogLevel.WARN); // Minimal logging
    const performanceMonitor = new PerformanceMonitor(false); // No profiling
    const keyManager = new StorageKeyManager(options.namespace, options.zFactor);

    const clientManager = new ClientManager(client, logger);
    const conflictResolver = new ConflictResolver<TState>(logger);
    const stateHydrator = new StateHydrator<TState>(client, logger, performanceMonitor, keyManager);
    const syncQueueManager = new SyncQueueManager<TState>(logger);

    return new ServiceContainerImpl(
      logger,
      performanceMonitor,
      clientManager,
      conflictResolver,
      stateHydrator,
      syncQueueManager,
      keyManager,
    );
  }
}
