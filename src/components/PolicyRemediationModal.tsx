import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, Loader2, X } from 'lucide-react';
import type { PolicyIncidentState, PolicyRemediationAction } from '../types';

const DIALOG_TITLE_ID = 'policy-remediation-dialog-title';

interface PolicyRemediationModalProps {
  open: boolean;
  incident: PolicyIncidentState | null;
  applying: boolean;
  onClose: () => void;
  onCancel: () => void;
  onEditSettings: () => void;
  onApplyAndResume: (actions: PolicyRemediationAction[]) => void;
}

export function PolicyRemediationModal({
  open,
  incident,
  applying,
  onClose,
  onCancel,
  onEditSettings,
  onApplyAndResume,
}: PolicyRemediationModalProps) {
  const [editedActions, setEditedActions] = useState<PolicyRemediationAction[]>([]);

  useEffect(() => {
    if (incident?.review?.actions) {
      setEditedActions(incident.review.actions.map((action) => ({ ...action })));
    } else {
      setEditedActions([]);
    }
  }, [incident?.incidentId, incident?.review?.actions]);

  const reviewing = incident?.status === 'detected' || incident?.status === 'reviewing';
  const recoverable = incident?.review?.recoverable !== false;

  const updateProposed = (actionId: string, proposed: string) => {
    setEditedActions((prev) =>
      prev.map((action) => (action.id === actionId ? { ...action, proposed } : action))
    );
  };

  const handleApply = () => {
    if (editedActions.length === 0) return;
    onApplyAndResume(editedActions);
  };

  return (
    <AnimatePresence>
      {open && incident && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-lg flex items-center justify-center p-4 z-[60] overflow-y-auto"
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
            className="w-full max-w-lg bg-zinc-950/95 border border-amber-500/30 rounded-[2rem] p-6 sm:p-8 shadow-[0_0_80px_rgba(0,0,0,0.8)] relative my-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

            <div className="flex justify-between items-start gap-3 mb-5">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                <h2
                  id={DIALOG_TITLE_ID}
                  className="text-lg sm:text-xl font-bold tracking-tight text-white/90"
                >
                  Content policy issue
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close policy remediation dialog"
                className="p-1.5 rounded-full text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-white/60 mb-4">
              Generation paused during <span className="text-white/80">{incident.stepLabel}</span>.
              The AI provider blocked part of the show content.
            </p>

            {reviewing ? (
              <div className="flex items-center gap-3 py-8 justify-center text-white/70">
                <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                <span>Analyzing the blocked content and preparing fixes…</span>
              </div>
            ) : (
              <>
                <p className="text-sm text-white/75 mb-4">
                  {incident.review?.summary ?? incident.providerMessage}
                </p>

                {!recoverable && (
                  <p className="text-sm text-amber-300/90 mb-4 border border-amber-500/20 rounded-xl p-3 bg-amber-500/5">
                    This content cannot be produced while complying with provider policy. Edit your
                    show settings or cancel this generation.
                  </p>
                )}

                {incident.review?.causes && incident.review.causes.length > 0 && (
                  <div className="mb-5 space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
                      Likely causes
                    </h3>
                    {incident.review.causes.map((cause) => (
                      <article
                        key={cause.id}
                        className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                              cause.confidence === 'high'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-white/10 text-white/50'
                            }`}
                          >
                            {cause.confidence}
                          </span>
                          {cause.location.eventId && (
                            <span className="text-white/40 text-xs">{cause.location.eventId}</span>
                          )}
                        </div>
                        <p className="text-white/80 mb-1">{cause.explanation}</p>
                        {cause.triggerPhrases.length > 0 && (
                          <p className="text-amber-200/80 text-xs">
                            Triggered by: {cause.triggerPhrases.join(', ')}
                          </p>
                        )}
                        {cause.excerpt && (
                          <p className="text-white/50 text-xs mt-2 font-mono line-clamp-3">
                            {cause.excerpt}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                )}

                {recoverable && editedActions.length > 0 && (
                  <div className="mb-6 space-y-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
                      Proposed fixes — edit before applying
                    </h3>
                    {editedActions.map((action) => (
                      <div key={action.id} className="space-y-1.5">
                        <label className="text-xs text-white/50 block">{action.rationale}</label>
                        {action.original && (
                          <p className="text-xs text-white/40 line-clamp-2 font-mono">
                            Original: {action.original}
                          </p>
                        )}
                        <textarea
                          value={action.proposed}
                          onChange={(e) => updateProposed(action.id, e.target.value)}
                          rows={3}
                          className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white/90 resize-y focus:outline-none focus:border-amber-500/40"
                          placeholder="Enter compliant replacement text…"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                  {recoverable && (
                    <button
                      type="button"
                      disabled={applying || editedActions.some((a) => !a.proposed.trim())}
                      onClick={handleApply}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-sm transition-colors cursor-pointer"
                    >
                      {applying ? 'Applying…' : 'Apply & Resume'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onEditSettings}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-white/15 text-white/80 hover:bg-white/5 text-sm transition-colors cursor-pointer"
                  >
                    Edit show settings
                  </button>
                  <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-white/50 hover:text-white/70 text-sm transition-colors cursor-pointer"
                  >
                    Cancel show
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
