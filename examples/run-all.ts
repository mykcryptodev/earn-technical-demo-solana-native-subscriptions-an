/**
 * Run all examples sequentially. Each example is self-contained and uses
 * fresh keypairs, so they can also be run individually via npm scripts.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const examples = [
  '01-init-subscription-authority.ts',
  '02-fixed-delegation-allowance.ts',
  '03-recurring-delegation.ts',
  '04-subscription-plan.ts',
  '05-multi-delegation-demo.ts',
];

function runExample(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', path.join(__dirname, file)], {
      stdio: 'inherit',
      shell: true,
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function main() {
  console.log('Running all Solana Subscriptions examples on devnet...\n');

  for (const file of examples) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running ${file}`);
    console.log('='.repeat(60));

    const code = await runExample(file);
    if (code !== 0) {
      console.error(`\nExample ${file} failed with exit code ${code}`);
      process.exit(code);
    }
  }

  console.log('\nAll examples completed successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
