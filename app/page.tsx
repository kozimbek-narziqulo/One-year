'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AuthModal from '../components/AuthModal';
import { GardenApp } from "../components/GardenApp.tsx";

export default function Page() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        Загрузка...
      </div>
    );
  }

  return (
    <main className="relative min-h-screen bg-slate-950">
      <GardenApp />
      {!session && <AuthModal />}
    </main>
  );
}
