import { spawn } from 'node:child_process';
import path from 'node:path';
import { createServer } from 'vite';

async function start() {
  console.log('[dev] Starting Vite dev server...');
  const server = await createServer();
  await server.listen(5199);
  const serverUrl = 'http://localhost:5199';
  console.log(`[dev] Vite listening at ${serverUrl}`);

  console.log('[dev] Building Electron main & preload...');
  const tsc = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '-p', 'electron/tsconfig.json'], {
    stdio: 'inherit',
    shell: true,
  });

  tsc.on('close', (code) => {
    if (code !== 0) {
      console.error('[dev] Failed to compile Electron TypeScript files.');
      process.exit(1);
    }

    console.log('[dev] Launching Electron...');
    const electronBinary = path.resolve('node_modules/electron/dist/electron.exe');
    const electronProcess = spawn(
      electronBinary,
      ['.'],
      {
        env: { ...process.env, VITE_DEV_SERVER_URL: serverUrl },
        stdio: 'inherit',
      },
    );

    electronProcess.on('close', () => {
      console.log('[dev] Electron closed. Shutting down Vite server...');
      server.close();
      process.exit(0);
    });
  });
}

start().catch(console.error);
