import React from 'react';
import { X, Plus } from 'lucide-react';
import type { CollectionPalette } from '../types';
import { cn } from '../lib/utils';

interface CollectionPaletteBarProps {
  palette: CollectionPalette[];
  onSelect: (color: CollectionPalette) => void;
  onRemove: (id: string) => void;
  onSaveCurrent: () => void;
  canSave: boolean;
}

export const CollectionPaletteBar: React.FC<CollectionPaletteBarProps> = ({
  palette, onSelect, onRemove, onSaveCurrent, canSave
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="font-mono text-[10px] uppercase tracking-widest opacity-60">
          Collection Palette
        </label>
        {canSave && (
          <button
            type="button"
            onClick={onSaveCurrent}
            className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-brand-accent hover:opacity-70 transition-opacity"
          >
            <Plus className="w-3 h-3" />
            Save Color
          </button>
        )}
      </div>

      {palette.length === 0 ? (
        <p className="font-mono text-[9px] uppercase tracking-widest text-brand-ink/30 py-2">
          No saved colors yet — generate a colorway and click Save Color
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {palette.map((c) => (
            <div key={c.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(c)}
                title={`${c.name} — ${c.pantone || c.hex}`}
                className={cn(
                  "w-8 h-8 border border-brand-ink/20 hover:border-brand-ink transition-all hover:scale-110",
                  "flex items-center justify-center rounded-sm"
                )}
                style={{ backgroundColor: c.hex }}
              />
              <button
                type="button"
                onClick={() => onRemove(c.id)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-brand-ink text-white rounded-full hidden group-hover:flex items-center justify-center"
              >
                <X className="w-2.5 h-2.5" />
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <div className="bg-brand-ink text-white font-mono text-[8px] px-2 py-1 rounded whitespace-nowrap">
                  {c.name || c.pantone || c.hex}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
