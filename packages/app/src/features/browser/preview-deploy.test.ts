import { describe, expect, it } from 'vitest';

import checkRunFixture from './__fixtures__/check-run.json';
import prCommentFixture from './__fixtures__/pr-comment.json';
import { PREVIEW_DEPLOY_HOSTS, matchPreviewDeploy } from './preview-deploy';

describe('matchPreviewDeploy', () => {
  it('extracts preview deployment URLs from comment or check text', () => {
    const text = 'Deploys ready at https://my-app-git-feat.vercel.app and https://my-app.netlify.app/demo!';
    expect(matchPreviewDeploy(text)).toEqual([
      'https://my-app-git-feat.vercel.app',
      'https://my-app.netlify.app/demo',
    ]);
  });

  it('rejects partial host matches', () => {
    const text = 'Check out https://notvercel.app.fake/foo and https://myvercel.app.com';
    expect(matchPreviewDeploy(text)).toEqual([]);
  });

  it('reads a real GitHub check-run payload — the preview link lives in its output summary', () => {
    const found = matchPreviewDeploy(checkRunFixture.output.summary);
    expect(found).toEqual(['https://my-app-git-feat-login-acme.vercel.app']);
  });

  it('reads a real PR-comment payload, ignoring a deploy-log link on a host not in the allowlist', () => {
    const found = matchPreviewDeploy(prCommentFixture.body);
    expect(found).toEqual([
      'https://deploy-preview-42--my-app.netlify.app',
      'https://deploy-preview-42--my-app.netlify.app/__preview',
    ]);
    expect(found).not.toContain('https://app.netlify.com/sites/my-app/deploys/64f0a1b2');
  });

  it('matches only against a user-edited allowlist when one is passed', () => {
    const text = 'Preview at https://my-app.vercel.app and https://my-app.example-hosting.dev';
    expect(matchPreviewDeploy(text, ['example-hosting.dev'])).toEqual([
      'https://my-app.example-hosting.dev',
    ]);
  });

  it('returns nothing for an empty allowlist', () => {
    expect(matchPreviewDeploy('https://my-app.vercel.app', [])).toEqual([]);
  });

  it('exports the seeded allowlist as the seven public hosts', () => {
    expect(PREVIEW_DEPLOY_HOSTS).toEqual([
      'vercel.app',
      'netlify.app',
      'pages.dev',
      'surge.sh',
      'render.com',
      'fly.dev',
      'onrender.com',
    ]);
  });
});
