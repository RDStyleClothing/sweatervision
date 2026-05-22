import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Send, Zap, Palette, Ruler, Upload, X, Droplets, Pipette, ChevronDown } from 'lucide-react';
import { cn, fileToBase64, nanoid } from '../lib/utils';
import { findPantoneByInput, getNearestPantoneFromHex, getCompensatedColor, getDynamicColorDescriptor } from '../lib/pantone';
import { CollectionPaletteBar } from './CollectionPaletteBar';
import type { ColorState, OutputMode, CollectionPalette } from '../types';

interface ModificationPanelProps {
  colorState: ColorState;
  onColorChange: (cs: Partial<ColorState>) => void;
  collectionPalette: CollectionPalette[];
  onSaveColorToPalette: () => void;
  onRemoveFromPalette: (id: string) => void;
  onSelectFromPalette: (c: CollectionPalette) => void;
  onModify: (
    prompt: string,
    mode: OutputMode,
    referenceImage?: string,
    targetPart?: string,
    label?: string,
    metadata?: Record<string, string>,
    isForceAsIs?: boolean
  ) => void;
  isProcessing: boolean;
  useClaudePrompt: boolean;
  className?: string;
}

const QUICK_PROMPTS = [
  'Convert to cardigan',
  'Add ribbed cuffs',
  'Extend body length by 4 inches',
  'Change neckline to V-neck',
  'Add chest pocket',
  'Slim fit silhouette',
  'Oversized relaxed fit',
  'Add cable knit pattern',
];

export const ModificationPanel: React.FC<ModificationPanelProps> = ({
  colorState, onColorChange,
  collectionPalette, onSaveColorToPalette, onRemoveFromPalette, onSelectFromPalette,
  onModify, isProcessing, useClaudePrompt, className
}) => {
  const [activeMode, setActiveMode] = useState<OutputMode>('edit');
  const [prompt, setPrompt] = useState('');
  const [targetPart, setTargetPart] = useState('sweater');
  const [imageLabel, setImageLabel] = useState('');
  const [colorName, setColorName] = useState('');
  const [colorCode, setColorCode] = useState('');
  const [fabricDescription, setFabricDescription] = useState('');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [activePresets, setActivePresets] = useState<string[]>(['Change Color']);
  const [inputError, setInputError] = useState(false);
  const [pantoneWarning, setPantoneWarning] = useState<string | null>(null);
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync colorName/colorCode from pantone match
  useEffect(() => {
    if (!colorState.pantone.trim()) return;
    const match = findPantoneByInput(colorState.pantone);
    if (match) {
      if (!colorName) setColorName(match.name);
      if (!colorCode) setColorCode(match.code.match(/\d{2}-\d{4}/)?.[0] || '');
      setPantoneWarning(null);
    } else {
      const nearest = getNearestPantoneFromHex(colorState.selectedHex);
      setPantoneWarning(`"${colorState.pantone}" not found — using nearest match: ${nearest.code} ${nearest.name}`);
    }
  }, [colorState.pantone]);

  // Sketch mode: force white
  useEffect(() => {
    if (activeMode === 'sketch') {
      onColorChange({ selectedHex: '#ffffff', pantone: '' });
    }
  }, [activeMode]);

  const resolvedPantone = (() => {
    if (colorState.wasEyedropped) return null;
    return findPantoneByInput(colorState.pantone) || null;
  })();
  const displayHex = colorState.wasEyedropped
    ? colorState.selectedHex
    : colorState.useCompensation
      ? getCompensatedColor(colorState.selectedHex)
      : colorState.selectedHex;

  const nearestPantone = resolvedPantone || getNearestPantoneFromHex(colorState.selectedHex);

  const handleSubmit = (e?: React.FormEvent, forceAsIs = false) => {
    if (e) e.preventDefault();
    if (!imageLabel.trim()) {
      setInputError(true);
      setTimeout(() => setInputError(false), 3000);
      return;
    }
    if (isProcessing) return;

    const metadata: Record<string, string> = {
      renderMode: activeMode === 'sales_sheet' ? 'Sales Sheet Render'
        : activeMode === 'sketch' ? 'Flat Sketch'
        : activeMode === 'render' ? '3D Render' : 'Life-like',
      colorName: colorName.trim() || nearestPantone.name,
      colorCode: colorCode.trim() || nearestPantone.code.match(/\d{2}-\d{4}/)?.[0] || '',
      colorCompensation: colorState.useCompensation ? 'true' : 'false',
    };

    onModify(prompt, activeMode, referenceImage || undefined, targetPart, imageLabel, metadata, forceAsIs);
    setPrompt('');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { const b64 = await fileToBase64(file); setReferenceImage(b64); }
  };

  const handleQuickPrompt = (qp: string) => {
    setPrompt(prev => prev ? `${prev}, ${qp.toLowerCase()}` : qp);
    setShowQuickPrompts(false);
  };

  return (
    <div className={cn('space-y-6', className)}>

      {/* Style name */}
      <div className="space-y-2">
        <label className={cn('font-mono text-[10px] uppercase tracking-widest block transition-colors', inputError ? 'text-red-500' : 'opacity-60')}>
          {activeMode === 'sales_sheet' ? 'Project Name / Season' : 'Style Name or Number'}
          <span className="text-red-500 ml-1">*</span>
        </label>
        <input
          type="text" value={imageLabel}
          onChange={e => { setImageLabel(e.target.value); if (inputError) setInputError(false); }}
          placeholder={activeMode === 'sales_sheet' ? 'e.g. FALL-2026-COLLECTION' : 'e.g. SW-2024-01 / V-Neck Sample A'}
          className={cn('w-full bg-transparent border p-3 font-mono text-xs focus:outline-none focus:ring-1 transition-all',
            inputError ? 'border-red-500 ring-red-500 bg-red-50/10 animate-shake' : 'border-[#141414] focus:ring-[#141414]')}
          disabled={isProcessing}
        />
        {inputError && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="text-red-500 font-mono text-[8px] uppercase tracking-widest">
            Style name is required before generating
          </motion.p>
        )}
      </div>

      {/* Mode tabs */}
      <div className="space-y-2">
        <label className="font-mono text-[10px] uppercase tracking-widest block opacity-60">Action Mode</label>
        <div className="grid grid-cols-4 gap-0 border border-[#141414]">
          {(['edit', 'render', 'sketch', 'sales_sheet'] as OutputMode[]).map((m, i, arr) => (
            <button key={m} type="button" onClick={() => setActiveMode(m)} disabled={isProcessing}
              className={cn('py-2 px-1 sm:p-3 font-mono text-[8px] sm:text-[9px] uppercase tracking-wider transition-all',
                i < arr.length - 1 && 'border-r border-[#141414]',
                activeMode === m ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/5'
              )}>
              {m === 'sales_sheet' ? 'Sales Sheet' : m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <p className="font-mono text-[9px] opacity-40 leading-tight">
          {activeMode === 'edit' && 'Updates the garment on a model or photo — preserves background & model.'}
          {activeMode === 'render' && '3D ghost mannequin e-commerce shot on pure white background.'}
          {activeMode === 'sketch' && 'Technical flat CAD sketch for tech packs. Auto-sets white colorway.'}
          {activeMode === 'sales_sheet' && 'Process a full page of sketches — converts all to 3D renders simultaneously.'}
        </p>
      </div>

      {/* Target part (not sales sheet) */}
      {activeMode !== 'sales_sheet' && (
        <div className="space-y-2">
          <label className="font-mono text-[10px] uppercase tracking-widest block opacity-60">Target Garment / Part</label>
          <input type="text" value={targetPart} onChange={e => setTargetPart(e.target.value)}
            placeholder="e.g. sweater, top, sleeves, neckline"
            className="w-full bg-transparent border border-[#141414] p-3 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#141414]"
            disabled={isProcessing} />
        </div>
      )}

      {/* Fabric (render + sales sheet) */}
      {(activeMode === 'render' || activeMode === 'sales_sheet') && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
          className="space-y-2 border border-[#141414] p-4 bg-white/50">
          <label className="font-mono text-[10px] uppercase tracking-widest block opacity-60">Global Fabric / Texture</label>
          <input type="text" value={fabricDescription} onChange={e => setFabricDescription(e.target.value)}
            placeholder={activeMode === 'sales_sheet' ? 'e.g. 12gg cotton/acrylic blend throughout' : 'e.g. Heavy gauge cable knit with fuzzy mohair finish'}
            className="w-full bg-transparent border border-[#141414] p-3 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#141414]"
            disabled={isProcessing} />
          <p className="font-mono text-[9px] opacity-40 italic">
            {activeMode === 'render' && 'Tip: "Chunky cable knit" beats "knit" for accuracy.'}
            {activeMode === 'sales_sheet' && 'All sketches rendered in this fabric.'}
          </p>
        </motion.div>
      )}

      {/* Color selector (not sketch / sales sheet) */}
      {activeMode !== 'sales_sheet' && (
        <div className="space-y-4 border border-[#141414] p-4 bg-white/30">
          <div className="flex items-center justify-between">
            <label className="font-mono text-[10px] uppercase tracking-widest opacity-60">Color Selection</label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={activePresets.includes('Change Color')}
                onChange={e => {
                  setActivePresets(prev => e.target.checked ? [...prev.filter(p => p !== 'Change Color'), 'Change Color'] : prev.filter(p => p !== 'Change Color'));
                }}
                className="accent-brand-ink w-3 h-3" disabled={isProcessing || activeMode === 'sketch'} />
              <span className="font-mono text-[9px] uppercase tracking-widest opacity-60">Apply color change</span>
            </label>
          </div>

          {/* Collection palette */}
          <CollectionPaletteBar
            palette={collectionPalette}
            onSelect={onSelectFromPalette}
            onRemove={onRemoveFromPalette}
            onSaveCurrent={onSaveColorToPalette}
            canSave={activePresets.includes('Change Color')}
          />

          {/* Pantone field */}
          <div className="space-y-1">
            <label className="font-mono text-[9px] uppercase tracking-widest block opacity-50">Pantone TCX Code</label>
            <input
              type="text" value={colorState.pantone}
              onChange={e => onColorChange({ pantone: e.target.value, wasEyedropped: false })}
              placeholder="e.g. 19-4052 TCX or Classic Blue"
              className="w-full bg-transparent border border-[#141414] p-2.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#141414]"
              disabled={isProcessing || activeMode === 'sketch'} />
            {pantoneWarning && (
              <p className="font-mono text-[9px] text-amber-600 leading-tight">{pantoneWarning}</p>
            )}
          </div>

          {/* Color picker + eyedropper */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="font-mono text-[9px] uppercase tracking-widest opacity-50">Hex</label>
              <input type="color" value={colorState.selectedHex}
                onChange={e => onColorChange({ selectedHex: e.target.value, pantone: '', wasEyedropped: false })}
                className="w-8 h-8 border border-[#141414]/20 cursor-pointer rounded-sm p-0.5"
                disabled={isProcessing || activeMode === 'sketch'} />
            </div>
            <input type="text" value={colorState.selectedHex}
              onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) onColorChange({ selectedHex: e.target.value, pantone: '', wasEyedropped: false }); }}
              className="w-24 bg-transparent border border-[#141414] p-2 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-[#141414] uppercase"
              disabled={isProcessing || activeMode === 'sketch'} />
            <button type="button"
              onClick={() => onColorChange({ wasEyedropped: !colorState.wasEyedropped })}
              className={cn('flex items-center gap-1.5 px-3 py-2 border font-mono text-[9px] uppercase tracking-widest transition-all',
                colorState.wasEyedropped ? 'bg-brand-ink text-white border-brand-ink' : 'border-[#141414]/40 hover:border-brand-ink')}
              title="Exact match mode — no Pantone variance"
              disabled={isProcessing || activeMode === 'sketch'}>
              <Pipette className="w-3 h-3" />
              Exact
            </button>
          </div>

          {/* Compensation toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={colorState.useCompensation}
              onChange={e => onColorChange({ useCompensation: e.target.checked })}
              className="accent-brand-ink w-3.5 h-3.5" disabled={isProcessing} />
            <span className="font-mono text-[9px] uppercase tracking-widest opacity-60">Screen compensation (+brightness adjust)</span>
          </label>

          {/* Resolved color readout */}
          <div className="mt-1 pt-3 border-t border-[#141414]/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-[#141414]/5 p-2 rounded">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border border-[#141414]/20 rounded-full" style={{ backgroundColor: displayHex }} />
              <span className="font-mono text-[10px] uppercase tracking-wider font-bold">
                {colorState.wasEyedropped ? 'Exact Match (No Variance)' : resolvedPantone ? `${resolvedPantone.name}` : `Nearest: ${nearestPantone.name}`}
              </span>
            </div>
            <div className="font-mono text-[10px] flex items-center gap-1.5">
              <span className="bg-[#141414] text-white px-1.5 py-0.5 rounded text-[9px]">
                {colorState.wasEyedropped ? 'EXACT' : resolvedPantone ? resolvedPantone.code.match(/\d{2}-\d{4}/)?.[0] || resolvedPantone.code : nearestPantone.code.match(/\d{2}-\d{4}/)?.[0] || ''}
              </span>
              <span>{displayHex.toUpperCase()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Color name + code fields */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="font-mono text-[10px] uppercase tracking-widest block opacity-60">Color Name</label>
          <input type="text" value={colorName} onChange={e => setColorName(e.target.value)}
            placeholder="e.g. Dusty Blue"
            className="w-full bg-transparent border border-[#141414] p-3 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#141414]"
            disabled={isProcessing} />
        </div>
        <div className="space-y-2">
          <label className="font-mono text-[10px] uppercase tracking-widest block opacity-60">Color Code</label>
          <input type="text" value={colorCode} onChange={e => setColorCode(e.target.value)}
            placeholder="e.g. B2182"
            className="w-full bg-transparent border border-[#141414] p-3 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#141414]"
            disabled={isProcessing} />
        </div>
      </div>

      {/* Reference image */}
      {activeMode !== 'sales_sheet' && (
        <div className="space-y-2 border border-[#141414] p-4 bg-white/40">
          <div className="flex items-center justify-between">
            <label className="font-mono text-[10px] uppercase tracking-widest block opacity-60">Design / Style Reference</label>
            {referenceImage && (
              <button type="button" onClick={() => setReferenceImage(null)}
                className="font-mono text-[10px] uppercase tracking-widest text-[#141414]/50 hover:text-red-500 transition-colors">
                Remove
              </button>
            )}
          </div>
          {!referenceImage ? (
            <div onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={async e => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) { const b = await fileToBase64(file); setReferenceImage(b); }
              }}
              className="border border-dashed border-[#141414]/40 hover:border-[#141414] p-4 flex flex-col items-center justify-center cursor-pointer transition-all bg-[#141414]/5 hover:bg-[#141414]/10 group">
              <Upload className="w-4 h-4 mb-1 text-[#141414]/60 group-hover:scale-110 transition-transform" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-center text-[#141414]/80">Upload Style Reference</span>
              <span className="font-mono text-[8px] uppercase tracking-wider text-[#141414]/40 mt-1">Drag & Drop or Click</span>
            </div>
          ) : (
            <div className="flex items-center gap-4 bg-white border border-[#141414] p-3 rounded">
              <img src={referenceImage} alt="Ref" className="w-16 h-16 object-cover border border-[#141414]/20" />
              <div>
                <span className="font-mono text-[10px] uppercase tracking-widest font-bold block">Reference Attached</span>
                <span className="font-mono text-[8px] uppercase tracking-wider text-[#141414]/50 leading-tight block mt-0.5">AI will use this image's pattern & texture as a guide.</span>
              </div>
            </div>
          )}
          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,.heic,.heif" className="hidden" />
        </div>
      )}

      {/* Sketch-to-render hint */}
      {activeMode === 'render' && (
        <div className="border border-brand-accent/20 bg-brand-accent/5 p-3">
          <p className="font-mono text-[9px] uppercase tracking-widest text-brand-accent leading-relaxed">
            💡 Tip: Upload a hand-drawn sketch above and use Render mode to auto-generate a realistic fabric prototype.
          </p>
        </div>
      )}

      {/* Prompt textarea */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="font-mono text-[10px] uppercase tracking-widest opacity-60">
            {activeMode === 'sales_sheet' ? 'Additional Instructions' : 'Custom Instructions'}
          </label>
          <button type="button" onClick={() => setShowQuickPrompts(p => !p)}
            className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity">
            Quick Prompts <ChevronDown className={cn('w-3 h-3 transition-transform', showQuickPrompts && 'rotate-180')} />
          </button>
        </div>

        {showQuickPrompts && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap gap-1.5 p-3 border border-[#141414]/20 bg-white/50">
            {QUICK_PROMPTS.map(qp => (
              <button key={qp} type="button" onClick={() => handleQuickPrompt(qp)}
                className="font-mono text-[9px] uppercase tracking-wider px-2.5 py-1.5 border border-[#141414]/30 hover:bg-brand-ink hover:text-white transition-all">
                {qp}
              </button>
            ))}
          </motion.div>
        )}

        <div className="relative">
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder={activeMode === 'sales_sheet'
              ? 'Optional: Additional notes for the full-page render...'
              : 'Describe changes e.g. "Change to navy blue, slim fit, add ribbed hem"'}
            className="w-full bg-transparent border border-[#141414] p-4 pr-14 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#141414] min-h-[100px] resize-none placeholder:opacity-30"
            disabled={isProcessing} />
          {useClaudePrompt && (
            <div className="absolute top-3 right-3">
              <span className="bg-brand-accent/10 text-brand-accent font-mono text-[8px] uppercase tracking-widest px-2 py-1 rounded">
                Claude
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Submit buttons */}
      <div className="flex gap-3">
        {activeMode === 'render' && (
          <button type="button" onClick={() => handleSubmit(undefined, true)} disabled={isProcessing || !imageLabel.trim()}
            className="flex-shrink-0 btn-secondary text-[9px] px-4 py-3">
            Render As Is
          </button>
        )}
        <button type="button" onClick={() => handleSubmit()} disabled={isProcessing || (!prompt.trim() && activePresets.length === 0 && activeMode !== 'render')}
          className="flex-1 btn-primary flex items-center justify-center gap-2">
          <Send className="w-4 h-4" />
          {isProcessing ? 'Generating...' : activeMode === 'sales_sheet' ? 'Process Sheet' : 'Generate'}
        </button>
      </div>

      <div className="flex items-center gap-4 opacity-30">
        <div className="h-px flex-1 bg-[#141414]" />
        <span className="font-mono text-[9px] uppercase tracking-[0.2em]">Claude + Gemini Engine</span>
        <div className="h-px flex-1 bg-[#141414]" />
      </div>
    </div>
  );
};
