'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrMsg(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setErrMsg('Invalid email or password');
      return;
    }

    router.push('/');
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      {/* Logo / Hero */}
      <div className="flex flex-col items-center mb-10 text-center">
        <motion.div
          className="flex flex-col items-center"
          initial={{ opacity: 0, y: 20, rotate: -5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <div className="flex items-center space-x-3">
            <motion.span
              className="text-4xl"
              initial={{ rotate: 0 }}
              animate={{ rotate: [0, 20, 0, 20, 0] }}
              transition={{
                repeat: Infinity,
                repeatDelay: 2,
                duration: 1,
                ease: 'easeInOut',
              }}
              role="img"
              aria-label="wave"
            >
              👋
            </motion.span>

            <Image
              src="/logo.png"
              alt="Company Logo"
              width={80}
              height={80}
              className="rounded-full shadow"
            />
          </div>

          <h1 className="text-xl font-semibold text-gray-800 mt-4">
            Welcome to La Mia Mamma Portal
          </h1>
          <p className="text-gray-500 text-sm max-w-xs mt-1">
            Please sign in with your staff email to continue
          </p>
        </motion.div>
      </div>

      {/* Card / Form */}
      <motion.div
        className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6 border border-gray-100"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5, ease: 'easeOut' }}
      >
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="you@lamiamamma.co.uk"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {errMsg && (
            <p className="text-red-600 text-sm">{errMsg}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2 rounded-lg text-white text-sm font-semibold transition
              ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}
            `}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-[11px] text-gray-400 text-center mt-4 leading-snug">
          By signing in you agree to the staff policies.
          <br />
          Ask Ops if you don&apos;t have an account.
        </p>
      </motion.div>

      <p className="text-[10px] text-gray-300 text-center mt-10">
        &copy; {new Date().getFullYear()} La Mia Mamma LTD
      </p>
    </main>
  );
}
