import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';

// Champ mot de passe avec l'icône œil pour afficher / masquer la saisie.
// Même rendu que dans les pages HTML publiques (src/password-toggle.js).
export default function PasswordInput({ className, ...props }) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <div className="relative">
      <input {...props} type={visible ? 'text' : 'password'} className={cn(className, 'pr-11 [&::-ms-reveal]:hidden')} />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        aria-pressed={visible}
        title={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-neutral-500 hover:text-white focus:outline-none focus-visible:text-white transition-colors"
      >
        <Icon className="w-4 h-4" />
      </button>
    </div>
  );
}
