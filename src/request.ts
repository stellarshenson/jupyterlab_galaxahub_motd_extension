import { URLExt } from '@jupyterlab/coreutils';

import { ServerConnection } from '@jupyterlab/services';

/**
 * The route prefix of this extension's server half, the only routes the frontend calls.
 */
export const NAMESPACE = 'jupyterlab-galaxahub-motd-extension';

/**
 * The two feeds the tab pulls. The terminal route exists for the terminal hook, not for the tab.
 */
export type Feed = 'rich' | 'notifications';

/**
 * One proxy answer as the model reads it: status 0 when the request never got an answer.
 */
export interface IAnswer {
  status: number;
  etag: string | null;
  body: unknown;
}

/**
 * GET one feed from the proxy. The Etag the model holds goes out as If-None-Match, so an
 * unchanged feed answers 304 with no body.
 */
export async function fetchFeed(
  feed: Feed,
  etag: string | null,
  serverSettings: ServerConnection.ISettings
): Promise<IAnswer> {
  const url = URLExt.join(serverSettings.baseUrl, NAMESPACE, feed);
  const headers: Record<string, string> = etag ? { 'If-None-Match': etag } : {};
  let response: Response;
  try {
    response = await ServerConnection.makeRequest(
      url,
      { headers },
      serverSettings
    );
  } catch {
    return { status: 0, etag: null, body: null };
  }
  let body: unknown = null;
  if (response.status === 200) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  }
  return { status: response.status, etag: response.headers.get('Etag'), body };
}
