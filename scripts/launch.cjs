// npm scripts must also work from PowerShell/CMD and when launched by Electron hosts.
const { spawn } = require('node:child_process')
const { resolve } = require('node:path')
const [mode, ...args] = process.argv.slice(2)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const executable = mode === 'electron' ? require('electron') : process.execPath
const command = mode === 'electron' ? args : [resolve('node_modules/electron-vite/bin/electron-vite.js'), mode, ...args]
const child = spawn(executable, command, { stdio: 'inherit', env, windowsHide: true })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
