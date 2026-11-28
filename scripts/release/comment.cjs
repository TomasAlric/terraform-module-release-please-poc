// Phase 1.1 & 6: Persistent, idempotent PR comment manager separated from PR test execution.
const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');

const MARKER = '<!-- release-impact-certification-marker:v2 -->';

function run(cmd, args, input) {
  return execFileSync(cmd, args, { encoding: 'utf8', input }).trim();
}

function sanitizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/ghp_[A-Za-z0-9_]+/g, '[REDACTED]')
    .replace(/github_pat_[A-Za-z0-9_]+/g, '[REDACTED]')
    .replace(/gho_[A-Za-z0-9_]+/g, '[REDACTED]')
    .slice(0, 600);
}

function buildPendingComment(preview) {
  const repo = preview.repository;
  const runUrl = `https://github.com/${repo}/actions/runs/${preview.workflow_run_id}`;
  const candidateUrl =
    preview.rc_status?.candidate_url || `https://github.com/${repo}/tree/${encodeURIComponent(preview.candidate_tag)}`;
  const nextVersionDisplay = preview.expected_next_tag
    ? preview.expected_next_tag
    : 'None (no release triggered — remains ' + preview.current_stable_tag + ')';

  const lines = [
    MARKER,
    `<!-- metadata ${preview.metadata_digest} -->`,
    '## Release Impact & Certification',
    '',
    `Current stable version: ${preview.current_stable_tag}`,
    `Expected next version: ${nextVersionDisplay}`,
    `Release type: ${preview.release_type}`,
    `Breaking changes: ${sanitizeText(preview.breaking_summary)}`,
    '',
    'Candidate:',
    `${preview.candidate_tag}`,
    '',
    `Candidate SHA: ${preview.head_sha}`,
    `Base SHA: ${preview.base_sha}`,
    `Tested Merge SHA: ${preview.tested_sha}`,
    `Certified Tree SHA: ${preview.tree_sha}`,
    '',
    'Infrastructure certification:',
    '',
    '| Validation | Status |',
    '|---|---|',
    '| Terraform Contract Tests | PENDING |',
    '| Fresh Installation | PENDING |',
    '| Consumer Upgrade | PENDING |',
    '| Upgrade Plan Policy | PENDING |',
    '| Post-upgrade Idempotency | PENDING |',
    '| Cleanup | PENDING |',
    '',
    'Overall result: PENDING',
    '',
    `Workflow run: [Run #${preview.workflow_run_id}](${runUrl}) · Candidate: [\`${preview.candidate_tag}\`](${candidateUrl})`,
    '',
    'Publication: Pending protected merge and final certification.',
    '',
    'This version is a preview and may change before publication.',
  ];
  return lines.join('\n');
}

function botComment(comment) {
  return comment.user?.id === 41898282 && comment.body?.startsWith(MARKER);
}

function commentsFor(repo, number) {
  return JSON.parse(run('gh', ['api', '--paginate', '--slurp', `repos/${repo}/issues/${number}/comments`])).flat();
}

function reportCompleted(repo) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH));
  const ci = event.workflow_run;
  if (ci.path !== '.github/workflows/ci.yml' || ci.event !== 'pull_request' ||
      ci.repository.full_name !== repo || ci.pull_requests.length !== 1) return;
  const number = ci.pull_requests[0].number;
  const pr = JSON.parse(run('gh', ['api', `repos/${repo}/pulls/${number}`]));
  if (pr.state !== 'open' || pr.head.sha !== ci.head_sha || pr.base.ref !== 'main') return;
  const latest = JSON.parse(run('gh', ['api',
    `repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${ci.head_sha}&event=pull_request&per_page=1`])).workflow_runs[0];
  if (latest?.id !== ci.id || latest.run_attempt !== ci.run_attempt) return;
  const comment = commentsFor(repo, number).find(botComment);
  const digest = require('node:crypto').createHash('sha256').update(JSON.stringify([pr.title.trim(), (pr.body || '').trim()])).digest('hex');
  if (!comment?.body.includes(`<!-- metadata ${digest} -->`) ||
      !comment.body.includes(`Candidate SHA: ${pr.head.sha}`) || !comment.body.includes(`Base SHA: ${pr.base.sha}`)) return;
  const {jobs} = JSON.parse(run('gh',['api',`repos/${repo}/actions/runs/${ci.id}/attempts/${ci.run_attempt}/jobs`]));
  const body = comment.body.split('Infrastructure certification:')[0] + 'Infrastructure certification:\n\n' +
    jobs.map(j => `- [${j.name.replace(/[^a-z0-9 &-]/gi, '')}](${j.html_url}) · ${j.conclusion}`).join('\n') +
    `\n\nOverall result: ${ci.conclusion.toUpperCase()}\n\n[Execution and evidence](${ci.html_url})`;
  run('gh',['api',`repos/${repo}/issues/comments/${comment.id}`,'-X','PATCH','--input','-'],JSON.stringify({body}));
}

function upsertComment(repo, prNumber, body) {
  const existing = commentsFor(repo, prNumber).find(botComment);
  if (existing) {
    const targetId = existing.id;
    const updated = JSON.parse(run('gh', ['api', `repos/${repo}/issues/comments/${targetId}`,
      '-X','PATCH','--input','-'], JSON.stringify({body})));
    console.log(`Updated existing PR #${prNumber} comment ${targetId}: ${updated.html_url}`);
    return updated;
  } else {
    const payload = JSON.stringify({ body });
    const created = JSON.parse(
      run('gh', ['api', `repos/${repo}/issues/${prNumber}/comments`, '-X', 'POST', '--input', '-'], payload)
    );
    console.log(`Created new PR #${prNumber} comment ${created.id}: ${created.html_url}`);
    return created;
  }
}

function invalidateStaleOpenPrs(repo) {
  const currentMainSha = run('git', ['rev-parse', 'HEAD']);
  const manifest = JSON.parse(run('git', ['show', `${currentMainSha}:.release-please-manifest.json`]));
  const currentStableTag = `v${manifest['.']}`;

  const openPrs = JSON.parse(
    run('gh', [
      'pr',
      'list',
      '--repo',
      repo,
      '--base',
      'main',
      '--state',
      'open',
      '--json',
      'number,title,headRefName,headRefOid',
    ])
  );

  for (const pr of openPrs) {
    if (pr.headRefName === 'release-please--branches--main') continue;
    const existing = commentsFor(repo, pr.number).find(botComment);
    if (!existing) continue;

    const baseMatch = existing.body.match(/^Base SHA:\s*([0-9a-f]{40})/m);
    const recordedBase = baseMatch ? baseMatch[1] : null;
    if (recordedBase && recordedBase !== currentMainSha) {
      let updatedBody = existing.body
        .replace(/^Current stable version:.*$/m, `Current stable version: ${currentStableTag}`)
        .replace(/^Overall result:.*$/m, `Overall result: INVALIDATED (Base branch main advanced to ${currentMainSha.slice(0, 7)})`)
        .replace(
          /^Publication:.*$/m,
          `Publication: BLOCKED — Base branch main advanced from ${recordedBase.slice(0, 7)} to ${currentMainSha.slice(0, 7)}. Rebase/synchronize PR to recertify.`
        );
      if (!updatedBody.includes('### Base Branch Invalidation')) {
        updatedBody += `\n\n### Base Branch Invalidation\n- **Obsolete Base SHA**: \`${recordedBase}\`\n- **New Main SHA**: \`${currentMainSha}\`\n- **Action Required**: Update/rebase branch onto \`main\` to generate a new Release Candidate and recertify.`;
      }
      const payload = JSON.stringify({ body: updatedBody });
      run('gh', ['api', `repos/${repo}/issues/comments/${existing.id}`, '-X', 'PATCH', '--input', '-'], payload);
      console.log(`Invalidated stale certification comment on PR #${pr.number} (old base ${recordedBase.slice(0, 7)} -> new main ${currentMainSha.slice(0, 7)})`);
    }
  }
}

function main() {
  const mode = process.argv[2];
  const filePath = process.argv[3];
  const repo = process.env.GITHUB_REPOSITORY || 'TomasAlric/terraform-module-release-please-poc';

  if (mode === 'completed') return reportCompleted(repo);
  if (mode === 'invalidate-stale') {
    invalidateStaleOpenPrs(repo);
    return;
  }

  if (!filePath || !existsSync(filePath)) {
    throw new Error(`Missing input file for comment mode '${mode}': ${filePath}`);
  }

  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  if (mode === 'pending') {
    const body = buildPendingComment(data);
    upsertComment(data.repository, data.pr_number, body);
  } else {
    throw new Error(`Unknown comment mode: ${mode}`);
  }
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
