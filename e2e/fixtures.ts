import AxeBuilder from '@axe-core/playwright'
import { test as base } from '@playwright/test'

export const test = base.extend<{ a11y: () => AxeBuilder }>({
  a11y: async ({ page }, use) => {
    await use(() =>
      new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .disableRules(['meta-viewport']),
    )
  },
})

export { expect } from '@playwright/test'
