import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { VEHICLE_CATEGORIES, getBrandsForCategory } from '../../lib/vehicleBrands';
import { parseVehicleSpeech } from '../../lib/voiceVehicle';
import { NO_PLATE_LABEL } from '../../lib/plateFormat';

// Dictée vocale du formulaire "Ajouter un véhicule" (automobiliste et station) :
// un tap, puis « Toyota, A A 1 8 9 D S » — mains occupées ou mouillées.
// Utilise la reconnaissance vocale du navigateur (Chrome/Edge/Safari) ; sur
// Firefox elle n'existe pas, on l'indique au lieu d'un bouton mort.
// L'analyse de la phrase est dans lib/voiceVehicle.js ; ce composant ne gère
// que le micro et transmet { category, brand, plate, heard } à `onResult`.

const SpeechRecognitionCtor = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

const ERROR_MESSAGES = {
  'not-allowed': 'Micro refusé — autorisez-le dans les réglages du navigateur.',
  'service-not-allowed': 'Micro refusé — autorisez-le dans les réglages du navigateur.',
  'audio-capture': 'Aucun micro détecté sur cet appareil.',
  network: 'La dictée vocale demande une connexion internet.',
  'no-speech': "Je n'ai rien entendu — réessayez.",
};

const categoryLabel = (value) => VEHICLE_CATEGORIES.find((c) => c.value === value)?.label || value;

export default function VoiceVehicleButton({ currentCategory = '', hasBrand = false, onResult }) {
  const [listening, setListening] = useState(false);
  const [feedback, setFeedback] = useState(null); // { tone: 'ok' | 'warn', text }
  const recognitionRef = useRef(null);
  // Les callbacks du micro vivent plus longtemps qu'un rendu : on lit toujours les dernières props.
  const latest = useRef({ currentCategory, hasBrand, onResult });
  latest.current = { currentCategory, hasBrand, onResult };

  useEffect(() => () => recognitionRef.current?.abort(), []);

  if (!SpeechRecognitionCtor) {
    return <p className="text-xs text-neutral-500">Dictée vocale indisponible sur ce navigateur — essayez Chrome ou Safari.</p>;
  }

  const handleTranscripts = (alternatives) => {
    const { currentCategory: category, hasBrand: brandAlreadySet, onResult: notify } = latest.current;
    const brandsByCategory = Object.fromEntries(VEHICLE_CATEGORIES.map((c) => [c.value, getBrandsForCategory(c.value)]));
    const result = parseVehicleSpeech(alternatives, { brandsByCategory, currentCategory: category });
    if (!result.category && !result.brand && !result.plate && !result.noPlate) {
      setFeedback({ tone: 'warn', text: `Je n'ai pas compris « ${result.heard} ». Dites par exemple : « Toyota, A A 1 8 9 D S ».` });
      return;
    }
    notify(result);
    const captured = [result.category && categoryLabel(result.category), result.brand, result.noPlate ? NO_PLATE_LABEL : result.plate].filter(Boolean).join(' · ');
    const missing = [];
    if (!result.brand && !brandAlreadySet) missing.push('marque non reconnue (choisissez-la dans la liste)');
    if (!result.plate && !result.noPlate) missing.push("immatriculation non comprise (dites « sans plaque » s'il n'y en a pas)");
    setFeedback(missing.length
      ? { tone: 'warn', text: `Entendu : ${captured}. ${missing.join(' ; ')}.` }
      : { tone: 'ok', text: `Entendu : ${captured}. Vérifiez puis validez.` });
  };

  const start = () => {
    if (listening) { recognitionRef.current?.stop(); return; }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'fr-FR';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 3;
    let answered = false;
    recognition.onresult = (event) => {
      answered = true;
      handleTranscripts(Array.from(event.results[0]).map((alt) => alt.transcript));
    };
    recognition.onerror = (event) => {
      answered = true;
      setFeedback({ tone: 'warn', text: ERROR_MESSAGES[event.error] || 'La dictée vocale a échoué — réessayez.' });
    };
    recognition.onend = () => {
      setListening(false);
      if (!answered) setFeedback({ tone: 'warn', text: "Je n'ai rien entendu — réessayez." });
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      setFeedback(null);
    } catch {
      setListening(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={start}
        className={`w-full flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
          listening
            ? 'bg-red-500/15 border-red-500/60 text-red-300 animate-pulse'
            : 'bg-blue-600/10 border-blue-500/40 text-blue-300 hover:bg-blue-600/20'
        }`}
      >
        {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        {listening ? 'Je vous écoute… (toucher pour arrêter)' : 'Remplir à la voix'}
      </button>
      <p
        role="status"
        aria-live="polite"
        className={`text-xs mt-1.5 ${feedback ? (feedback.tone === 'ok' ? 'text-emerald-400' : 'text-amber-400') : 'text-neutral-500'}`}
      >
        {feedback ? feedback.text : 'Dites la marque et l\'immatriculation, ex. « Toyota, A A 1 8 9 D S » — ou « Toyota, sans plaque ». Vous pouvez aussi préciser le type : moto, camion, bus…'}
      </p>
    </div>
  );
}
