import RNShare, { Social } from 'react-native-share';
import { FACEBOOK_APP_ID } from '../constants/social';

// Instagram requires a Facebook App ID as of Jan 2023 — see constants/social.ts.
// Rejects if Instagram isn't installed; caller should catch and show a friendly alert.
export async function shareToInstagramStory(watermarkedImageUri: string) {
  await RNShare.shareSingle({
    backgroundImage: watermarkedImageUri,
    social: Social.InstagramStories,
    appId: FACEBOOK_APP_ID,
    attributionURL: 'https://narrows.site',
  });
}

// Snapchat sharing via react-native-share is Android-first; on iOS, Snap
// deprecated simple pasteboard sharing in favor of their own Creative Kit SDK,
// so this may only open Snapchat without pre-filling the image on iOS. Unlike
// Instagram Stories, Snapchat here isn't a "stories" target — it takes a plain url.
export async function shareToSnapchat(watermarkedImageUri: string) {
  await RNShare.shareSingle({
    url: watermarkedImageUri,
    social: Social.Snapchat,
  });
}
