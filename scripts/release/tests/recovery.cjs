// Run the production publisher against a bare Git remote and a file-backed Releases API double.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { publish } = require('../publication.cjs');
const repo = 'fixture/recovery';

async function worker() {
  await publish({ async createRelease({name, tag, notes, sha}) {
    const file = process.env.RELEASE_FILE;
    if (process.env.FAULT === 'after-tag') throw Error('simulated transport failure before release');
    const data = {id:1, name, tag_name:tag.toString(), target_commitish:sha, body:notes, author:{id:82914085},
      assets:[], prerelease:false, draft:false, html_url:'https://example.invalid/release'};
    fs.writeFileSync(file, JSON.stringify(data), {flag:'wx'});
    if (process.env.FAULT === 'after-release') throw Error('simulated timeout after release creation');
  }});
}

async function scenario(fault) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'release-recovery-'));
  const repository = path.join(dir,'work');
  const remote = path.join(dir,'remote.git');
  const file = path.join(dir,'release.json');
  const asset = path.join(dir,'asset.json');
  const git = (...args) => execFileSync('git',args,{cwd:repository,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  fs.mkdirSync(repository);
  try {
    git('init','--bare',remote); git('init','-b','main'); git('remote','add','origin',remote);
    git('-c','user.name=Fixture','-c','user.email=f@example.invalid','commit','--allow-empty','-m','fixture');
    const sha = git('rev-parse','HEAD');
    const proof = {repository:repo,version:'6.2.1',result:'success',merge_commit:sha,certified_tree:git('rev-parse','HEAD^{tree}'),
      pull_request:1,certified_at:'2025-01-01T00:00:00Z'};
    const proposal = {proof,name:'v6.2.1',notes:'Correction'};
    const bin = path.join(dir,'gh');
    fs.writeFileSync(bin,`#!/usr/bin/env python3
import json, os, pathlib, sys
args=sys.argv[1:]
release=pathlib.Path(os.environ['RELEASE_FILE'])
asset=pathlib.Path(os.environ['ASSET_FILE'])
if args[0]=='api':
    if not release.exists():
        sys.exit('not found (HTTP 404)')
    print(release.read_text())
elif args[:2]==['release','upload']:
    if os.getenv('FAULT')=='upload-failed': sys.exit('upload refused')
    with asset.open('xb') as dest: dest.write(pathlib.Path(args[3]).read_bytes())
    data=json.loads(release.read_text())
    data['assets']=[{'name':'certification.json'}]
    release.write_text(json.dumps(data))
    if os.getenv('FAULT')=='upload-timeout': sys.exit('timeout after upload')
elif args[:2]==['release','download']:
    if '--dir' in args: (pathlib.Path(args[-1])/'certification.json').write_bytes(asset.read_bytes())
    else: sys.stdout.buffer.write(asset.read_bytes())
elif args[:2]!=['issue','edit']: sys.exit('unexpected command')
`, {mode:0o755});
    const start = (payload, fail = '') => new Promise(resolve => {
      const child = spawn(process.execPath,[__filename,'worker'],{cwd:repository,env:{...process.env,
        PATH:dir+path.delimiter+process.env.PATH, RELEASE_FILE:file, ASSET_FILE:asset, RUNNER_TEMP:dir,
        GH_TOKEN:'', GITHUB_REPOSITORY:repo, GITHUB_STEP_SUMMARY:path.join(dir,'summary'),
        CERTIFIED_PROPOSAL:JSON.stringify(payload), FAULT:fail},stdio:'ignore'});
      child.on('close',resolve);
    });
    const divergent = {...proposal,notes:'Different authorization'};
    if (fault === 'different-commit') {
      git('-c','user.name=Fixture','-c','user.email=f@example.invalid','commit','--allow-empty','-m','other candidate');
      const different = git('rev-parse','HEAD');
      git('push','origin',different+':refs/tags/v6.2.1');
      assert.equal(await start(proposal),1);
      assert.ok(git('ls-remote','origin','refs/tags/v6.2.1').startsWith(different));
      assert.equal(fs.existsSync(file),false);
    } else if (fault === 'competing') {
      const results = await Promise.all([start(proposal),start(divergent)]);
      assert.deepEqual(results.sort(),[0,1]);
    } else {
      assert.equal(await start(proposal,fault),1);
      assert.ok(git('ls-remote','origin','refs/tags/v6.2.1^{}').startsWith(sha));
      assert.equal(fs.existsSync(file),fault !== 'after-tag');
      assert.equal(fs.existsSync(asset),fault === 'upload-timeout');
      assert.equal(await start(divergent),1);
      assert.equal(await start(proposal),0);
      assert.equal(await start(proposal),0);
      assert.deepEqual(JSON.parse(fs.readFileSync(asset)),proof);
      fs.writeFileSync(asset,'different bytes');
      assert.equal(await start(proposal),1);
      assert.equal(fs.readFileSync(asset,'utf8'),'different bytes');
    }
    assert.equal(git('ls-remote','--refs','--tags','origin').split('\n').length,1);
    console.log('PASS',fault,'one tag; original proposal retained');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
(async () => {
  if (process.argv[2] === 'worker') return worker();
  for (const fault of ['after-tag','after-release','upload-failed','upload-timeout','competing','different-commit']) await scenario(fault);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
