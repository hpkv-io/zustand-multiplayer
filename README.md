<div align="center">
  <img src="assets/images/logo.png" alt="Zustand Multiplayer Logo" width="200" />
  
  <h1>Zustand Multiplayer</h1>
  
  <p>
    <strong>Transform any Zustand store into a real-time synchronized multiplayer experience</strong>
  </p>

  <p>
    <a href="https://github.com/hpkv-io/zustand-multiplayer/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-Ready-blue.svg" alt="TypeScript" /></a>
    <a href="https://github.com/hpkv-io/zustand-multiplayer/actions"><img src="https://github.com/hpkv-io/zustand-multiplayer/actions/workflows/ci.yml/badge.svg" alt="CI Status" /></a>
  </p>

</div>

---

This monorepo contains the **Zustand Multiplayer** middleware and related packages. Zustand Multiplayer enables real-time synchronization of Zustand stores across multiple clients without requiring you to set up WebSocket servers or handle complex synchronization logic.

## 📦 Packages

This monorepo is organized using [pnpm workspaces](https://pnpm.io/workspaces) and [Turborepo](https://turbo.build/repo).

### Core Package

| Package | Version | Description |
|---------|---------|-------------|
| [@hpkv/zustand-multiplayer](packages/zustand-multiplayer) | [![npm](https://img.shields.io/npm/v/@hpkv/zustand-multiplayer.svg)](https://www.npmjs.com/package/@hpkv/zustand-multiplayer) | Real-time multiplayer middleware for Zustand |

### Internal Packages

| Package | Description |
|---------|-------------|
| [@repo/eslint-config](packages/eslint-config) | Shared ESLint configurations |
| [@repo/typescript-config](packages/typescript-config) | Shared TypeScript configurations |

## 📚 Examples

Explore our example applications to see Zustand Multiplayer in action:

| Example | Description | Next.js | React | TypeScript | JavaScript | Vite | Express |
|---------|-------------|---------|-------|------------|------------|------|---------|
| **[Next.js Chat App](examples/nextjs-chat)** | Real-time chat application with message synchronization and user management | ✅ | ✅ | ✅ | | | |
| **[JavaScript Chat App](examples/javascript-chat)** | Framework-free vanilla JavaScript chat with Vite development setup | | | | ✅ | ✅ | ✅ |
| **[Next.js Collaborative Todo](examples/nextjs-collaborative-todo)** | Full-stack todo application with real-time task synchronization | ✅ | ✅ | ✅ | | | |
| **[JavaScript Collaborative Todo](examples/javascript-collaborative-todo)** | Vanilla JavaScript todo app with minimal Express.js backend | | | | ✅ | | ✅ |
| **[Next.js Tic-Tac-Toe Game](examples/nextjs-tic-tac-toe)** | Multiplayer tic-tac-toe game with live scoreboard and turn management | ✅ | ✅ | ✅ | | | |
| **[React Live Cursors](examples/react-live-cursors)** | Real-time collaborative cursor tracking | | ✅ | | ✅ | ✅ | ✅ |
| **[JavaScript Live Cursors](examples/javascript-live-cursors)** | Vanilla JavaScript live cursor tracking with real-time synchronization | | | | ✅ | ✅ | ✅ |


## Support

- **Documentation**: [Full Documentation](packages/zustand-multiplayer#readme)
- **Issues**: [GitHub Issues](https://github.com/hpkv-io/zustand-multiplayer/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hpkv-io/zustand-multiplayer/discussions)
- **Email**: support@hpkv.io
