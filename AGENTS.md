# Repository Guidelines

## Project Structure & Module Organization
- `client/src/`: React + Vite frontend (pages, components, hooks, UI).
- `server/`: Express API, route registration, auth, and storage integration.
- `shared/`: Cross-layer TypeScript modules (schema, domain logic, utilities).
- `e2e/`: Playwright end-to-end specs (`*.spec.ts`).
- `server/test/`: Test helpers and in-memory test app wiring.
- `dev/`: Local development assets (Docker compose and setup docs).
- `docs/prd/`: Product requirement docs and implementation tracking.

## Build, Test, and Development Commands
- `npm run dev`: Start the app in development mode on port `5000`.
- `npm run dev:local`: Windows-friendly local dev startup (`cross-env`, no auto-restart).
- `npm run dev:local:watch`: Watch mode startup (requires child-process spawn support).
- `npm run build`: Bundle server and client into `dist/`.
- `npm start`: Run production bundle from `dist/index.cjs`.
- `npm run check`: Type-check with strict TypeScript settings.
- `npm run db:push`: Push Drizzle schema changes to the configured database.
- `npx vitest run`: Run unit/integration tests once.
- `npx vitest run --coverage`: Generate V8 coverage reports.
- `npx playwright test`: Run browser E2E tests in `e2e/`.

## Coding Style & Naming Conventions
- Language: TypeScript (strict mode) with ES modules.
- Match existing style: 2-space indentation, semicolons, double quotes.
- Use path aliases: `@/*` for `client/src/*`, `@shared/*` for shared modules.
- Naming:
  - React components: `PascalCase` (`TeamWizard.tsx` style).
  - Hooks: `use-` prefix in file/function intent (for example `use-auth.ts`).
  - Shared/server modules: kebab-case filenames (`entity-detection.ts`).

## Testing Guidelines
- Frameworks: Vitest (`node` environment) and Playwright.
- Unit tests live beside logic in `shared/` (`*.test.ts`).
- API integration tests are in `server/` (commonly `*.api.test.ts`).
- Use `server/test/` helpers for isolated route/storage tests.
- Cover success, validation, and error paths for new endpoints; run coverage before opening a PR.

## Commit & Pull Request Guidelines
- Follow imperative, descriptive commit subjects (`Add session recurrence validation`).
- Include tracking IDs when relevant (example: `(PRD-043)`).
- Keep commits focused; avoid placeholder messages like "saved progress".
- PRs should include:
  - concise summary and linked issue/PRD
  - test evidence (`npx vitest run`, relevant Playwright output)
  - screenshots/GIFs for UI changes
  - notes for schema or env changes

## Security & Configuration Tips
- Do not commit secrets; keep `.env` local.
- Use `DEV_AUTH_BYPASS=true` only in local development, never in production configs.
