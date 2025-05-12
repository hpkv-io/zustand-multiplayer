# Contributing to Zustand Multiplayer

Thank you for your interest in contributing to the Zustand Multiplayer project! This document provides guidelines and instructions to help you contribute effectively.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
- [Development Workflow](#development-workflow)
  - [Branching Strategy](#branching-strategy)
  - [Making Changes](#making-changes)
  - [Testing](#testing)
  - [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

Please be respectful and considerate of others when contributing to this project. Harassment or abusive behavior will not be tolerated.

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm (v7 or higher)
- A [HPKV](https://hpkv.io) account for testing

### Setup

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/hpkv-io/zustand-multiplayer.git
   cd zustand-multiplayer
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy the environment file and configure your environment variables:
   ```bash
   cp .env.example .env
   ```
   Then update the .env file with your HPKV API credentials.

## Development Workflow

### Branching Strategy

- `main` - Latest stable release
- `dev` - Development branch where features are integrated
- Feature branches - Create from `dev` for new features or fixes

### Making Changes

1. Create a new branch from `dev`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

   or

   ```bash
   git checkout -b fix/issue-you-are-fixing
   ```

2. Make your changes with clear, descriptive commits.

3. Push your branch to your fork:
   ```bash
   git push -u origin feature/your-feature-name
   ```

### Testing

Run tests before submitting your changes:

```bash
npm test
```

For development with continuous testing:

```bash
npm run test:watch
```

To view tests in UI mode:

```bash
npm run test:ui
```

### Code Style

We use ESLint and Prettier to maintain code quality:

- Check linting:

  ```bash
  npm run lint
  ```

- Fix linting issues:

  ```bash
  npm run lint:fix
  ```

- Format code:

  ```bash
  npm run format
  ```

- Verify all checks pass:
  ```bash
  npm run check
  ```

## Pull Request Process

1. Ensure your code passes all tests, linting, and formatting checks
2. Create a pull request against the `dev` branch
3. Fill in the PR template with details about your changes
4. Wait for code review and address any feedback
5. Once approved, your PR will be merged

## Release Process

Releases are managed by the maintainers. The process includes:

1. Testing on the `dev` branch
2. Creating a release branch
3. Building and publishing to npm
4. Merging back to `main` with a version tag

## Project Structure

The project is organized as follows:

- `src/` - Source code
  - `index.ts` - Main entry point
  - `multiplayer.ts` - Core multiplayer middleware implementation
  - `token-helper.ts` - Helper for token generation
  - `hpkvStorage.ts` - HPKV Storage
- `tests/` - Test files
- `examples/` - Example applications using the middleware
- `.github/workflows/` - CI/CD configuration

## Documentation

If you're adding new features or making significant changes, please update the documentation:

1. Update relevant sections in the README.md
2. Add JSDoc comments to your code
3. Provide examples for new features

## Community

- Report bugs or request features by opening issues
- Join discussions in the issue tracker
- Follow the maintainers for updates on the project

Thank you for contributing to Zustand Multiplayer!
