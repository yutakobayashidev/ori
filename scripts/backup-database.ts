import { backupDatabase } from '../src/features/storage/backup.server'

const source = process.env.TWITTER_LITE_DB_PATH
const destination = process.argv[2]
if (!source || !destination || process.argv.length !== 3) {
  console.error(
    'Usage: TWITTER_LITE_DB_PATH=/absolute/app.db pnpm db:backup /absolute/backup.db',
  )
  process.exitCode = 1
} else {
  await backupDatabase(source, destination)
  console.log(`Backup verified: ${destination}`)
}
