const { execSync } = require('child_process');
try {
  const output = execSync('pnpm run build', { cwd: './frontend/chat-app', encoding: 'utf8', stdio: 'pipe' });
  require('fs').writeFileSync('build-out.txt', output);
} catch (e) {
  require('fs').writeFileSync('build-out.txt', e.stdout + '\n' + e.stderr);
}
