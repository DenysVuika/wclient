import type { ApiClient } from '../http/client';

export type ActorProfile = {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  banner?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  indexedAt?: string;
  listItemCount?: number;
  joinedWeekCount?: number;
  joinedAllTimeCount?: number;
  viewer?: {
    muted?: boolean;
    blockedBy?: boolean;
    blocking?: string;
    following?: string;
    followedBy?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/**
 * Extended actor profile with W social attributes.
 */
export type WActorProfile = ActorProfile & {
  wsocialAccountType?: 'human' | 'bot';
  wsocialVerified?: 'wid' | 'admin';
};

export type ActorService = {
  /**
   * Get detailed profile view of an actor.
   * Does not require auth, but returns additional relevant metadata when authenticated.
   *
   * @param actor Handle or DID of account to fetch profile of.
   */
  getProfile: (actor: string) => Promise<ActorProfile>;
};

/**
 * Get detailed profile view of an actor.
 * Does not require auth, but returns additional relevant metadata when authenticated.
 *
 * Query parameters:
 * - actor (string, format: at-identifier, required): Handle or DID of account to fetch profile of.
 */
export async function getProfile(api: ApiClient, actor: string): Promise<ActorProfile> {
  const response = await api.request({
    path: 'app.bsky.actor.getProfile',
    query: {
      actor,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ActorProfile;
}
