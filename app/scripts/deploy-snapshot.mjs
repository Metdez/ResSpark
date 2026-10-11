// Deploys the last COMMIT, not the working tree: parallel executors keep uncommitted
// work in the shared checkout, and `pnpm run deploy` would ship it half-done.
// Run through `pnpm -C app run deploy:snapshot` so dotenv supplies the Cloudflare
// token and VITE_* values; this script never reads env files itself.
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', '..')
const dir = join(root, '.claude', 'worktrees', 'deploy-snapshot')
const win = process.platform === 'win32'

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: win })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`)
}

function remove() {
  spawnSync('git', ['worktree', 'remove', '--force', dir], { cwd: root, stdio: 'ignore' })
  // rmdir /s /q does not follow pnpm's node_modules junctions into the shared store.
  if (existsSync(dir)) {
    if (win) spawnSync('cmd', ['/c', 'rmdir', '/s', '/q', dir], { stdio: 'ignore' })
    else rmSync(dir, { recursive: true, force: true })
  }
  spawnSync('git', ['worktree', 'prune'], { cwd: root, stdio: 'ignore' })
}

const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()
console.log(`deploy:snapshot of commit ${head}`)
remove()
try {
  run('git', ['worktree', 'add', '--detach', dir, 'HEAD'], root)
  run('pnpm', ['install', '--frozen-lockfile'], dir)
  run('pnpm', ['exec', 'tsc', '-b'], join(dir, 'app'))
  run('pnpm', ['run', 'deploy:raw'], join(dir, 'app'))
  console.log(`deployed commit ${head}`)
} finally {
  remove()
}
