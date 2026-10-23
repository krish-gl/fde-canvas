// Hash routes, so the app works from any static host or file server with no rewrite rules.
//   #/                     projects
//   #/new                  new project, asked as questions
//   #/p/<id>               project canvas
//   #/p/<id>/edit          the same questions, for an existing project
// Older #/a/<id> links (from when projects were called accounts) still open.
import { useEffect, useState } from 'react';

export type Route =
  | { screen: 'projects' }
  | { screen: 'new' }
  | { screen: 'project'; projectId: string }
  | { screen: 'edit'; projectId: string };

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'new') return { screen: 'new' };
  if ((parts[0] === 'p' || parts[0] === 'a') && parts[1]) return parts[2] === 'edit' ? { screen: 'edit', projectId: parts[1] } : { screen: 'project', projectId: parts[1] };
  return { screen: 'projects' };
}

export const hrefFor = (route: Route) =>
  route.screen === 'new' ? '#/new'
    : route.screen === 'project' ? `#/p/${encodeURIComponent(route.projectId)}`
      : route.screen === 'edit' ? `#/p/${encodeURIComponent(route.projectId)}/edit`
        : '#/';

export const navigate = (route: Route) => { window.location.hash = hrefFor(route); };

export function useRoute() {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => { setRoute(parse(window.location.hash)); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
