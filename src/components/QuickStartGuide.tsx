import { motion, AnimatePresence } from 'motion/react';
import { HelpCircle, X } from 'lucide-react';
import { QUICKSTART_DISMISSED_KEY } from '../showConfig';

const DIALOG_TITLE_ID = 'quick-start-dialog-title';

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
    body: 'Hit Generate — agents research, script, voice, and mix your show (typically 8–20 minutes depending on show length and options). Host and guest profile fields shape who speaks and how; they do not change your topic.',
  },
] as const;

interface QuickStartGuideProps {
  open: boolean;
  onClose: () => void;
}

function persistDismissIfNeeded(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(QUICKSTART_DISMISSED_KEY, '1');
}

export function QuickStartGuide({ open, onClose }: QuickStartGuideProps) {
  const handleDismiss = () => {
    persistDismissIfNeeded();
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          onClick={handleDismiss}
          className="fixed inset-0 bg-black/80 backdrop-blur-lg flex items-center justify-center p-4 z-50 overflow-hidden"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={DIALOG_TITLE_ID}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', duration: 0.4 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-zinc-950/90 border border-white/10 rounded-[2rem] p-6 sm:p-8 shadow-[0_0_80px_rgba(0,0,0,0.8)] relative overflow-hidden"
          >
            <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-io-blue/20 blur-3xl pointer-events-none" />

            <div className="flex justify-between items-start gap-3 mb-5">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-io-blue/70 shrink-0" />
                <h2
                  id={DIALOG_TITLE_ID}
                  className="text-lg sm:text-xl font-bold tracking-tight text-white/90"
                >
                  Quick start — how this works
                </h2>
              </div>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Close quick start guide"
                className="p-1.5 rounded-full text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ol className="space-y-3 mb-6">
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

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleDismiss}
                className="text-xs font-bold uppercase tracking-wider text-white/45 hover:text-white/75 transition-colors cursor-pointer px-2 py-2"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="px-6 py-2.5 bg-white text-black hover:bg-zinc-200 rounded-full font-bold uppercase tracking-wider text-[11px] transition-all cursor-pointer shadow-lg shadow-black/30"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function isQuickStartDismissed(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(QUICKSTART_DISMISSED_KEY) === '1';
}
