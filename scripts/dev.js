// Unset ELECTRON_RUN_AS_NODE so Electron starts as a real app, not Node.js.
// cross-env sets it to "" which is still truthy on some platforms.
delete process.env.ELECTRON_RUN_AS_NODE;

const { execSync } = require('child_process');
execSync('npx electron-vite dev', { stdio: 'inherit', env: process.env });
