import { expect, test } from '../fixtures'

test('selects articles and keeps the reader focused on their content', async ({
  page,
}) => {
  await page.goto('/inbox')
  await page.waitForLoadState('networkidle')
  const rows = page.locator('.inbox-article-row')
  await expect(rows).toHaveCount(9)
  const articleTitle = 'エージェントに渡す文脈は、短くてもよい'
  await rows.filter({ hasText: articleTitle }).click()
  const reader = page.getByRole('article', { name: articleTitle, exact: true })
  await expect(reader).toBeVisible()
  await expect(
    reader.getByRole('heading', { name: articleTitle, exact: true }),
  ).toBeVisible()
  await expect(
    reader.getByText(
      'まず目的を一文で書き、次に変えてはいけない条件を添える。',
      { exact: false },
    ),
  ).toBeVisible()
  await expect(page.getByText('FOR YOU', { exact: true })).toHaveCount(0)
  await expect(page.getByText('モック', { exact: true })).toHaveCount(0)
  await expect(
    page.getByText('この記事が届いた理由', { exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /あなたへ|あとで読む|未読のみ/ }),
  ).toHaveCount(0)
  const back = page.getByRole('button', { name: '記事一覧に戻る' })
  if (await back.isVisible()) await back.click()
  await rows
    .filter({ hasText: '3カラムの余白が、情報を読むリズムをつくる' })
    .click()
  await expect(
    page.getByRole('article', {
      name: '3カラムの余白が、情報を読むリズムをつくる',
      exact: true,
    }),
  ).toBeVisible()
})

test('recovers from empty search and shares navigation with Twitter Lite', async ({
  page,
  a11y,
}) => {
  await page.goto('/inbox')
  await page.waitForLoadState('networkidle')
  const rows = page.locator('.inbox-article-row')
  await page
    .getByRole('textbox', { name: '記事を検索' })
    .fill('存在しない検索語xyz')
  await expect(rows).toHaveCount(0)
  await expect(
    page.getByText('記事がありません', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '検索をクリア' }).click()
  await expect(rows).toHaveCount(9)
  expect((await a11y().analyze()).violations).toEqual([])
  await expect(
    page.getByRole('button', { name: '興味を編集', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('link', { name: 'Twitter Lite', exact: true }).click()
  await expect(page).toHaveURL(/\/deck$/)
  await page.getByRole('link', { name: 'リーダー', exact: true }).click()
  await expect(page).toHaveURL(/\/inbox$/)
  await expect(rows).toHaveCount(9)
})

test('keeps article navigation readable without horizontal overflow', async ({
  page,
  a11y,
}, testInfo) => {
  await page.goto('/inbox')
  await page.waitForLoadState('networkidle')
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 850 })
    await expect(
      page.getByRole('textbox', { name: '記事を検索' }),
    ).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    await page.locator('.inbox-article-row').first().click()
    const reader = page.getByRole('article', {
      name: 'ブラウザを見ながら考える。AIエージェントとの新しい開発の進め方',
      exact: true,
    })
    await expect(reader).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    await page.screenshot({
      path: testInfo.outputPath(`inbox-reader-${width}.png`),
    })
    if (width === 320) expect((await a11y().analyze()).violations).toEqual([])
    const back = page.getByRole('button', { name: '記事一覧に戻る' })
    if (await back.isVisible()) await back.click()
  }
})
