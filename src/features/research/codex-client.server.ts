const TIMEOUT_MS = 60_000
type Pending = {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/** One connection to a separately managed local Codex app-server. */
export class CodexClient {
  private socket?: WebSocket
  private connection?: Promise<void>
  private closed = false
  private nextId = 0
  private pending = new Map<number, Pending>()
  private rejectOpen?: (error: Error) => void

  constructor(
    private readonly url: string,
    private readonly onNotification: (method: string, params: unknown) => void,
    private readonly onToolCall: (params: unknown) => Promise<unknown>,
    private readonly onDisconnect?: (error: Error) => void,
  ) {
    const endpoint = new URL(url)
    if (
      endpoint.protocol !== 'ws:' ||
      !['127.0.0.1', '[::1]'].includes(endpoint.hostname) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.hash
    )
      throw new Error('Codex requires a loopback WebSocket URL.')
  }

  connect(): Promise<void> {
    this.connection ??= this.open()
    return this.connection
  }

  private async open() {
    if (this.closed) throw new Error('Codex connection is closed.')
    const socket = new WebSocket(this.url)
    this.socket = socket
    socket.addEventListener('message', (event) => this.receive(event.data))
    socket.addEventListener('close', () =>
      this.disconnect(new Error('Codex connection closed unexpectedly.')),
    )
    socket.addEventListener('error', () =>
      this.disconnect(new Error('Could not connect to Codex app-server.')),
    )
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.disconnect(new Error('Codex connection timed out.'))
      }, TIMEOUT_MS)
      this.rejectOpen = (error) => {
        clearTimeout(timer)
        reject(error)
      }
      socket.addEventListener(
        'open',
        () => {
          clearTimeout(timer)
          this.rejectOpen = undefined
          resolve()
        },
        { once: true },
      )
    })
    try {
      await this.request('initialize', {
        clientInfo: { name: 'twitter_lite', version: '0.1.0' },
        capabilities: { experimentalApi: true },
      })
      this.send({ method: 'initialized', params: {} })
    } catch (error) {
      this.disconnect(
        error instanceof Error
          ? error
          : new Error('Codex initialization failed.'),
      )
      throw error
    }
  }

  request<T = unknown>(method: string, params: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = ++this.nextId
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Codex request timed out: ${method}`))
      }, TIMEOUT_MS)
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      })
      try {
        this.send({ id, method, params })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  close(): void {
    this.disconnect(new Error('Codex connection was closed.'), false)
  }

  private disconnect(error: Error, notify = true) {
    if (this.closed) return
    this.closed = true
    this.rejectOpen?.(error)
    this.rejectOpen = undefined
    for (const request of this.pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    this.pending.clear()
    this.socket?.close()
    if (notify) this.onDisconnect?.(error)
  }

  private send(message: unknown) {
    if (this.closed || this.socket?.readyState !== WebSocket.OPEN)
      throw new Error('Codex connection is not open.')
    this.socket.send(JSON.stringify(message))
  }

  private receive(data: unknown) {
    try {
      if (typeof data !== 'string') throw new Error('Expected a text frame.')
      const message: unknown = JSON.parse(data)
      if (!message || typeof message !== 'object' || Array.isArray(message))
        throw new Error('Expected a JSON-RPC message.')
      const value = message as Record<string, unknown>
      if (typeof value.method === 'string') {
        if (typeof value.id === 'number' || typeof value.id === 'string') {
          void this.respond(value.id, value.method, value.params)
        } else {
          this.onNotification(value.method, value.params)
        }
      } else if (typeof value.id === 'number') {
        const pending = this.pending.get(value.id)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pending.delete(value.id)
        if ('error' in value) {
          pending.reject(new Error('Codex rejected the request.'))
        } else {
          pending.resolve(value.result)
        }
      }
    } catch {
      this.disconnect(new Error('Invalid Codex app-server message.'))
    }
  }

  private async respond(id: number | string, method: string, params: unknown) {
    let response: unknown
    if (method === 'item/tool/call') {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const result = await Promise.race([
          this.onToolCall(params),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Tool timed out.')),
              TIMEOUT_MS,
            )
          }),
        ])
        response = { id, result }
      } catch {
        response = {
          id,
          result: {
            contentItems: [
              {
                type: 'inputText',
                text: 'The research tool failed or timed out.',
              },
            ],
            success: false,
          },
        }
      } finally {
        clearTimeout(timer)
      }
    } else if (
      method === 'item/commandExecution/requestApproval' ||
      method === 'item/fileChange/requestApproval'
    ) {
      response = { id, result: { decision: 'decline' } }
    } else if (method === 'item/permissions/requestApproval') {
      response = { id, result: { permissions: {}, scope: 'turn' } }
    } else {
      response = {
        id,
        error: { code: -32601, message: 'Unsupported server request.' },
      }
    }
    if (!this.closed) {
      try {
        this.send(response)
      } catch {
        this.disconnect(new Error('Could not respond to Codex app-server.'))
      }
    }
  }
}
