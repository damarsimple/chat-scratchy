# Agent Guidelines

## Project Overview

Chat Scratchy is a ChatGPT-like UI for interacting with OpenAI-compatible endpoints. It features streaming responses, thinking display, and session management.

## Tech Stack

- Frontend: React + TypeScript + Vite (strict mode)
- Backend: Express.js (port 3001)
- Styling: Plain CSS with CSS variables

## Key Files

- `src/App.tsx` - Main React component with all UI logic
- `src/index.css` - All styles
- `server/server.js` - Express backend for session storage
- `.env` - Environment variables (API endpoint, base URL, default model)

## Important Patterns

### API Response Format
The backend uses Qwen-style streaming with `reasoning_content` field for thinking:
```json
{"choices":[{"delta":{"reasoning_content":"...","content":"..."}}]}
```

### Environment Variables
- `VITE_API_ENDPOINT` - OpenAI-compatible endpoint
- `VITE_API_BASE` - Backend API base URL
- `VITE_DEFAULT_MODEL` - Default model name

### Strict TypeScript
The project uses strict mode with:
- `noUncheckedIndexedAccess: true`
- `noImplicitReturns: true`
- `exactOptionalPropertyTypes: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`

Always run `npm run build` before marking a task complete.

## Commands

- `npm run dev` - Start frontend dev server
- `npm run build` - Build for production
- `cd server && npm run dev` - Start backend server