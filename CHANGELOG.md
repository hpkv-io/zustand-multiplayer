# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Future additions will be listed here

### Changed

- Future changes will be listed here

### Fixed

- Future fixes will be listed here

## [0.4.0]

### Added

- Granular storage support

## [0.3.2] - 2025-06-09

### Changed

- Remove redundant retry for setting item

## [0.3.1] - 2025-06-09

### Fixed

- Upgraded the websocket-client package to fix compatibility issues with CF workers

## [0.3.0] - 2025-06-07

### Added

- **Conflict Resolution**: Automatic handling of simultaneous edits with configurable resolution strategies
- **Performance Monitoring**: Built-in metrics to track synchronization performance and connection health
- **Enhanced Logging**: Configurable log levels for better debugging and monitoring
- **Selective Synchronization**: Choose which parts of your state to sync across clients
- **Connection Status Tracking**: Real-time connection state monitoring with automatic reconnection

### Changed

- **Improved Stability**: Better handling of network interruptions and offline scenarios
- **Enhanced Documentation**: Complete API reference and technical design documentation
- **Updated Examples**: Refreshed starter applications with improved user experience
- **Better TypeScript Support**: Enhanced type definitions for improved developer experience

### Fixed

- **State Synchronization**: Resolved issues with rapid state changes and data consistency
- **Connection Reliability**: Improved reconnection logic and error recovery
- **Memory Management**: Better cleanup of resources and event listeners
- **Edge Case Handling**: Fixed issues with special data types and nested object updates

## [0.2.0-alpha] - 2025-05-11

### Changed

- API Changes

### Added

- Subscription and Publish Management Options

## [0.1.3-alpha] - 2025-04-21

### Changed

- Upgraded dependencies

## [0.1.2-alpha] - 2025-04-21

### Added

- New token API interface types: `TokenRequest` and `TokenResponse`
- Comprehensive token API documentation in `/docs/TOKEN_API.md`
- Framework-specific token handler methods for Express, Next.js, and Fastify
- Generic `processTokenRequest` method for custom framework implementations

### Changed

- Enhanced `TokenHelper` class with improved error handling and request validation

## [0.1.1-alpha] - 2025-04-21

### Changed

- Improved retry management

## [0.1.0-alpha.9] - 2025-04-19

### Added

- Initial release of zustand-multiplayer middleware
- Real-time state synchronization between multiple clients
- Persistent state storage using HPKV WebSocket API
- Support for versioning and migrations
- Connection status management with automatic reconnection
- Throttling to optimize network traffic
- TypeScript support with full type definitions
- Custom merge strategies for combining remote and local state
- Partial state persistence with the partialize option
- TokenHelper class for server-side token generation

[Unreleased]: https://github.com/hpkv-io/zustand-multiplayer/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/hpkv-io/zustand-multiplayer/compare/v0.3.2...v0.4.0
[0.3.1]: https://github.com/hpkv-io/zustand-multiplayer/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/hpkv-io/zustand-multiplayer/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/hpkv-io/zustand-multiplayer/compare/v0.2.0-alpha...v0.3.0
[0.2.0-alpha]: https://github.com/hpkv-io/zustand-multiplayer/compare/v0.1.3-alpha...v0.2.0-alpha
[0.1.3-alpha]: https://github.com/hpkv-io/zustand-multiplayer/compare/v0.1.2-alpha...v0.1.3-alpha
[0.1.2-alpha]: https://github.com/hpkv-io/zustand-multiplayer/compare/v0.1.1-alpha...v0.1.2-alpha
[0.1.1-alpha]: https://github.com/hpkv-io/zustand-multiplayer/releases/tag/v0.1.1-alpha
[0.1.0-alpha.9]: https://github.com/hpkv-io/zustand-multiplayer/releases/tag/v0.1.0-alpha.9
