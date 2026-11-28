// Git objects and Release Please are real. Only the GitHub release and PR APIs are in memory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');
const { Manifest } = require('release-please');
const { LocalGitHub } = require('release-please/build/src/local-github');
const { createHash } = require('node:crypto');
const config = fs.readFileSync(path.join(__dirname, '../../../release-please-config.json'));
const historical = ['6.0.0', '6.1.0', '6.1.1', '6.2.0'];

async function scenario(label, messages, expected, tagOnly = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brownfield-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_DATE: '2024-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2024-01-01T00:00:00Z' } }).trim();
  const write = (file, body) => fs.writeFileSync(path.join(dir, file), body);
  const commit = msg => { git('add', '.'); git('commit', '-qm', msg); return git('rev-parse', 'HEAD'); };
  const releases = [];
  const pulls = [];
  const inventory = () => historical.map(v => {
    const t = 'v' + v;
    return { tag: t, commit: git('rev-parse', t), tree: git('rev-parse', t+'^{tree}'),
      changelog: git('rev-parse', t+':CHANGELOG.md'), release: releases.find(r => r.tagName === t) || null };
  });
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
    let history = '# Changelog\n';
    for (const version of historical) {
      history += '\n## ' + version + '\n\nManual notes for ' + version + '\n';
      write('CHANGELOG.md', history);
      write('main.tf', 'output "revision" { value = "'+version+'" }\n');
      const sha = commit('Entrega manual ' + version);
      git('tag', 'v' + version);
      if (!tagOnly || version !== '6.2.0') releases.unshift({ id: historical.indexOf(version)+1, draft:false, prerelease:false, tagName: 'v'+version, name: version, sha,
        notes: 'Manual notes for '+version, assets: [{name:'notes.txt',digest:createHash('sha256').update(history).digest('hex')}] });
    }
    const before = JSON.stringify(inventory());
    const consumer = git('show', 'v6.1.1:main.tf');
    write('release-please-config.json', config);
    write('.release-please-manifest.json', JSON.stringify({'.':'6.2.0'}));
    fs.mkdirSync(path.join(dir,'.release'));
    write('.release/brownfield.json', JSON.stringify({repository:'fixture/module',tag:'v6.2.0',commit:git('rev-parse','v6.2.0'),release_id:4}));
    commit('ci: adopt release management');
    git('remote','add','origin',dir);
    let previewBase = git('rev-parse','HEAD');
    for (const [i, msg] of messages.entries()) {
      previewBase = git('rev-parse','HEAD');
      write(msg.startsWith('docs:') ? 'README.md' : 'change.tf', '# change '+i+'\n');
      commit(msg);
    }
    git('update-ref','refs/remotes/origin/main',previewBase);
    const bin = fs.mkdtempSync(path.join(dir,'.git','fixture-bin-'));
    const cli = path.join(bin,'gh');
    fs.writeFileSync(cli, '#!/bin/sh\n[ "$1" = api ] || exit 1\nprintf "%s" "$FIXTURE_RELEASE"\n',{mode:0o755});
    const stable = releases[0];
    const env = {...process.env, PATH:bin+path.delimiter+process.env.PATH, GH_TOKEN:'', GITHUB_REPOSITORY:'fixture/module',
      FIXTURE_RELEASE:JSON.stringify({...stable, tag_name:stable.tagName}), PR_NUMBER:'1', PR_BASE_SHA:previewBase,
      PR_TITLE:messages.at(-1) || 'ci: adopt release management', PR_BODY:'', PR_HEAD_REF:'feature',
      PR_HEAD_SHA:git('rev-parse','HEAD'), TESTED_SHA:git('rev-parse','HEAD')};
    const output = path.join(bin,'preview.json');
    const result = spawnSync(process.execPath,[path.join(__dirname,'../preview.cjs'),output],{cwd:dir,env,encoding:'utf8'});
    let projected;
    if (tagOnly) {
      assert.notEqual(result.status,0);
      assert.match(result.stderr,/Incomplete stable release/);
    } else {
      assert.equal(result.status,0,result.stderr);
      projected = JSON.parse(fs.readFileSync(output));
      assert.equal(projected.expected_next_version,expected);
    }
    const api = {
      async *releaseIterator() { yield* releases; },
      async *pullRequestIterator(branch, state) { if (state === 'MERGED') yield* pulls; },
    };
    const scm = new LocalGitHub({owner:'fixture', repo:'module', defaultBranch:'main'}, api, dir);
    const manifest = await Manifest.fromManifest(scm, 'main');
    const proposals = await manifest.buildPullRequests();
    assert.equal(proposals.length, expected ? 1 : 0);
    if (expected) {
      const [pr] = proposals;
      assert.ok(pr.title.toString().endsWith(expected));
      const changes = await scm.buildChangeSet(pr.updates, 'main');
      for (const [name, change] of changes) write(name, change.content);
      const updated = fs.readFileSync(path.join(dir,'CHANGELOG.md'),'utf8');
      const oldSections = history.slice(history.indexOf('## '));
      assert.equal(updated.split(oldSections).length, 2);
      assert.equal(JSON.parse(changes.get('.release-please-manifest.json').content)['.'], expected);
      const candidate = git('rev-parse','HEAD');
      const rc = projected?.candidate_tag;
      if (rc) git('tag', rc, candidate);
      const sha = commit(pr.title.toString());
      pulls.push({ number:1, sha, title:pr.title.toString(), body:pr.body.toString(), labels:['autorelease: pending'],
        headBranchName:pr.headRefName, baseBranchName:'main', files:[...changes.keys()] });
      const [release] = await (await Manifest.fromManifest(scm, 'main')).buildReleases();
      assert.equal(release.tag.toString(), 'v'+expected);
      assert.equal(release.sha, sha);
      git('tag',release.tag.toString(),sha);
      releases.unshift({tagName:release.tag.toString(),name:release.name,notes:release.notes,sha});
      console.log(label, rc, release.tag.toString(), sha);
    }
    assert.equal(JSON.stringify(inventory()),before);
    assert.equal(git('show','v6.1.1:main.tf'),consumer);
    console.log('PASS',label,'historical inventory',createHash('sha256').update(before).digest('hex'));
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
(async () => {
  for (const args of [
    ['patch',['fix: correct module behavior'],'6.2.1'], ['minor',['feat: add output'],'6.3.0'],
    ['major',['feat!: remove old output'],'7.0.0'], ['docs',['docs: explain inputs'],null],
    ['no change',[],null], ['accumulated',['Legacy adjustment','fix: repair output','feat: extend output'],'6.3.0'],
    ['tag only',['fix: repair output'],'6.2.1',true],
  ]) await scenario(...args);
})().catch(error => { console.error(error); process.exitCode = 1; });
