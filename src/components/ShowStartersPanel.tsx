import { Sparkles } from 'lucide-react';
import {
  SHOW_STARTERS,
  SHOW_PRESETS,
  STARTER_CATEGORIES,
  type StarterCategory,
  type ShowStarter,
} from '../showConfig';

interface ShowStartersPanelProps {
  selectedStarterId?: string;
  selectedCategory: StarterCategory | 'all';
  onCategoryChange: (category: StarterCategory | 'all') => void;
  onSelectStarter: (starterId: string) => void;
  disabled?: boolean;
}

function getPresetStyleLabel(presetId: string): string | undefined {
  const preset = SHOW_PRESETS.find((p) => p.id === presetId);
  const style = preset?.partial.structure?.style;
  if (!style || style === 'custom') return undefined;
  return style.charAt(0).toUpperCase() + style.slice(1);
}

function getStarterBadges(starter: ShowStarter): string[] {
  const badges: string[] = [];
  const styleLabel = getPresetStyleLabel(starter.presetId);
  if (styleLabel) badges.push(styleLabel);
  if (starter.durationMinutes) badges.push(`${starter.durationMinutes} min`);
  const preset = SHOW_PRESETS.find((p) => p.id === starter.presetId);
  const guestMode = preset?.partial.guests?.mode;
  if (guestMode === 'guided') badges.push('Guided guests');
  if (guestMode === 'fixed') badges.push('Fixed guests');
  return badges;
}

export function ShowStartersPanel({
  selectedStarterId,
  selectedCategory,
  onCategoryChange,
  onSelectStarter,
  disabled,
}: ShowStartersPanelProps) {
  const filtered =
    selectedCategory === 'all'
      ? SHOW_STARTERS
      : SHOW_STARTERS.filter((s) => s.category === selectedCategory);

  return (
    <div className="bg-[#0e0e0e]/50 border border-white/5 rounded-[1.5rem] p-5 flex flex-col gap-4 backdrop-blur-md">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-white/40" />
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/40">
              Start from an example
            </span>
          </div>
          <p className="text-xs text-white/45 font-medium">
            Pick a topic and format together, or choose a format for your own topic.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 p-0.5 bg-white/[0.03] border border-white/5 rounded-full shrink-0">
          {STARTER_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onCategoryChange(cat.id)}
              className={`px-3.5 py-1.5 rounded-full text-[10px] font-bold transition-all uppercase tracking-wider cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-white text-black font-extrabold shadow-sm'
                  : 'text-white/55 hover:text-white/85'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
        {filtered.map((starter) => {
          const badges = getStarterBadges(starter);
          const isSelected = selectedStarterId === starter.id;

          return (
            <button
              key={starter.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectStarter(starter.id)}
              className={`text-left p-4 rounded-xl border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isSelected
                  ? 'bg-white/10 border-io-blue/50 ring-1 ring-io-blue/30'
                  : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]'
              }`}
            >
              <span className="text-sm font-bold text-white/90">{starter.title}</span>
              <p className="text-xs text-white/50 mt-1 leading-relaxed">{starter.description}</p>
              {badges.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {badges.map((badge) => (
                    <span
                      key={badge}
                      className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.06] text-white/45 border border-white/5"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
