import { useState, type FormEvent } from 'react';
import { Mail, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function SignIn() {
  const { signInWithEmail, verifyEmailCode, configured } = useAuth();
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    setError(null);
    try {
      await signInWithEmail(email);
      setStatus('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the link');
      setStatus('idle');
    }
  }

  async function handleCode(event: FormEvent) {
    event.preventDefault();
    if (code.replace(/\D/g, '').length < 6) return;
    setVerifying(true);
    setError(null);
    try {
      await verifyEmailCode(email, code);
      // AuthContext picks up the new session and App swaps this screen out.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code didn’t work');
      setVerifying(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-medium text-gray-900">NBA Bruball</h1>
          <p className="mt-2 text-sm text-gray-600">
            Draft NBA teams. Ride them all season.
          </p>
        </div>

        {!configured && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Supabase isn’t configured. Add <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to <code>.env.local</code>.
          </div>
        )}

        {status === 'sent' ? (
          <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-center">
            <CheckCircle2 className="mx-auto mb-2 size-8 text-green-600" />
            <p className="font-medium text-gray-900">Check your email</p>
            <p className="mt-1 text-sm text-gray-600">
              We sent a sign-in link and code to {email}.
            </p>
            <form onSubmit={handleCode} className="mt-4 text-left">
              <label htmlFor="code" className="mb-1 block text-sm font-medium text-gray-700">
                Link opening in your email app? Enter the code instead:
              </label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                maxLength={10}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-center text-lg tracking-widest outline-none focus:border-orange-500"
              />
              <button
                type="submit"
                disabled={verifying || code.replace(/\D/g, '').length < 6}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-orange-700 disabled:opacity-60"
              >
                {verifying && <Loader2 className="size-4 animate-spin" />}
                Sign in with code
              </button>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </form>
            <button
              type="button"
              onClick={() => {
                setStatus('idle');
                setCode('');
                setError(null);
              }}
              className="mt-4 text-sm text-orange-600 underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={!configured}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:border-orange-500 disabled:bg-gray-100"
            />
            <button
              type="submit"
              disabled={status === 'sending' || !configured}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-orange-700 disabled:opacity-60"
            >
              {status === 'sending' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mail className="size-4" />
              )}
              Send sign-in link
            </button>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <p className="mt-3 text-center text-xs text-gray-500">
              No password needed — we’ll email you a link.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
