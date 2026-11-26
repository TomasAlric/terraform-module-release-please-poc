// Execute com NODE_PATH apontando ao node_modules da instalação isolada.
require("release-please");
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { TerraformModule } = require('release-please/build/src/strategies/terraform-module');
const { parseConventionalCommits } = require('release-please/build/src/commit');
const { TagName } = require('release-please/build/src/util/tag-name');

async function main() {
  const config = JSON.parse(fs.readFileSync('release-please-config.json')).packages['.'];
  const strategy = new TerraformModule({
    github: { repository: { owner: 'lab', repo: 'module' }, findFilesByFilenameAndRef: async () => [] },
    targetBranch: 'main',
    includeComponentInTag: config['include-component-in-tag'],
    changelogSections: config['changelog-sections'],
  });
  const baseline = { tag: TagName.parse('v6.2.0'), sha: 'a'.repeat(40) };
  const cases = [
    ['fix: repair contract', '6.2.1'], ['feat: extend contract', '6.3.0'],
    ['feat!: replace contract', '7.0.0'], ['fix: migrate output\n\nBREAKING CHANGE: remove old output', '7.0.0'],
    ['perf: optimize validation', '6.2.1'],
    ...['docs', 'test', 'chore', 'refactor', 'ci'].map(type => [type + ': maintenance', null]),
  ];
  for (const [message, expected] of cases) {
    const commits = parseConventionalCommits([{ message, sha: 'b'.repeat(40), files: ['main.tf'] }]);
    const pr = await strategy.buildReleasePullRequest(commits, baseline);
    const actual = pr?.version.toString() ?? null;
    assert.equal(actual, expected);
    console.log(JSON.stringify({ message, actual }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
