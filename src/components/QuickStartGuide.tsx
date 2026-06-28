import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HelpCircle, ChevronDown, ChevronUp, X } from 'lucide-react';
import { QUICKSTART_DISMISSED_KEY } from '../showConfig';

const STEPS = [
  {
    title: 'Preview first',
    body: 'Open a show in the Radio Show Library below to hear what you will get — AI voices, background music, and a synced transcript.',
  },
  {
    title: 'Describe your show',
    body: 'Type a topic in the box above, or pick a starter below. Starters fill in both the topic and the show format (debate, interview, roundtable, etc.).',
  },
  {
    title: 'Tune the vibe',
    body: 'Duration and Mood set length and tone. Open Advanced to customize the host persona, guest archetypes, show style, and radio features.',
  },
  {
    title: 'Generate and listen',
    body: 'Hit Generate — agents research, script, voice, and mix your show in about five minutes. Host and guest profile fields shape who speaks and how; they do not change your topic.',
  },
] as const;

interface QuickStartGuideProps {
  forceOpen?: boolean;
  onForceOpenHandled?: () => void;
}

export function QuickStartGuide({ forceOpen, onForceOpenHandled }: QuickStartGuideProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(QUICKSTART_DISMISSED_KEY) === '1';
  });
  const [expanded, setExpanded] = useState(() => {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem(QUICKSTART_DISMISSED_KEY) !== '1';
  });

  const isVisible = !dismissed || forceOpen;
  const isExpanded = forceOpen || expanded;

  const handleDismiss = () => {
    setDismissed(true);
    setExpanded(false);
    localStorage.setItem(QUICKSTART_DISMISSED_KEY, '1');
    onForceOpenHandled?.();
  };

  const handleToggle = () => {
    if (forceOpen) {
      onForceOpenHandled?.();
      setExpanded(true);
      return;
    }
    setExpanded((v) => !v);
  };

  if (!isVisible) return null;

  return (
    <div className="bg-[#0e0e0e]/50 border border-white/5 rounded-[1.5rem] backdrop-blur-md overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-white/5">
        <button
          type="button"
          onClick={handleToggle}
          className="flex items-center gap-2 flex-1 text-left cursor-pointer group"
        >
          <HelpCircle className="w-4 h-4 text-io-blue/70 shrink-0" />
          <span className="text-sm font-bold text-white/90 group-hover:text-white transition-colors">
            Quick start — how this works
          </span>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-white/40 ml-auto" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-white/40 ml-auto" />
          )}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss quick start guide"
          className="p-1.5 rounded-full text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <ol className="p-4 pt-3 space-y-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/10 text-[10px] font-bold flex items-center justify-center text-white/60 mt-0.5">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-white/80">{step.title}</p>
                    <p className="text-xs text-white/45 mt-0.5 leading-relaxed">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function isQuickStartDismissed(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(QUICKSTART_DISMISSED_KEY) === '1';
}
