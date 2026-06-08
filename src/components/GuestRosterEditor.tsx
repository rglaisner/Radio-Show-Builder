import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import {
  GUEST_MODES,
  GEMINI_VOICES,
  HOST_DELIVERIES,
  GUEST_GENDERS,
  AUDIO_TREATMENTS,
  VOICE_LABELS,
  AUDIO_TREATMENT_LABELS,
  GUEST_GENDER_LABELS,
  getGuestLimits,
  createEmptyGuestProfile,
  syncGuestRosterForMode,
  type ShowConfig,
  type ShowStyle,
  type GuestMode,
  type GuestProfile,
  type GeminiVoice,
  type HostDelivery,
  type GuestGender,
  type AudioTreatment,
} from '../showConfig';

const inputClass =
  'w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-io-blue';
const selectClass =
  'w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none';
const labelClass = 'text-[10px] font-bold uppercase tracking-wider text-white/40';

function guestFieldId(index: number, field: string): string {
  return `guest-${index}-${field}`;
}

export interface GuestRosterEditorProps {
  style: ShowStyle;
  guests: Partial<ShowConfig['guests']>;
  hostVoice?: GeminiVoice;
  guestModeId?: string;
  guestCountId?: string;
  onChange: (guests: Partial<ShowConfig['guests']>) => void;
}

function getDuplicateVoices(
  hostVoice: GeminiVoice | undefined,
  roster: GuestProfile[] | undefined
): GeminiVoice[] {
  const counts = new Map<GeminiVoice, number>();
  if (hostVoice) {
    counts.set(hostVoice, 1);
  }
  for (const guest of roster ?? []) {
    if (guest.voice) {
      counts.set(guest.voice, (counts.get(guest.voice) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([voice]) => voice);
}

export function GuestRosterEditor({
  style,
  guests,
  hostVoice,
  guestModeId,
  guestCountId,
  onChange,
}: GuestRosterEditorProps) {
  const mode = guests.mode ?? 'auto';
  const limits = getGuestLimits(style);
  const synced = syncGuestRosterForMode(guests, style);
  const roster = synced.roster ?? [];
  const count = synced.count ?? limits.min;
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({ 0: true });

  const duplicateVoices = getDuplicateVoices(hostVoice, roster);
  const showRoster = mode === 'guided' || mode === 'fixed';

  const handleModeChange = (nextMode: GuestMode) => {
    const next = syncGuestRosterForMode({ ...guests, mode: nextMode }, style);
    onChange(next);
    if (nextMode === 'guided' || nextMode === 'fixed') {
      setExpandedCards({ 0: true });
    }
  };

  const handleCountChange = (raw: string) => {
    const parsed = raw ? Number(raw) : undefined;
    const nextCount =
      parsed !== undefined && !Number.isNaN(parsed)
        ? Math.max(limits.min, Math.min(limits.max, parsed))
        : undefined;
    const next = syncGuestRosterForMode({ ...guests, count: nextCount }, style);
    onChange(next);
  };

  const updateGuest = (index: number, patch: Partial<GuestProfile>) => {
    const nextRoster = roster.map((guest, i) => (i === index ? { ...guest, ...patch } : guest));
    onChange({ ...guests, mode, count, roster: nextRoster });
  };

  const addGuest = () => {
    if (roster.length >= limits.max) return;
    const nextRoster = [...roster, createEmptyGuestProfile()];
    onChange({
      ...guests,
      mode,
      count: mode === 'fixed' ? nextRoster.length : count,
      roster: nextRoster,
    });
    setExpandedCards((prev) => ({ ...prev, [nextRoster.length - 1]: true }));
  };

  const removeGuest = (index: number) => {
    if (mode === 'fixed' && roster.length <= 1) return;
    const nextRoster = roster.filter((_, i) => i !== index);
    onChange({
      ...guests,
      mode,
      count: mode === 'fixed' ? nextRoster.length : count,
      roster: nextRoster,
    });
  };

  const toggleCard = (index: number) => {
    setExpandedCards((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="md:col-span-2 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor={guestModeId} className={labelClass}>
            Guest mode
          </label>
          <select
            id={guestModeId}
            name={guestModeId}
            value={mode}
            onChange={(e) => handleModeChange(e.target.value as GuestMode)}
            className={selectClass}
          >
            {GUEST_MODES.map((m) => (
              <option key={m} value={m} className="bg-neutral-900">
                {m}
              </option>
            ))}
          </select>
        </div>

        {(mode === 'auto' || mode === 'guided') && (
          <div className="space-y-2">
            <label htmlFor={guestCountId} className={labelClass}>
              Guest count
            </label>
            <input
              id={guestCountId}
              name={guestCountId}
              type="number"
              autoComplete="off"
              min={limits.min}
              max={limits.max}
              value={count}
              placeholder="Auto"
              onChange={(e) => handleCountChange(e.target.value)}
              className={inputClass}
            />
            <p className="text-[10px] text-white/30">
              {style}: {limits.min}–{limits.max} guests
            </p>
          </div>
        )}
      </div>

      {duplicateVoices.length > 0 && (
        <p className="text-xs text-amber-400/90">
          Duplicate voices detected ({duplicateVoices.join(', ')}). Guests may sound similar.
        </p>
      )}

      {showRoster && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className={labelClass}>
              {mode === 'fixed' ? 'Guest roster' : 'Guest archetypes'}
            </span>
            <button
              type="button"
              onClick={addGuest}
              disabled={roster.length >= limits.max}
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-io-blue hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3 h-3" />
              Add guest
            </button>
          </div>

          {roster.map((guest, index) => {
            const isExpanded = expandedCards[index] ?? false;
            const cardTitle =
              guest.name?.trim() ||
              (mode === 'fixed' ? `Guest ${index + 1} (name required)` : `Archetype ${index + 1}`);

            return (
              <div
                key={index}
                className="border border-white/10 rounded-lg bg-white/[0.02] overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleCard(index)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left text-sm text-white/80 hover:bg-white/[0.03]"
                >
                  <span>{cardTitle}</span>
                  <span className="flex items-center gap-2">
                    {mode === 'fixed' && roster.length > 1 && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeGuest(index);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            removeGuest(index);
                          }
                        }}
                        className="p-1 text-white/40 hover:text-red-400"
                        aria-label={`Remove guest ${index + 1}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-white/40" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-white/40" />
                    )}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-white/5 pt-3">
                    <div className="space-y-2">
                      <label htmlFor={guestFieldId(index, 'name')} className={labelClass}>
                        Name{mode === 'fixed' ? ' *' : ''}
                      </label>
                      <input
                        id={guestFieldId(index, 'name')}
                        name={guestFieldId(index, 'name')}
                        type="text"
                        autoComplete="off"
                        value={guest.name ?? ''}
                        placeholder={mode === 'fixed' ? 'Required' : 'Optional — LLM may invent'}
                        onChange={(e) => updateGuest(index, { name: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor={guestFieldId(index, 'voice')} className={labelClass}>Voice</label>
                      <select
                        id={guestFieldId(index, 'voice')}
                        name={guestFieldId(index, 'voice')}
                        value={guest.voice ?? ''}
                        onChange={(e) =>
                          updateGuest(index, {
                            voice: e.target.value ? (e.target.value as GeminiVoice) : undefined,
                          })
                        }
                        className={selectClass}
                      >
                        <option value="" className="bg-neutral-900">
                          Auto-assign
                        </option>
                        {GEMINI_VOICES.map((v) => (
                          <option key={v} value={v} className="bg-neutral-900">
                            {VOICE_LABELS[v]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label htmlFor={guestFieldId(index, 'persona')} className={labelClass}>Persona</label>
                      <textarea
                        id={guestFieldId(index, 'persona')}
                        name={guestFieldId(index, 'persona')}
                        rows={2}
                        autoComplete="off"
                        value={guest.persona ?? ''}
                        placeholder="e.g. skeptical backend engineer"
                        onChange={(e) => updateGuest(index, { persona: e.target.value })}
                        className={`${inputClass} resize-none`}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor={guestFieldId(index, 'delivery')} className={labelClass}>Delivery</label>
                      <select
                        id={guestFieldId(index, 'delivery')}
                        name={guestFieldId(index, 'delivery')}
                        value={guest.delivery ?? ''}
                        onChange={(e) =>
                          updateGuest(index, {
                            delivery: e.target.value ? (e.target.value as HostDelivery) : undefined,
                          })
                        }
                        className={selectClass}
                      >
                        <option value="" className="bg-neutral-900">
                          Default
                        </option>
                        {HOST_DELIVERIES.map((d) => (
                          <option key={d} value={d} className="bg-neutral-900">
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor={guestFieldId(index, 'accent')} className={labelClass}>Accent</label>
                      <input
                        id={guestFieldId(index, 'accent')}
                        name={guestFieldId(index, 'accent')}
                        type="text"
                        autoComplete="off"
                        value={guest.accent ?? ''}
                        placeholder="e.g. Southern American English"
                        onChange={(e) => updateGuest(index, { accent: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor={guestFieldId(index, 'location')} className={labelClass}>Location</label>
                      <input
                        id={guestFieldId(index, 'location')}
                        name={guestFieldId(index, 'location')}
                        type="text"
                        autoComplete="off"
                        value={guest.location ?? ''}
                        placeholder="e.g. Austin, Texas"
                        onChange={(e) => updateGuest(index, { location: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor={guestFieldId(index, 'gender')} className={labelClass}>Gender</label>
                      <select
                        id={guestFieldId(index, 'gender')}
                        name={guestFieldId(index, 'gender')}
                        value={guest.gender ?? 'unspecified'}
                        onChange={(e) =>
                          updateGuest(index, { gender: e.target.value as GuestGender })
                        }
                        className={selectClass}
                      >
                        {GUEST_GENDERS.map((g) => (
                          <option key={g} value={g} className="bg-neutral-900">
                            {GUEST_GENDER_LABELS[g]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor={guestFieldId(index, 'audio-treatment')} className={labelClass}>Audio treatment</label>
                      <select
                        id={guestFieldId(index, 'audio-treatment')}
                        name={guestFieldId(index, 'audio-treatment')}
                        value={guest.audioTreatment ?? 'phone'}
                        onChange={(e) =>
                          updateGuest(index, { audioTreatment: e.target.value as AudioTreatment })
                        }
                        className={selectClass}
                      >
                        {AUDIO_TREATMENTS.map((t) => (
                          <option key={t} value={t} className="bg-neutral-900">
                            {AUDIO_TREATMENT_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {mode === 'guided' && roster.length > 1 && (
                      <div className="md:col-span-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeGuest(index)}
                          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white/40 hover:text-red-400"
                        >
                          <Trash2 className="w-3 h-3" />
                          Remove archetype
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
