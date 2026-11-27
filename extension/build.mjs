#!/usr/bin/env node
/**
 * FicTracker extension build script.
 *
 * 1. Builds the library page (React, via Vite) into dist/stage/app/.
 * 2. Bundles the background worker and content scripts (esbuild) from src/ext/.
 * 3. Copies the manifest, icons and panel CSS.
 * 4. Makes a Chrome and a Firefox copy and zips each. The Firefox manifest
 *    gets `background.scripts` instead of `service_worker` and the gecko
 *    settings AMO requires. The code is the same (Firefox aliases chrome.*)
 *    except that Firefox's background script uses the browser's own HTML
 *    parser instead of bundling linkedom.
 *
 * Usage:   node extension/build.mjs   (or npm run build:ext)
 * Output:  extension/dist/build-{chrome,firefox}/   (load these unpacked)
 *          extension/dist/fictracker-{chrome,firefox}-v{version}.zip
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as viteBuild } from 'vite';
import { build as esbuild } from 'esbuild';

const EXT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(EXT_DIR, '..');
const DIST_DIR = path.join(EXT_DIR, 'dist');
const STAGE_DIR = path.join(DIST_DIR, 'stage');

const CONTENT_SCRIPTS = {
  'content/ao3.js': 'src/ext/content-ao3.js',
  'content/site.js': 'src/ext/content-site.js',
};
const BACKGROUND = { 'background.js': 'src/ext/background.js' };

// Chrome's background service worker has no DOMParser, so its background
// script bundles linkedom (about 600 KB). Firefox's background page has the
// browser's own parser, so its build swaps linkedom for that.
const FIREFOX_ALIASES = { 'linkedom/worker': './src/ext/native-dom-parser.js' };

function bundle(outdir, scripts, alias = {}) {
  return esbuild({
    absWorkingDir: ROOT,
    entryPoints: Object.fromEntries(
      Object.entries(scripts).map(([out, src]) => [out.replace(/\.js$/, ''), src]),
    ),
    outdir,
    bundle: true,
    format: 'iife',
    target: ['chrome110', 'firefox128'],
    alias,
    logLevel: 'warning',
  });
}

// Gecko extension ID for AMO. Once uploaded to AMO under this ID, it
// cannot be changed — any rename creates a new listing. Email-style IDs
// are conventional; the domain does not need to resolve.
const GECKO_ID = 'fictracker@fictracker.app';

// Firefox 128 (an ESR) is the first version that grants an MV3 add-on's
// host permissions at install time. Before that, people had to switch on
// AO3 access by hand, or the panel never appeared.
const GECKO_MIN_VERSION = '128.0';

async function rimraf(p) {
  await fs.rm(p, { recursive: true, force: true });
}

async function stage() {
  await rimraf(STAGE_DIR);
  await viteBuild({ configFile: path.join(ROOT, 'vite.config.js'), logLevel: 'warn' });
  await bundle(STAGE_DIR, CONTENT_SCRIPTS);
  await fs.cp(path.join(EXT_DIR, 'icons'), path.join(STAGE_DIR, 'icons'), { recursive: true });
  await fs.cp(path.join(EXT_DIR, 'content/content.css'), path.join(STAGE_DIR, 'content/content.css'));
  await fs.cp(path.join(EXT_DIR, 'manifest.json'), path.join(STAGE_DIR, 'manifest.json'));
}

function transformManifestForFirefox(manifest) {
  const out = structuredClone(manifest);
  if (out.background?.service_worker) {
    out.background = { scripts: [out.background.service_worker] };
  }
  out.browser_specific_settings = {
    gecko: {
      id: GECKO_ID,
      strict_min_version: GECKO_MIN_VERSION,
      // Mozilla requires this block. FicTracker collects nothing: the
      // library stays in extension storage and the only requests go to AO3.
      data_collection_permissions: {
        required: ['none'],
        optional: [],
      },
    },
    // Lists the add-on for Firefox for Android on AMO too.
    gecko_android: {
      strict_min_version: GECKO_MIN_VERSION,
    },
  };
  return out;
}

async function buildTarget(target) {
  const manifestPath = path.join(EXT_DIR, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const version = manifest.version;
  const buildDir = path.join(DIST_DIR, `build-${target}`);
  const zipPath = path.join(DIST_DIR, `fictracker-${target}-v${version}.zip`);

  await rimraf(buildDir);
  await rimraf(zipPath);
  await fs.cp(STAGE_DIR, buildDir, { recursive: true });
  await bundle(buildDir, BACKGROUND, target === 'firefox' ? FIREFOX_ALIASES : {});

  if (target === 'firefox') {
    const transformed = transformManifestForFirefox(manifest);
    await fs.writeFile(
      path.join(buildDir, 'manifest.json'),
      JSON.stringify(transformed, null, 2) + '\n',
    );
  }

  // Use system `zip` rather than a Node library so there's no new dep.
  // `-q` quiets progress output; `-r` recurses; the trailing `.` zips
  // the buildDir contents (not the buildDir itself).
  execSync(`cd "${buildDir}" && zip -qr "${zipPath}" .`);
  // Intentionally leave buildDir in place so `about:debugging` (Firefox)
  // and `chrome://extensions` "Load unpacked" can point at it directly
  // without the user having to unzip. Both are gitignored via `dist/`.

  const { size } = await fs.stat(zipPath);
  const rel = path.relative(path.resolve(EXT_DIR, '..'), zipPath);
  console.log(`  ✔ ${rel} (${(size / 1024).toFixed(1)} KB)`);
  return zipPath;
}

async function main() {
  const manifest = JSON.parse(
    await fs.readFile(path.join(EXT_DIR, 'manifest.json'), 'utf8'),
  );
  console.log(`Building FicTracker extensions v${manifest.version}...`);
  await fs.mkdir(DIST_DIR, { recursive: true });
  await stage();
  await buildTarget('chrome');
  await buildTarget('firefox');
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
