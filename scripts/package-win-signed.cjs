const { spawn } = require('node:child_process');

const certLink = process.env.WIN_CSC_LINK ?? process.env.CSC_LINK;
const certPassword = process.env.WIN_CSC_KEY_PASSWORD ?? process.env.CSC_KEY_PASSWORD;

if (!certLink || !certPassword) {
  console.error(
    [
      'Windows code-signing environment variables are missing.',
      'Set WIN_CSC_LINK (or CSC_LINK) to a base64-encoded .pfx certificate,',
      'and WIN_CSC_KEY_PASSWORD (or CSC_KEY_PASSWORD) to the certificate password.',
    ].join('\n'),
  );
  process.exit(1);
}

const builderCommand = process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder';
const child = spawn(
  builderCommand,
  ['--win', 'portable', '--config', 'forceCodeSigning=true'],
  {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
