// Release Please calculates the candidate. Only transport to the reserved branch is customized.
const { execFileSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const { GitHub, Manifest } = require('release-please');

function command(program, args, input) {
  return execFileSync(program, args, { encoding: 'utf8', input }).trim();
}
const git = (...args) => command('git', args);
const gh = (...args) => command('gh', args);

const { resolveStableBaseline } = require('./baseline.cjs');

async function reconcile() {
  if (!process.env.GH_TOKEN) throw Error('Release credential required');
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const github = await GitHub.create({ owner, repo, token: process.env.GH_TOKEN });
  const manifest = await Manifest.fromManifest(github, 'main');
  const base = git('rev-parse', 'HEAD');
  resolveStableBaseline(process.env.GITHUB_REPOSITORY, base);
  const candidates = await manifest.buildPullRequests();
  if (!candidates.length) return;
  if (candidates.length !== 1) throw Error('Expected one root package');
  const candidate = candidates[0];
  const branch = candidate.headRefName;
  if (branch !== 'release-please--branches--main') throw Error('Unexpected candidate branch');
  const changes = await github.buildChangeSet(candidate.updates, base);
  for (const [path, update] of changes) {
    if (!['CHANGELOG.md', '.release-please-manifest.json', 'README.md', 'versions.tf'].includes(path)) {
      throw Error('Unexpected release file ' + path);
    }
    writeFileSync(path, update.content);
    git('add', '--', path);
  }
  const remoteBase = git('ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0];
  if (base !== remoteBase) throw Error('Main advanced. Reconcile the new push.');
  const tree = git('write-tree');
  const old = git('ls-remote', 'origin', 'refs/heads/' + branch).split(/\s/)[0];
  if (old) git('fetch', 'origin', 'refs/heads/' + branch);
  if (!old || git('rev-parse', old + '^{tree}') !== tree || git('merge-base', old, base) !== base) {
    const parents = ['-p', base];
    if (old && old !== base) parents.push('-p', old);
    const sha = git('commit-tree', tree, ...parents, '-m', candidate.title.toString());
    git('push', 'origin', sha + ':refs/heads/' + branch);
  }
  const prs = JSON.parse(gh('pr', 'list', '--base', 'main', '--head', branch, '--json', 'number,title,body'));
  const title = candidate.title.toString();
  const body = candidate.body.toString();
  const args = ['--title', title, '--body-file', '-'];
  if (!prs.length) {
    command('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--label', 'autorelease: pending', ...args], body);
  } else if (prs[0].title !== title || prs[0].body.trim() !== body.trim()) {
    command('gh', ['pr', 'edit', String(prs[0].number), ...args], body);
  }
  console.log(title, branch, tree);
}
reconcile().catch(error => { console.error(error.message); process.exitCode = 1; });
