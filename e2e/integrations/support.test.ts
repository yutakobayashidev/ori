import { expect, test } from '../fixtures'

const reviewSubject = '来週のレビュー、日程を決める'
const coffeeSubject = '久しぶりに、お茶でも'

test('reviews an edited reply and keeps the simulated result in history', async ({
  page,
  a11y,
}) => {
  await page.goto('/support')
  await page.waitForLoadState('networkidle')
  const rows = page.locator('.support-row')
  await expect(rows).toHaveCount(3)
  await rows.filter({ hasText: reviewSubject }).click()
  await page.getByRole('button', { name: '丁寧に', exact: true }).click()
  const reply = page.getByRole('textbox', { name: '返信', exact: true })
  await expect(reply).toHaveValue(/資料をご共有/)
  const edited = '資料を確認しました。初回の導線について当日お話しします。'
  await reply.fill(edited)
  const slot = '10月5日（月）14:00–14:30'
  await page.getByRole('combobox', { name: '日程候補' }).selectOption(slot)
  await page.getByRole('button', { name: '返信に入れる' }).click()
  await expect(reply).toHaveValue(`${edited}\n\n${slot}はいかがでしょうか。`)
  await page.getByRole('button', { name: '送信内容を確認' }).click()
  const dialog = page.getByRole('dialog', { name: '送信内容の確認' })
  await expect(dialog).toContainText(edited)
  await expect(dialog).toContainText(slot)
  await expect(dialog).toContainText('外部には送信されません')
  expect((await a11y().analyze()).violations).toEqual([])
  await dialog.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(reply).toHaveValue(new RegExp(edited))
  await page.getByRole('button', { name: '送信内容を確認' }).click()
  await dialog.getByRole('button', { name: '送信を試す' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(rows.filter({ hasText: reviewSubject })).toHaveCount(0)
  await page.getByRole('button', { name: '履歴', exact: true }).click()
  await rows.filter({ hasText: reviewSubject }).click()
  await expect(page.locator('.support-outcome')).toContainText(edited)
  await expect(page.locator('.support-outcome')).toContainText(slot)
})

test('defers a conversation and restores it to the current queue', async ({
  page,
}) => {
  await page.goto('/support')
  await page.waitForLoadState('networkidle')
  const rows = page.locator('.support-row')
  await rows.filter({ hasText: coffeeSubject }).click()
  await page
    .getByRole('textbox', { name: '返信', exact: true })
    .fill('土曜の予定を確認してから返事するね。')
  await page.getByRole('button', { name: '今は置いておく' }).click()
  await expect(rows.filter({ hasText: coffeeSubject })).toHaveCount(0)
  await page.getByRole('button', { name: 'あとで', exact: true }).click()
  await rows.filter({ hasText: coffeeSubject }).click()
  await expect(
    page.getByRole('textbox', { name: '返信', exact: true }),
  ).toHaveValue('土曜の予定を確認してから返事するね。')
  await page.getByRole('button', { name: '今に戻す' }).click()
  const back = page.getByRole('button', { name: '連絡一覧に戻る' })
  if (await back.isVisible()) await back.click()
  await expect(rows.filter({ hasText: coffeeSubject })).toBeVisible()
  await expect(
    page.getByRole('button', { name: '今', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('keeps corrections as new records and summarizes only selected current facts', async ({
  page,
  a11y,
}) => {
  await page.goto('/journal')
  await page.waitForLoadState('networkidle')
  await expect(
    page.getByRole('button', { name: '記録する', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('textbox', { name: '記録内容' })
    .fill('次はレビュー資料の導線を確認する')
  await page.getByRole('button', { name: '記録する', exact: true }).click()
  await expect(page.getByRole('article', { name: 'メモの記録' })).toContainText(
    '発生日時: 不明',
  )
  await page.getByRole('button', { name: '体重', exact: true }).click()
  await page.getByRole('spinbutton', { name: '体重', exact: true }).fill('65.2')
  await page.getByRole('textbox', { name: '記録元' }).fill('自宅の体重計')
  await page.getByRole('button', { name: '記録する', exact: true }).click()
  await page
    .getByRole('article', { name: '体重の記録' })
    .getByRole('button', { name: '訂正する' })
    .click()
  const correction = page.getByRole('dialog', { name: '記録を訂正' })
  await correction
    .getByRole('spinbutton', { name: '体重', exact: true })
    .fill('65.8')
  await correction.getByRole('button', { name: '訂正を追加' }).click()
  const weights = page.getByRole('article', { name: '体重の記録' })
  await expect(weights).toHaveCount(2)
  await expect(weights.filter({ hasText: '65.2 kg' })).toContainText('訂正前')
  await expect(weights.filter({ hasText: '65.8 kg' })).toContainText('訂正')
  await page
    .getByRole('button', { name: '記録をまとめる', exact: true })
    .click()
  const review = page.getByRole('dialog', { name: '記録をまとめる' })
  const summary = review.getByRole('textbox', { name: '記録のまとめ' })
  await expect(summary).toHaveValue(/65.8 kg/)
  await expect(summary).not.toHaveValue(/65.2 kg/)
  await expect(summary).toHaveValue(/記録元: 自宅の体重計/)
  await expect(summary).toHaveValue(/発生日時が不明の記録: 2件/)
  await review.getByRole('checkbox', { name: /次はレビュー資料/ }).uncheck()
  await expect(summary).not.toHaveValue(/次はレビュー資料/)
  await expect(summary).toHaveValue(/記録のない期間の服薬・体重は不明/)
  expect((await a11y().analyze()).violations).toEqual([])
})

test('fits communication and journal interactions in narrow screens', async ({
  page,
  a11y,
}) => {
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/support')
    await page.waitForLoadState('networkidle')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    await page.locator('.support-row').first().click()
    await expect(
      page.getByRole('textbox', { name: '返信', exact: true }),
    ).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    if (width === 320) expect((await a11y().analyze()).violations).toEqual([])
    const back = page.getByRole('button', { name: '連絡一覧に戻る' })
    if (await back.isVisible()) await back.click()
    await page.getByRole('link', { name: '記録', exact: true }).click()
    await page.getByRole('button', { name: '体重', exact: true }).click()
    await expect(
      page.getByRole('spinbutton', { name: '体重', exact: true }),
    ).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    if (width === 320) expect((await a11y().analyze()).violations).toEqual([])
  }
})
