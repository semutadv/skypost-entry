// SKYPOST — Archipelago Air Mail: the hand-in program.
//
// The game itself lives in game/ as plain static files. This program's one
// job is to deliver it the way the bounty asks: copy game/ and screenshots/
// into the output directory and write the dossier that describes them,
// using the kit's own buildDossier so the bytes match the scorer's exactly.
//
// The output directory is a mount point in the grader, so it is never
// removed — only its contents are cleared before the copy.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// The caps the bounty's gate scores with, from the kit's library header.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

function clearOutputContents(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    return;
  }
  for (const entry of readdirSync(dir)) {
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

function main(): void {
  const gameDir = join(repoRoot, 'game');
  const shotsDir = join(repoRoot, 'screenshots');
  if (!existsSync(join(gameDir, 'index.html'))) {
    throw new Error('game/index.html is missing — nothing to hand in');
  }
  if (!existsSync(shotsDir)) {
    throw new Error('screenshots/ is missing — nothing to hand in');
  }

  clearOutputContents(outputDir);
  cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });

  const dossier = buildDossier(outputDir, DOSSIER_CAPS);
  writeFileSync(join(outputDir, 'dossier.json'), dossier);

  // A one-line receipt on stdout: what was handed in, and how big it is.
  const gameFiles = readdirSync(join(outputDir, 'game'), { recursive: true }).length;
  const shotFiles = readdirSync(join(outputDir, 'screenshots')).length;
  const dossierBytes = typeof dossier === 'string'
    ? Buffer.byteLength(dossier)
    : dossier.byteLength;
  console.log(
    `skypost: handed in ${gameFiles} game files, ${shotFiles} screenshots, ` +
    `dossier ${dossierBytes} bytes -> ${outputDir}`
  );
}

main();
