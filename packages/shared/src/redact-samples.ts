/**
 * One credential-shaped sample per `SECRET_PATTERNS` entry (Phase 91 Theme G).
 * Assembled from parts so no literal here trips a repository secret scanner.
 * `redact.test.ts` fails when a pattern has no sample; the diagnostics-bundle
 * test seeds every sample and asserts none survives.
 */
export const REDACT_SAMPLES: Readonly<Record<string, string>> = {
  github: 'gh' + 'p_0123456789abcdefghijABCDEF',
  githubFineGrained: 'github_' + 'pat_0123456789abcdefghijkl',
  gitlab: 'gl' + 'pat-a1b2c3d4e5f6g7h8i9j0k1',
  gitlabOauth: 'glo' + 'as-a1b2c3d4e5f6g7h8i9j0k1',
  llmKey: 'sk' + '-ant-abcdefghijklmnop0123',
  slack: 'xo' + 'xb-0123456789-abcdef',
  slackApp: 'xa' + 'pp-1-A0123456789-abcdef',
  bearer: 'Bearer ' + 'abcdefghijklmnop1234',
  jwt: 'ey' + 'JhbGciOiJI.eyJzdWIiOiIx.abcdefgh12345',
  atlassian: 'ATA' + 'TT3abcdefghijklmnopqrstuvwx',
  pem: ['-----BEGIN RSA PRIVATE KEY-----', 'MIIEowIBAAKCAQEAxyz', '-----END RSA PRIVATE KEY-----'].join('\n'),
  aws: 'AK' + 'IAABCDEFGHIJKLMNOP',
  google: 'AI' + 'zaSyA1234567890abcdefghijklmnopqrstuv',
  stripe: 'sk' + '_live_4eC39HqLyjWDarjtT1zdp7dc',
  npm: 'np' + 'm_' + 'a'.repeat(36),
  queryForm: 'https://x.test/cb?api_key=' + 'supersecretvalue123',
};
