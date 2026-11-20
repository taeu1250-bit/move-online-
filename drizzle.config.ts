import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  dialect: 'sqlite',
  schema: './db/*.ts',
  out: './drizzle',
})
