import { describe, expect, it } from 'vitest';
import { matchPreviewDeploy } from './preview-deploy';

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
});
