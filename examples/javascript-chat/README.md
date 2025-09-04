# Vanilla JavaScript Chat App with Zustand Multiplayer
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)
![Zustand](https://img.shields.io/badge/zustand-%23FF6B6B.svg?style=for-the-badge&logo=zustand&logoColor=white)

A real-time chat application built with vanilla JavaScript, Vite, and Zustand Multiplayer middleware, demonstrating how to create collaborative applications with multiplayer state synchronization in pure JavaScript.

![Chat App Screenshot](../../.github/assets/examples/chat.png)

## Prerequisites

You need an API key to run this example:

- Sign up at [HPKV Website](https://hpkv.io/signup)
- Navigate to [Dashboard](https://hpkv.io/dashboard)
- Create an API Key  
- Note down the API Key and API Base Url. Follow the instructions below to set these values in your .env file

## Getting Started

1. **Clone and setup the monorepo:**
   ```bash
   git clone https://github.com/hpkv-io/zustand-multiplayer.git
   cd zustand-multiplayer
   pnpm install
   ```

2. **Environment Setup:**
   Copy the example environment file in this directory:
   ```bash
   cp examples/javascript-chat/.env.example examples/javascript-chat/.env
   ```

   Edit the `.env` file with your HPKV credentials:
   ```env
   HPKV_API_KEY=your_api_key_here
   HPKV_API_BASE_URL=your_api_base_url
   VITE_HPKV_API_BASE_URL=your_api_base_url
   ```

3. **Build the package (required):**
   ```bash
   # From monorepo root - build the zustand-multiplayer package first
   pnpm turbo build --filter=@hpkv/zustand-multiplayer
   ```

4. **Run the example:**
   ```bash
   # From monorepo root
   pnpm --filter javascript-chat dev
   
   # Or use Turbo
   pnpm turbo dev --filter javascript-chat
   ```

5. **Open in multiple browser windows:**
   Navigate to `http://localhost:5173` in different browser windows, enter usernames, and see the chat messages sent across windows in real-time!