// Pass a single certified Release Please proposal between isolated Actions jobs.
const { execFileSync } = require('node:child_process');
const { appendFileSync, writeFileSync, mkdtempSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const { GitHub, Manifest } = require('release-please');
const { TagName } = require('release-please/build/src/util/tag-name');

function run(cmd, ...args) {
  return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
}

async function authorize(github) {
  const manifest = await Manifest.fromManifest(github, 'main');
  const candidates = await manifest.buildReleases();
  if (!candidates.length) return;
  if (candidates.length !== 1) throw Error('Expected one root release');
  const [release] = candidates;
  const tag = release.tag.toString();
  const proof = JSON.parse(run('python3', 'scripts/release/verify.py', release.sha, tag,
    String(release.pullRequest.number)));
  const changelog = run('git', 'show', release.sha + ':CHANGELOG.md');
  if (!release.notes.trim() || !changelog.includes(release.notes.trim())) throw Error('Release notes mismatch');
  const proposal = { proof, name: release.name || tag, notes: release.notes };
  appendFileSync(process.env.GITHUB_OUTPUT, 'proposal=' + JSON.stringify(proposal) + '\n');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, JSON.stringify(proof) + '\n');
}

async function publish(github) {
  // The writer never asks the manifest to select a release.
  const { proof, name, notes } = JSON.parse(process.env.CERTIFIED_PROPOSAL);
  const tag = 'v' + proof.version;
  const ref = 'refs/tags/' + tag;
  if (proof.repository !== process.env.GITHUB_REPOSITORY || proof.result !== 'success' ||
      run('git', 'rev-parse', proof.merge_commit + '^{tree}') !== proof.certified_tree) {
    throw Error('Invalid certification contract');
  }
  // The first durable side effect commits to the complete approved proposal.
  // A retry constructs the same object, including its original certification timestamp.
  const digest = createHash('sha256').update(JSON.stringify({ proof, name, notes })).digest('hex');
  const timestamp = Date.parse(proof.certified_at) / 1000;
  if (!Number.isSafeInteger(timestamp) || !/^v\d+\.\d+\.\d+$/.test(tag)) throw Error('Invalid tag coordinates');
  const annotation = `object ${proof.merge_commit}\ntype commit\ntag ${tag}\n` +
    `tagger Certified release <release@users.noreply.github.com> ${timestamp} +0000\n\nproposal-sha256 ${digest}\n`;
  const tagObject = execFileSync('git', ['mktag'], {input: annotation, encoding:'utf8'}).trim();
  run('git', 'push', 'origin', tagObject + ':' + ref);
  const checkRef = () => {
    const remote = run('git', 'ls-remote', 'origin', ref, ref + '^{}');
    if (!remote.split('\n').includes(tagObject + '\t' + ref) ||
        !remote.split('\n').includes(proof.merge_commit + '\t' + ref + '^{}')) throw Error('Tag or authorization mismatch');
  };
  checkRef();
  const repo = 'repos/' + proof.repository;
  const releasePath = repo + '/releases/tags/' + tag;
  // Only a confirmed 404 permits creation. Other transport errors stop the job.
  const { spawnSync } = require('node:child_process');
  const lookup = spawnSync('gh', ['api', releasePath], { encoding: 'utf8' });
  if (lookup.status !== 0) {
    if (!lookup.stderr.includes('(HTTP 404)')) throw Error('Cannot query release');
    await github.createRelease({ name, tag: TagName.parse(tag), notes, sha: proof.merge_commit });
  }
  const release = JSON.parse(run('gh', 'api', releasePath));
  if (release.author.id !== 82914085 || release.body.trim() !== notes.trim() || release.draft ||
      release.prerelease || release.tag_name !== tag || release.name !== name || release.target_commitish !== proof.merge_commit) {
    throw Error('Unexpected published release');
  }
  checkRef();
  const directory = mkdtempSync(join(process.env.RUNNER_TEMP, 'proof-'));
  const file = join(directory, 'certification.json');
  const expected = JSON.stringify(proof, null, 2) + '\n';
  if (release.assets.some(asset => asset.name === 'certification.json')) {
    run('gh', 'release', 'download', tag, '--pattern', 'certification.json', '--dir', directory);
    if (readFileSync(file, 'utf8') !== expected) throw Error('Existing proof mismatch');
  } else {
    writeFileSync(file, expected);
    run('gh', 'release', 'upload', tag, file);
  }
  // Confirm bytes after upload as well as on retries, before marking publication complete.
  if (run('gh', 'release', 'download', tag, '--pattern', 'certification.json', '--output', '-') !== expected.trim()) {
    throw Error('Uploaded certificate mismatch');
  }
  checkRef();
  run('gh', 'issue', 'edit', String(proof.pull_request), '--add-label', 'autorelease: tagged',
    '--remove-label', 'autorelease: pending');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, release.html_url + '\n' + JSON.stringify(proof) + '\n');
}

async function main() {
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const github = await GitHub.create({ owner, repo, token: process.env.GH_TOKEN });
  if (process.argv[2] === 'authorize') return authorize(github);
  if (process.argv[2] === 'publish') return publish(github);
  throw Error('Unknown publication operation');
}
module.exports = { publish };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
