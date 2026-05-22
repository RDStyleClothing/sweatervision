import React from 'react';
import { Download, X } from 'lucide-react';
import { cn, downloadMultiComparisonImage, generateLabel, generateFilename } from '../lib/utils';
import type { HistoryItem } from '../types';

interface MultiComparisonProps {
  pinnedItems: { item: HistoryItem; styleLabel: string }[];
  onRemovePin: (id: string) => void;
  onClose: () => void;
}

export const MultiComparison: React.FC<MultiComparisonProps> = ({ pinnedItems, onRemovePin, onClose }) => {
  if (pinnedItems.length === 0) return null;

  const handleDownload = () => {
    const images = pinnedItems.map(({ item, styleLabel }) => ({
      image: item.image,
      label: `${styleLabel} ${generateLabel(item)}`,
    }));
    downloadMultiComparisonImage(images, `comparison-${Date.now()}.png`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-bold uppercase tracking-tight">Colorway Comparison</h3>
          <p className="font-mono text-[9px] uppercase tracking-widest opacity-50">{pinnedItems.length} item{pinnedItems.length !== 1 && 's'} pinned</p>
        </div>
        <div className="flex items-center gap-3">
          {pinnedItems.length >= 2 && (
            <button onClick={handleDownload}
              className="flex items-center gap-2 btn-secondary text-[9px] px-4 py-2">
              <Download className="w-3.5 h-3.5" /> Export Grid
            </button>
          )}
          <button onClick={onClose} className="p-2 hover:bg-brand-ink/5 rounded-full transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className={cn('grid gap-4', pinnedItems.length === 1 ? 'grid-cols-1' : pinnedItems.length === 2 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4')}>
        {pinnedItems.map(({ item, styleLabel }) => (
          <div key={item.id} className="space-y-2 relative group">
            <button onClick={() => onRemovePin(item.id)}
              className="absolute top-2 right-2 z-10 w-6 h-6 bg-brand-ink/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <X className="w-3 h-3" />
            </button>
            <div className={cn('aspect-[3/4] overflow-hidden rounded-xl border border-brand-ink/10',
              item.metadata?.renderMode !== 'Sales Sheet Render' ? 'transparency-checkerboard' : 'bg-white')}>
              <img src={item.image} alt={styleLabel} className="w-full h-full object-cover" />
            </div>
            <div className="space-y-0.5">
              <p className="font-mono text-[9px] uppercase tracking-wider font-bold truncate">{styleLabel}</p>
              {item.metadata?.colorName && (
                <p className="font-mono text-[8px] uppercase tracking-wider opacity-60 truncate">{item.metadata.colorName}</p>
              )}
              {item.metadata?.renderMode && (
                <span className={cn('inline-block font-mono text-[7px] uppercase tracking-wider px-1.5 py-0.5 rounded-full',
                  item.metadata.renderMode !== 'Sales Sheet Render' ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-ink/5 text-brand-ink')}>
                  {item.metadata.renderMode}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {pinnedItems.length < 4 && (
        <p className="font-mono text-[9px] uppercase tracking-widest opacity-30 text-center">
          Pin up to 4 renders from any style to compare colorways
        </p>
      )}
    </div>
  );
};
