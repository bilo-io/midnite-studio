import { BsRobot } from 'react-icons/bs';
import { MdOutlineWorkspaces } from 'react-icons/md';
import { SiBitbucket, SiGit, SiGithub, SiGitlab } from 'react-icons/si';
import { VscAzureDevops } from 'react-icons/vsc';
import { describe, expect, it } from 'vitest';

import {
  AGENTS_CATEGORY_ICON,
  WORKSPACE_CATEGORY_ICON,
  categoryIconMaskUrl,
  gitCategoryIcon,
} from './nav-category-icons';

describe('gitCategoryIcon', () => {
  it('maps each supported forge to its own brand mark and colour', () => {
    expect(gitCategoryIcon('github')).toEqual({ Icon: SiGithub, color: 'currentColor' });
    expect(gitCategoryIcon('gitlab')).toEqual({ Icon: SiGitlab, color: '#FC6D26' });
    expect(gitCategoryIcon('bitbucket')).toEqual({ Icon: SiBitbucket, color: '#0052CC' });
    expect(gitCategoryIcon('azure')).toEqual({ Icon: VscAzureDevops, color: '#0078D7' });
  });

  it('falls back to the plain Git mark for an unrecognised forge', () => {
    expect(gitCategoryIcon('unknown')).toEqual({ Icon: SiGit, color: '#F05032' });
  });

  it('falls back to the plain Git mark when no repo is selected', () => {
    expect(gitCategoryIcon(null)).toEqual({ Icon: SiGit, color: '#F05032' });
  });
});

describe('static category icons', () => {
  it('Agents wears the same robot glyph as the title bar agent count', () => {
    expect(AGENTS_CATEGORY_ICON).toEqual({ Icon: BsRobot, color: 'currentColor' });
  });

  it('Workspace wears MdOutlineWorkspaces', () => {
    expect(WORKSPACE_CATEGORY_ICON).toEqual({ Icon: MdOutlineWorkspaces, color: 'currentColor' });
  });
});

describe('categoryIconMaskUrl', () => {
  it('renders an icon to a data: URL usable as a CSS mask-image', () => {
    const url = categoryIconMaskUrl(SiGit);
    expect(url.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(url).toContain('svg');
    expect(url.endsWith('")')).toBe(true);
  });

  it('renders each icon to a distinct shape', () => {
    expect(categoryIconMaskUrl(SiGit)).not.toEqual(categoryIconMaskUrl(SiGithub));
  });
});
