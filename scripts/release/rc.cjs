// Phase 2: Immutable Release Candidate tag & GitHub pre-release creator.
const { execFileSync, spawnSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');

function run(cmd, args, input) {
  return execFileSync(cmd, args, { encoding: 'utf8', input }).trim();
}

const SEMVER_RC_REGEX = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-rc\.pr[1-9][0-9]*\.[0-9a-f]{7}(\.t[0-9a-f]{7})?$/;
const ISOLATED_RC_REGEX = /^candidate\/pr-[1-9][0-9]*\/[0-9a-f]{7}(\.t[0-9a-f]{7})?$/;
const STABLE_TAG_REGEX = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

function main() {
  const previewPath = process.argv[2];
  if (!previewPath) throw new Error('Usage: node scripts/release/rc.cjs <preview.json>');
  const preview = JSON.parse(readFileSync(previewPath, 'utf8'));

  const repo = preview.repository;
  if (repo !== 'TomasAlric/terraform-module-release-please-poc') {
    throw new Error(`Unauthorized repository: ${repo}`);
  }
  if (!preview.pr_number || preview.pr_number <= 0) {
    throw new Error(`Invalid PR number: ${preview.pr_number}`);
  }
  const tag = preview.candidate_tag;
  if (STABLE_TAG_REGEX.test(tag)) {
    throw new Error(`Refusing to create stable tag prematurely: ${tag}`);
  }
  if (!SEMVER_RC_REGEX.test(tag) && !ISOLATED_RC_REGEX.test(tag)) {
    throw new Error(`Invalid candidate tag format: ${tag}`);
  }

  const commitSha = preview.candidate_commit_sha;
  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new Error(`Invalid candidate commit SHA: ${commitSha}`);
  }

  const actualTree = run('git', ['rev-parse', `${commitSha}^{tree}`]);
  if (actualTree !== preview.tree_sha) {
    throw new Error(`Tree SHA mismatch for candidate ${commitSha}: expected ${preview.tree_sha}, got ${actualTree}`);
  }

  const ref = `refs/tags/${tag}`;
  const existing = run('git', ['ls-remote', 'origin', ref]);
  let tagCreated = false;
  if (existing) {
    const remoteSha = existing.split(/\s+/)[0];
    if (remoteSha !== commitSha) {
      throw new Error(`Candidate tag ${tag} already exists on origin at ${remoteSha} (cannot move to ${commitSha})`);
    }
    console.log(`Candidate tag ${tag} already exists at ${commitSha} (idempotent match).`);
  } else {
    run('git', ['push', 'origin', `${commitSha}:${ref}`]);
    const verifyRemote = run('git', ['ls-remote', 'origin', ref]).split(/\s+/)[0];
    if (verifyRemote !== commitSha) {
      throw new Error(`Post-push verification failed for ${ref}: got ${verifyRemote}`);
    }
    tagCreated = true;
    console.log(`Created immutable candidate tag ${tag} -> ${commitSha}`);
  }

  let prereleaseUrl = `https://github.com/${repo}/tree/${encodeURIComponent(tag)}`;
  let prereleaseCreated = false;

  if (preview.is_semver_prerelease) {
    const releasePath = `repos/${repo}/releases/tags/${encodeURIComponent(tag)}`;
    const lookup = spawnSync('gh', ['api', releasePath], { encoding: 'utf8' });
    if (lookup.status === 0) {
      const rel = JSON.parse(lookup.stdout);
      if (!rel.prerelease) {
        throw new Error(`Release ${tag} exists but is not marked as prerelease!`);
      }
      prereleaseUrl = rel.html_url;
      console.log(`GitHub pre-release ${tag} already exists: ${prereleaseUrl}`);
    } else {
      if (!lookup.stderr.includes('HTTP 404')) {
        throw new Error(`Failed querying release ${tag}: ${lookup.stderr}`);
      }
      const notes = [
        `### Release Candidate \`${tag}\``,
        '',
        `- **Pull Request**: #${preview.pr_number}`,
        `- **Current Stable Version**: \`${preview.current_stable_tag}\``,
        `- **Expected Next Version**: \`${preview.expected_next_tag}\` (\`${preview.release_type}\`)`,
        `- **Declared Breaking Changes**: ${preview.breaking_summary}`,
        `- **Candidate Commit SHA**: \`${preview.candidate_commit_sha}\``,
        `- **PR Head SHA**: \`${preview.head_sha}\``,
        `- **PR Base SHA**: \`${preview.base_sha}\``,
        `- **Tested Merge SHA**: \`${preview.tested_sha}\``,
        `- **Tree SHA**: \`${preview.tree_sha}\``,
        `- **Workflow Run ID**: \`${preview.workflow_run_id}\` (attempt \`${preview.workflow_run_attempt}\`)`,
        `- **Policy Version**: \`${preview.policy_version}\``,
        '',
        '> Pre-release candidate created automatically for Day 0 (Fresh Installation) and Day 2 (Consumer Upgrade) infrastructure certification. Not a stable release.',
      ].join('\n');

      const payload = JSON.stringify({
        tag_name: tag,
        target_commitish: commitSha,
        name: `${tag} (PR #${preview.pr_number})`,
        body: notes,
        draft: false,
        prerelease: true,
        make_latest: 'false',
      });
      const created = JSON.parse(
        run('gh', ['api', `repos/${repo}/releases`, '-X', 'POST', '--input', '-'], payload)
      );
      prereleaseUrl = created.html_url;
      prereleaseCreated = true;
      console.log(`Created GitHub pre-release ${tag}: ${prereleaseUrl}`);
    }
  }

  preview.rc_status = {
    tag_created: tagCreated,
    prerelease_created: prereleaseCreated,
    candidate_url: prereleaseUrl,
  };
  writeFileSync(previewPath, JSON.stringify(preview, null, 2) + '\n');
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
