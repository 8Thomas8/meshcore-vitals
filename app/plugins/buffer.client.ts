import { Buffer } from 'buffer'

// meshcore.js uses the Node `Buffer` global throughout its parsers without
// importing it, so it is undefined in the browser. Exposing it globally is
// what makes the library usable client-side.
export default defineNuxtPlugin(() => {
  if (!('Buffer' in globalThis)) {
    ;(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer
  }
})
