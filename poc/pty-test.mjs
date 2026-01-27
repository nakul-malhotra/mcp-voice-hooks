/**
 * PTY Stdin Injection POC
 *
 * Tests whether we can spawn Claude Code in a PTY and inject
 * text into its stdin as if the user typed it.
 */

import pty from 'node-pty';
import { stripVTControlCharacters } from 'node:util';

const CLAUDE_BIN = process.env.CLAUDE_BIN || '/opt/homebrew/bin/claude';
const INJECT_DELAY_MS = 5000;
const EXIT_DELAY_MS = 30000;
const HARD_TIMEOUT_MS = 60000;

let buffer = '';
let cleanBuffer = '';
let injected = false;
let exitSent = false;
let claudeReady = false;

console.log('=== PTY Stdin Injection POC ===');
console.log(`Spawning: ${CLAUDE_BIN}`);
console.log(`Will inject "what is 2+2?" after detecting ready state (or ${INJECT_DELAY_MS}ms fallback)`);
console.log('');

const shell = pty.spawn(CLAUDE_BIN, ['--no-update-check'], {
  name: 'xterm-256color',
  cols: 120,
  rows: 30,
  cwd: process.cwd(),
  env: { ...process.env, TERM: 'xterm-256color' },
});

console.log(`[POC] Claude PID: ${shell.pid}`);

// Hard timeout to prevent hanging
const hardTimeout = setTimeout(() => {
  console.log('\n[POC] Hard timeout reached. Killing process.');
  shell.kill();
  process.exit(1);
}, HARD_TIMEOUT_MS);

shell.onData((data) => {
  buffer += data;
  const clean = stripVTControlCharacters(data);
  cleanBuffer += clean;
  process.stdout.write(data);

  // Detect when Claude is ready for input
  // Claude Code typically shows a prompt like ">" or waits for input
  if (!claudeReady && !injected) {
    // Look for common ready indicators in the clean text
    const readyPatterns = [
      />\s*$/,           // Simple prompt
      /\$\s*$/,          // Shell-style prompt
      /claude/i,         // Claude branding appeared
      /type.*message/i,  // "Type a message" prompt
      /ask.*anything/i,  // "Ask anything" prompt
    ];

    for (const pattern of readyPatterns) {
      if (pattern.test(cleanBuffer)) {
        claudeReady = true;
        console.log(`\n[POC] Detected ready state (matched: ${pattern})`);
        injectInput();
        break;
      }
    }
  }
});

function injectInput() {
  if (injected) return;
  injected = true;

  console.log('\n[POC] --- INJECTING: "what is 2+2?" ---\n');
  shell.write('what is 2+2?\r');

  // Schedule exit
  setTimeout(() => {
    if (!exitSent) {
      exitSent = true;
      console.log('\n[POC] --- INJECTING: "/exit" ---\n');
      shell.write('/exit\r');

      // If /exit doesn't work, try Ctrl+C then Ctrl+D
      setTimeout(() => {
        console.log('\n[POC] --- Sending Ctrl+C + Ctrl+D fallback ---\n');
        shell.write('\x03'); // Ctrl+C
        setTimeout(() => {
          shell.write('\x04'); // Ctrl+D
        }, 1000);
      }, 5000);
    }
  }, EXIT_DELAY_MS - INJECT_DELAY_MS);
}

// Fallback: inject after delay even if we didn't detect ready state
setTimeout(() => {
  if (!injected) {
    console.log('\n[POC] Fallback timer triggered (ready state not detected)');
    injectInput();
  }
}, INJECT_DELAY_MS);

shell.onExit(({ exitCode, signal }) => {
  clearTimeout(hardTimeout);
  console.log(`\n\n=== POC Results ===`);
  console.log(`Exit code: ${exitCode}, Signal: ${signal}`);
  console.log(`Total output captured: ${buffer.length} chars`);
  console.log(`Clean text length: ${cleanBuffer.length} chars`);
  console.log(`Ready state detected: ${claudeReady}`);
  console.log(`Input was injected: ${injected}`);

  // Check if we got a meaningful response
  const hasResponse = cleanBuffer.includes('4') || cleanBuffer.includes('four');
  console.log(`Contains answer (4): ${hasResponse}`);

  if (hasResponse) {
    console.log('\n*** SUCCESS: PTY stdin injection works! ***');
  } else {
    console.log('\n--- Response did not contain expected answer. Review output above. ---');
  }

  process.exit(exitCode);
});

process.on('SIGINT', () => {
  console.log('\n[POC] Caught SIGINT, cleaning up...');
  shell.kill();
  process.exit(130);
});
