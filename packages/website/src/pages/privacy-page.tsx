import { Container, Heading, Lede } from '../components';
import { SiteNav } from '../components/site-nav';
import { Footer } from '../sections/footer/footer';

import { PrivacyMarkdown } from './privacy-markdown';
// The statement itself: generated from the app's network registry (`moon run root:privacy-doc`), so the
// page and the app can never describe different hosts. Taken as text at build time, not linked.
import privacyDoc from '../../../../docs/PRIVACY.md?raw';

/**
 * `docs/PRIVACY.md` points a reader at the repository's `SECURITY.md`; the site never links to or names a
 * repository, so that clause is dropped here rather than edited out of the source document.
 */
export const publicPrivacySource = (source: string): string => source.replace(/;\s*see `SECURITY\.md`/g, '');

/**
 * The privacy page, served at `/privacy/`.
 *
 * Same three parts as every other page (nav / main / footer). It carries no link to a repository, a
 * release list or an issue tracker — the guard test in `privacy-page.test.tsx` holds it to that.
 */
export const PrivacyPage = () => (
  <>
    <SiteNav offLanding />
    <main>
      <Container className="max-w-3xl pb-16 pt-20 sm:pt-28">
        <div className="flex flex-col items-start gap-5">
          <Heading level={1}>Privacy</Heading>
          <Lede>
            Midnite Studio runs on your Mac and needs no account with us. This is what it sends out, what it keeps and
            how, and who can reach in.
          </Lede>
        </div>
        <div className="mt-10">
          <PrivacyMarkdown source={publicPrivacySource(privacyDoc)} />
        </div>
      </Container>
    </main>
    <Footer />
  </>
);
