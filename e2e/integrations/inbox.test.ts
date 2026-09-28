import { expect, test } from '../fixtures'

test('selects articles and keeps the reader focused on their content', async ({
  page,
}) => {
  await page.goto('/inbox')
  await page.waitForLoadState('networkidle')
  const rows = page.locator('.inbox-article-row')
  await expect(rows).toHaveCount(9)
  const articleTitle = 'Context for an agent can be brief'
  await rows.filter({ hasText: articleTitle }).click()
  const reader = page.getByRole('article', { name: articleTitle, exact: true })
  await expect(reader).toBeVisible()
  await expect(
    reader.getByRole('heading', { name: articleTitle, exact: true }),
  ).toBeVisible()
  await expect(
    reader.getByText(
      'Start with a one-sentence goal, then add the constraints that must hold.',
      { exact: false },
    ),
  ).toBeVisible()
  await expect(page.getByText('FOR YOU', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Mock', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Why this article', { exact: true })).toHaveCount(
    0,
  )
  await expect(
    page.getByRole('button', { name: /For you|Read later|Unread only/ }),
  ).toHaveCount(0)
  const back = page.getByRole('button', { name: 'Back to articles' })
  if (await back.isVisible()) await back.click()
  await rows
    .filter({ hasText: 'Three columns create a rhythm for reading' })
    .click()
  await expect(
    page.getByRole('article', {
      name: 'Three columns create a rhythm for reading',
      exact: true,
    }),
  ).toBeVisible()
})

test('recovers from empty search and shares navigation with Research', async ({
  page,
  a11y,
}) => {
  await page.goto('/inbox')
  await page.waitForLoadState('networkidle')
  const rows = page.locator('.inbox-article-row')
  await page
    .getByRole('textbox', { name: 'Search articles' })
    .fill('nonexistent-query-xyz')
  await expect(rows).toHaveCount(0)
  await expect(
    page.getByText('No articles found', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(rows).toHaveCount(9)
  expect((await a11y().analyze()).violations).toEqual([])
  await expect(
    page.getByRole('button', { name: 'Edit interests', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('link', { name: 'Research', exact: true }).click()
  await expect(page).toHaveURL(/\/deck$/)
  await page.getByRole('link', { name: 'Reader', exact: true }).click()
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
      page.getByRole('textbox', { name: 'Search articles' }),
    ).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    await page.locator('.inbox-article-row').first().click()
    const reader = page.getByRole('article', {
      name: 'Thinking in the browser: a new workflow with AI agents',
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
    const back = page.getByRole('button', { name: 'Back to articles' })
    if (await back.isVisible()) await back.click()
  }
})
