import { expect, test } from '../fixtures'

test('previews a natural-language memo and shares the executed record with journal', async ({
  page,
}) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const memo = '明日のレビューは導線から確認する'
  await page
    .getByRole('textbox', { name: 'ホームへの入力' })
    .fill(`メモ: ${memo}`)
  await page.getByRole('button', { name: '候補を表示' }).click()
  const execute = page.getByRole('button', { name: '実行する', exact: true })
  await expect(execute).toBeVisible()
  await execute.click()
  await page.getByRole('link', { name: '記録', exact: true }).first().click()
  await expect(page.getByRole('article', { name: 'メモの記録' })).toContainText(
    memo,
  )
  await page.getByRole('link', { name: 'ホーム', exact: true }).first().click()
  await expect(
    page.getByRole('textbox', { name: 'ホームへの入力' }),
  ).toBeVisible()
})

test('keeps the home usable on narrow screens', async ({
  page,
  a11y,
}, testInfo) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 850 })
    await expect(
      page.getByRole('textbox', { name: 'ホームへの入力' }),
    ).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`) })
    if (width === 320) expect((await a11y().analyze()).violations).toEqual([])
  }
})

test('adds tasks only after confirmation and can defer and restore them', async ({
  page,
}) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const input = page.getByRole('textbox', { name: 'ホームへの入力' })
  const complete = page.getByRole('button', {
    name: '買い物を完了',
    exact: true,
  })
  await input.fill('買い物を追加')
  await page.getByRole('button', { name: '候補を表示' }).click()
  await expect(complete).toHaveCount(0)
  await page.getByRole('button', { name: '実行する', exact: true }).click()
  await expect(complete).toBeVisible()
  await input.fill('買い物をあとで')
  await page.getByRole('button', { name: '候補を表示' }).click()
  await expect(complete).toBeVisible()
  await page.getByRole('button', { name: '実行する', exact: true }).click()
  await expect(complete).toHaveCount(0)
  await page.locator('.home-rest summary').click()
  await page.getByRole('button', { name: '買い物を戻す', exact: true }).click()
  await complete.click()
  await expect(complete).toHaveCount(0)
  await page.locator('.home-rest summary').click()
  await expect(
    page.getByRole('button', { name: '買い物を戻す', exact: true }),
  ).toBeVisible()
})

test('resolves communication within home and carries the status to the shared queue', async ({
  page,
  a11y,
}) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: '青木 遥との会話を開く' }).click()
  const dialog = page.getByRole('dialog', { name: '青木 遥との連絡' })
  await expect(
    dialog.getByRole('textbox', { name: '返信', exact: true }),
  ).toBeVisible()
  expect((await a11y().analyze()).violations).toEqual([])
  await dialog.getByRole('button', { name: '今は置いておく' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '青木 遥との会話を開く' }),
  ).toHaveCount(0)
  await page.getByRole('link', { name: '連絡', exact: true }).first().click()
  const rows = page.locator('.support-row')
  await expect(
    rows.filter({ hasText: '来週のレビュー、日程を決める' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'あとで', exact: true }).click()
  await rows.filter({ hasText: '来週のレビュー、日程を決める' }).click()
  await page.getByRole('button', { name: '今に戻す' }).click()
  const back = page.getByRole('button', { name: '連絡一覧に戻る' })
  if (await back.isVisible()) await back.click()
  await page.getByRole('link', { name: 'ホーム', exact: true }).first().click()
  await expect(
    page.getByRole('button', { name: '青木 遥との会話を開く' }),
  ).toBeVisible()
})

test('updates the prose brief as priorities change and opens the referenced conversation', async ({
  page,
}) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const brief = page.getByRole('region', { name: '今日のブリーフ' })
  await expect(brief).toContainText('レビュー資料を確認する')
  await expect(brief).toContainText('4件')
  await page
    .getByRole('button', { name: 'レビュー資料を確認するを完了', exact: true })
    .click()
  await expect(brief).not.toContainText('レビュー資料を確認する')
  await brief.getByRole('button', { name: '青木 遥さんへの返信' }).click()
  const dialog = page.getByRole('dialog', {
    name: '青木 遥との連絡',
    exact: true,
  })
  await dialog.getByRole('button', { name: '今は置いておく' }).click()
  await expect(brief).toContainText('3件')
  await expect(brief).not.toContainText('青木 遥')
  await page
    .getByRole('textbox', { name: 'ホームへの入力' })
    .fill('再開地点：資料の2ページ目から')
  await page.getByRole('button', { name: '候補を表示' }).click()
  await page.getByRole('button', { name: '実行する', exact: true }).click()
  await expect(brief).toContainText('資料の2ページ目から')
})
