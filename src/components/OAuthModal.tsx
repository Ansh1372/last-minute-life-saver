import React, { useState } from 'react';
import { setCachedToken, getOAuthUrl } from '../auth';
import { Key, Globe, Eye, EyeOff, ShieldCheck, Check } from 'lucide-react';

interface OAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string) => void;
}

export default function OAuthModal({ isOpen, onClose, onSuccess }: OAuthModalProps) {
  const envClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const [clientId, setClientId] = useState(envClientId);
  const [manualToken, setManualToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [developerName, setDeveloperName] = useState('Workspace Tester');
  const [developerEmail, setDeveloperEmail] = useState('workspace@gmail.com');

  const defaultScopes = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/documents'
  ];

  // Pre-fill local storage client id if env is empty
  React.useEffect(() => {
    if (!envClientId) {
      const saved = localStorage.getItem('life_saver_client_id');
      if (saved) setClientId(saved);
    }
  }, [envClientId]);

  if (!isOpen) return null;

  const handleLaunchOAuth = () => {
    if (!clientId) {
      alert("Please provide a Google OAuth Client ID first.");
      return;
    }
    const redirectUri = window.location.origin;
    const authUrl = getOAuthUrl(clientId, redirectUri, defaultScopes);
    
    // Save client id to restore easily
    localStorage.setItem('life_saver_client_id', clientId);
    window.location.href = authUrl;
  };

  const handleManualTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken) return;
    
    setCachedToken(manualToken, developerEmail, developerName);
    onSuccess(manualToken);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl border border-slate-100 overflow-hidden" id="oauth-modal-container">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-display text-xl font-semibold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-slate-800" />
            Connect Google Workspace
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Authorizes Calendar synchronization & document draft writing.
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Method A: Google Implicit Flow */}
          <div className="space-y-3">
            <h4 className="font-display font-medium text-sm text-slate-900 flex items-center gap-2">
              <Globe className="h-4 w-4 text-slate-600" />
              Standard Google OAuth
            </h4>
            <div className="p-4 bg-slate-50 rounded-xl space-y-3 border border-slate-100">
              {!envClientId && (
                <>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Provide your custom **Google Client ID** (from Google Cloud Console) to log in directly via the official secure Google Consent page.
                  </p>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-mono text-slate-400 font-semibold mb-1">
                      Google Client ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 575869-abc.apps.googleusercontent.com"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 font-mono bg-white"
                    />
                  </div>
                </>
              )}
              {envClientId && (
                <p className="text-xs text-slate-600 leading-relaxed text-center py-2">
                  Securely connect your Google Calendar and Gmail to allow the AI to schedule slots and draft documents automatically.
                </p>
              )}
              <button
                type="button"
                onClick={handleLaunchOAuth}
                className="w-full bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                Authenticate via Google
              </button>
            </div>
          </div>

          <div className="relative flex py-1 items-center justify-center">
            <div className="border-t border-slate-100 flex-grow"></div>
            <span className="flex-shrink mx-4 text-[10px] font-mono font-medium text-slate-400 bg-white px-2">OR</span>
            <div className="border-t border-slate-100 flex-grow"></div>
          </div>

          {/* Method B: Developer Token Override */}
          <div className="space-y-3">
            <h4 className="font-display font-medium text-sm text-slate-900 flex items-center gap-2">
              <Key className="h-4 w-4 text-slate-600" />
              Developer Bypass (Access Token)
            </h4>
            <form onSubmit={handleManualTokenSubmit} className="p-4 bg-amber-50/40 rounded-xl space-y-3 border border-amber-100">
              <p className="text-xs text-slate-600 leading-relaxed">
                Running in a secure sandbox? Paste an active **Access Token** (from Google OAuth Playground or CLI) to bypass client registration.
              </p>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-mono text-slate-400 font-semibold mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={developerName}
                    onChange={(e) => setDeveloperName(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-mono text-slate-400 font-semibold mb-1">
                    Google Email
                  </label>
                  <input
                    type="email"
                    value={developerEmail}
                    onChange={(e) => setDeveloperEmail(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider font-mono text-slate-400 font-semibold mb-1">
                  Access Token Value
                </label>
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    placeholder="ya29.a0AfB_..."
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    className="w-full text-xs pl-3 pr-10 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 font-mono bg-white"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-amber-600 text-white hover:bg-amber-700 text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                Apply Developer Override Token
              </button>
            </form>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
