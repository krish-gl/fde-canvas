// "How it works": docs/question-logic.md, shown in the app. The file is the one source; this page only renders it.
import { useMemo } from 'react';
import { marked } from 'marked';
import logic from '../../docs/question-logic.md?raw';

// Links in the doc point at source files relative to docs/; in the app they open on GitHub instead.
const REPO = 'https://github.com/krish-gl/fde-canvas/blob/main/';
const withRepoLinks = (markdown: string) => markdown.replace(/\]\(\.\.\/([^)]+)\)/g, (_, path) => `](${REPO}${path})`);

export default function LogicScreen() {
  const html = useMemo(() => marked.parse(withRepoLinks(logic), { async: false }), []);
  return <main className="page narrow">
    <article className="doc" dangerouslySetInnerHTML={{ __html: html }} />
  </main>;
}
