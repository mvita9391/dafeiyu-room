import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, runCompatibilityProbe } from '../scripts/probe-world-integration.mjs';

test('unknown host stays unverified and missing transport is unavailable', () => {
  const report = buildReport({ host: { name: 'unknown' } });
  assert.equal(report.host.status, 'unverified');
  assert.deepEqual(report.supportedTransports, []);
  assert.equal(report.connection.status, 'unavailable');
});

test('report allowlist never serializes credentials, arbitrary metadata, or paths', () => {
  const secret = { token: 'TOP_SECRET', authorization: 'Bearer PRIVATE', path: '/Users/private/model', error: 'secret /Volumes/private', protocolVersions: ['2025-11-25', '/Users/private'], supportedTransports: ['stdio', '/Users/private'] };
  const report = buildReport({ ...secret, host: secret, voice: secret });
  const json = JSON.stringify(report);
  for (const forbidden of ['TOP_SECRET', 'PRIVATE', '/Users/', '/Volumes/', 'Bearer']) assert.equal(json.includes(forbidden), false);
});

test('standard SDK clients discover and call tools over real HTTP and stdio', async () => {
  const report = await runCompatibilityProbe();
  assert.deepEqual(report.supportedTransports.sort(), ['stdio', 'streamable-http']);
  assert.equal(report.connection.status, 'verified');
  assert.equal(report.host.status, 'unverified');
  assert.ok(report.protocolVersions.includes('2025-11-25'));
  for (const result of report.experiments) {
    assert.equal(result.discovered, true);
    assert.equal(result.called, true);
    assert.equal(result.unauthorizedRejected, true);
  }
  assert.equal("voicePackaging" in report, false);
});
