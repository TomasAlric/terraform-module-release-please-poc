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

function buildFinalComment(report) {
  const preview = report.preview;
  const cert = report.certification;
  const impact = report.upgrade_impact || { create: 0, update: 0, replace: 0, delete: 0 };
  const policy = report.upgrade_policy_details || {
    critical_resource_preservation: cert.upgrade_impact_policy === 'PASS' ? 'PASS' : 'FAIL',
    contract_compatibility: cert.upgrade_impact_policy === 'PASS' ? 'PASS' : 'FAIL',
    upgrade_authorization: cert.upgrade_impact_policy === 'PASS' ? 'PASS' : 'FAIL',
  };
  const repo = preview.repository;
  const runUrl = `https://github.com/${repo}/actions/runs/${preview.workflow_run_id}`;
  const candidateUrl =
    preview.rc_status?.candidate_url || `https://github.com/${repo}/tree/${encodeURIComponent(preview.candidate_tag)}`;
  const nextVersionDisplay = preview.expected_next_tag
    ? preview.expected_next_tag
    : 'None (no release triggered — remains ' + preview.current_stable_tag + ')';

  const incompatibilityDisplay =
    report.detected_incompatibilities && report.detected_incompatibilities.length > 0
      ? `Detected (${report.detected_incompatibilities.map(sanitizeText).join('; ')})`
      : 'None detected';

  const reuseDisplay = preview.evidence_reuse?.reused
    ? `Reused authenticated evidence from run #${preview.evidence_reuse.source_run_id} (fingerprint \`${preview.equivalence_fingerprint.slice(0, 12)}\`)`
    : `Full certification executed (${sanitizeText(preview.evidence_reuse?.reason || 'primary execution')})`;

  const lines = [
    MARKER,
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
    `| Terraform Contract Tests | ${cert.terraform_contracts} |`,
    `| Fresh Installation | ${cert.fresh_installation} |`,
    `| Consumer Upgrade | ${cert.consumer_upgrade} |`,
    `| Upgrade Plan Policy | ${cert.upgrade_impact_policy} |`,
    `| Post-upgrade Idempotency | ${cert.post_upgrade_idempotency} |`,
    `| Cleanup | ${cert.cleanup} |`,
    '',
    `Overall result: ${cert.result}`,
    '',
    '### Upgrade Impact',
    '',
    `Stable: ${preview.current_stable_tag}`,
    `Candidate: ${preview.candidate_tag}`,
    '',
    `Create: ${impact.create}`,
    `Update: ${impact.update}`,
    `Replace: ${impact.replace}`,
    `Delete: ${impact.delete}`,
    '',
    `Critical resource preservation: ${policy.critical_resource_preservation}`,
    `Contract compatibility: ${policy.contract_compatibility}`,
    `Upgrade authorization: ${policy.upgrade_authorization}`,
    '',
    '### Evidence & Traceability',
    `- **Declared breaking changes**: ${sanitizeText(preview.breaking_summary)}`,
    `- **Detected contract/upgrade incompatibility**: ${incompatibilityDisplay}`,
    `- **Evidence reuse**: ${reuseDisplay}`,
    `- **Equivalence fingerprint**: \`${preview.equivalence_fingerprint}\``,
    `- **Candidate reference**: [\`${preview.candidate_tag}\`](${candidateUrl})`,
    `- **Workflow run**: [Run #${preview.workflow_run_id} (attempt ${preview.workflow_run_attempt})](${runUrl})`,
  ];

  if (report.failures && report.failures.length > 0) {
    lines.push('', '### Failure Diagnostics');
    for (const f of report.failures) {
      lines.push(`- **FAIL**: ${sanitizeText(f)}`);
    }
  }

  lines.push(
    '',
    cert.result === 'PASS'
      ? 'Publication: Pending protected merge and final certification.'
      : 'Publication: BLOCKED — certification checks failed or incomplete.',
    '',
    'This version is a preview and may change before publication.'
  );

  return lines.join('\n');
}

function upsertComment(repo, prNumber, body) {
  const commentsJson = run('gh', ['api', '--paginate', `repos/${repo}/issues/${prNumber}/comments`]);
  const comments = JSON.parse(commentsJson);
  const matching = comments.filter(c => typeof c.body === 'string' && c.body.includes('<!-- release-impact-certification-marker'));

  if (matching.length > 0) {
    const targetId = matching[0].id;
    const payload = JSON.stringify({ body });
    const updated = JSON.parse(
      run('gh', ['api', `repos/${repo}/issues/comments/${targetId}`, '-X', 'PATCH', '--input', '-'], payload)
    );
    // Clean up any duplicate marker comments if they ever existed
    for (let i = 1; i < matching.length; i++) {
      try {
        run('gh', ['api', `repos/${repo}/issues/comments/${matching[i].id}`, '-X', 'DELETE']);
      } catch {
        // ignore
      }
    }
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
    const comments = JSON.parse(run('gh', ['api', '--paginate', `repos/${repo}/issues/${pr.number}/comments`]));
    const existing = comments.find(c => typeof c.body === 'string' && c.body.includes('<!-- release-impact-certification-marker'));
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
  } else if (mode === 'final') {
    const body = buildFinalComment(data);
    upsertComment(data.preview.repository, data.preview.pr_number, body);
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
