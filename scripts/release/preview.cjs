// Phase 1 & 7: Deterministic Release Version Preview and Equivalence Contract using Release Please.
require('release-please');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { TerraformModule } = require('release-please/build/src/strategies/terraform-module');
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

function gitBlobAt(ref, filePath) {
  try {
    return run('git', ['rev-parse', `${ref}:${filePath}`]);
  } catch {
    return null;
  }
}

function gitShowAt(ref, filePath) {
  return run('git', ['show', `${ref}:${filePath}`]);
}

function computeEquivalenceContract(ref, stableVersion, stableTagSha, workspaceRoot) {
  const functionalPaths = [
    'main.tf',
    'variables.tf',
    'outputs.tf',
    'versions.tf',
    'tests/contract.tftest.hcl',
    'examples/complete/main.tf',
  ];
  const functionalEntries = functionalPaths.map(p => `${p}:${gitBlobAt(ref, p) || 'missing'}`);
  const functionalModuleTree = sha256(functionalEntries.join('\n'));

  const lockContent = tryRun('git', ['show', `${ref}:scripts/release/package-lock.json`]) ||
    (existsSync(join(workspaceRoot, 'scripts/release/package-lock.json'))
      ? readFileSync(join(workspaceRoot, 'scripts/release/package-lock.json'), 'utf8')
      : '');
  const dependenciesLockHash = sha256(`terraform:1.6.6\n${lockContent}`);

  const readScript = relPath => {
    const fromGit = tryRun('git', ['show', `${ref}:${relPath}`]);
    if (fromGit !== null) return fromGit;
    const full = join(workspaceRoot, relPath);
    return existsSync(full) ? readFileSync(full, 'utf8') : '';
  };

  const consumerFixturesHash = sha256(
    readScript('scripts/certify/run-day0.sh') + '\n---\n' + readScript('scripts/certify/run-day2.sh')
  );
  const testPolicyHash = sha256(
    readScript('scripts/certify.sh') + '\n---\n' + readScript('scripts/certify/analyze-plan.py')
  );
  const terraformConfigHash = sha256(
    `${gitShowAt(ref, 'versions.tf')}\n${gitShowAt(ref, 'release-please-config.json')}`
  );
  const originStableVersion = `v${stableVersion}@${stableTagSha}`;
  const environmentParameters = 'linux-x86_64:terraform-1.6.6:builtin-provider';

  const contract = {
    functional_module_tree: functionalModuleTree,
    dependencies_lock_hash: dependenciesLockHash,
    consumer_fixtures_hash: consumerFixturesHash,
    terraform_config_hash: terraformConfigHash,
    test_policy_hash: testPolicyHash,
    origin_stable_version: originStableVersion,
    environment_parameters: environmentParameters,
  };
  return {
    contract,
    fingerprint: sha256(JSON.stringify(contract)),
  };
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

function evaluateEvidenceReuse(repo, isReleasePr, headSha, baseSha, stableTagSha, currentEq) {
  if (process.env.DISABLE_EVIDENCE_REUSE === 'true') {
    return {
      reused: false,
      eligible: false,
      reason: 'Evidence reuse explicitly disabled via DISABLE_EVIDENCE_REUSE=true',
    };
  }
  if (!isReleasePr && process.env.ENABLE_PR_EVIDENCE_REUSE !== 'true') {
    return {
      reused: false,
      eligible: false,
      reason: 'Feature PRs execute full certification to produce primary evidence',
    };
  }
  if (!process.env.GH_TOKEN) {
    return {
      reused: false,
      eligible: false,
      reason: 'No GitHub token available to verify authenticated prior runs',
    };
  }

  try {
    // Check commits on main since stableTagSha to find the most recent commit that touched functional files
    const commitsRaw = tryRun('git', ['log', '--format=%H', `${stableTagSha}..${baseSha}`]);
    const mainCommits = commitsRaw ? commitsRaw.split('\n').filter(Boolean) : [];
    if (!mainCommits.length) {
      return {
        reused: false,
        eligible: false,
        reason: 'No merged commits found on main since latest stable release',
      };
    }

    // Query recent successful pull_request runs of ci.yml
    const runsJson = JSON.parse(
      run('gh', ['api', `repos/${repo}/actions/workflows/ci.yml/runs?event=pull_request&status=completed&per_page=15`])
    );
    const runs = (runsJson.workflow_runs || []).filter(
      r => r.conclusion === 'success' && r.head_sha !== headSha && r.head_repository?.full_name === repo
    );

    const divergenceReasons = [];
    for (const candidateRun of runs) {
      const log = tryRun('gh', [
        'run',
        'view',
        String(candidateRun.id),
        '--repo',
        repo,
        '--attempt',
        String(candidateRun.run_attempt || 1),
        '--log',
      ]);
      if (!log) continue;
      const matches = log.match(/CERTIFICATION_EVIDENCE_JSON=(\{[^\r\n]+\})/);
      if (!matches) continue;
      let evidence;
      try {
        evidence = JSON.parse(matches[1]);
      } catch {
        continue;
      }
      if (evidence.certification?.result !== 'PASS') continue;
      const priorEq = evidence.equivalence_contract;
      if (!priorEq) continue;

      const diffs = [];
      for (const key of [
        'functional_module_tree',
        'dependencies_lock_hash',
        'consumer_fixtures_hash',
        'terraform_config_hash',
        'test_policy_hash',
        'origin_stable_version',
        'environment_parameters',
      ]) {
        if (priorEq[key] !== currentEq.contract[key]) {
          diffs.push(`${key} diverged (${priorEq[key]?.slice(0, 10)} != ${currentEq.contract[key]?.slice(0, 10)})`);
        }
      }

      if (diffs.length === 0) {
        return {
          reused: true,
          eligible: true,
          reason: `Proven 100% equivalence with authenticated run #${candidateRun.id} (candidate ${evidence.release_candidate?.reference})`,
          source_run_id: candidateRun.id,
          source_run_attempt: candidateRun.run_attempt || 1,
          source_pr_number: evidence.pr_number,
          source_candidate: evidence.release_candidate,
          source_upgrade_impact: evidence.upgrade_impact,
          source_certification: evidence.certification,
          equivalence_fingerprint: currentEq.fingerprint,
          verified_criteria: Object.keys(currentEq.contract),
        };
      } else {
        divergenceReasons.push(`Run #${candidateRun.id}: ${diffs.join(', ')}`);
      }
    }

    return {
      reused: false,
      eligible: false,
      reason: divergenceReasons.length
        ? `Equivalence rejected — divergence detected: ${divergenceReasons[0]}`
        : 'No prior authenticated run with matching equivalence contract found',
      divergences: divergenceReasons.slice(0, 3),
    };
  } catch (err) {
    return {
      reused: false,
      eligible: false,
      reason: `Equivalence verification failed safely (forcing full recertification): ${err.message}`,
    };
  }
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
  const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
  const outputPath = process.argv[2] || '';

  // 1. Discover current main and latest stable version dynamically
  const currentMainSha = tryRun('git', ['rev-parse', 'origin/main']) || baseSha;
  const manifestRaw = gitShowAt(currentMainSha, '.release-please-manifest.json');
  const manifestJson = JSON.parse(manifestRaw);
  const currentStableVersion = manifestJson['.'];
  if (!currentStableVersion) {
    throw new Error('Could not discover current stable version from .release-please-manifest.json');
  }
  const currentStableTag = `v${currentStableVersion}`;
  const stableTagSha =
    tryRun('git', ['rev-parse', `refs/tags/${currentStableTag}^{commit}`]) ||
    tryRun('git', ['rev-parse', `${currentStableTag}^{commit}`]) ||
    currentMainSha;

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
  const logShasRaw = tryRun('git', ['log', '--format=%H', `${stableTagSha}..${currentMainSha}`]);
  const mainCommitShas = logShasRaw ? logShasRaw.split('\n').filter(Boolean) : [];
  const accumulatedCommits = mainCommitShas.map(sha => {
    const message = run('git', ['log', '-1', '--format=%B', sha]);
    const filesRaw = tryRun('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', sha]);
    const files = filesRaw ? filesRaw.split('\n').filter(Boolean) : ['main.tf'];
    return { sha, message, files };
  });

  // 4. Configure Release Please TerraformModule strategy
  const configRaw = gitShowAt(currentMainSha, 'release-please-config.json');
  const config = JSON.parse(configRaw).packages['.'];
  const [owner, repoName] = repo.split('/');
  const strategy = new TerraformModule({
    github: {
      repository: { owner, repo: repoName },
      findFilesByFilenameAndRef: async () => [],
    },
    targetBranch: 'main',
    includeComponentInTag: config['include-component-in-tag'],
    includeVInTag: config['include-v-in-tag'],
    changelogSections: config['changelog-sections'],
  });
  const baselineRelease = {
    tag: TagName.parse(currentStableTag),
    sha: stableTagSha,
  };

  // 5. Evaluate PR commit & combined commits
  const isReleasePr = headRef === 'release-please--branches--main';
  const squashMessage = prBody ? `${prTitle}\n\n${prBody}` : prTitle;
  const changedFilesRaw = tryRun('git', ['diff', '--name-only', `${baseSha}...${headSha}`]);
  const changedFiles = changedFilesRaw ? changedFilesRaw.split('\n').filter(Boolean) : ['main.tf'];

  const prRawCommit = {
    sha: headSha,
    message: squashMessage,
    files: changedFiles.length ? changedFiles : ['main.tf'],
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

  let expectedNextVersion = releasePrCandidate?.version?.toString() || null;
  if (isReleasePr && !expectedNextVersion) {
    // Fallback to manifest on the Release PR branch if already updated
    try {
      const prManifest = JSON.parse(gitShowAt(headSha, '.release-please-manifest.json'));
      if (prManifest['.'] && prManifest['.'] !== currentStableVersion) {
        expectedNextVersion = prManifest['.'];
      }
    } catch {
      // ignore
    }
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
  const eq = computeEquivalenceContract(candidateCommitSha, currentStableVersion, stableTagSha, workspaceRoot);
  const evidenceReuse = evaluateEvidenceReuse(
    repo,
    isReleasePr,
    headSha,
    currentMainSha,
    stableTagSha,
    eq
  );

  const preview = {
    repository: repo,
    pr_number: prNumber,
    pr_title: prTitle,
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
    policy_version: 2,
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

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
