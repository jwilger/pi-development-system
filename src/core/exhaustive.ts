/** Compile-time proof that a switch covered every case; a runtime hit means a parse boundary let an impossible value through. */
export function assertNever(value: never): never {
  throw new Error(`unhandled case: ${JSON.stringify(value)}`);
}
