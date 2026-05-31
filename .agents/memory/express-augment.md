---
name: Express Request augmentation
description: How to correctly extend the Express Request type in this project so req.userId/userRole are recognized everywhere.
---

Augmenting Express `Request` with custom properties (like `userId`, `userRole`) requires a **global ambient `.d.ts` file** using the `Express` namespace — NOT `declare module "express"` inside a TypeScript module file.

**Correct pattern** (`src/express.d.ts`):
```typescript
declare global {
  namespace Express {
    interface Request {
      userId?: number;
      userRole?: string;
    }
  }
}
export {};
```

**Why:** Express's `Request` interface lives in `express-serve-static-core`. Augmenting via `declare module "express"` inside a `.ts` file with imports does NOT propagate to the generic instantiation `Request<ParamsDictionary, any, ...>` used in route handlers. The `Express` global namespace pattern works because `@types/express-serve-static-core` merges `Express.Request` into its `Request` type automatically.

**How to apply:** Any time you add new properties to Express Request, put them in `artifacts/api-server/src/express.d.ts`. The file already exists. The `AuthedRequest` interface in `auth.ts` extends `Request` and narrows `userId`/`userRole` to non-optional for use in protected route type casting.
