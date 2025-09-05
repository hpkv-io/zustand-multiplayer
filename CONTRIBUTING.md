# Contributing to Zustand Multiplayer

Thank you for your interest in contributing to Zustand Multiplayer! This document provides guidelines and information for contributors to help you get started.

## 📋 Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Adding Examples](#adding-examples)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)

## 🚀 Getting Started

### Prerequisites

- **Node.js** v20 or higher
- **pnpm** v9.0.0 or higher
- **Git** for version control
- **HPKV API Key** for running examples and tests (get one at [hpkv.io](https://hpkv.io/signup))

### Initial Setup

1. **Fork the repository** on GitHub
2. **Clone your fork locally**:
   ```bash
   git clone https://github.com/your-username/zustand-multiplayer.git
   cd zustand-multiplayer
   ```
3. **Install dependencies**:
   ```bash
   pnpm install
   ```
4. **Build the core package**:
   ```bash
   pnpm turbo build --filter=@hpkv/zustand-multiplayer
   ```

## 🛠️ Development Setup

### Environment Variables

For running examples and tests, you'll need HPKV credentials:

1. Sign up at [HPKV Website](https://hpkv.io/signup)
2. Get your API key from the [Dashboard](https://hpkv.io/dashboard)
3. Set up environment variables in example directories as needed

### Available Commands

```bash
# Build all packages
pnpm turbo build

# Run tests
pnpm turbo test

# Run linting
pnpm turbo lint

# Type checking
pnpm turbo type-check

# Run a specific example
pnpm --filter nextjs-chat dev

# Work on the core package
pnpm --filter @hpkv/zustand-multiplayer dev
```

## 📁 Project Structure

This is a **pnpm monorepo** managed with **Turborepo**:

```
├── packages/                    # Core libraries
│   ├── zustand-multiplayer/    # Main package
│   ├── eslint-config/          # Shared ESLint configs
│   └── typescript-config/      # Shared TypeScript configs
├── examples/                   # Demo applications
│   ├── nextjs-*/              # Next.js examples
│   ├── javascript-*/          # Vanilla JS examples
│   └── react-*/               # React examples
├── .github/workflows/         # CI/CD pipelines
├── .changeset/               # Release management
└── docs/                     # Documentation
```

### Core Package Structure

The main `@hpkv/zustand-multiplayer` package is organized as follows:

```
packages/zustand-multiplayer/src/
├── auth/          # Authentication and token management
├── core/          # Core middleware functionality
├── monitoring/    # Performance and debugging tools
├── storage/       # Persistence layer
├── types/         # TypeScript definitions
├── utils/         # Shared utilities
└── multiplayer.ts # Main export
```

## ⚡ Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Make Your Changes

- Follow the [Code Standards](#code-standards)
- Add tests for new functionality
- Update documentation as needed
- Ensure examples work if you've made breaking changes

### 3. Test Your Changes

```bash
# Run all quality checks
pnpm turbo build
pnpm turbo test
pnpm turbo lint
pnpm turbo type-check

# Test specific examples
pnpm --filter nextjs-chat dev
```

### 4. Commit Your Changes

We use [Changesets](https://github.com/changesets/changesets) for version management:

```bash
# Add a changeset (required for changes that affect users)
pnpm changeset

# Commit your changes
git add .
git commit -m "feat: add new multiplayer feature"
```

## 📜 Code Standards

### TypeScript Guidelines

- **Use strict TypeScript** - no `any` in production code
- **Explicit return types** for all functions
- **Prefer type-only imports** when importing only types
- **Use utility types** (`Partial`, `Pick`, etc.) where appropriate

```typescript
// ✅ Good
export function createStore(config: StoreConfig): Store<StateType> {
  // implementation
}

// ❌ Bad  
export function createStore(config: any) {
  // implementation
}
```

### Code Style


### File Organization

- **Index exports** - use `index.ts` files to create clean public APIs
- **Co-location** - keep related files close together
- **Consistent naming** - use kebab-case for files, camelCase for variables

## 🧪 Testing

### Test Structure

```
tests/
├── unit/         # Isolated unit tests
├── integration/  # End-to-end tests
├── fixtures/     # Test data and mocks
└── setup.ts      # Test configuration
```

### Writing Tests

- **Use Vitest** as the testing framework
- **Cover edge cases** and error conditions
- **Mock external dependencies** (API calls, WebSocket connections)
- **Use descriptive test names**

```typescript
// ✅ Good test structure
describe('multiplayer middleware', () => {
  it('should synchronize state changes across multiple clients', async () => {
    // Test implementation
  })

  it('should handle connection failures gracefully', async () => {
    // Test implementation
  })
})
```

### Running Tests

```bash
# Run all tests
pnpm turbo test

# Run tests for specific package
pnpm --filter @hpkv/zustand-multiplayer test

# Run tests in watch mode
pnpm --filter @hpkv/zustand-multiplayer test --watch
```

## 📚 Adding Examples

Examples are crucial for demonstrating the library's capabilities. When adding a new example:

### 1. Create Example Structure

```bash
mkdir examples/your-example-name
cd examples/your-example-name
```

### 2. Required Files

Every example should have:

- **`package.json`** with proper workspace dependencies
- **`README.md`** with setup instructions
- **`.env.example`** showing required environment variables
- **Source code** demonstrating the feature

### 3. Package.json Template

```json
{
  "name": "your-example-name",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "...",
    "build": "...",
    "lint": "eslint .",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@hpkv/zustand-multiplayer": "workspace:*"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*"
  }
}
```

### 4. README Template

Use other examples as reference, but include:

- **Description** of what the example demonstrates
- **Tech stack badges**
- **Prerequisites** (HPKV API key setup)
- **Getting Started** instructions
- **Features** list
- **Screenshot** if applicable

### 5. Add to Examples README

Update `examples/README.md` with your new example entry.

## 🔄 Submitting Changes

### Pull Request Process

1. **Ensure all checks pass**:
   ```bash
   pnpm turbo build test lint type-check
   ```

2. **Add a changeset** (if your changes affect users):
   ```bash
   pnpm changeset
   ```

3. **Create a Pull Request** with:
   - **Clear title** describing the change
   - **Description** of what was changed and why
   - **Screenshots** for UI changes
   - **Breaking changes** clearly marked

### Pull Request Template

```markdown
## Description
Brief description of the changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Example addition

## Testing
- [ ] Tests pass locally
- [ ] New tests added for new functionality
- [ ] Examples tested manually

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Changeset added (if needed)
```

## 🚢 Release Process

We use **Changesets** for automated version management:

1. **Changesets are added** during development for user-facing changes
2. **Changeset bot** creates version bump PRs automatically
3. **Maintainers merge** the version PR when ready to release
4. **GitHub Action** publishes to npm automatically

### Changeset Types

- **`patch`** - Bug fixes and small improvements
- **`minor`** - New features (backwards compatible)
- **`major`** - Breaking changes

## 💡 Contributing Ideas

We welcome contributions in these areas:

### Core Library
- **Performance optimizations**
- **New middleware features**
- **Better TypeScript types**
- **Enhanced debugging tools**

### Examples
- **New frameworks** (Vue, Svelte, Angular)
- **Mobile examples** (React Native, Ionic)
- **Desktop apps** (Electron, Tauri)
- **Complex use cases** (collaborative editors, games)

### Documentation
- **API documentation**
- **Tutorial content**
- **Video guides**
- **Blog posts**

### Testing
- **End-to-end tests**
- **Performance tests**
- **Browser compatibility tests**

## 🤝 Community Guidelines

- **Be respectful** and inclusive
- **Ask questions** if something is unclear
- **Help others** in discussions and issues
- **Follow the code of conduct**

## 📞 Getting Help

- **GitHub Issues** - For bugs and feature requests
- **GitHub Discussions** - For questions and community chat
- **Email** - support@hpkv.io for direct support

## 📄 License

By contributing to Zustand Multiplayer, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Thank you for contributing to Zustand Multiplayer! 🎉