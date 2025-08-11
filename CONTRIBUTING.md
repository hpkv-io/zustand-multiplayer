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

- Node.js (v18 or higher)
- npm
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
- Feature branches - Create from `main` for new features or fixes

### Making Changes

1. Create a new branch from `main`:

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
  npm run format:fix
  ```

- Verify all checks pass:
  ```bash
  npm run check
  ```

## Pull Request Process

1. Ensure your code passes all tests, linting, and formatting checks
2. Create a pull request against the `main` branch
3. Fill in the PR template with details about your changes
4. Wait for code review and address any feedback
5. Once approved, your PR will be merged

## Documentation

If you're adding new features or making significant changes, please update the documentation:

1. Update relevant sections in the README.md
2. Provide examples for new features

## Community

- Report bugs or request features by opening issues
- Join discussions in the issue tracker
- Follow the maintainers for updates on the project

Thank you for contributing to Zustand Multiplayer!
