import { REQUEST_TIMEOUT_MS } from './constants'

// meshcore.js requests wait forever for a node that stopped answering.
export function withTimeout<T>(request: Promise<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('errors.noAnswer')), ms)
  })
  return Promise.race([request, timeout]).finally(() => clearTimeout(timer))
}
