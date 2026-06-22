// Simple in-memory storage for token (Required: do NOT store token in localStorage for security purposes)
let cachedAccessToken: string | null = null;
let simulatedUser: { name: string; email: string; photoURL?: string } | null = null;

export interface TokenStatus {
  hasToken: boolean;
  accessToken: string | null;
  user: { name: string; email: string; photoURL?: string } | null;
}

export const getCachedToken = (): TokenStatus => {
  return {
    hasToken: !!cachedAccessToken,
    accessToken: cachedAccessToken,
    user: simulatedUser,
  };
};

export const setCachedToken = (token: string, email: string = "user@example.com", name: string = "Google User") => {
  cachedAccessToken = token;
  simulatedUser = {
    name,
    email,
    photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
  };
  
  // Clean up URL hash if we received it from Google Redirect
  if (window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname);
  }
};

export const clearCachedToken = () => {
  cachedAccessToken = null;
  simulatedUser = null;
};

// Generates the Google implicit flow OAuth URL
export const getOAuthUrl = (clientId: string, redirectUri: string, scopes: string[]): string => {
  const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const options = {
    redirect_uri: redirectUri,
    client_id: clientId,
    access_type: 'offline', // request authorization code
    response_type: 'token',
    prompt: 'consent',
    scope: scopes.join(' '),
  };

  const qs = new URLSearchParams(options);
  return `${rootUrl}?${qs.toString()}`;
};
