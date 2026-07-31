import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { cacheGet, cacheSet, withTimeout } from '../lib/cache';

export type AccountType = 'boater' | 'marina';

export type OwnedMarina = {
  id: string;
  name: string;
  winterization_enabled: boolean;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
};

type AccountContextValue = {
  loading: boolean;
  accountType: AccountType;
  // set once a marina account's application has been approved and linked
  // (supabase/marina_winterization.sql — you set marinas.profile_id manually)
  marina: OwnedMarina | null;
  refreshAccount: () => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [accountType, setAccountType] = useState<AccountType>('boater');
  const [marina, setMarina] = useState<OwnedMarina | null>(null);

  const load = useCallback(async () => {
    // local session read — no network, so this still resolves offline
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setAccountType('boater');
      setMarina(null);
      setLoading(false);
      return;
    }

    try {
      const { data: profile, error } = await withTimeout(
        supabase.from('profiles').select('account_type').eq('id', user.id).single()
      );
      if (error) throw error;

      const type: AccountType = profile?.account_type === 'marina' ? 'marina' : 'boater';
      setAccountType(type);
      await cacheSet('accountType', type);

      if (type === 'marina') {
        const { data: ownedMarina } = await withTimeout(
          supabase
            .from('marinas')
            .select('id, name, winterization_enabled, stripe_account_id, stripe_charges_enabled')
            .eq('profile_id', user.id)
            .maybeSingle()
        );
        setMarina(ownedMarina ?? null);
        await cacheSet('ownedMarina', ownedMarina ?? null);
      } else {
        setMarina(null);
      }
    } catch {
      // offline — fall back to whatever we last knew
      const cachedType = await cacheGet<AccountType>('accountType');
      if (cachedType) setAccountType(cachedType);
      const cachedMarina = await cacheGet<OwnedMarina | null>('ownedMarina');
      setMarina(cachedMarina ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => sub.subscription.unsubscribe();
  }, [load]);

  return (
    <AccountContext.Provider value={{ loading, accountType, marina, refreshAccount: load }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used inside <AccountProvider>');
  return ctx;
}
