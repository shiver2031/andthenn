import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const gate = resolve('scripts/release-gate.mjs');
const keys = ['production-role-mapping','client-access-grants','manager-finance-grants','finance-definitions','standalone-task-scope','retention-privacy','platform-ownership','provider-sandboxes','backup-recovery','performance-accessibility','uat-founder','uat-manager','uat-designer','uat-client'];
test('release gate rejects missing, stale, future and dirty attestations and requires immutable production artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'andthenn-gate-test-')), repo = join(root, 'repo'), packet = join(root, 'packet.json');
  await mkdir(repo);
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init'); git('config','user.name','Gate test'); git('config','user.email','gate-test@example.invalid');
    await writeFile(join(repo,'baseline.txt'),'isolated fixture'); git('add','.'); git('commit','-m','fixture');
    const sha = git('rev-parse','HEAD');
    const record = { releaseCommit: sha, approvals: Object.fromEntries(keys.map(key => [key, {status:'approved',approvedBy:'Fixture Approver',approvedAt:'2020-01-01T00:00:00Z',evidence:'https://example.invalid/fixture'}])) };
    const run = async (data, artifacts = false) => { await writeFile(packet, JSON.stringify(data)); return spawnSync(process.execPath,[gate],{cwd:repo,encoding:'utf8',env:{...process.env,RELEASE_APPROVAL_PATH:packet,RELEASE_REQUIRE_ARTIFACTS:artifacts?'1':'0'}}); };
    assert.equal((await run(record)).status,0);
    assert.notEqual((await run({...record,approvals:{}})).status,0);
    assert.notEqual((await run({...record,releaseCommit:'0'.repeat(40)})).status,0);
    assert.notEqual((await run({...record,approvals:{...record.approvals,'uat-client':{...record.approvals['uat-client'],approvedAt:'2999-01-01'}}})).status,0);
    assert.notEqual((await run(record,true)).status,0);
    const production = {...record,artifacts:Object.fromEntries(['webImage','workerImage','migrationImage'].map(key=>[key,`registry.example.invalid/app@sha256:${'a'.repeat(64)}`])),checks:Object.fromEntries(['quality','browser','migrations','authentication','providers','storage','recovery','performance','accessibility','data-api','uat'].map(key=>[key,{status:'passed',releaseCommit:sha,evidence:'https://example.invalid/fixture'}]))};
    assert.equal((await run(production,true)).status,0);
    await writeFile(join(repo,'unreviewed.txt'),'change'); assert.notEqual((await run(production,true)).status,0);
  } finally { await rm(root,{recursive:true,force:true}); }
});
