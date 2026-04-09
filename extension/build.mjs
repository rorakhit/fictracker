#!/usr/bin/env node
/**
 * FicTracker extension build script.
 *
 * Builds both Chrome and Firefox zips from a single source tree. The
 * Chrome zip is an as-is copy of the source. The Firefox zip gets a
 * mutated manifest.json: `background.service_worker` is rewritten to
 * `background.scripts` (Firefox MV3's preferred form, supported all
 * the way back to Firefox 115 ESR), and a `browser_specific_settings`
 * block is injected with the gecko extension ID required by AMO.
 *
 * The .js files themselves are identical across both targets — Firefox
 * aliases `chrome.*` to `browser.*` so `chrome.runtime.sendMessage`,
 * `chrome.storage.local`, etc. work verbatim.
 *
 * Usage:   node extension/build.mjs
 * Output:  extension/dist/fictracker-chrome-v{version}.zip
 *          extension/dist/fictracker-firefox-v{version}.zip
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(EXT_DIR, 'dist');

// Explicit allowlist of what ships in the extension zip. Everything else
// in extension/ (README, bookmarklet.js reference file, store-listing
// PNGs, previous zips, this build script) is excluded.
const INCLUDE = [
  'background',
  'content',
  'popup',
  'icons',
  'manifest.json',
];

// Gecko extension ID for AMO. Once uploaded to AMO under this ID, it
// cannot be changed — any rename creates a new listing. Email-style IDs
// are conventional; the domain does not need to resolve.
const GECKO_ID = 'fictracker@fictracker.app';

// Firefox ESR baseline. MV3 background.scripts has been supported since
// Firefox 109 (MV3 launch, Jan 2023), but 115 is the current ESR and a
// safer floor for orgs that lag behind rapid release.
const GECKO_MIN_VERSION = '115.0';

async function rimraf(p) {
  await fs.rm(p, { recursive: true, force: true });
}

async function copyIncluded(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  for (const name of INCLUDE) {
    await fs.cp(path.join(src, name), path.join(dest, name), { recursive: true });
  }
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
      // Mozilla requires this block to be present (AMO rejects uploads
      // without it as of late 2024). Values must be drawn from Mozilla's
      // fixed taxonomy. FicTracker collects two categories, both required:
      //   - authenticationInfo: email + password sent to Supabase Auth
      //     on sign-in; session tokens stored in chrome.storage.local.
      //   - websiteContent: the extension scrapes AO3 work page DOM
      //     (title, authors, tags, kudos, chapter count) and POSTs it to
      //     the FicTracker Supabase backend. This is the core value prop
      //     of the extension, so it can't be marked optional.
      // Nothing else is collected — no location, no health/payment info,
      // no browsing activity beyond AO3 work pages, no search terms, no
      // personal communications, no telemetry.
      data_collection_permissions: {
        required: ['authenticationInfo', 'websiteContent'],
        optional: [],
      },
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
  await copyIncluded(EXT_DIR, buildDir);

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
  await buildTarget('chrome');
  await buildTarget('firefox');
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
