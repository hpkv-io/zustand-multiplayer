# Claude Development Guidelines

## Code Quality Standards

### 1. NEVER COMPROMISE ON IMPLEMENTATION QUALITY

- **Always implement the full, correct solution** - no placeholders, no "simplified versions", no shortcuts
- When you encounter build errors or API issues, research and fix them properly
- If you write a comment like "This is a placeholder" or "For now, we'll use a simplified approach", STOP immediately and implement it correctly

### 2. Error Handling Approach

- When encountering build errors:
  1. Research the root cause of the error.
  2. Fix the implementation and ensure it's correct.
  3. Never work around errors with simplified implementations
- If you can't find documentation, ask the user rather than guessing.

### 3. Implementation Standards

- Every implementation must be production-grade by default
- Match the quality level of existing code
- Complete all functionality before marking a task as done

### 4. Shortcuts Policy

- Shortcuts are ONLY acceptable when explicitly requested by the user
- Examples of explicit requests: "just make it compile for now", "create a mock implementation", "stub this out"
- Default assumption: every implementation should be complete and production-ready
