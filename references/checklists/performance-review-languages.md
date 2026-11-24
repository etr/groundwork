# Performance Review: Language-Specific Checks

The language-specific checks of the `performance-reviewer` agent. Apply the section for each language family present in the changed files and skip the rest; a family with no file in the change has nothing to check.

### JavaScript/TypeScript
- `forEach` with `await` inside (use `Promise.all` or `for...of` with batching)
- Spreading large arrays in loops: `[...arr, item]` in reduce
- Missing `useMemo`/`useCallback` for expensive React computations
- Creating new objects/arrays in render (unstable references)
- `JSON.parse(JSON.stringify())` for deep clone (use structuredClone or library)
- Regex created inside loops instead of compiled once
- Not using `Map`/`Set` for lookups
- Building strings with `+=` in loops (use array + join)

### Python
- List comprehension inside another on large data
- String concatenation in loop (use `''.join()`)
- Not using generators for large sequences
- Repeated `in` checks on list (use set)
- Missing `__slots__` for many small objects
- Not using `lru_cache` for pure recursive functions
- DataFrame operations in loops instead of vectorized
- Loading entire file when iterating lines

### Java
- String concatenation in loops (use StringBuilder)
- Autoboxing in tight loops
- Creating iterators repeatedly instead of reusing
- Not using primitive streams for numeric operations
- Synchronizing entire methods instead of specific blocks
- Not closing resources (use try-with-resources)
- Creating `Pattern` objects inside loops
- Using `LinkedList` when `ArrayList` would perform better

### C#
- LINQ in tight loops without materialization
- Boxing/unboxing in generic collections
- String interpolation in loops (use StringBuilder)
- Not using `Span<T>` for slice operations
- Async void instead of async Task
- Capturing loop variables in closures
- Not using `ArrayPool<T>` for temporary arrays
- `ToList()` when enumeration is sufficient

### Go
- Allocating in loops (preallocate slices with capacity)
- String concatenation (use strings.Builder)
- Not reusing buffers (use sync.Pool)
- Goroutine leaks (missing context cancellation)
- Mutex held across I/O operations
- Using defer in loops (defers only run at function exit)
- Not using buffered channels appropriately
- Reflection in hot paths

### Rust
- Unnecessary `.clone()` calls
- Not using iterators (manual index loops)
- Allocating `String` when `&str` suffices
- Not using `Vec::with_capacity` for known sizes
- `collect()` to intermediate Vec when chaining would work
- Arc/Mutex where Rc/RefCell would suffice (single-threaded)
- Not using `Cow<str>` for conditionally-owned strings
- Unnecessary bounds checks (use `get_unchecked` in verified hot paths)

### C/C++
- Memory allocation in loops (reuse buffers)
- Passing large structs by value (use const reference)
- Virtual function calls in tight loops
- Cache-unfriendly data access patterns (column vs row major)
- Missing move semantics (unnecessary copies)
- Not using `reserve()` for vectors
- Redundant string copies (use string_view)
- Unrolled loops where compiler could optimize

### PHP
- Not using prepared statements (recompiles each query)
- Array functions creating copies instead of references
- Loading entire files into memory (use streaming)
- Not using generators for large datasets
- Autoloading overhead in loops
- Creating objects in tight loops
- Not using opcache effectively
- String functions vs array functions on large data

### Ruby
- Method calls in tight loops (Ruby method calls are slow)
- Creating symbols dynamically (symbol table grows forever)
- Not using `.freeze` for constant strings
- `each` with block vs `while` for hot loops
- Not using `Set` for membership tests
- Regular expressions without `/o` flag (recompiles)
- `map` followed by `compact` (use `filter_map`)
- Not using `lazy` for large enumerables

### Swift/Kotlin (Mobile)
- Creating views in loops instead of reusing cells
- Not using lazy properties for expensive initialization
- Main thread blocking with synchronous I/O
- Large image loading without downsampling
- Retain cycles in closures (missing weak references)
- Not using value types where appropriate
- Excessive object allocation in scroll handlers
- Not using background queues/dispatchers for heavy work
