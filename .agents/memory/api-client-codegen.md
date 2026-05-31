---
name: API client codegen
description: The api-client-react package has no codegen script — new hooks must be hand-written following the orval output pattern.
---

## Rule
`lib/api-client-react` has no `codegen` script in `package.json` and no orval config file. There is no way to regenerate from the OpenAPI spec automatically.

**How to add new API hooks:**
1. Create `lib/api-client-react/src/<feature>.ts` — hand-write hooks matching the orval pattern: `customFetch`, `useQuery`/`useMutation` from TanStack Query, typed `QueryKey` helpers (`getGet<X>QueryKey`), and typed input/response interfaces.
2. Re-export from `lib/api-client-react/src/index.ts` with `export * from "./<feature>";`.
3. Import in the frontend via `@workspace/api-client-react` — the workspace symlink resolves through `src/index.ts`.

**Why:** The `generated/api.ts` file is orval-generated but there is no codegen pipeline hooked into the build. Adding to the generated file would be overwritten if codegen ever runs; a separate file is safer and maintains the pattern.
