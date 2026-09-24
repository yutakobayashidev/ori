// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { researchEvents } from './events.server'

it('streams the initial state and pushes updates without another HTTP request', async () => {
  let emit = (_value: { configured: boolean; run: null }) => {}
  const unsubscribe = vi.fn()
  const response = researchEvents(
    new Request('http://127.0.0.1/api/research/events'),
    (listener) => {
      emit = listener
      listener({ configured: false, run: null })
      return unsubscribe
    },
  )
  const reader = response.body?.getReader()
  expect.assert.isDefined(reader)
  const decoder = new TextDecoder()
  expect(response.headers.get('content-type')).toContain('text/event-stream')
  expect(decoder.decode((await reader.read()).value)).toBe(
    'data: {"configured":false,"run":null}\n\n',
  )
  emit({ configured: true, run: null })
  expect(decoder.decode((await reader.read()).value)).toContain(
    '"configured":true',
  )
  await reader.cancel()
  expect(unsubscribe).toHaveBeenCalledOnce()
})

it('unsubscribes on browser abort and sends current state on a fresh connection', async () => {
  const controller = new AbortController()
  const unsubscribe = vi.fn()
  let configured = false
  const subscribe = (
    listener: (value: { configured: boolean; run: null }) => void,
  ) => {
    listener({ configured, run: null })
    return unsubscribe
  }
  const first = researchEvents(
    new Request('http://127.0.0.1/events', { signal: controller.signal }),
    subscribe,
  )
  const firstReader = first.body?.getReader()
  expect.assert.isDefined(firstReader)
  await firstReader.read()
  controller.abort()
  expect(unsubscribe).toHaveBeenCalledOnce()
  expect((await firstReader.read()).done).toBe(true)
  configured = true
  const second = researchEvents(
    new Request('http://127.0.0.1/events'),
    subscribe,
  )
  const reader = second.body?.getReader()
  expect.assert.isDefined(reader)
  expect(new TextDecoder().decode((await reader.read()).value)).toContain(
    '"configured":true',
  )
  await reader.cancel()
})

it('bounds a slow viewer buffer while retaining the latest state', async () => {
  let emit = (_value: { configured: boolean; run: null }) => {}
  const response = researchEvents(
    new Request('http://127.0.0.1/events'),
    (listener) => {
      emit = listener
      listener({ configured: false, run: null })
      return () => {}
    },
  )
  for (let i = 0; i < 1000; i++) emit({ configured: false, run: null })
  emit({ configured: true, run: null })
  const reader = response.body?.getReader()
  expect.assert.isDefined(reader)
  await reader.read()
  expect(new TextDecoder().decode((await reader.read()).value)).toContain(
    '"configured":true',
  )
  await reader.cancel()
})
