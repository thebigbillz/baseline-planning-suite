// Development runner: both services and all three dev servers, one command.
//   npm run dev   →  shell http://localhost:8080 · people :8081 · delivery :8082
import { spawn } from 'node:child_process';

const processes = [
  ['people-api', 'npm', ['run', 'start', '-w', '@baseline/people-api']],
  ['delivery-api', 'npm', ['run', 'start', '-w', '@baseline/delivery-api']],
  ['people', 'npm', ['run', 'dev', '-w', '@baseline/people']],
  ['delivery', 'npm', ['run', 'dev', '-w', '@baseline/delivery']],
  ['shell', 'npm', ['run', 'dev', '-w', '@baseline/shell']],
];

const children = processes.map(([name, command, args]) => {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = (chunk) => String(chunk).split('\n').filter(Boolean).forEach((line) => console.log(`[${name}] ${line}`));
  child.stdout.on('data', tag);
  child.stderr.on('data', tag);
  return child;
});

const stop = () => children.forEach((child) => child.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
