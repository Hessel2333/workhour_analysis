import { spawn } from 'node:child_process';

const children = [];

function start(name, command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      process.exitCode = code;
    }
  });

  children.push(child);
}

start('api', process.execPath, ['--env-file=.env', 'server/index.mjs']);
start('client', process.execPath, ['./node_modules/vite/bin/vite.js', '--host', '0.0.0.0']);

function shutdown(signal) {
  children.forEach((child) => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
