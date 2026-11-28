// Exercise the production baseline validator and fingerprint with real Git trees.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { validateBaseline } = require('../baseline.cjs');
const { computeEquivalenceContract } = require('../preview.cjs');
const original = process.cwd();
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'integrity-'));
try {
  process.chdir(dir);
  const git = (...args) => execFileSync('git',args,{encoding:'utf8'}).trim();
  git('init','-q');
  const repo = 'fixture/module', tag = 'v6.2.0';
  fs.writeFileSync('main.tf','# fixture\n');
  git('add','main.tf');
  const tree = git('write-tree');
  const commit = git('-c','user.name=Fixture','-c','user.email=f@example.invalid','commit-tree',tree,'-m','manual');
  const initial = computeEquivalenceContract(tree,'6.2.0',commit).fingerprint;
  for (const file of ['new.tf','cluster.tf.json','modules/child/main.tf','templates/launch.tftpl','bin/helper',
    'fixtures/consumer/main.tf','config.json','.terraform.lock.hcl','scripts/release/package-lock.json',
    '.github/workflows/ci.yml','scripts/certify.sh']) {
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,'fixture'); git('add',file);
    assert.notEqual(computeEquivalenceContract(git('write-tree'),'6.2.0',commit).fingerprint,initial);
    git('read-tree',tree);
    console.log('PASS changed fingerprint',file);
  }
  assert.notEqual(computeEquivalenceContract(tree,'6.1.1',commit).fingerprint,initial);
  const release = {id:620,tag_name:tag,prerelease:false,draft:false,target_commitish:commit};
  const proof = {repository:repo,version:'6.2.0',result:'success',merge_commit:commit,certified_tree:tree};
  const anchor = {repository:repo,tag,commit,release_id:620};
  validateBaseline(release,anchor,null,repo,tag,commit,tree);
  validateBaseline(release,null,proof,repo,tag,commit,tree);
  for (const args of [
    [{...release,tag_name:'v6.1.1'},anchor,null], [release,{...anchor,commit:tree},null],
    [release,{...anchor,release_id:1},null], [{...release,draft:true},null,proof],
    [release,null,null], [release,null,{...proof,certified_tree:commit}], [release,null,{...proof,result:'failure'}],
  ]) assert.throws(()=>validateBaseline(...args,repo,tag,commit,tree));
  console.log('PASS manual and certified baseline; seven incompatible states refused');
} finally { process.chdir(original); fs.rmSync(dir,{recursive:true,force:true}); }
