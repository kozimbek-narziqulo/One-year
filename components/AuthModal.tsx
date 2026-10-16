'use client';

import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AuthModal() {
  const [loading, setLoading] = useState(false);

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      alert(error.message || 'Ошибка авторизации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Вход в дневник сада</h2>
        <p className="text-slate-400 text-sm mb-6">
          Войдите, чтобы ваши записи синхронизировались и не терялись при смене устройств.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => handleSocialLogin('google')}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white text-slate-800 font-medium py-3 px-4 rounded-xl hover:bg-slate-100 transition shadow-md"
          >
            <span>Войти через Google</span>
          </button>
        </div>
      </div>
    </div>
  );
}
