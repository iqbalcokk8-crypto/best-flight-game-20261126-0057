// SENJA SKY COURIER — hand-in program (Node 22, standard library only).
// It gathers the game and its screenshots from beside this file and
// writes them to /output (or MAKEFUN_OUTPUT_DIR outside the grader),
// then writes /output/dossier.json with the kit's buildDossier, so the
// judge reads exactly what the game ships. Two runs write the same
// bytes: nothing here depends on time, randomness or the environment.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function freshDir(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

function copyTree(name) {
  const from = join(repoRoot, name);
  if (!existsSync(from)) return;
  cpSync(from, join(outDir, name), { recursive: true });
}

function writeDossier() {
  const dossier = buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);
}

freshDir(outDir);
copyTree('game');
copyTree('screenshots');
writeDossier();
