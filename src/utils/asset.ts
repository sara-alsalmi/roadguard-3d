/** URL of a file in /public, correct under any deploy path (e.g. GitHub Pages at /repo-name/). */
export const asset = (path: string): string => import.meta.env.BASE_URL + path.replace(/^\//, "");
