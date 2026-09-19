import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_COUNTRY } from '../lib/countries';
import {
  loadCountryState, resolveCountry, setCountryOverride, clearUrlCountry, saveProfileCountry,
} from '../lib/userCountry';

// Pays affiché dans la recherche de stations (voir lib/userCountry.js pour la règle
// de décision). `chooseCountry(code)` = choix manuel ; `chooseCountry(null)` = retour
// à la détection automatique.
export function useClientCountry() {
  const [state, setState] = useState({
    loading: true, status: 'ok', code: DEFAULT_COUNTRY, source: 'default', detected: null, openCodes: [DEFAULT_COUNTRY],
  });

  useEffect(() => {
    let alive = true;
    loadCountryState(supabase).then((s) => { if (alive) setState({ loading: false, ...s }); });
    return () => { alive = false; };
  }, []);

  const chooseCountry = useCallback((code) => {
    setCountryOverride(code);
    clearUrlCountry();
    if (code) saveProfileCountry(supabase, code);
    setState((prev) => ({
      ...prev,
      ...resolveCountry({ override: code, detected: prev.detected, openCodes: prev.openCodes }),
    }));
  }, []);

  return { ...state, chooseCountry };
}
