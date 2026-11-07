const { spawnSync } = require('node:child_process')
const { resolve } = require('node:path')
// node-pty 1.1 ships Windows N-API binaries. Validate them in Electron instead
// of unnecessarily requiring a full Visual C++/Spectre source build.
const executable = process.platform === 'win32' ? require('electron') : process.execPath
const args = process.platform === 'win32'
  ? ['-e', "require('node-pty'); console.log('Windows node-pty loaded in Electron')"]
  : [resolve('node_modules/@electron/rebuild/lib/cli.js'), '-f', '-w', 'node-pty']
const result = spawnSync(executable, args, { stdio: 'inherit', windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
if (result.error) console.error(result.error.message)
process.exitCode = result.status ?? 1
