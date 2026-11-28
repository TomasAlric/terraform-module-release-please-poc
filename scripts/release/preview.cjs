// Phase 1 & 7: Deterministic Release Version Preview and Equivalence Contract using Release Please.
require('release-please');
const { resolveStableBaseline } = require('./baseline.cjs');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { Manifest } = require('release-please');
const { LocalGitHub } = require('release-please/build/src/local-github');
const { buildStrategy } = require('release-please/build/src/factory');
const { parseConventionalCommits } = require('release-please/build/src/commit');
const { TagName } = require('release-please/build/src/util/tag-name');
const { Version } = require('release-please/build/src/version');

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...options }).trim();
}

function tryRun(cmd, args) {
  try {
    return run(cmd, args, { stdio: ['pipe', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function gitShowAt(ref, filePath) {
  return run('git', ['show', `${ref}:${filePath}`]);
}

// Informational digest only. Every candidate executes the full certification.
function computeEquivalenceContract(ref, version, stableSha) {
  const contract = {
    repository_tree: run('git', ['rev-parse', `${ref}^{tree}`]),
    origin_stable_version: `v${version}@${stableSha}`,
    environment_parameters: 'linux-x86_64:terraform-1.6.6:builtin-provider',
  };
  return { contract, fingerprint: sha256(JSON.stringify(contract)) };
}

function classifyIncrement(currentStr, nextStr) {
  if (!nextStr) return 'NONE';
  const current = Version.parse(currentStr);
  const next = Version.parse(nextStr);
  if (next.major > current.major) return 'MAJOR';
  if (next.minor > current.minor) return 'MINOR';
  if (next.patch > current.patch) return 'PATCH';
  return 'NONE';
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY || 'TomasAlric/terraform-module-release-please-poc';
  const prNumber = Number(process.env.PR_NUMBER || 0);
  const prTitle = (process.env.PR_TITLE || '').trim();
  const prBody = (process.env.PR_BODY || '').trim();
  const headSha = (process.env.PR_HEAD_SHA || run('git', ['rev-parse', 'HEAD'])).trim();
  const baseSha = (process.env.PR_BASE_SHA || run('git', ['rev-parse', 'origin/main'])).trim();
  const testedSha = (process.env.TESTED_SHA || run('git', ['rev-parse', 'HEAD'])).trim();
  const headRef = (process.env.PR_HEAD_REF || '').trim();
  const runId = String(process.env.GITHUB_RUN_ID || 'local');
  const runAttempt = String(process.env.GITHUB_RUN_ATTEMPT || '1');
  const outputPath = process.argv[2] || '';

  // 1. Discover current main and latest stable version dynamically
  const currentMainSha = run('git', ['rev-parse', 'origin/main']);
  const { currentStableVersion, currentStableTag, stableTagSha } = resolveStableBaseline(repo, currentMainSha);

  // 2. Check base branch freshness & ancestry
  let isMainAncestorOfHead = false;
  try {
    run('git', ['merge-base', '--is-ancestor', currentMainSha, headSha]);
    isMainAncestorOfHead = true;
  } catch {
    isMainAncestorOfHead = false;
  }
  const baseStale = baseSha !== currentMainSha || !isMainAncestorOfHead;
  const staleReason = baseStale
    ? `Base branch main is at ${currentMainSha.slice(0, 7)} (PR base was ${baseSha.slice(0, 7)}, ancestor=${isMainAncestorOfHead}). Obsolete evidence is invalidated.`
    : null;

  // 3. Collect commits integrated into main since the latest stable tag
  const logShasRaw = run('git', ['log', '--format=%H', `${stableTagSha}..${currentMainSha}`]);
  const mainCommitShas = logShasRaw ? logShasRaw.split('\n').filter(Boolean) : [];
  const accumulatedCommits = mainCommitShas.map(sha => {
    const message = run('git', ['log', '-1', '--format=%B', sha]);
    const filesRaw = run('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', sha]);
    const files = filesRaw ? filesRaw.split('\n').filter(Boolean) : [];
    return { sha, message, files };
  });

  // 4. Configure Release Please TerraformModule strategy
  const [owner, repoName] = repo.split('/');
  const scm = new LocalGitHub({ owner, repo: repoName, defaultBranch: 'main' }, {}, process.cwd());
  const manifest = await Manifest.fromManifest(scm, currentMainSha);
  const strategy = await buildStrategy({ ...manifest.repositoryConfig['.'], path: '.', github: scm, targetBranch: currentMainSha });
  const baselineRelease = {
    tag: TagName.parse(currentStableTag),
    sha: stableTagSha,
  };

  // 5. Evaluate PR commit & combined commits
  const isReleasePr = headRef === 'release-please--branches--main';
  const squashMessage = prBody ? `${prTitle}\n\n${prBody}` : prTitle;
  const changedFilesRaw = run('git', ['diff', '--name-only', `${baseSha}...${headSha}`]);
  const changedFiles = changedFilesRaw ? changedFilesRaw.split('\n').filter(Boolean) : [];

  const prRawCommit = {
    sha: headSha,
    message: squashMessage,
    files: changedFiles,
  };

  const parsedPrCommits = parseConventionalCommits([prRawCommit]);
  const parsedAccumulatedCommits = parseConventionalCommits(accumulatedCommits);

  const declaredBreakingInPr = parsedPrCommits.some(c => c.breaking);
  const declaredBreakingInMain = parsedAccumulatedCommits.some(c => c.breaking);
  const breakingNotes = [
    ...parsedPrCommits.flatMap(c => (c.notes || []).filter(n => n.title.includes('BREAKING')).map(n => n.text)),
    ...parsedAccumulatedCommits.flatMap(c => (c.notes || []).filter(n => n.title.includes('BREAKING')).map(n => n.text)),
  ];

  let breakingSummary = 'Not declared';
  if (declaredBreakingInPr) {
    breakingSummary = breakingNotes.length
      ? `Declared in PR (${breakingNotes[0].split('\n')[0].trim()})`
      : 'Declared in PR (breaking type indicator !)';
  } else if (declaredBreakingInMain) {
    breakingSummary = 'Declared in accumulated commits on main';
  }

  const combinedRawCommits = isReleasePr ? accumulatedCommits : [prRawCommit, ...accumulatedCommits];
  const combinedConventional = parseConventionalCommits(combinedRawCommits);
  const releasePrCandidate = await strategy.buildReleasePullRequest(combinedConventional, baselineRelease);

  const expectedNextVersion = releasePrCandidate?.version?.toString() || null;
  if (isReleasePr && JSON.parse(gitShowAt(headSha, '.release-please-manifest.json'))['.'] !== expectedNextVersion) {
    throw Error('Release PR manifest diverges from accumulated changes');
  }

  // Also check if PR alone triggers a release
  const prAloneCandidate = isReleasePr
    ? releasePrCandidate
    : await strategy.buildReleasePullRequest(parsedPrCommits, baselineRelease);
  const prAloneTriggersRelease = Boolean(prAloneCandidate?.version);

  const releaseType = classifyIncrement(currentStableVersion, expectedNextVersion);

  // 6. Determine tree SHA and candidate reference
  const headTreeSha = run('git', ['rev-parse', `${headSha}^{tree}`]);
  const testedTreeSha = run('git', ['rev-parse', `${testedSha}^{tree}`]);
  // Candidate tag points to headSha when headTreeSha === testedTreeSha, else testedSha
  const candidateCommitSha = headTreeSha === testedTreeSha ? headSha : testedSha;
  const candidateTreeSha = headTreeSha === testedTreeSha ? headTreeSha : testedTreeSha;
  const shortSha = headSha.slice(0, 7);

  let candidateTag;
  let isSemverPrerelease;
  if (expectedNextVersion) {
    candidateTag = `v${expectedNextVersion}-rc.pr${prNumber}.${shortSha}`;
    isSemverPrerelease = true;
  } else {
    candidateTag = `candidate/pr-${prNumber}/${shortSha}`;
    isSemverPrerelease = false;
  }

  // Check if tag already exists on origin pointing to a different commit
  const existingTagLine = tryRun('git', ['ls-remote', 'origin', `refs/tags/${candidateTag}`]);
  if (existingTagLine) {
    const existingSha = existingTagLine.split(/\s+/)[0];
    if (existingSha && existingSha !== candidateCommitSha) {
      candidateTag = `${candidateTag}.t${testedSha.slice(0, 7)}`;
    }
  }

  // Check migration doc presence in PR diff or README/docs
  const migrationDocPresent =
    changedFiles.some(f => f === 'README.md' || f.startsWith('docs/')) ||
    /migra(tion|ção)|BREAKING CHANGE/i.test(prBody);

  // Check if an open Release PR currently exists
  let existingReleasePr = null;
  if (process.env.GH_TOKEN) {
    const openPrsRaw = tryRun('gh', [
      'pr',
      'list',
      '--repo',
      repo,
      '--base',
      'main',
      '--head',
      'release-please--branches--main',
      '--state',
      'open',
      '--json',
      'number,title,headRefOid',
    ]);
    if (openPrsRaw) {
      try {
        const parsed = JSON.parse(openPrsRaw);
        if (parsed.length > 0) existingReleasePr = parsed[0];
      } catch {
        // ignore
      }
    }
  }

  // 7. Compute Equivalence Contract & Reuse Evaluation
  const eq = computeEquivalenceContract(candidateCommitSha, currentStableVersion, stableTagSha);
  const evidenceReuse = { reused: false, eligible: false, reason: 'Full certification required for every candidate' };

  const preview = {
    repository: repo,
    pr_number: prNumber,
    pr_title: prTitle,
    metadata_digest: sha256(JSON.stringify([prTitle, prBody])),
    head_ref: headRef,
    is_release_pr: isReleasePr,
    current_stable_version: currentStableVersion,
    current_stable_tag: currentStableTag,
    stable_tag_sha: stableTagSha,
    expected_next_version: expectedNextVersion,
    expected_next_tag: expectedNextVersion ? `v${expectedNextVersion}` : null,
    release_type: releaseType,
    pr_alone_triggers_release: prAloneTriggersRelease,
    declared_breaking_in_pr: declaredBreakingInPr,
    declared_breaking_in_main: declaredBreakingInMain,
    declared_breaking: declaredBreakingInPr || declaredBreakingInMain,
    breaking_summary: breakingSummary,
    migration_doc_present: migrationDocPresent,
    accumulated_main_commits_count: accumulatedCommits.length,
    existing_release_pr: existingReleasePr,
    candidate_tag: candidateTag,
    is_semver_prerelease: isSemverPrerelease,
    candidate_commit_sha: candidateCommitSha,
    head_sha: headSha,
    base_sha: baseSha,
    current_main_sha: currentMainSha,
    tested_sha: testedSha,
    tree_sha: candidateTreeSha,
    head_tree_sha: headTreeSha,
    tested_tree_sha: testedTreeSha,
    base_stale: baseStale,
    stale_reason: staleReason,
    workflow_run_id: runId,
    workflow_run_attempt: runAttempt,
    policy_version: 3,
    equivalence_contract: eq.contract,
    equivalence_fingerprint: eq.fingerprint,
    evidence_reuse: evidenceReuse,
  };

  const jsonOutput = JSON.stringify(preview, null, 2);
  if (outputPath) {
    writeFileSync(outputPath, jsonOutput + '\n');
  }
  console.log(jsonOutput);
}

module.exports = { computeEquivalenceContract };
if (require.main === module) main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
