const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

function brandElectronForWindows() {
  if (process.platform !== 'win32') {
    return;
  }

  const root = path.join(__dirname, '..');
  const rceditPath = path.join(root, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe');
  const iconCandidates = [
    path.join(root, 'build-resources', 'app-icon.ico'),
    path.join(root, 'release', '.icon-ico', 'icon.ico'),
  ];
  const iconPath = iconCandidates.find((candidate) => fs.existsSync(candidate));

  if (!fs.existsSync(rceditPath) || !fs.existsSync(electronPath)) {
    return;
  }

  const args = [
    electronPath,
    '--set-version-string',
    'FileDescription',
    'Time Assistant',
    '--set-version-string',
    'ProductName',
    'Time Assistant',
    '--set-version-string',
    'InternalName',
    'time-assistant',
    '--set-version-string',
    'OriginalFilename',
    'time-assistant.exe',
  ];

  spawnSync(rceditPath, args, { stdio: 'ignore' });

  if (iconPath) {
    spawnSync(rceditPath, [electronPath, '--set-icon', iconPath], { stdio: 'ignore' });
  }
}

brandElectronForWindows();

const child = spawn(electronPath, ['.', ...process.argv.slice(2)], {
  env,
  stdio: 'inherit',
  windowsHide: false,
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
