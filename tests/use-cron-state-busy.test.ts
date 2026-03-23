import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'

import { useUiSettingsStore } from '../src/stores/setting.ts'
import { useCronState } from '../src/composables/useCronState.ts'

class MemoryStorage {
  private data = new Map<string, string>()

  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null
  }

  setItem(key: string, value: string) {
    this.data.set(key, String(value))
  }

  removeItem(key: string) {
    this.data.delete(key)
  }

  clear() {
    this.data.clear()
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setupState() {
  ;(globalThis as any).localStorage = new MemoryStorage()
  setActivePinia(createPinia())
  const settings = useUiSettingsStore()
  settings.save({ apiBaseUrl: 'http://127.0.0.1:3000', token: '' })

  const cronState = useCronState() as any
  cronState.cronJobs = []
  cronState.cronLoading = false
  cronState.cronBusy = false
  cronState.cronSaving = false
  cronState.cronError = null
  return cronState
}

test('running a cron job does not mark cronSaving as busy', async () => {
  const cronState = setupState()
  const originalFetch = globalThis.fetch
  const deferred = createDeferred<Response>()

  globalThis.fetch = (async () => deferred.promise) as typeof fetch

  try {
    const runPromise = cronState.runCronJob({ id: 'job-1' })
    assert.equal(cronState.cronSaving, false)

    deferred.resolve(new Response(JSON.stringify({ ok: true, payload: { message: 'ok' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    await runPromise
    assert.equal(cronState.cronSaving, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('add and update toggle cronSaving only for form submission', async () => {
  const cronState = setupState()
  const originalFetch = globalThis.fetch
  const addDeferred = createDeferred<Response>()
  const updateDeferred = createDeferred<Response>()
  let callCount = 0

  globalThis.fetch = (async () => {
    callCount += 1
    if (callCount === 1) return addDeferred.promise
    return updateDeferred.promise
  }) as typeof fetch

  try {
    const addPromise = cronState.addCronJob({ name: 'job' })
    assert.equal(cronState.cronSaving, true)
    addDeferred.resolve(new Response(JSON.stringify({ ok: true, payload: { id: 'job-1' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    await addPromise
    assert.equal(cronState.cronSaving, false)

    const updatePromise = cronState.updateCronJob('job-1', { name: 'job-1' })
    assert.equal(cronState.cronSaving, true)
    updateDeferred.resolve(new Response(JSON.stringify({ ok: true, payload: { id: 'job-1' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    await updatePromise
    assert.equal(cronState.cronSaving, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})
