import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPending,
  pendingKey,
  readPending,
  UPLOAD_TRANSPORT,
  uploadBlob,
  writePending,
} from './transport'

// One fake tus Upload per test; the mock factory records the options and the call order.
const tusState = vi.hoisted(() => ({
  options: undefined as Record<string, unknown> | undefined,
  calls: [] as string[],
  previous: [] as unknown[],
  outcome: 'success' as 'success' | 'error',
}))

vi.mock('tus-js-client', () => ({
  Upload: class {
    options: Record<string, unknown>
    constructor(_blob: Blob, options: Record<string, unknown>) {
      this.options = options
      tusState.options = options
    }
    async findPreviousUploads() {
      tusState.calls.push('find')
      return tusState.previous
    }
    resumeFromPreviousUpload(prev: unknown) {
      tusState.calls.push(`resume:${String(prev)}`)
    }
    start() {
      tusState.calls.push('start')
      const o = this.options as {
        onProgress: (a: number, b: number) => void
        onSuccess: () => void
        onError: (e: Error) => void
      }
      o.onProgress(3, 4)
      if (tusState.outcome === 'success') o.onSuccess()
      else o.onError(new Error('tus failed'))
    }
    async abort() {
      tusState.calls.push('abort')
    }
  },
}))

const TARGET = {
  document_id: 'D1',
  path: 'firm/case/item/D1.jpg',
  token: 'tok-1',
  signed_url: 'https://ref.supabase.co/storage/v1/object/upload/sign/case-documents/x?token=tok-1',
}
const blob = new Blob(['hello'])

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('pending-upload map', () => {
  it('keys a file by name, size and lastModified', () => {
    expect(pendingKey({ name: 'a.jpg', size: 10, lastModified: 5 })).toBe(
      'a.jpg|10|5'
    )
  })

  it('writes, reads and clears per item', () => {
    writePending('I1', 'k', 'D1')
    writePending('I2', 'k', 'D2')
    expect(readPending('I1')).toEqual({ k: 'D1' })
    clearPending('I1', 'k')
    expect(readPending('I1')).toEqual({})
    expect(readPending('I2')).toEqual({ k: 'D2' })
  })

  it('reads a corrupt value as empty without throwing', () => {
    localStorage.setItem('rs_pending_uploads', '{not json')
    expect(readPending('I1')).toEqual({})
    localStorage.setItem('rs_pending_uploads', JSON.stringify({ I1: { k: 7 } }))
    expect(readPending('I1')).toEqual({})
  })

  it('is a no-op when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError')
      },
    })
    expect(() => writePending('I1', 'k', 'D1')).not.toThrow()
    expect(readPending('I1')).toEqual({})
    expect(() => clearPending('I1', 'k')).not.toThrow()
  })
})

// A scripted XMLHttpRequest: each send() takes the next outcome (an HTTP status or a network error).
function stubXhr(outcomes: Array<number | 'error'>) {
  const sent: Array<{ method: string; url: string; headers: Record<string, string> }> = []
  vi.stubGlobal(
    'XMLHttpRequest',
    class {
      status = 0
      upload: { onprogress?: (e: { loaded: number; total: number }) => void } = {}
      onload?: () => void
      onerror?: () => void
      onabort?: () => void
      private req = { method: '', url: '', headers: {} as Record<string, string> }
      open(method: string, url: string) {
        this.req.method = method
        this.req.url = url
      }
      setRequestHeader(k: string, v: string) {
        this.req.headers[k.toLowerCase()] = v
      }
      send() {
        sent.push(this.req)
        const next = outcomes.shift()
        queueMicrotask(() => {
          if (next === 'error' || next === undefined) return this.onerror?.()
          this.upload.onprogress?.({ loaded: 1, total: 2 })
          this.status = next
          this.onload?.()
        })
      }
      abort() {
        this.onabort?.()
      }
    }
  )
  return sent
}

describe('uploadBlob over a signed PUT', () => {
  it('PUTs to signed_url with type, apikey and no upsert, and reports progress', async () => {
    const sent = stubXhr([200])
    const progress = vi.fn()
    await uploadBlob(TARGET, blob, 'image/jpeg', progress, { transport: 'put' })
    expect(sent).toEqual([
      {
        method: 'PUT',
        url: TARGET.signed_url,
        headers: {
          'content-type': 'image/jpeg',
          apikey: 'sb_publishable_test',
          'x-upsert': 'false',
        },
      },
    ])
    expect(progress).toHaveBeenCalledWith(0.5)
  })

  it('retries network errors with 1 s then 3 s and succeeds on the third attempt', async () => {
    vi.useFakeTimers()
    const timeout = vi.spyOn(globalThis, 'setTimeout')
    const sent = stubXhr(['error', 'error', 200])
    const done = uploadBlob(TARGET, blob, 'image/jpeg', () => {}, {
      transport: 'put',
    })
    await vi.runAllTimersAsync()
    await expect(done).resolves.toBeUndefined()
    expect(sent).toHaveLength(3)
    expect(timeout.mock.calls.map((c) => c[1])).toEqual([1000, 3000])
  })

  it('does not retry a 4xx', async () => {
    const sent = stubXhr([403, 200])
    await expect(
      uploadBlob(TARGET, blob, 'image/jpeg', () => {}, { transport: 'put' })
    ).rejects.toMatchObject({ code: 'upload_failed', status: 403 })
    expect(sent).toHaveLength(1)
  })

  it('gives up after three 5xx answers with code network', async () => {
    vi.useFakeTimers()
    const sent = stubXhr([503, 502, 500])
    const done = uploadBlob(TARGET, blob, 'image/jpeg', () => {}, {
      transport: 'put',
    }).catch((e: unknown) => e)
    await vi.runAllTimersAsync()
    expect(await done).toMatchObject({ code: 'network' })
    expect(sent).toHaveLength(3)
  })
})

describe('uploadBlob over TUS', () => {
  beforeEach(() => {
    tusState.options = undefined
    tusState.calls = []
    tusState.previous = []
    tusState.outcome = 'success'
  })

  it('is the transport chosen by spike (c)', () => {
    expect(UPLOAD_TRANSPORT).toBe('tus')
  })

  it('configures the signed resumable endpoint exactly as the spike proved', async () => {
    const progress = vi.fn()
    await uploadBlob(TARGET, blob, 'image/jpeg', progress, { transport: 'tus' })
    const o = tusState.options!
    expect(o.endpoint).toBe(
      'https://ref.storage.supabase.co/storage/v1/upload/resumable/sign'
    )
    expect(o.headers).toEqual({
      apikey: 'sb_publishable_test',
      'x-signature': 'tok-1',
    })
    expect(o.chunkSize).toBe(6 * 1024 * 1024)
    expect(o.uploadDataDuringCreation).toBe(true)
    expect(o.removeFingerprintOnSuccess).toBe(true)
    expect(o.metadata).toEqual({
      bucketName: 'case-documents',
      objectName: TARGET.path,
      contentType: 'image/jpeg',
      cacheControl: '3600',
    })
    await expect(
      (o.fingerprint as () => Promise<string>)()
    ).resolves.toBe('rs-D1')
    expect(progress).toHaveBeenCalledWith(0.75)
    expect(tusState.calls).toEqual(['find', 'start'])
  })

  it('resumes a previous upload before starting', async () => {
    tusState.previous = ['prev-1']
    await uploadBlob(TARGET, blob, 'application/pdf', () => {}, {
      transport: 'tus',
    })
    expect(tusState.calls).toEqual(['find', 'resume:prev-1', 'start'])
  })

  it('rejects when tus reports an error', async () => {
    tusState.outcome = 'error'
    await expect(
      uploadBlob(TARGET, blob, 'image/jpeg', () => {}, { transport: 'tus' })
    ).rejects.toMatchObject({ code: 'network' })
  })
})
