import { createFileRoute, redirect } from '@tanstack/react-router';

/** Classification rules now sit on the single Rules page. */
export const Route = createFileRoute('/_authenticated/classification-rules')({
  beforeLoad: () => { throw redirect({ to: '/rules', hash: 'classification', replace: true }); },
  head: () => ({ meta: [{ title: 'Rules — Thapal' }, { name: 'description', content: 'Classification rules now live on the Rules page.' }, { property: 'og:title', content: 'Rules — Thapal' }, { property: 'og:description', content: 'Classification rules now live on the Rules page.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
});
