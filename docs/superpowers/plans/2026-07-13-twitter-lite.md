# Twitter Lite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a localhost-only TanStack Start reader that loads user timelines and Top/Latest searches through a read-only Bird server boundary.

**Architecture:** First extend the sibling Bird repository with a typed search product option. Then build Twitter Lite as a TanStack Start application whose server functions call Bird, while TanStack Query owns cursor pagination and the browser renders the Mist Instrument interface.

**Tech Stack:** Node.js 22, pnpm 11, Nix, TypeScript, React 19, TanStack Start/Router/Query, Zod 4, Nitro, Vitest, Testing Library, Playwright, Biome, hand-written CSS.

## Global Constraints

- Bind development and production to `127.0.0.1` by default; allow an explicit host override for Tailscale testing.
- Read `TWITTER_RELAY_BASE_URL` only on the server; pass `BIRD_PROFILE_NAME` explicitly to Bird.
- Do not expose a generic relay endpoint or any Bird mutation method.
- Show no posts until a handle, profile URL, or search query is submitted.
- Support only `Top` and `Latest` search products; `Latest` remains Bird's default.
- Keep home, recommendations, trends, notifications, saved history, autocomplete, and all write actions out of scope.
- Load 20 posts per cursor page and continue automatically without a fixed page limit.
- Use Mist Instrument tokens and no remote fonts; respect keyboard focus and `prefers-reduced-motion`.
- Work test-first for every behavior change and run the pre-commit documentation check in both repositories.
- Do not push Bird or publish `@yuta/bird` without separate user authorization.

## File Map

### Bird repository (`../bird`)

- `src/lib/twitter-client-search.ts` — typed Top/Latest contract and GraphQL variable.
- `src/lib/index.ts` — public type exports.
- `src/commands/search.ts` — CLI `--product` option.
- `tests/twitter-client.search-bookmarks.test.ts` — request and pagination behavior.
- `tests/commands.search.test.ts` — CLI forwarding behavior.
- `tests/library-exports.test.ts` — public type availability.
- `README.md` — library and CLI usage.

### Twitter Lite repository

- `flake.nix` / `flake.lock` — Node, pnpm, and Chromium development environment.
- `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` — pinned toolchain and scripts.
- `vite.config.ts` / `tsconfig.json` / `vitest.config.ts` / `playwright.config.ts` / `biome.json` — build and test configuration.
- `src/router.tsx` / `src/routes/*.tsx` — TanStack Router setup and User/Search routes.
- `src/features/posts/inputs.ts` — handle, URL, and raw-query normalization.
- `src/features/posts/types.ts` — application page/result/error contracts.
- `src/features/posts/page.ts` — page flattening and ID deduplication.
- `src/features/posts/post-service.ts` — testable BirdReader adapter.
- `src/features/posts/bird-client.server.ts` — the only runtime import of `@yuta/bird`.
- `src/features/posts/server-functions.ts` — validated TanStack Start RPC boundary.
- `src/features/posts/use-post-feed.ts` — infinite-query configuration.
- `src/features/posts/components/*.tsx` — forms, feed states, post cards, and media.
- `src/styles.css` — Mist Instrument tokens and responsive styling.
- `tests/e2e/*` — deterministic mock relay and browser flow.
- `tests/live/relay.test.ts` — opt-in read-only relay smoke test.
- `README.md` — setup, commands, safety boundary, and feature scope.

---

### Task 1: Extend Bird with Top/Latest search products

**Files:**
- Clone: `../bird` from `https://git.yutakobayashi.com/yuta/bird`
- Modify: `../bird/src/lib/twitter-client-search.ts`
- Modify: `../bird/src/lib/index.ts`
- Modify: `../bird/src/commands/search.ts`
- Modify: `../bird/tests/twitter-client.search-bookmarks.test.ts`
- Modify: `../bird/tests/commands.search.test.ts`
- Modify: `../bird/tests/library-exports.test.ts`
- Modify: `../bird/README.md`
- Modify: `../bird/CHANGELOG.md`

**Interfaces:**
- Produces: `SearchProduct = 'Top' | 'Latest'`.
- Produces: `SearchFetchOptions.product?: SearchProduct`.
- Produces: `TwitterClient.search(query, count, { product })` and `getAllSearchResults(query, { product })`.
- Produces: `bird search <query> --product <Top|Latest>`.

- [ ] **Step 1: Clone Bird and verify the baseline**

Run:

```bash
git clone https://git.yutakobayashi.com/yuta/bird ../bird
cd ../bird
nix develop -c pnpm install --frozen-lockfile
nix develop -c pnpm exec vitest run \
  tests/twitter-client.search-bookmarks.test.ts \
  tests/commands.search.test.ts \
  tests/library-exports.test.ts
```

Expected: the checkout is at or after `0caf2677` and the existing focused tests pass.

- [ ] **Step 2: Add failing library tests**

In `tests/twitter-client.search-bookmarks.test.ts`, extend `retries on 404 and posts search payload` so the parsed request type and assertion are:

```ts
const parsed = JSON.parse(urlVars as string) as {
  rawQuery?: string
  product?: string
}
expect(parsed.rawQuery).toBe('needle')
expect(parsed.product).toBe('Latest')
```

Change `paginates search results using the bottom cursor` to call and assert:

```ts
const result = await client.search('needle', 3, { product: 'Top' })

const firstVars = JSON.parse(
  new URL(mockFetch.mock.calls[0][0] as string).searchParams.get(
    'variables',
  ) as string,
) as { cursor?: string; product?: string }
const secondVars = JSON.parse(
  new URL(mockFetch.mock.calls[1][0] as string).searchParams.get(
    'variables',
  ) as string,
) as { cursor?: string; product?: string }

expect(firstVars.product).toBe('Top')
expect(secondVars.product).toBe('Top')
```

- [ ] **Step 3: Run the library tests and verify RED**

Run:

```bash
nix develop -c pnpm exec vitest run tests/twitter-client.search-bookmarks.test.ts
```

Expected: TypeScript reports that `product` is not part of `SearchFetchOptions`, or the Top assertion receives `Latest`.

- [ ] **Step 4: Implement the minimal library contract**

In `src/lib/twitter-client-search.ts`, replace the search option definitions with:

```ts
export type SearchProduct = 'Top' | 'Latest'

/** Options for search methods */
export interface SearchFetchOptions {
  /** Include raw GraphQL response in `_raw` field */
  includeRaw?: boolean
  /** Search result ranking (default: Latest) */
  product?: SearchProduct
}

/** Options for paged search methods */
export interface SearchPaginationOptions extends SearchFetchOptions {
  maxPages?: number
  /** Starting cursor for pagination (resume from previous fetch) */
  cursor?: string
}
```

In `searchPaged()`, destructure once:

```ts
const { includeRaw = false, maxPages, product = 'Latest' } = options
```

Use the captured value in every request:

```ts
const variables = {
  rawQuery: query,
  count: pageCount,
  querySource: 'typed_query',
  product,
  ...(pageCursor ? { cursor: pageCursor } : {}),
}
```

In `src/lib/index.ts`, export the public types:

```ts
export type {
  SearchFetchOptions,
  SearchPaginationOptions,
  SearchProduct,
} from './twitter-client-search.js'
```

- [ ] **Step 5: Run the library tests and verify GREEN**

Run:

```bash
nix develop -c pnpm exec vitest run tests/twitter-client.search-bookmarks.test.ts
```

Expected: every search/bookmark test passes.

- [ ] **Step 6: Add failing CLI and export tests**

Add to `tests/commands.search.test.ts`:

```ts
it('passes --product to non-paged search', async () => {
  registerSearchCommands(program, mockContext as CliContext)
  const searchSpy = vi
    .spyOn(TwitterClient.prototype, 'search')
    .mockResolvedValue({ success: true, tweets: [] })

  try {
    await program.parseAsync([
      'node',
      'bird',
      'search',
      'cats',
      '--product',
      'Top',
    ])
    expect(searchSpy).toHaveBeenCalledWith('cats', 10, {
      includeRaw: false,
      product: 'Top',
    })
  } finally {
    searchSpy.mockRestore()
  }
})
```

Update the existing paged-search test to pass `--product Top` and require `product: 'Top'` in the expected options.

Add explicit invalid-choice coverage:

```ts
it('rejects unsupported search products', async () => {
  registerSearchCommands(program, mockContext as CliContext)
  program.exitOverride()

  await expect(
    program.parseAsync([
      'node',
      'bird',
      'search',
      'cats',
      '--product',
      'Media',
    ]),
  ).rejects.toMatchObject({ code: 'commander.invalidArgument' })
})
```

In `tests/library-exports.test.ts`, import and exercise the types:

```ts
import {
  type SearchFetchOptions,
  type SearchProduct,
  TwitterClient,
} from '../src/index.js'

it('exposes search product types', () => {
  const product: SearchProduct = 'Top'
  const options: SearchFetchOptions = { product }

  expect(options.product).toBe('Top')
})
```

- [ ] **Step 7: Run the CLI/export tests and verify RED**

Run:

```bash
nix develop -c pnpm exec vitest run \
  tests/commands.search.test.ts \
  tests/library-exports.test.ts
```

Expected: the CLI rejects or ignores `--product` before the command implementation changes.

- [ ] **Step 8: Implement the CLI option**

In `src/commands/search.ts`, use Commander's choice validation:

```ts
import { type Command, Option } from 'commander'
import type { SearchProduct } from '../lib/twitter-client-search.js'
```

Register the option after `--cursor`:

```ts
.addOption(
  new Option('--product <product>', 'Search product')
    .choices(['Top', 'Latest'] satisfies SearchProduct[])
    .default('Latest'),
)
```

Add `product?: SearchProduct` to the search command option type, then construct:

```ts
const includeRaw = cmdOpts.jsonFull ?? false
const product = cmdOpts.product ?? 'Latest'
const searchOptions = { includeRaw, product }
const paginationOptions = {
  includeRaw,
  maxPages,
  cursor: pagination.cursor,
  product,
}
```

Leave `mentions` unchanged so it continues using Bird's Latest default.

- [ ] **Step 9: Update Bird documentation and verify the repository**

Add these concrete examples to `README.md`:

```md
bird search "AI lang:ja" --product Top -n 20
bird search "from:steipete" --product Latest -n 20

const popular = await client.search('AI lang:ja', 20, {
  product: 'Top',
})
```

Document that Latest is the default and add `[--product Top|Latest]` to the command synopsis. Add this new section above the released entries in `CHANGELOG.md`:

```md
## Unreleased

### Added

- Add Top and Latest product selection to library and CLI search.
```

Run:

```bash
nix develop -c pnpm exec vitest run \
  tests/twitter-client.search-bookmarks.test.ts \
  tests/commands.search.test.ts \
  tests/library-exports.test.ts
nix develop -c pnpm run build:dist
nix develop -c pnpm run lint
nix develop -c pnpm test
git diff --check
```

Expected: focused tests, all 416+ non-live tests, build, and lint pass with no diff whitespace errors.

- [ ] **Step 10: Commit Bird**

```bash
git add \
  src/lib/twitter-client-search.ts \
  src/lib/index.ts \
  src/commands/search.ts \
  tests/twitter-client.search-bookmarks.test.ts \
  tests/commands.search.test.ts \
  tests/library-exports.test.ts \
  README.md CHANGELOG.md
git commit -m "feat: support ranked tweet search"
```

### Task 2: Create the reproducible TanStack Start foundation

**Files:**
- Create: `flake.nix`
- Generate: `flake.lock`
- Create: `package.json`
- Generate: `pnpm-lock.yaml`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `biome.json`
- Create: `src/router.tsx`
- Create: `src/routes/__root.tsx`
- Create: `src/routes/index.tsx`
- Create: `src/routes/index.test.tsx`
- Create: `src/styles.css`
- Create: `tests/setup.ts`

**Interfaces:**
- Consumes: local `@yuta/bird` through `link:../bird`.
- Produces: `getRouter()` with an SSR-aware QueryClient.
- Produces: a buildable TanStack Start/Nitro application at `http://127.0.0.1:3000`.

- [ ] **Step 1: Add the Nix development shell**

Create `flake.nix`:

```nix
{
  description = "Intentional X reader";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let pkgs = import nixpkgs { inherit system; };
        in {
          default = pkgs.mkShell {
            packages = with pkgs; [ nodejs_22 pnpm chromium ];
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
            PLAYWRIGHT_CHROMIUM_EXECUTABLE =
              "${pkgs.chromium}/bin/chromium";
          };
        });
    };
}
```

Run `nix flake lock` to generate `flake.lock`.

- [ ] **Step 2: Add pinned package and tool configuration**

Create `package.json`:

```json
{
  "name": "twitter-lite",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.9.0",
  "engines": { "node": ">=22.12.0" },
  "imports": { "#/*": "./src/*" },
  "scripts": {
    "dev": "vite dev --host 127.0.0.1 --port 3000",
    "dev:tailscale": "vite dev --host 0.0.0.0 --port 3000",
    "generate-routes": "tsr generate",
    "build": "vite build",
    "start": "HOST=127.0.0.1 node .output/server/index.mjs",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "format": "biome check --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:live": "TWITTER_LITE_LIVE=1 vitest run tests/live/relay.test.ts"
  },
  "dependencies": {
    "@tanstack/react-query": "5.101.2",
    "@tanstack/react-router": "1.170.17",
    "@tanstack/react-router-ssr-query": "1.167.1",
    "@tanstack/react-start": "1.168.27",
    "@yuta/bird": "link:../bird",
    "nitro": "3.0.260610-beta",
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@biomejs/biome": "2.5.3",
    "@playwright/test": "1.61.1",
    "@tanstack/router-cli": "1.167.18",
    "@testing-library/dom": "10.4.1",
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@types/node": "26.1.1",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.3",
    "jsdom": "29.1.1",
    "typescript": "7.0.2",
    "vite": "8.1.4",
    "vitest": "4.1.10"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  esbuild: true
```

Create `tsconfig.json`:

```json
{
  "include": ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts"],
  "compilerOptions": {
    "target": "ES2022",
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "node"],
    "paths": { "#/*": ["./src/*"] },
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

Create `vite.config.ts`:

```ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { nitro } from 'nitro/vite'

export default defineConfig({
  plugins: [
    nitro(),
    tanstackStart(),
    viteReact(),
  ],
})
```

Create `vitest.config.ts`:

```ts
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '#': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    exclude: ['tests/e2e/**'],
  },
})
```

Create `tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)
```

Create `biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.3/schema.json",
  "files": { "includes": ["**", "!src/routeTree.gen.ts"] },
  "formatter": { "enabled": true, "indentStyle": "space" },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": {
    "formatter": { "quoteStyle": "single", "semicolons": "asNeeded" }
  }
}
```

- [ ] **Step 3: Install dependencies and generate the route tree**

Run:

```bash
nix develop -c pnpm install
nix develop -c pnpm generate-routes
```

Expected: `pnpm-lock.yaml` and `src/routeTree.gen.ts` are generated without ignored-build warnings.

- [ ] **Step 4: Write the failing foundation test**

Create `src/routes/index.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Home } from './index'

describe('Home', () => {
  it('starts without ambient post content', () => {
    render(<Home />)

    expect(screen.getByText('目的を決めてから開く')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })
})
```

Run:

```bash
nix develop -c pnpm test -- src/routes/index.test.tsx
```

Expected: FAIL because `Home` and its intentional-reading copy do not exist.

- [ ] **Step 5: Add the minimal router and root document**

Create `src/router.tsx`:

```tsx
import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
    },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: false,
  })

  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
```

Create `src/routes/__root.tsx`:

```tsx
import type { QueryClient } from '@tanstack/react-query'
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import appCss from '../styles.css?url'

type RouterContext = { queryClient: QueryClient }

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      { title: 'Twitter Lite' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
```

Create `src/routes/index.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

export function Home() {
  return (
    <main className="landing">
      <p className="brand">TWITTER LITE</p>
      <h1>目的を決めてから開く</h1>
      <p>ユーザー名か検索語を入力するまで、投稿は表示しません。</p>
    </main>
  )
}
```

Create `src/styles.css`:

```css
:root {
  color: #1e3238;
  background: #dfe7e9;
  font-family: Inter, "Noto Sans JP", ui-sans-serif, system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
}

button,
input {
  font: inherit;
}

.landing {
  width: min(42rem, calc(100% - 2rem));
  margin: 15vh auto;
  padding: 2rem;
  border: 1px solid #c1cfd2;
  border-radius: 1rem;
  background: #f8faf9;
}

.brand {
  color: #70858a;
  font-size: 0.7rem;
  letter-spacing: 0.2em;
}
```

- [ ] **Step 6: Verify and commit the foundation**

Run:

```bash
nix develop -c pnpm generate-routes
nix develop -c pnpm test -- src/routes/index.test.tsx
nix develop -c pnpm typecheck
nix develop -c pnpm lint
nix develop -c pnpm build
git diff --check
```

Expected: the route test, typecheck, lint, and Nitro build pass.

Commit:

```bash
git add \
  flake.nix flake.lock package.json pnpm-lock.yaml pnpm-workspace.yaml \
  tsconfig.json vite.config.ts vitest.config.ts biome.json \
  src/router.tsx src/routeTree.gen.ts src/routes src/styles.css tests/setup.ts
git commit -m "chore: scaffold twitter lite"
```

### Task 3: Define validated inputs and page merging

**Files:**
- Create: `src/features/posts/types.ts`
- Create: `src/features/posts/inputs.ts`
- Create: `src/features/posts/inputs.test.ts`
- Create: `src/features/posts/page.ts`
- Create: `src/features/posts/page.test.ts`

**Interfaces:**
- Produces: `normalizeUserTarget(value: string): string`.
- Produces: `buildSearchQuery(value: string, following: boolean): string`.
- Produces: `userPageInputSchema` and `searchPageInputSchema`.
- Produces: `flattenPostPages(pages: PostPage[]): Post[]`.

- [ ] **Step 1: Write failing input tests**

Create `src/features/posts/inputs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildSearchQuery, normalizeUserTarget } from './inputs'

describe('normalizeUserTarget', () => {
  it.each([
    ['@tan_stack', 'tan_stack'],
    ['tan_stack', 'tan_stack'],
    ['https://x.com/tan_stack', 'tan_stack'],
    ['https://twitter.com/tan_stack/', 'tan_stack'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeUserTarget(input)).toBe(expected)
  })

  it.each([
    '',
    'not valid',
    'https://example.com/tan_stack',
    'https://x.com/tan_stack/status/1',
  ])('rejects %s', (input) => {
    expect(() => normalizeUserTarget(input)).toThrow()
  })
})

describe('buildSearchQuery', () => {
  it('keeps a deliberate query unchanged', () => {
    expect(buildSearchQuery('  AI lang:ja  ', false)).toBe('AI lang:ja')
  })

  it('adds the follows operator once', () => {
    expect(buildSearchQuery('AI lang:ja', true)).toBe(
      'AI lang:ja filter:follows',
    )
    expect(buildSearchQuery('AI filter:follows', true)).toBe(
      'AI filter:follows',
    )
  })

  it('rejects an empty query', () => {
    expect(() => buildSearchQuery('   ', false)).toThrow()
  })
})
```

- [ ] **Step 2: Run the input tests and verify RED**

Run:

```bash
nix develop -c pnpm test -- src/features/posts/inputs.test.ts
```

Expected: FAIL because `./inputs` does not exist.

- [ ] **Step 3: Implement shared contracts and input validation**

Create `src/features/posts/types.ts`:

```ts
import type { SearchProduct, TweetData } from '@yuta/bird'

export type Post = TweetData

export type PostPage = {
  tweets: Post[]
  nextCursor?: string
}

export type LoadErrorCode =
  | 'invalid-input'
  | 'user-not-found'
  | 'user-unavailable'
  | 'relay-config'
  | 'timeout'
  | 'upstream'

export type LoadError = {
  code: LoadErrorCode
  message: string
  retryable: boolean
}

export type LoadResult =
  | { ok: true; page: PostPage }
  | { ok: false; error: LoadError }

export type UserPageInput = {
  target: string
  cursor?: string
}

export type SearchPageInput = {
  query: string
  product: SearchProduct
  following: boolean
  cursor?: string
}
```

Create `src/features/posts/inputs.ts`:

```ts
import { z } from 'zod'

const HANDLE = /^[A-Za-z0-9_]{1,15}$/
const FOLLOWS = /(?:^|\s)filter:follows(?:\s|$)/i

export class InputError extends Error {}

export const userPageInputSchema = z.object({
  target: z.string().trim().min(1).max(256),
  cursor: z.string().min(1).optional(),
})

export const searchPageInputSchema = z.object({
  query: z.string().trim().min(1).max(512),
  product: z.enum(['Top', 'Latest']),
  following: z.boolean(),
  cursor: z.string().min(1).optional(),
})

export const userRouteSearchSchema = z.object({
  target: z.string().catch(''),
})

export const postSearchRouteSchema = z.object({
  q: z.string().catch(''),
  product: z.enum(['Top', 'Latest']).catch('Latest'),
  following: z.boolean().catch(false),
})

function requireHandle(value: string): string {
  if (!HANDLE.test(value)) {
    throw new InputError('ハンドルは英数字とアンダースコアで入力してください。')
  }
  return value
}

export function normalizeUserTarget(raw: string): string {
  const value = raw.trim()
  if (!value) {
    throw new InputError('ハンドルまたはプロフィール URL を入力してください。')
  }
  if (value.startsWith('@')) {
    return requireHandle(value.slice(1))
  }
  if (!value.includes('://')) {
    return requireHandle(value)
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new InputError('プロフィール URL の形式を確認してください。')
  }
  if (!['x.com', 'twitter.com'].includes(url.hostname.toLowerCase())) {
    throw new InputError('x.com または twitter.com の URL を入力してください。')
  }
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length !== 1) {
    throw new InputError('プロフィール URL を入力してください。')
  }
  return requireHandle(segments[0] ?? '')
}

export function buildSearchQuery(raw: string, following: boolean): string {
  const query = raw.trim()
  if (!query) {
    throw new InputError('検索語を入力してください。')
  }
  if (query.length > 512) {
    throw new InputError('検索語は 512 文字以内で入力してください。')
  }
  return following && !FOLLOWS.test(query)
    ? `${query} filter:follows`
    : query
}
```

- [ ] **Step 4: Run the input tests and verify GREEN**

Run:

```bash
nix develop -c pnpm test -- src/features/posts/inputs.test.ts
```

Expected: all normalization and query-building tests pass.

- [ ] **Step 5: Write failing page-merging tests**

Create `src/features/posts/page.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { flattenPostPages } from './page'
import type { Post, PostPage } from './types'

const post = (id: string): Post => ({
  id,
  text: `post-${id}`,
  author: { username: `user-${id}`, name: `User ${id}` },
})

describe('flattenPostPages', () => {
  it('preserves API order and removes duplicate IDs', () => {
    const pages: PostPage[] = [
      { tweets: [post('1'), post('2')], nextCursor: 'next' },
      { tweets: [post('2'), post('3')] },
    ]

    expect(flattenPostPages(pages).map(({ id }) => id)).toEqual([
      '1',
      '2',
      '3',
    ])
  })
})
```

Run:

```bash
nix develop -c pnpm test -- src/features/posts/page.test.ts
```

Expected: FAIL because `flattenPostPages` does not exist.

- [ ] **Step 6: Implement page merging and verify**

Create `src/features/posts/page.ts`:

```ts
import type { Post, PostPage } from './types'

export function flattenPostPages(pages: PostPage[]): Post[] {
  const seen = new Set<string>()
  return pages.flatMap(({ tweets }) =>
    tweets.filter(({ id }) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    }),
  )
}
```

Run:

```bash
nix develop -c pnpm test -- \
  src/features/posts/inputs.test.ts \
  src/features/posts/page.test.ts
nix develop -c pnpm typecheck
```

Expected: both suites and typecheck pass.

- [ ] **Step 7: Commit the domain layer**

```bash
git add src/features/posts
git commit -m "feat: validate intentional post requests"
```

### Task 4: Add the read-only Bird server boundary

**Files:**
- Create: `src/features/posts/post-service.ts`
- Create: `src/features/posts/post-service.test.ts`
- Create: `src/features/posts/bird-client.server.ts`
- Create: `src/features/posts/server-functions.ts`

**Interfaces:**
- Consumes: `normalizeUserTarget`, `buildSearchQuery`, and Bird's read methods.
- Produces: `loadUserPage(reader, input): Promise<LoadResult>`.
- Produces: `searchPage(reader, input): Promise<LoadResult>`.
- Produces: TanStack Start server functions `loadUserPosts` and `searchPosts`.

- [ ] **Step 1: Write failing service tests**

Create `src/features/posts/post-service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { loadUserPage, searchPage, type BirdReader } from './post-service'

const reader = (): BirdReader => ({
  getUserIdByUsername: vi
    .fn()
    .mockResolvedValue({ success: true, userId: '42' }),
  getUserTweetsPaged: vi.fn().mockResolvedValue({
    success: true,
    tweets: [
      { id: '1', text: 'hello', author: { username: 'yuta', name: 'Yuta' } },
    ],
    nextCursor: 'user-next',
  }),
  getAllSearchResults: vi.fn().mockResolvedValue({
    success: true,
    tweets: [],
    nextCursor: 'search-next',
  }),
})

describe('loadUserPage', () => {
  it('resolves a handle and fetches exactly one page', async () => {
    const client = reader()
    const result = await loadUserPage(client, {
      target: 'https://x.com/yuta',
      cursor: 'cursor-1',
    })

    expect(client.getUserIdByUsername).toHaveBeenCalledWith('yuta')
    expect(client.getUserTweetsPaged).toHaveBeenCalledWith('42', 20, {
      cursor: 'cursor-1',
      maxPages: 1,
      pageDelayMs: 0,
    })
    expect(result).toMatchObject({
      ok: true,
      page: { nextCursor: 'user-next' },
    })
  })

  it('returns a safe not-found error', async () => {
    const client = reader()
    vi.mocked(client.getUserIdByUsername).mockResolvedValue({
      success: false,
      error: 'User not found: private relay detail',
    })

    expect(await loadUserPage(client, { target: 'missing' })).toEqual({
      ok: false,
      error: {
        code: 'user-not-found',
        message: 'ユーザーが見つかりませんでした。',
        retryable: false,
      },
    })
  })
})

describe('searchPage', () => {
  it('forwards Top and appends follows once', async () => {
    const client = reader()
    await searchPage(client, {
      query: 'AI lang:ja',
      product: 'Top',
      following: true,
      cursor: 'cursor-2',
    })

    expect(client.getAllSearchResults).toHaveBeenCalledWith(
      'AI lang:ja filter:follows',
      { product: 'Top', cursor: 'cursor-2', maxPages: 1 },
    )
  })
})
```

- [ ] **Step 2: Run the service tests and verify RED**

Run:

```bash
nix develop -c pnpm test -- src/features/posts/post-service.test.ts
```

Expected: FAIL because `post-service.ts` does not exist.

- [ ] **Step 3: Implement the testable BirdReader adapter**

Create `src/features/posts/post-service.ts`:

```ts
import type { SearchProduct, SearchResult } from '@yuta/bird'
import { InputError, buildSearchQuery, normalizeUserTarget } from './inputs'
import type {
  LoadError,
  LoadResult,
  SearchPageInput,
  UserPageInput,
} from './types'

type UserLookupResult = {
  success: boolean
  userId?: string
  error?: string
}

export interface BirdReader {
  getUserIdByUsername(username: string): Promise<UserLookupResult>
  getUserTweetsPaged(
    userId: string,
    limit: number,
    options: {
      cursor?: string
      maxPages: number
      pageDelayMs: number
    },
  ): Promise<SearchResult>
  getAllSearchResults(
    query: string,
    options: {
      product: SearchProduct
      cursor?: string
      maxPages: number
    },
  ): Promise<SearchResult>
}

const failure = (
  code: LoadError['code'],
  message: string,
  retryable: boolean,
): LoadResult => ({ ok: false, error: { code, message, retryable } })

function upstreamFailure(message = ''): LoadResult {
  const lower = message.toLowerCase()
  if (lower.includes('timeout') || lower.includes('aborted')) {
    return failure('timeout', '取得がタイムアウトしました。', true)
  }
  if (lower.includes('not found')) {
    return failure('user-not-found', 'ユーザーが見つかりませんでした。', false)
  }
  if (lower.includes('suspended') || lower.includes('protected')) {
    return failure('user-unavailable', 'このユーザーの投稿は取得できません。', false)
  }
  return failure('upstream', 'X から投稿を取得できませんでした。', true)
}

function resultPage(result: SearchResult): LoadResult {
  return result.success
    ? {
        ok: true,
        page: { tweets: result.tweets, nextCursor: result.nextCursor },
      }
    : upstreamFailure(result.error)
}

export async function loadUserPage(
  reader: BirdReader,
  input: UserPageInput,
): Promise<LoadResult> {
  try {
    const handle = normalizeUserTarget(input.target)
    const user = await reader.getUserIdByUsername(handle)
    if (!user.success || !user.userId) {
      return upstreamFailure(user.error)
    }
    return resultPage(
      await reader.getUserTweetsPaged(user.userId, 20, {
        cursor: input.cursor,
        maxPages: 1,
        pageDelayMs: 0,
      }),
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return failure('timeout', '取得がタイムアウトしました。', true)
    }
    if (error instanceof InputError) {
      return failure('invalid-input', error.message, false)
    }
    return upstreamFailure(error instanceof Error ? error.message : '')
  }
}

export async function searchPage(
  reader: BirdReader,
  input: SearchPageInput,
): Promise<LoadResult> {
  try {
    return resultPage(
      await reader.getAllSearchResults(
        buildSearchQuery(input.query, input.following),
        {
          product: input.product,
          cursor: input.cursor,
          maxPages: 1,
        },
      ),
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return failure('timeout', '取得がタイムアウトしました。', true)
    }
    if (error instanceof InputError) {
      return failure('invalid-input', error.message, false)
    }
    return upstreamFailure(error instanceof Error ? error.message : '')
  }
}
```

- [ ] **Step 4: Run the service tests and verify GREEN**

Run:

```bash
nix develop -c pnpm test -- src/features/posts/post-service.test.ts
```

Expected: all service behavior passes without a relay.

- [ ] **Step 5: Add the server-only client and RPCs**

Create `src/features/posts/bird-client.server.ts`:

```ts
import { TwitterClient } from '@yuta/bird'
import type { BirdReader } from './post-service'

let client: TwitterClient | undefined

export function getBirdReader(): BirdReader {
  client ??= new TwitterClient({
    relayBaseUrl: process.env.TWITTER_RELAY_BASE_URL,
    profileName: process.env.BIRD_PROFILE_NAME,
    timeoutMs: 20_000,
  })
  return client
}
```

Create `src/features/posts/server-functions.ts`:

```ts
import { createServerFn } from '@tanstack/react-start'
import { searchPageInputSchema, userPageInputSchema } from './inputs'
import { loadUserPage, searchPage } from './post-service'
import type { LoadResult } from './types'

const configFailure = (): LoadResult => ({
  ok: false,
  error: {
    code: 'relay-config',
    message: 'TWITTER_RELAY_BASE_URL を設定してください。',
    retryable: false,
  },
})

async function reader() {
  const { getBirdReader } = await import('./bird-client.server')
  return getBirdReader()
}

export const loadUserPosts = createServerFn({ method: 'GET' })
  .validator(userPageInputSchema)
  .handler(async ({ data }) => {
    try {
      return await loadUserPage(await reader(), data)
    } catch {
      return configFailure()
    }
  })

export const searchPosts = createServerFn({ method: 'GET' })
  .validator(searchPageInputSchema)
  .handler(async ({ data }) => {
    try {
      return await searchPage(await reader(), data)
    } catch {
      return configFailure()
    }
  })
```

- [ ] **Step 6: Prove Bird stays server-only**

Run:

```bash
nix develop -c pnpm typecheck
nix develop -c pnpm build
rg -n "TWITTER_RELAY_BASE_URL|BIRD_PROFILE_NAME|node:fs" dist/client .output/public 2>/dev/null
```

Expected: typecheck and build pass; `rg` returns no client-bundle match for relay environment names or Node filesystem imports.

- [ ] **Step 7: Commit the server boundary**

```bash
git add src/features/posts
git commit -m "feat: add read-only bird boundary"
```

### Task 5: Add intentional User and Search routes

**Files:**
- Create: `src/components/app-shell.tsx`
- Create: `src/features/posts/components/user-form.tsx`
- Create: `src/features/posts/components/search-form.tsx`
- Create: `src/features/posts/components/forms.test.tsx`
- Create: `src/routes/user.tsx`
- Create: `src/routes/search.tsx`
- Modify: `src/routes/index.tsx`
- Delete: `src/routes/index.test.tsx`

**Interfaces:**
- Consumes: typed route schemas from Task 3.
- Produces: `UserForm({ initialTarget, onSubmit })`.
- Produces: `SearchForm({ initialQuery, initialProduct, initialFollowing, onSubmit })`.
- Produces: typed `/user` and `/search` routes with no automatic post fetch.

- [ ] **Step 1: Write failing form tests**

Create `src/features/posts/components/forms.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SearchForm } from './search-form'
import { UserForm } from './user-form'

describe('UserForm', () => {
  it('submits only after the user enters a target', () => {
    const onSubmit = vi.fn()
    render(<UserForm initialTarget="" onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText('ハンドルまたはプロフィール URL'), {
      target: { value: '@yuta' },
    })
    fireEvent.click(screen.getByRole('button', { name: '表示' }))

    expect(onSubmit).toHaveBeenCalledWith('yuta')
  })

  it('explains invalid input beside the field', () => {
    const onSubmit = vi.fn()
    render(<UserForm initialTarget="" onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('button', { name: '表示' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'ハンドルまたはプロフィール URL を入力してください。',
    )
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('SearchForm', () => {
  it('submits the selected ranking and follows filter', () => {
    const onSubmit = vi.fn()
    render(
      <SearchForm
        initialQuery=""
        initialProduct="Latest"
        initialFollowing={false}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText('検索語'), {
      target: { value: 'AI lang:ja' },
    })
    fireEvent.click(screen.getByLabelText('人気順'))
    fireEvent.click(screen.getByLabelText('フォロー中のみ'))
    fireEvent.click(screen.getByRole('button', { name: '検索' }))

    expect(onSubmit).toHaveBeenCalledWith({
      q: 'AI lang:ja',
      product: 'Top',
      following: true,
    })
  })
})
```

Run:

```bash
nix develop -c pnpm test -- src/features/posts/components/forms.test.tsx
```

Expected: FAIL because both form components are missing.

- [ ] **Step 2: Implement the focused forms**

Create `src/features/posts/components/user-form.tsx`:

```tsx
import { type FormEvent, useState } from 'react'
import { normalizeUserTarget } from '../inputs'

type Props = {
  initialTarget: string
  onSubmit: (target: string) => void
}

export function UserForm({ initialTarget, onSubmit }: Props) {
  const [target, setTarget] = useState(initialTarget)
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    try {
      const handle = normalizeUserTarget(target)
      setError('')
      onSubmit(handle)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : '入力内容を確認してください。',
      )
    }
  }

  return (
    <form className="intent-form" onSubmit={submit}>
      <label className="field">
        <span>ハンドルまたはプロフィール URL</span>
        <input
          autoComplete="off"
          aria-describedby={error ? 'target-error' : undefined}
          aria-invalid={Boolean(error)}
          name="target"
          value={target}
          onChange={(event) => setTarget(event.currentTarget.value)}
          placeholder="@handle または https://x.com/handle"
        />
        {error ? (
          <span className="field-error" id="target-error" role="alert">
            {error}
          </span>
        ) : null}
      </label>
      <button type="submit">表示</button>
    </form>
  )
}
```

Create `src/features/posts/components/search-form.tsx`:

```tsx
import type { SearchProduct } from '@yuta/bird'
import { type FormEvent, useState } from 'react'
import { buildSearchQuery } from '../inputs'

type SearchValues = {
  q: string
  product: SearchProduct
  following: boolean
}

type Props = {
  initialQuery: string
  initialProduct: SearchProduct
  initialFollowing: boolean
  onSubmit: (values: SearchValues) => void
}

export function SearchForm({
  initialQuery,
  initialProduct,
  initialFollowing,
  onSubmit,
}: Props) {
  const [q, setQuery] = useState(initialQuery)
  const [product, setProduct] = useState(initialProduct)
  const [following, setFollowing] = useState(initialFollowing)
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    try {
      const query = buildSearchQuery(q, false)
      setError('')
      onSubmit({ q: query, product, following })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : '入力内容を確認してください。',
      )
    }
  }

  return (
    <form className="intent-form" onSubmit={submit}>
      <label className="field">
        <span>検索語</span>
        <input
          autoComplete="off"
          aria-describedby={error ? 'query-error' : undefined}
          aria-invalid={Boolean(error)}
          name="q"
          value={q}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="検索語や高度な検索演算子"
        />
        {error ? (
          <span className="field-error" id="query-error" role="alert">
            {error}
          </span>
        ) : null}
      </label>
      <fieldset className="segmented">
        <legend>並び順</legend>
        {(['Top', 'Latest'] as const).map((value) => (
          <label key={value}>
            <input
              checked={product === value}
              name="product"
              onChange={() => setProduct(value)}
              type="radio"
              value={value}
            />
            {value === 'Top' ? '人気順' : '最新順'}
          </label>
        ))}
      </fieldset>
      <label className="check">
        <input
          checked={following}
          onChange={(event) => setFollowing(event.currentTarget.checked)}
          type="checkbox"
        />
        フォロー中のみ
      </label>
      <button type="submit">検索</button>
    </form>
  )
}
```

- [ ] **Step 3: Run the form tests and verify GREEN**

Run:

```bash
nix develop -c pnpm test -- src/features/posts/components/forms.test.tsx
```

Expected: both form behaviors pass.

- [ ] **Step 4: Add the shell and typed routes**

Create `src/components/app-shell.tsx`:

```tsx
import { Link } from '@tanstack/react-router'

export function AppShell({
  active,
  children,
}: {
  active: 'user' | 'search'
  children: React.ReactNode
}) {
  return (
    <main className="app">
      <header className="app-header">
        <p className="brand">TWITTER LITE</p>
        <nav aria-label="閲覧方法" className="tabs">
          <Link
            aria-current={active === 'user' ? 'page' : undefined}
            search={{ target: '' }}
            to="/user"
          >
            ユーザー
          </Link>
          <Link
            aria-current={active === 'search' ? 'page' : undefined}
            search={{ q: '', product: 'Latest', following: false }}
            to="/search"
          >
            検索
          </Link>
        </nav>
      </header>
      <section className="reader">{children}</section>
    </main>
  )
}
```

Replace `src/routes/index.tsx` with:

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/user', search: { target: '' } })
  },
})
```

Create `src/routes/user.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { UserForm } from '#/features/posts/components/user-form'
import { userRouteSearchSchema } from '#/features/posts/inputs'

export const Route = createFileRoute('/user')({
  validateSearch: (search) => userRouteSearchSchema.parse(search),
  component: UserRoute,
})

function UserRoute() {
  const { target } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <AppShell active="user">
      <h1>誰の投稿を見ますか？</h1>
      <p className="intro">履歴やおすすめは表示しません。</p>
      <UserForm
        initialTarget={target}
        key={target}
        onSubmit={(nextTarget) =>
          navigate({ search: { target: nextTarget } })
        }
      />
    </AppShell>
  )
}
```

Create `src/routes/search.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { SearchForm } from '#/features/posts/components/search-form'
import { postSearchRouteSchema } from '#/features/posts/inputs'

export const Route = createFileRoute('/search')({
  validateSearch: (search) => postSearchRouteSchema.parse(search),
  component: SearchRoute,
})

function SearchRoute() {
  const values = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <AppShell active="search">
      <h1>何を確認しますか？</h1>
      <p className="intro">入力した条件だけを検索します。</p>
      <SearchForm
        initialFollowing={values.following}
        initialProduct={values.product}
        initialQuery={values.q}
        key={`${values.q}:${values.product}:${values.following}`}
        onSubmit={(search) => navigate({ search })}
      />
    </AppShell>
  )
}
```

Delete `src/routes/index.test.tsx` because redirect behavior is covered by Playwright in Task 9.

- [ ] **Step 5: Generate routes, verify, and commit**

Run:

```bash
nix develop -c pnpm generate-routes
nix develop -c pnpm test -- src/features/posts/components/forms.test.tsx
nix develop -c pnpm typecheck
```

Expected: tests and typecheck pass; route generation includes `/user` and `/search`.

Commit:

```bash
git add src/components src/features/posts/components src/routes src/routeTree.gen.ts
git commit -m "feat: add intentional reader routes"
```

### Task 6: Render rich read-only post cards

**Files:**
- Create: `src/features/posts/components/post-card.tsx`
- Create: `src/features/posts/components/post-media.tsx`
- Create: `src/features/posts/components/post-card.test.tsx`

**Interfaces:**
- Consumes: `Post` from Task 3.
- Produces: `PostCard({ post, quoted? })` with text, media, quote, article, counts, and an explicit original link.

- [ ] **Step 1: Write failing post-card tests**

Create `src/features/posts/components/post-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PostCard } from './post-card'
import type { Post } from '../types'

const richPost: Post = {
  id: '123',
  text: '詳細 https://example.com/article',
  author: {
    username: 'yuta',
    name: 'Yuta',
    profileImageUrl: 'https://pbs.twimg.com/avatar.jpg',
  },
  createdAt: '2026-07-13T00:00:00.000Z',
  replyCount: 3,
  retweetCount: 4,
  likeCount: 5,
  media: [
    {
      type: 'photo',
      url: 'https://pbs.twimg.com/photo.jpg',
      width: 1200,
      height: 800,
    },
  ],
  article: { title: 'Article title', previewText: 'Preview' },
  quotedTweet: {
    id: '122',
    text: 'quoted',
    author: { username: 'other', name: 'Other' },
  },
}

describe('PostCard', () => {
  it('renders rich content without mutation controls', () => {
    render(<PostCard post={richPost} />)

    expect(screen.getByText('Yuta')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '投稿画像' })).toBeInTheDocument()
    expect(screen.getByText('Article title')).toBeInTheDocument()
    expect(screen.getByText('quoted')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /いいね/ })).not.toBeInTheDocument()
  })

  it('uses deliberate safe external links', () => {
    render(<PostCard post={richPost} />)

    expect(screen.getByRole('link', { name: '元の投稿を開く' })).toHaveAttribute(
      'href',
      'https://x.com/yuta/status/123',
    )
    expect(screen.getByRole('link', { name: '元の投稿を開く' })).toHaveAttribute(
      'rel',
      'noreferrer noopener',
    )
  })
})
```

Run:

```bash
nix develop -c pnpm test -- src/features/posts/components/post-card.test.tsx
```

Expected: FAIL because `PostCard` does not exist.

- [ ] **Step 2: Implement media rendering**

Create `src/features/posts/components/post-media.tsx`:

```tsx
import type { Post } from '../types'

type Media = NonNullable<Post['media']>[number]

export function PostMedia({ media }: { media: Media[] }) {
  if (media.length === 0) return null
  return (
    <div className="media-grid">
      {media.map((item) =>
        item.type === 'photo' ? (
          <img
            alt="投稿画像"
            className="media"
            height={item.height}
            key={item.url}
            loading="lazy"
            src={item.url}
            width={item.width}
          />
        ) : (
          <video
            className="media"
            controls
            key={item.videoUrl ?? item.url}
            loop={item.type === 'animated_gif'}
            poster={item.previewUrl ?? item.url}
            preload="metadata"
            src={item.videoUrl ?? item.url}
          />
        ),
      )}
    </div>
  )
}
```

- [ ] **Step 3: Implement the post card**

Create `src/features/posts/components/post-card.tsx`:

```tsx
import type { ReactNode } from 'react'
import type { Post } from '../types'
import { PostMedia } from './post-media'

const URL = /(https?:\/\/[^\s]+)/g

function linkedText(text: string): ReactNode[] {
  return text.split(URL).map((part, index) =>
    part.startsWith('http://') || part.startsWith('https://') ? (
      <a href={part} key={`link-${index}`} rel="noreferrer noopener" target="_blank">
        {part}
      </a>
    ) : (
      part
    ),
  )
}

export function PostCard({
  post,
  quoted = false,
}: {
  post: Post
  quoted?: boolean
}) {
  const original = `https://x.com/${post.author.username}/status/${post.id}`
  return (
    <article className={quoted ? 'post quote' : 'post'}>
      <header className="post-header">
        {post.author.profileImageUrl ? (
          <img
            alt=""
            className="avatar"
            height="40"
            loading="lazy"
            src={post.author.profileImageUrl}
            width="40"
          />
        ) : null}
        <div>
          <strong>{post.author.name}</strong>
          <span className="handle">@{post.author.username}</span>
        </div>
        {post.createdAt ? (
          <time dateTime={post.createdAt}>
            {new Intl.DateTimeFormat('ja-JP', {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'Asia/Tokyo',
            }).format(new Date(post.createdAt))}
          </time>
        ) : null}
      </header>
      <p className="post-text">{linkedText(post.text)}</p>
      {post.media ? <PostMedia media={post.media} /> : null}
      {post.article ? (
        <section className="article-card">
          <strong>{post.article.title}</strong>
          {post.article.previewText ? <p>{post.article.previewText}</p> : null}
        </section>
      ) : null}
      {post.quotedTweet && !quoted ? (
        <PostCard post={post.quotedTweet} quoted />
      ) : null}
      {!quoted ? (
        <footer className="post-footer">
          <span className="counts">
            返信 {post.replyCount ?? 0}　再投稿 {post.retweetCount ?? 0}　いいね{' '}
            {post.likeCount ?? 0}
          </span>
          <a href={original} rel="noreferrer noopener" target="_blank">
            元の投稿を開く
          </a>
        </footer>
      ) : null}
    </article>
  )
}
```

- [ ] **Step 4: Verify and commit post rendering**

Run:

```bash
nix develop -c pnpm test -- src/features/posts/components/post-card.test.tsx
nix develop -c pnpm typecheck
```

Expected: rich-content and safe-link tests pass.

Commit:

```bash
git add src/features/posts/components
git commit -m "feat: render rich read-only posts"
```

### Task 7: Add infinite cursor loading and feed states

**Files:**
- Create: `src/features/posts/use-post-feed.ts`
- Create: `src/features/posts/use-post-feed.test.ts`
- Create: `src/features/posts/components/post-feed.tsx`
- Create: `src/features/posts/components/post-feed.test.tsx`
- Modify: `src/routes/user.tsx`
- Modify: `src/routes/search.tsx`

**Interfaces:**
- Consumes: `loadUserPosts`, `searchPosts`, `PostPage`, and `flattenPostPages`.
- Produces: `FeedRequest` and `usePostFeed(request)`.
- Produces: `PostFeed({ request })` with loading, empty, error, retry, auto-page, and end states.

- [ ] **Step 1: Write failing query-option tests**

Create `src/features/posts/use-post-feed.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createPostFeedOptions } from './use-post-feed'

describe('createPostFeedOptions', () => {
  it('loads the next user cursor and does not retry automatically', async () => {
    const loadUser = vi.fn().mockResolvedValue({
      ok: true,
      page: { tweets: [], nextCursor: 'next' },
    })
    const options = createPostFeedOptions(
      { kind: 'user', target: '@yuta' },
      { loadUser, search: vi.fn() },
    )

    const page = await options.queryFn({
      pageParam: 'cursor',
    } as never)
    expect(loadUser).toHaveBeenCalledWith({
      data: { target: '@yuta', cursor: 'cursor' },
    })
    expect(options.getNextPageParam(page)).toBe('next')
    expect(options.retry).toBe(false)
  })

  it('includes every search control in the query key', () => {
    const options = createPostFeedOptions(
      {
        kind: 'search',
        query: 'AI',
        product: 'Top',
        following: true,
      },
      { loadUser: vi.fn(), search: vi.fn() },
    )

    expect(options.queryKey).toEqual([
      'posts',
      { kind: 'search', query: 'AI', product: 'Top', following: true },
    ])
  })
})
```

Run:

```bash
nix develop -c pnpm test -- src/features/posts/use-post-feed.test.ts
```

Expected: FAIL because query options do not exist.

- [ ] **Step 2: Implement infinite-query options and hook**

Create `src/features/posts/use-post-feed.ts`:

```ts
import type { SearchProduct } from '@yuta/bird'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { loadUserPosts, searchPosts } from './server-functions'
import type { LoadError, LoadResult, PostPage } from './types'

export type FeedRequest =
  | { kind: 'user'; target: string }
  | {
      kind: 'search'
      query: string
      product: SearchProduct
      following: boolean
    }

type Loaders = {
  loadUser: (options: {
    data: { target: string; cursor?: string }
  }) => Promise<LoadResult>
  search: (options: {
    data: {
      query: string
      product: SearchProduct
      following: boolean
      cursor?: string
    }
  }) => Promise<LoadResult>
}

export class PostLoadError extends Error {
  constructor(readonly detail: LoadError) {
    super(detail.message)
  }
}

const unwrap = (result: LoadResult): PostPage => {
  if (!result.ok) throw new PostLoadError(result.error)
  return result.page
}

export function createPostFeedOptions(
  request: FeedRequest,
  loaders: Loaders,
) {
  return {
    queryKey: ['posts', request] as const,
    initialPageParam: undefined as string | undefined,
    retry: false as const,
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) =>
      request.kind === 'user'
        ? unwrap(
            await loaders.loadUser({
              data: { target: request.target, cursor: pageParam },
            }),
          )
        : unwrap(
            await loaders.search({
              data: {
                query: request.query,
                product: request.product,
                following: request.following,
                cursor: pageParam,
              },
            }),
          ),
    getNextPageParam: (page: PostPage) => page.nextCursor,
  }
}

export function usePostFeed(request: FeedRequest | undefined) {
  const loadUser = useServerFn(loadUserPosts)
  const search = useServerFn(searchPosts)
  const disabled = {
    kind: 'user',
    target: '',
  } satisfies FeedRequest

  return useInfiniteQuery({
    ...createPostFeedOptions(request ?? disabled, { loadUser, search }),
    enabled: request !== undefined,
  })
}
```

- [ ] **Step 3: Run query-option tests and verify GREEN**

Run:

```bash
nix develop -c pnpm test -- src/features/posts/use-post-feed.test.ts
```

Expected: query key, cursor forwarding, and retry behavior pass.

- [ ] **Step 4: Write failing feed-state tests**

Create `src/features/posts/components/post-feed.test.tsx` using a module mock:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostFeed } from './post-feed'
import { usePostFeed } from '../use-post-feed'

vi.mock('../use-post-feed', async (importOriginal) => {
  const original = await importOriginal<typeof import('../use-post-feed')>()
  return { ...original, usePostFeed: vi.fn() }
})

const result = {
  data: undefined,
  error: null,
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isError: false,
  isFetchNextPageError: false,
  isFetchingNextPage: false,
  isPending: false,
  refetch: vi.fn(),
}

describe('PostFeed', () => {
  beforeEach(() => vi.mocked(usePostFeed).mockReturnValue(result as never))

  it('renders no posts before a deliberate request', () => {
    render(<PostFeed request={undefined} />)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('renders a deduplicated page and a quiet end', () => {
    vi.mocked(usePostFeed).mockReturnValue({
      ...result,
      data: {
        pages: [
          {
            tweets: [
              { id: '1', text: 'first', author: { username: 'a', name: 'A' } },
              { id: '1', text: 'first', author: { username: 'a', name: 'A' } },
            ],
          },
        ],
      },
    } as never)

    render(<PostFeed request={{ kind: 'user', target: 'a' }} />)
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('これ以上の投稿はありません。')).toBeInTheDocument()
  })

  it('keeps loaded posts while retrying a later page', () => {
    const fetchNextPage = vi.fn()
    vi.mocked(usePostFeed).mockReturnValue({
      ...result,
      data: {
        pages: [
          {
            tweets: [
              { id: '1', text: 'kept', author: { username: 'a', name: 'A' } },
            ],
          },
        ],
      },
      fetchNextPage,
      hasNextPage: true,
      isFetchNextPageError: true,
    } as never)

    render(<PostFeed request={{ kind: 'user', target: 'a' }} />)
    expect(screen.getByText('kept')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(fetchNextPage).toHaveBeenCalledOnce()
  })
})
```

Run:

```bash
nix develop -c pnpm test -- src/features/posts/components/post-feed.test.tsx
```

Expected: FAIL because `PostFeed` does not exist.

- [ ] **Step 5: Implement feed states and IntersectionObserver**

Create `src/features/posts/components/post-feed.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { flattenPostPages } from '../page'
import {
  PostLoadError,
  type FeedRequest,
  usePostFeed,
} from '../use-post-feed'
import { PostCard } from './post-card'

export function PostFeed({ request }: { request: FeedRequest | undefined }) {
  const query = usePostFeed(request)
  const sentinel = useRef<HTMLDivElement>(null)
  const posts = query.data ? flattenPostPages(query.data.pages) : []

  useEffect(() => {
    if (!sentinel.current || !query.hasNextPage) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !query.isFetchingNextPage) {
          void query.fetchNextPage()
        }
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage])

  if (!request) return null
  if (query.isPending) {
    return <p className="state">投稿を取得しています…</p>
  }
  if (query.isError && posts.length === 0) {
    const error =
      query.error instanceof PostLoadError
        ? query.error.detail
        : { message: '投稿を取得できませんでした。', retryable: true }
    return (
      <div className="state" role="alert">
        <p>{error.message}</p>
        {error.retryable ? (
          <button onClick={() => void query.refetch()} type="button">
            再試行
          </button>
        ) : null}
      </div>
    )
  }
  if (posts.length === 0) {
    return <p className="state">条件に一致する投稿はありません。</p>
  }

  return (
    <section aria-live="polite" className="feed">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      <div aria-hidden ref={sentinel} />
      {query.isFetchingNextPage ? (
        <div className="loading-rail" role="status">
          次の投稿を取得しています…
        </div>
      ) : null}
      {query.isFetchNextPageError ? (
        <div className="state" role="alert">
          <p>続きの投稿を取得できませんでした。</p>
          <button onClick={() => void query.fetchNextPage()} type="button">
            再試行
          </button>
        </div>
      ) : null}
      {!query.hasNextPage ? (
        <p className="state">これ以上の投稿はありません。</p>
      ) : null}
    </section>
  )
}
```

- [ ] **Step 6: Connect feeds to route-controlled intent**

In `src/routes/user.tsx`, import `PostFeed` and render after the form:

```tsx
<PostFeed
  request={target ? { kind: 'user', target } : undefined}
/>
```

In `src/routes/search.tsx`, render:

```tsx
<PostFeed
  request={
    values.q
      ? {
          kind: 'search',
          query: values.q,
          product: values.product,
          following: values.following,
        }
      : undefined
  }
/>
```

- [ ] **Step 7: Verify and commit infinite loading**

Run:

```bash
nix develop -c pnpm test -- \
  src/features/posts/use-post-feed.test.ts \
  src/features/posts/components/post-feed.test.tsx
nix develop -c pnpm typecheck
nix develop -c pnpm build
```

Expected: query options, feed states, typecheck, and build pass.

Commit:

```bash
git add src/features/posts src/routes src/routeTree.gen.ts
git commit -m "feat: load post cursors infinitely"
```

### Task 8: Apply the Mist Instrument responsive interface

**Files:**
- Modify: `src/styles.css`
- Modify: `src/features/posts/components/forms.test.tsx`
- Modify: `src/features/posts/components/post-card.test.tsx`

**Interfaces:**
- Consumes: existing semantic class names and controls.
- Produces: responsive Mist Instrument layout, visible keyboard focus, stable media geometry, and reduced-motion behavior.

- [ ] **Step 1: Add failing accessibility assertions**

Extend `forms.test.tsx` with:

```tsx
it('uses a labelled grouping for ranking controls', () => {
  render(
    <SearchForm
      initialQuery=""
      initialProduct="Latest"
      initialFollowing={false}
      onSubmit={vi.fn()}
    />,
  )

  expect(
    screen.getByRole('group', { name: '並び順' }),
  ).toBeInTheDocument()
})
```

Extend `post-card.test.tsx` with:

```tsx
it('does not turn the author into a discovery link', () => {
  render(<PostCard post={richPost} />)

  expect(screen.queryByRole('link', { name: 'Yuta' })).not.toBeInTheDocument()
})
```

Run:

```bash
nix develop -c pnpm test -- src/features/posts/components
```

Expected: tests expose any missing semantics before visual work proceeds.

- [ ] **Step 2: Replace the base stylesheet with Mist Instrument**

Replace `src/styles.css` with:

```css
:root {
  --canvas: #dfe7e9;
  --surface: #f8faf9;
  --surface-muted: #edf3f3;
  --ink: #1e3238;
  --muted: #70858a;
  --accent: #255f6e;
  --accent-hover: #194d59;
  --border: #c1cfd2;
  --error: #8a3034;
  color: var(--ink);
  background: var(--canvas);
  font-family: Inter, "Noto Sans JP", ui-sans-serif, system-ui, sans-serif;
  font-synthesis: none;
}

* {
  box-sizing: border-box;
}

html {
  min-width: 320px;
  background: var(--canvas);
}

body {
  min-height: 100vh;
  margin: 0;
}

button,
input {
  font: inherit;
}

a {
  color: var(--accent);
  text-underline-offset: 0.18em;
}

button,
input,
a {
  border-radius: 0.55rem;
}

:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--accent) 42%, transparent);
  outline-offset: 3px;
}

.app {
  width: min(46rem, calc(100% - 2rem));
  min-height: calc(100vh - 2rem);
  margin: 1rem auto;
  overflow: clip;
  border: 1px solid var(--border);
  border-radius: 1.15rem;
  background: var(--surface);
  box-shadow: 0 1.2rem 3rem rgb(30 50 56 / 10%);
}

.app-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.2rem 1.4rem 0;
  border-bottom: 1px solid #dce5e6;
}

.brand {
  margin: 0 0 0.85rem;
  color: var(--muted);
  font-size: 0.68rem;
  letter-spacing: 0.2em;
}

.tabs {
  display: flex;
  gap: 1.1rem;
}

.tabs a {
  padding: 0.85rem 0.2rem 0.75rem;
  border-radius: 0;
  color: var(--muted);
  font-size: 0.9rem;
  text-decoration: none;
}

.tabs a[aria-current="page"] {
  border-bottom: 2px solid var(--accent);
  color: var(--accent);
  font-weight: 700;
}

.reader {
  padding: 2rem 1.4rem 3rem;
}

.reader > h1 {
  margin: 0;
  font-size: clamp(1.45rem, 4vw, 2rem);
  letter-spacing: -0.03em;
}

.intro {
  margin: 0.45rem 0 1.5rem;
  color: var(--muted);
}

.intent-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.85rem;
  align-items: end;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 0.9rem;
  background: var(--surface-muted);
}

.field {
  display: grid;
  gap: 0.4rem;
  min-width: 0;
  color: var(--muted);
  font-size: 0.78rem;
}

.field input {
  width: 100%;
  padding: 0.75rem 0.85rem;
  border: 1px solid #aebfc3;
  background: white;
  color: var(--ink);
}

.field-error {
  color: var(--error);
  font-size: 0.76rem;
}

.intent-form button,
.state button {
  min-height: 2.65rem;
  padding: 0.65rem 1rem;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: white;
  cursor: pointer;
  font-weight: 700;
}

.intent-form button:hover,
.state button:hover {
  background: var(--accent-hover);
}

.segmented {
  display: flex;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  border: 0;
}

.segmented legend {
  width: 100%;
  margin-bottom: 0.4rem;
  color: var(--muted);
  font-size: 0.78rem;
}

.segmented label {
  position: relative;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 0.55rem;
  cursor: pointer;
  font-size: 0.84rem;
}

.segmented input {
  position: absolute;
  opacity: 0;
}

.segmented label:has(input:checked) {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.check {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.65rem;
  font-size: 0.84rem;
}

.feed {
  display: grid;
  gap: 0.85rem;
  margin-top: 1.4rem;
}

.post {
  min-width: 0;
  padding: 1rem;
  border: 1px solid #d7e0e2;
  border-radius: 0.9rem;
  background: white;
}

.post-header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.65rem;
  align-items: center;
}

.avatar {
  border-radius: 50%;
}

.handle,
.post-header time {
  display: block;
  color: var(--muted);
  font-size: 0.76rem;
}

.post-header time {
  text-align: right;
}

.post-text {
  margin: 0.9rem 0;
  overflow-wrap: anywhere;
  line-height: 1.75;
  white-space: pre-wrap;
}

.media-grid {
  display: grid;
  gap: 0.4rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 0.8rem;
  overflow: hidden;
  border-radius: 0.75rem;
}

.media-grid:has(> :only-child) {
  grid-template-columns: 1fr;
}

.media {
  width: 100%;
  max-height: 32rem;
  object-fit: cover;
  background: var(--surface-muted);
}

.article-card,
.quote {
  margin-top: 0.8rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--surface);
}

.article-card p {
  margin-bottom: 0;
  color: var(--muted);
}

.quote .post-header time,
.quote .post-footer {
  display: none;
}

.post-footer {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1rem;
  color: var(--muted);
  font-size: 0.74rem;
}

.counts {
  font-variant-numeric: tabular-nums;
}

.state {
  padding: 1rem;
  color: var(--muted);
  text-align: center;
}

[role="alert"].state {
  color: var(--error);
}

.loading-rail {
  position: relative;
  padding: 0.8rem;
  color: var(--muted);
  font-size: 0.78rem;
  text-align: center;
}

.loading-rail::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 3px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--accent) 45%,
    transparent 100%
  );
  content: "";
  animation: rail 1.1s ease-in-out infinite;
}

@keyframes rail {
  0%,
  100% {
    opacity: 0.25;
    transform: scaleX(0.35);
  }
  50% {
    opacity: 1;
    transform: scaleX(1);
  }
}

@media (max-width: 42rem) {
  .app {
    width: 100%;
    min-height: 100vh;
    margin: 0;
    border-right: 0;
    border-left: 0;
    border-radius: 0;
  }

  .app-header,
  .reader {
    padding-right: 1rem;
    padding-left: 1rem;
  }

  .intent-form {
    grid-template-columns: 1fr;
  }

  .post-header {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .post-header time {
    grid-column: 2;
    text-align: left;
  }

  .post-footer {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Verify responsive semantics and commit**

Run:

```bash
nix develop -c pnpm test -- src/features/posts/components
nix develop -c pnpm lint
nix develop -c pnpm typecheck
nix develop -c pnpm build
```

Expected: component tests, lint, typecheck, and build pass.

Commit:

```bash
git add src/styles.css src/features/posts/components
git commit -m "feat: apply mist instrument interface"
```

### Task 9: Verify browser flows, live relay reads, and documentation

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/mock-relay.mjs`
- Create: `tests/e2e/reader.spec.ts`
- Create: `tests/live/relay.test.ts`
- Create: `.env.example`
- Modify: `.gitignore`
- Create: `README.md`
- Verify: `docs/superpowers/specs/2026-07-13-twitter-lite-design.md`

**Interfaces:**
- Consumes: the complete app and local Bird build.
- Produces: deterministic desktop/mobile browser coverage and an opt-in read-only live smoke test.

- [ ] **Step 1: Add the browser configuration**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

const appPort = 4173
const relayPort = 6911
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE

if (!chromiumExecutable) {
  throw new Error('Run E2E tests through `nix develop` to provide Chromium.')
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${appPort}`,
    launchOptions: { executablePath: chromiumExecutable },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `TWITTER_LITE_MOCK_RELAY_PORT=${relayPort} node tests/e2e/mock-relay.mjs`,
      port: relayPort,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `TWITTER_RELAY_BASE_URL=http://127.0.0.1:${relayPort} BIRD_PROFILE_NAME=e2e pnpm exec vite dev --host 127.0.0.1 --port ${appPort} --strictPort`,
      url: `http://127.0.0.1:${appPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
```

- [ ] **Step 2: Create a deterministic read-only relay**

Create `tests/e2e/mock-relay.mjs`. The response-shape excerpt below is only
part of the mock: the executable implementation must also enforce the request
contract listed after it.

```js
const tweet = (id, text, username = 'yuta') => ({
  entryId: `tweet-${id}`,
  content: {
    itemContent: {
      tweet_results: {
        result: {
          rest_id: id,
          legacy: {
            full_text: text,
            created_at: 'Mon Jul 13 00:00:00 +0000 2026',
            reply_count: 1,
            retweet_count: 2,
            favorite_count: 3,
            conversation_id_str: id,
          },
          core: {
            user_results: {
              result: {
                legacy: {
                  screen_name: username,
                  name: 'Yuta',
                },
              },
            },
          },
        },
      },
    },
  },
})

const cursor = (value) => ({
  entryId: 'cursor-bottom',
  content: { cursorType: 'Bottom', value },
})
```

Route by the operation-name suffix, never the query ID. Require
`x-profile-name: e2e`; require GET for `UserByScreenName` and `UserTweets`; and
require POST plus JSON `{ features, queryId }` for `SearchTimeline`, whose
`variables` remain in the URL. Validate only the minimal fixture variables,
not exact query IDs or complete feature bags. Return 405 for a wrong method,
403 for a wrong profile, 400 for malformed supported input, and 501 for an
unsupported operation. Never return 404 or make an outbound request.

Key transient state by raw query. The first cursor request for each
`retry-<project>` query returns 503 once, then succeeds on explicit retry. A
`slow-<project>` cursor request is delayed long enough to observe the loading
rail. Every page carrying a cursor also carries a parseable tweet, and page two
omits the cursor.

- [ ] **Step 3: Write failing end-to-end flows**

Create `tests/e2e/reader.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

let consoleErrors: string[]
let pageErrors: string[]

test.beforeEach(async ({ page }) => {
  consoleErrors = []
  pageErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
})

test.afterEach(() => {
  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('requires intent and infinitely loads a user timeline', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/user\?target=/)
  await expect(page.locator('article')).toHaveCount(0)

  await page.getByLabel('ハンドルまたはプロフィール URL').fill('@yuta')
  await page.getByRole('button', { name: '表示' }).click()

  await expect(page.getByText('user page 1')).toBeVisible()
  await expect(page.getByText('user page 2')).toBeVisible()
  await expect(page.getByText('これ以上の投稿はありません。')).toBeVisible()
  await expect(page).toHaveScreenshot('mist-user.png', {
    animations: 'disabled',
    fullPage: true,
  })
})

test('searches Top posts from followed accounts', async ({ page }) => {
  await page.goto('/search?q=&product=Latest&following=false')
  await page.getByLabel('検索語').fill('AI lang:ja')
  await page.getByLabel('人気順').check()
  await page.getByLabel('フォロー中のみ').check()
  await page.getByRole('button', { name: '検索' }).click()

  await expect(page.getByText('Top · follows page 1')).toBeVisible()
  await expect(page.getByText('Top · follows page 2')).toBeVisible()
})

test('keeps discovery surfaces absent', async ({ page }) => {
  await page.goto('/user?target=')
  await expect(
    page.getByRole('link', { name: /おすすめ|トレンド|通知/ }),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: /いいね|再投稿|フォロー/ })).toHaveCount(0)
})
```

Wait for the cold SSR page to hydrate before manipulating controlled fields.
In addition to the excerpted happy paths, cover a later-page 503 that retains
page one and succeeds only after Retry, the exact keyboard Tab order across
both navigation links and all form controls, absent discovery/mutation links
and controls, and a `slow-<project>` request under reduced motion whose loading
rail pseudo-element has `animation-name: none`. Run every flow in both projects
and let the slow request finish before teardown.

Run:

```bash
nix develop -c pnpm test:e2e
```

Expected: FAIL because approved visual snapshots do not exist yet. If a functional assertion fails first, reproduce it in the nearest focused unit test before changing application code.

- [ ] **Step 4: Make browser flows GREEN and capture screenshots**

Run:

```bash
nix develop -c pnpm exec playwright test --update-snapshots
nix develop -c pnpm test:e2e
```

Expected: the first run creates reviewed desktop and mobile `mist-user.png` snapshots; the second run passes all projects with no browser console errors.

- [ ] **Step 5: Add the opt-in live read test**

Create `tests/live/relay.test.ts`:

```ts
// @vitest-environment node

import { TwitterClient } from '@yuta/bird'
import { describe, expect, it } from 'vitest'

describe.runIf(process.env.TWITTER_LITE_LIVE === '1')(
  'configured relay',
  () => {
    it(
      'performs one read-only Top search',
      async () => {
        const relayBaseUrl = process.env.TWITTER_RELAY_BASE_URL
        if (!relayBaseUrl) {
          throw new Error('TWITTER_RELAY_BASE_URL is required for the live test')
        }
        const client = new TwitterClient({
          relayBaseUrl,
          profileName: process.env.BIRD_PROFILE_NAME,
          timeoutMs: 20_000,
        })
        const query = process.env.TWITTER_LITE_LIVE_QUERY ?? 'OpenAI'
        const result = await client.search(query, 1, { product: 'Top' })
        expect(result.success).toBe(true)
      },
      30_000,
    )
  },
)
```

Run:

```bash
nix develop -c pnpm test:live
```

Expected: when relay/profile environment configuration is actually available,
one read-only Top search test passes. Do not run this opt-in command
unconditionally or log relay configuration, response bodies, or post content.

- [ ] **Step 6: Document setup and intentional omissions**

Create `.env.example`:

```dotenv
TWITTER_RELAY_BASE_URL=http://127.0.0.1:6900
BIRD_PROFILE_NAME=
```

Extend `.gitignore` to exactly:

```gitignore
.superpowers/
.worktrees/
.env*
!.env.example
.output/
dist/
node_modules/
playwright-report/
test-results/
```

Create `README.md` with these sections and commands:

````md
# Twitter Lite

An intentional, read-only X reader that shows content only after a deliberate
handle, profile URL, or search query.

## Features

- User timelines from a manually entered handle or profile URL
- Top and Latest search
- Optional `filter:follows` search
- Infinite cursor loading
- Photos, videos, quotes, articles, and quiet engagement counts
- No home feed, recommendations, trends, notifications, history, or writes

## Setup

Use Nix, or Node.js `>=22.12.0` with pnpm `11.9.0`. Obtain the supplied local
Bird checkout beside this repository at unpublished commit
`81921226f099e7f7a2107be15fc9783218a6f400`. A fresh remote clone alone does
not contain that Top/Latest commit yet.

```bash
cd ../bird
git rev-parse HEAD
nix develop -c pnpm install --frozen-lockfile
nix develop -c pnpm run build:dist
cd ../twitter-lite
nix develop -c pnpm install --frozen-lockfile
```

Set `TWITTER_RELAY_BASE_URL` at runtime and, when the relay has multiple
profiles, `BIRD_PROFILE_NAME`. Bird and both values are read only by
server-side code and never reach the browser.

## Commands

```bash
nix develop -c pnpm dev
nix develop -c pnpm dev:tailscale
nix develop -c pnpm test
nix develop -c pnpm test:e2e
nix develop -c pnpm test:live
nix develop -c pnpm build
nix develop -c pnpm start
```

The default bind address is `127.0.0.1`. E2E runs through Nix with the system
Chromium; the live command performs exactly one explicitly configured read.
`dev:tailscale` binds `0.0.0.0`, including LAN interfaces as well as Tailscale,
so use it only on a trusted network. Find the Tailscale address with
`tailscale ip -4`.

## Reliability

Bird uses X's internal web GraphQL operations through the configured safe
relay. X may change query IDs or response shapes without notice.
````

- [ ] **Step 7: Run the complete verification matrix**

From `../bird`:

```bash
nix develop -c pnpm run build:dist
nix develop -c pnpm run lint
nix develop -c pnpm test
git status --short --branch
git rev-list --count origin/main..HEAD
git log --oneline origin/main..HEAD
```

From Twitter Lite:

```bash
nix develop -c pnpm install --frozen-lockfile
nix develop -c pnpm check:routes
nix develop -c pnpm lint
nix develop -c pnpm typecheck
nix develop -c pnpm test
nix develop -c pnpm build
nix develop -c pnpm test:e2e
nix develop -c pnpm test:live # only with configured relay environment
git diff --check
```

Expected:

- Bird build, lint, and all non-live tests pass.
- Twitter Lite lint, typecheck, unit tests, desktop/mobile browser tests, live read test, and production build pass.
- Bird has one local feature commit and no remote push.
- Fresh `.output/public` scans contain no Bird/client or relay environment names;
  source contains only the two intended server functions and no mutation/generic
  proxy calls.
- `README.md` and the design docs match the delivered commands and behavior.
- `AGENTS.md` and `CLAUDE.md` remain absent because no agent-specific instruction changed.

- [ ] **Step 8: Commit final verification assets and docs**

```bash
git add \
  .env.example .gitignore README.md playwright.config.ts \
  src/routes/__root.tsx tests/e2e tests/live docs
git commit -m "test: verify intentional reader flows"
```

Run one fresh post-commit audit:

```bash
git status --short --branch
git log --oneline --decorate -8
nix develop -c pnpm test
nix develop -c pnpm test:e2e
nix develop -c pnpm build
git diff --check
```

Expected: clean status, the planned commits are present, all unit tests pass, and the production build exits zero.
