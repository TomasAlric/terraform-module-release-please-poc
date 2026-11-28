// Resolve the same published baseline for preview and Release PR reconciliation.
const { execFileSync } = require('node:child_process');
function run(cmd, args) {
  return execFileSync(cmd, args, {encoding: 'utf8'}).trim();
}

function validateBaseline(release, anchor, proof, repo, tag, sha, tree) {
  if (release.tag_name !== tag || release.draft || release.prerelease) throw Error('Incomplete stable release');
  if (anchor?.tag === tag) {
    if (anchor.repository !== repo || anchor.release_id !== release.id || anchor.commit !== sha) {
      throw Error('Manual baseline differs from reviewed adoption inventory');
    }
  } else if (release.target_commitish !== sha || proof?.repository !== repo || proof.version !== tag.slice(1) ||
             proof.merge_commit !== sha || proof.certified_tree !== tree || proof.result !== 'success') {
    throw Error('Stable certificate differs from published tag or manifest');
  }
}

function resolveStableBaseline(repo, currentMainSha) {
  const manifestRaw = run('git', ['show', currentMainSha + ':.release-please-manifest.json']);
  const manifestJson = JSON.parse(manifestRaw);
  const currentStableVersion = manifestJson['.'];
  if (Object.keys(manifestJson).length !== 1 || typeof currentStableVersion !== 'string' ||
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(currentStableVersion)) {
    throw Error('Invalid root stable manifest');
  }
  const currentStableTag = `v${currentStableVersion}`;
  run('git', ['fetch', '--quiet', '--no-tags', 'origin', `refs/tags/${currentStableTag}`]);
  const stableTagSha = run('git', ['rev-parse', '--verify', 'FETCH_HEAD^{commit}']);
  run('git', ['merge-base', '--is-ancestor', stableTagSha, currentMainSha]);
  const published = JSON.parse(run('gh', ['api', `repos/${repo}/releases/latest`]));
  if (published.tag_name !== currentStableTag || published.draft || published.prerelease) {
    throw Error('Incomplete stable release: latest differs from manifest');
  }
  const anchorPath = '.release/brownfield.json';
  const hasAnchor = run('git', ['ls-tree', '--name-only', currentMainSha, '--', anchorPath]);
  const anchorRaw = hasAnchor && run('git', ['show', `${currentMainSha}:${anchorPath}`]);
  const anchor = anchorRaw ? JSON.parse(anchorRaw) : null;
  const proof = anchor?.tag === currentStableTag ? null : JSON.parse(run('gh', [
    'release', 'download', currentStableTag, '--repo', repo, '--pattern', 'certification.json', '--output', '-',
  ]));
  validateBaseline(published, anchor, proof, repo, currentStableTag, stableTagSha,
    run('git', ['rev-parse', `${stableTagSha}^{tree}`]));
  return { currentStableTag, currentStableVersion, stableTagSha };
}

module.exports = { validateBaseline, resolveStableBaseline };
