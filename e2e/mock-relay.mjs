import { createServer } from 'node:http'

const portValue = process.env.TWITTER_LITE_MOCK_RELAY_PORT
const port = Number(portValue)

if (!portValue || !Number.isInteger(port) || port < 1) {
  throw new Error('TWITTER_LITE_MOCK_RELAY_PORT must be a valid port')
}

const failedRetryQueries = new Set()
const rootByTarget = new Map([
  ['1001', '1000'],
  ['2001', '2000'],
])
const targetByRoot = new Map([
  ['1000', '1001'],
  ['2000', '2001'],
])
const failedThreadRoots = new Set()

const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const tweetResult = (
  id,
  text,
  username = 'yuta',
  { conversationId = id, inReplyTo } = {},
) => ({
  rest_id: id,
  legacy: {
    full_text: text,
    created_at: 'Mon Jul 13 00:00:00 +0000 2026',
    reply_count: 1,
    retweet_count: 2,
    favorite_count: 3,
    conversation_id_str: conversationId,
    ...(inReplyTo ? { in_reply_to_status_id_str: inReplyTo } : {}),
  },
  core: {
    user_results: {
      result: {
        rest_id: '42',
        legacy: { screen_name: username, name: 'Yuta' },
      },
    },
  },
})

const tweet = (id, text, username = 'yuta', options) => ({
  entryId: `tweet-${id}`,
  content: {
    itemContent: {
      tweet_results: {
        result: tweetResult(id, text, username, options),
      },
    },
  },
})

const cursor = (value) => ({
  entryId: 'cursor-bottom',
  content: { cursorType: 'Bottom', value },
})

const send = (response, payload, status = 200, headers = {}) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  })
  response.end(JSON.stringify(payload))
}

const fail = (response, status, message, headers) =>
  send(response, { errors: [{ message }] }, status, headers)

const variablesFrom = (url) => {
  const encoded = url.searchParams.get('variables')
  if (!encoded) throw new Error('variables are required')
  const variables = JSON.parse(encoded)
  if (!isRecord(variables)) throw new Error('variables must be an object')
  return variables
}

const jsonBodyFrom = async (request) => {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > 1_000_000) throw new Error('request body is too large')
  }
  const parsed = JSON.parse(body)
  if (!isRecord(parsed)) throw new Error('JSON body must be an object')
  return parsed
}

const timeline = (entries) => ({ instructions: [{ entries }] })

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)
  const operation = [
    'UserByScreenName',
    'UserTweets',
    'TweetDetail',
    'SearchTimeline',
    'ListsManagementPageTimeline',
    'ListLatestTweetsTimeline',
  ].find((name) => url.pathname.endsWith(`/${name}`))

  if (!operation) {
    fail(response, 501, 'unsupported read operation')
    return
  }

  const expectedMethod = operation === 'SearchTimeline' ? 'POST' : 'GET'
  if (request.method !== expectedMethod) {
    fail(response, 405, `expected ${expectedMethod}`, {
      allow: expectedMethod,
    })
    return
  }
  if (request.headers['x-profile-name'] !== 'e2e') {
    fail(response, 403, 'invalid profile')
    return
  }

  let variables
  try {
    variables = variablesFrom(url)
  } catch {
    fail(response, 400, 'malformed variables')
    return
  }

  if (operation === 'UserByScreenName') {
    if (
      typeof variables.screen_name !== 'string' ||
      variables.screen_name.length === 0
    ) {
      fail(response, 400, 'screen_name is required')
      return
    }
    send(response, {
      data: {
        user: {
          result: {
            rest_id: '42',
            legacy: { screen_name: variables.screen_name, name: 'Yuta' },
          },
        },
      },
    })
    return
  }

  if (operation === 'UserTweets') {
    const expectedCursor =
      variables.cursor === undefined || variables.cursor === 'user-next'
    if (
      variables.userId !== '42' ||
      variables.count !== 20 ||
      !expectedCursor
    ) {
      fail(response, 400, 'invalid user timeline variables')
      return
    }
    const secondPage = variables.cursor === 'user-next'
    const entries = secondPage
      ? [tweet('1010', 'user page 2')]
      : [
          tweet('1001', 'user page 1', 'yuta', {
            conversationId: '1000',
          }),
          cursor('user-next'),
        ]
    send(response, {
      data: {
        user: { result: { timeline: { timeline: timeline(entries) } } },
      },
    })
    return
  }

  if (operation === 'ListsManagementPageTimeline') {
    if (variables.count !== 100) {
      fail(response, 400, 'invalid lists management variables')
      return
    }
    const features = url.searchParams.get('features')
    try {
      if (!features || !isRecord(JSON.parse(features))) throw new Error()
    } catch {
      fail(response, 400, 'invalid lists management feature lock')
      return
    }
    send(response, {
      data: {
        viewer: {
          list_management_timeline: {
            timeline: {
              instructions: [
                {
                  entries: [
                    {
                      content: {
                        clientEventInfo: {
                          component: 'suggest_owned_subscribed_list',
                        },
                        items: [
                          {
                            item: {
                              itemContent: {
                                list: {
                                  id_str: '1234567890',
                                  name: 'My E2E List',
                                  description: 'Accounts selected for testing',
                                  member_count: 10,
                                  mode: 'Public',
                                  created_at: 1_704_067_200_000,
                                  user_results: {
                                    result: {
                                      rest_id: '42',
                                      core: {
                                        screen_name: 'yuta',
                                        name: 'Yuta',
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      },
      errors: [{ message: 'optional banner field failed' }],
    })
    return
  }

  if (operation === 'ListLatestTweetsTimeline') {
    const expectedCursor =
      variables.cursor === undefined || variables.cursor === 'list-next'
    if (
      typeof variables.listId !== 'string' ||
      !/^\d+$/.test(variables.listId) ||
      variables.count !== 20 ||
      !expectedCursor
    ) {
      fail(response, 400, 'invalid list timeline variables')
      return
    }
    const secondPage = variables.cursor === 'list-next'
    const entries = secondPage
      ? [tweet('3010', 'list page 2', 'listed')]
      : [tweet('3001', 'list page 1', 'listed'), cursor('list-next')]
    send(response, {
      data: {
        list: { tweets_timeline: { timeline: timeline(entries) } },
      },
    })
    return
  }

  if (operation === 'TweetDetail') {
    const focalTweetId = variables.focalTweetId
    if (typeof focalTweetId !== 'string' || !/^\d+$/.test(focalTweetId)) {
      fail(response, 400, 'invalid focalTweetId')
      return
    }
    const features = url.searchParams.get('features')
    const fieldToggles = url.searchParams.get('fieldToggles')
    try {
      if (!features || !isRecord(JSON.parse(features))) throw new Error()
      if (!fieldToggles || !isRecord(JSON.parse(fieldToggles))) {
        throw new Error()
      }
    } catch {
      fail(response, 400, 'invalid TweetDetail feature locks')
      return
    }

    const targetRoot = rootByTarget.get(focalTweetId)
    if (targetRoot && variables.cursor === undefined) {
      const text = focalTweetId === '1001' ? 'user page 1' : 'retry focal'
      const result = tweetResult(focalTweetId, text, 'focus', {
        conversationId: targetRoot,
        inReplyTo: targetRoot,
      })
      send(response, {
        data: {
          tweetResult: { result },
          threaded_conversation_with_injections_v2: {
            instructions: [
              {
                entries: [
                  tweet(focalTweetId, text, 'focus', {
                    conversationId: targetRoot,
                    inReplyTo: targetRoot,
                  }),
                ],
              },
            ],
          },
        },
      })
      return
    }

    const targetId = targetByRoot.get(focalTweetId)
    if (!targetId) {
      fail(response, 400, 'unsupported TweetDetail fixture')
      return
    }
    const expectedCursor = `thread-next:${focalTweetId}`
    if (variables.cursor !== undefined && variables.cursor !== expectedCursor) {
      fail(response, 400, 'invalid thread cursor')
      return
    }
    if (
      variables.cursor &&
      focalTweetId === '2000' &&
      !failedThreadRoots.has(focalTweetId)
    ) {
      failedThreadRoots.add(focalTweetId)
      fail(response, 503, 'transient thread fixture failure')
      return
    }

    const entries = variables.cursor
      ? [
          tweet(`${focalTweetId}3`, 'thread page 2', 'reply2', {
            conversationId: focalTweetId,
            inReplyTo: targetId,
          }),
        ]
      : [
          tweet(focalTweetId, 'thread root', 'root', {
            conversationId: focalTweetId,
          }),
          tweet(
            targetId,
            focalTweetId === '1000' ? 'user page 1' : 'retry focal',
            'focus',
            {
              conversationId: focalTweetId,
              inReplyTo: focalTweetId,
            },
          ),
          tweet(`${focalTweetId}2`, 'thread page 1', 'reply1', {
            conversationId: focalTweetId,
            inReplyTo: targetId,
          }),
          cursor(expectedCursor),
        ]
    send(response, {
      data: {
        tweetResult: {
          result: tweetResult(focalTweetId, 'thread root', 'root', {
            conversationId: focalTweetId,
          }),
        },
        threaded_conversation_with_injections_v2: {
          instructions: [{ entries }],
        },
      },
    })
    if (variables.cursor && focalTweetId === '2000') {
      failedThreadRoots.delete(focalTweetId)
    }
    return
  }

  const contentType = request.headers['content-type'] ?? ''
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    fail(response, 400, 'SearchTimeline requires JSON')
    return
  }

  let body
  try {
    body = await jsonBodyFrom(request)
  } catch {
    fail(response, 400, 'malformed JSON body')
    return
  }

  const rawQuery = variables.rawQuery
  const expectedCursor =
    variables.cursor === undefined ||
    variables.cursor === `search-next:${rawQuery}`
  if (
    typeof rawQuery !== 'string' ||
    rawQuery.length === 0 ||
    variables.count !== 20 ||
    variables.querySource !== 'typed_query' ||
    !['Top', 'Latest'].includes(variables.product) ||
    !expectedCursor ||
    !isRecord(body.features) ||
    typeof body.queryId !== 'string' ||
    body.queryId.length === 0 ||
    Object.hasOwn(body, 'variables')
  ) {
    fail(response, 400, 'invalid search request')
    return
  }

  const secondPage = variables.cursor !== undefined
  if (
    secondPage &&
    rawQuery.startsWith('retry-') &&
    !failedRetryQueries.has(rawQuery)
  ) {
    failedRetryQueries.add(rawQuery)
    fail(response, 503, 'transient fixture failure')
    return
  }
  if (secondPage && rawQuery.startsWith('slow-')) {
    await new Promise((resolve) => setTimeout(resolve, 1_200))
  }

  const follows = rawQuery.includes('filter:follows') ? 'follows' : 'all'
  const label = `${variables.product} · ${follows}`
  const id = encodeURIComponent(rawQuery)
  const entries = secondPage
    ? [tweet(`s-${id}-2`, `${label} page 2`)]
    : [tweet(`s-${id}-1`, `${label} page 1`), cursor(`search-next:${rawQuery}`)]

  send(response, {
    data: {
      search_by_raw_query: {
        search_timeline: { timeline: timeline(entries) },
      },
    },
  })
})

server.listen(port, '127.0.0.1')
