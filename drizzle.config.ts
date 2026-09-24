import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/features/storage/schema.ts',
  out: './drizzle',
})
