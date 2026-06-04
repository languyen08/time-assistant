const { execFileSync } = require('node:child_process');

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function parseVersion(tag) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  if (!match) {
    return undefined;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(left, right) {
  if (left.major !== right.major) {
    return left.major - right.major;
  }

  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }

  return left.patch - right.patch;
}

function nextTag(releaseType) {
  const tags = git('tag')
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => ({ tag, version: parseVersion(tag) }))
    .filter((entry) => entry.version);

  const latest =
    tags.sort((first, second) => compareVersions(first.version, second.version)).at(-1)?.version ??
    {
      major: 0,
      minor: 0,
      patch: 0,
    };

  const next = { ...latest };
  if (releaseType === 'major') {
    next.major += 1;
    next.minor = 0;
    next.patch = 0;
  } else if (releaseType === 'minor') {
    next.minor += 1;
    next.patch = 0;
  } else {
    next.patch += 1;
  }

  return `v${next.major}.${next.minor}.${next.patch}`;
}

function ensureCleanTree() {
  const status = git('status', '--short');
  if (status) {
    console.error('Working tree is not clean. Commit or stash changes before tagging a release.');
    process.exit(1);
  }
}

function main() {
  const releaseType = process.argv[2] ?? 'patch';
  if (!['major', 'minor', 'patch'].includes(releaseType)) {
    console.error('Usage: node scripts/release-tag.cjs [major|minor|patch]');
    process.exit(1);
  }

  ensureCleanTree();
  const tag = nextTag(releaseType);
  console.log(`Creating and pushing ${tag}`);
  git('tag', tag);
  git('push', 'origin', tag);
  console.log(`Pushed ${tag}`);
}

main();
