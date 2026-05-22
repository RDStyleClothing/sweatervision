import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scissors, RefreshCcw, History, ChevronRight, Download, Layout, CheckSquare, Square, Settings, AlertCircle, Upload, HelpCircle, Archive, Pin } from 'lucide-react';
import { ImageUploader } from './components/ImageUploader';
import { GarmentPreview } from './components/GarmentPreview';
import { ModificationPanel } from './components/ModificationPanel';
import { MultiComparison } from './components/MultiComparison';
import { SettingsPanel } from './components/SettingsPanel';
import { modifyGarment } from './lib/gemini';
import { buildClaudePrompt, buildLocalPrompt } from './lib/claude';
import { makeImageTransparent, fileToBase64, downloadImage, downloadCollectionZip, generateLabel, generateFilename, nanoid, cn } from './lib/utils';
import { getNearestPantoneFromHex, findPantoneByInput, getCompensatedColor } from './lib/pantone';
import type { StyleBucket, HistoryItem, ColorState, CollectionPalette, AppSettings, OutputMode } from './types';

const VERSION = '4.0.0';

const STEPS = [
  'Analyzing garment...',
  'Building Claude prompt...',
  'Queuing Gemini render...',
  'Generating 3D mesh...',
  'Applying fabric & color...',
  'Finalizing studio lighting...',
  'Removing background...',
];

function loadSettings(): AppSettings {
  try {
    const s = localStorage.getItem('sv_settings');
    if (s) return JSON.parse(s);
  } catch {}
  return { geminiApiKey: '', anthropicApiKey: '', showRateLimitTimer: true };
}

function saveSettings(s: AppSettings) {
  localStorage.setItem('sv_settings', JSON.stringify(s));
}

function loadPalette(): CollectionPalette[] {
  try {
    const p = localStorage.getItem('sv_palette');
    if (p) return JSON.parse(p);
  } catch {}
  return [];
}

function savePalette(p: CollectionPalette[]) {
  localStorage.setItem('sv_palette', JSON.stringify(p));
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [collectionName, setCollectionName] = useState('');
  const [collectionPalette, setCollectionPalette] = useState<CollectionPalette[]>(loadPalette);

  // Color state lifted to app level (fix: survives style switches)
  const [colorState, setColorState] = useState<ColorState>({
    pantone: '', selectedHex: '#000000', colorName: '', colorCode: '',
    useCompensation: true, wasEyedropped: false,
  });

  // Per-style history buckets
  const [buckets, setBuckets] = useState<StyleBucket[]>([]);
  const [activeBucketKey, setActiveBucketKey] = useState<string | null>(null);

  // Current render state
  const [currentImage, setCurrentImage] = useState<string | null>(null); // what Gemini got as input
  const [modifiedImage, setModifiedImage] = useState<string | null>(null);
  const [currentLabel, setCurrentLabel] = useState('');
  const [currentVersion, setCurrentVersion] = useState<number | undefined>();
  const [currentMetadata, setCurrentMetadata] = useState<Record<string, string>>({});
  const [baseContext, setBaseContext] = useState<string | undefined>();

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Rate limit
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(120);
  const [showInlineRateLimit, setShowInlineRateLimit] = useState(false);

  // Comparison pool (cross-style)
  const [pinnedItems, setPinnedItems] = useState<{ item: HistoryItem; styleLabel: string }[]>([]);
  const [isComparing, setIsComparing] = useState(false);

  // UI
  const [isShowingSettings, setIsShowingSettings] = useState(false);
  const [selectedHistoryIndices, setSelectedHistoryIndices] = useState<number[]>([]);
  const headerFileInputRef = useRef<HTMLInputElement>(null);

  const activeBucket = buckets.find(b => b.key === activeBucketKey) || null;

  // Countdown timer
  useEffect(() => {
    if (!isTimerActive || countdownSeconds <= 0) return;
    const id = setInterval(() => {
      setCountdownSeconds(prev => {
        if (prev <= 1) { setIsTimerActive(false); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isTimerActive, countdownSeconds]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // Save palette whenever it changes
  useEffect(() => { savePalette(collectionPalette); }, [collectionPalette]);

  const handleImageUpload = (base64: string, aspectWarning: boolean) => {
    const key = nanoid();
    const newBucket: StyleBucket = { key, originalImage: base64, label: '', aspectWarning, history: [], versionCounter: 0 };
    setBuckets(prev => [newBucket, ...prev]);
    setActiveBucketKey(key);
    setCurrentImage(base64);
    setModifiedImage(null);
    setCurrentLabel('');
    setCurrentVersion(undefined);
    setCurrentMetadata({});
    setBaseContext(undefined);
    setError(null);
    setSelectedHistoryIndices([]);
  };

  const updateBucket = (key: string, updater: (b: StyleBucket) => StyleBucket) => {
    setBuckets(prev => prev.map(b => b.key === key ? updater(b) : b));
  };

  const handleModify = async (
    userPrompt: string,
    mode: OutputMode,
    referenceImage?: string,
    targetPart?: string,
    label?: string,
    metadata?: Record<string, string>,
    isForceAsIs?: boolean
  ) => {
    if (!currentImage || !settings.geminiApiKey) {
      if (!settings.geminiApiKey) {
        setError('Gemini API key missing. Open Settings to add it.');
        setIsShowingSettings(true);
        return;
      }
      return;
    }

    setIsProcessing(true);
    setProcessingStep(STEPS[0]);
    setError(null);
    setCurrentLabel(label || '');
    setCurrentVersion(undefined);
    setCurrentMetadata(metadata || {});

    let stepIdx = 0;
    const stepInterval = setInterval(() => {
      if (stepIdx < STEPS.length - 1) setProcessingStep(STEPS[++stepIdx]);
    }, 2800);

    try {
      // Build prompt: Claude if key available, else local
      let finalPrompt = userPrompt;
      if (settings.anthropicApiKey && !isForceAsIs) {
        setProcessingStep('Building precision prompt with Claude...');
        finalPrompt = await buildClaudePrompt(settings.anthropicApiKey, {
          colorState, target: targetPart || 'garment',
          activePresets: metadata?.colorChange === 'true' ? ['Change Color'] : [],
          userPrompt, fabricDescription: metadata?.fabric || '',
          mode, isForceAsIs: isForceAsIs || false,
        });
      } else if (!isForceAsIs) {
        finalPrompt = buildLocalPrompt({
          colorState, target: targetPart || 'garment',
          activePresets: [],
          userPrompt, fabricDescription: metadata?.fabric || '',
          mode, isForceAsIs: isForceAsIs || false,
        });
      }

      const rawResult = await modifyGarment(
        settings.geminiApiKey, currentImage, finalPrompt, mode,
        referenceImage, targetPart,
        (attempt) => setProcessingStep(`Retrying... (attempt ${attempt}/3)`)
      );

      // Background removal for non-full-page modes
      let processedResult = rawResult;
      if (mode !== 'sales_sheet' && mode !== 'edit') {
        setProcessingStep('Removing background & creating transparency...');
        try { processedResult = await makeImageTransparent(rawResult); }
        catch (e) { console.warn('Transparency pass failed:', e); }
      }

      // Update bucket history
      if (activeBucketKey) {
        updateBucket(activeBucketKey, bucket => {
          const newVersion = bucket.versionCounter + 1;
          const histItem: HistoryItem = {
            id: nanoid(), styleKey: activeBucketKey,
            prompt: finalPrompt, image: processedResult,
            label: label || bucket.label,
            metadata: { ...metadata, colorCompensation: colorState.useCompensation ? 'true' : 'false' },
            version: newVersion, createdAt: Date.now(),
          };
          return {
            ...bucket,
            label: label || bucket.label,
            versionCounter: newVersion,
            history: [histItem, ...bucket.history].slice(0, 10),
          };
        });
      }

      setModifiedImage(processedResult);
      setCurrentVersion((activeBucket?.versionCounter || 0) + 1);
      setSelectedHistoryIndices([]);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.startsWith('RATE_LIMIT:')) {
        if (settings.showRateLimitTimer) {
          setIsTimerActive(true); setCountdownSeconds(120);
        } else {
          setShowInlineRateLimit(true);
          setTimeout(() => setShowInlineRateLimit(false), 8000);
        }
        setError('Rate limit reached. Wait a moment or add your own Gemini API key in Settings.');
      } else {
        setError(msg || 'Generation failed. Please try again.');
      }
    } finally {
      clearInterval(stepInterval);
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  const handleUseAsBase = (image: string) => {
    const prev = currentLabel || activeBucket?.label || '';
    const prevV = currentVersion;
    const ctx = prev ? `Editing from: V${prevV || '?'} of ${prev}` : undefined;
    setCurrentImage(image);
    setModifiedImage(null);
    setCurrentLabel('');
    setCurrentVersion(undefined);
    setCurrentMetadata({});
    setBaseContext(ctx);
    setError(null);
  };

  const handleSelectBucket = (key: string) => {
    const bucket = buckets.find(b => b.key === key);
    if (!bucket) return;
    setActiveBucketKey(key);
    setCurrentImage(bucket.originalImage);
    setModifiedImage(null);
    setCurrentLabel('');
    setCurrentVersion(undefined);
    setCurrentMetadata({});
    setBaseContext(undefined);
    setError(null);
    setSelectedHistoryIndices([]);
  };

  const handleHistoryItemClick = (item: HistoryItem) => {
    setModifiedImage(item.image);
    setCurrentLabel(item.label || '');
    setCurrentVersion(item.version);
    setCurrentMetadata(item.metadata || {});
    setBaseContext(undefined);
  };

  const handleSaveColorToPalette = () => {
    const match = findPantoneByInput(colorState.pantone);
    const hex = colorState.useCompensation ? getCompensatedColor(colorState.selectedHex) : colorState.selectedHex;
    const nearest = getNearestPantoneFromHex(hex);
    const entry: CollectionPalette = {
      id: nanoid(),
      pantone: colorState.pantone || nearest.code,
      hex, name: match?.name || nearest.name,
      code: match?.code.match(/\d{2}-\d{4}/)?.[0] || nearest.code.match(/\d{2}-\d{4}/)?.[0] || '',
      savedAt: Date.now(),
    };
    setCollectionPalette(prev => [entry, ...prev].slice(0, 24));
  };

  const handleSelectFromPalette = (c: CollectionPalette) => {
    setColorState(prev => ({ ...prev, pantone: c.pantone, selectedHex: c.hex, wasEyedropped: false }));
  };

  const handlePinItem = (item: HistoryItem, styleLabel: string) => {
    setPinnedItems(prev => {
      if (prev.some(p => p.item.id === item.id)) return prev.filter(p => p.item.id !== item.id);
      if (prev.length >= 4) return prev;
      return [...prev, { item, styleLabel }];
    });
  };

  const handleBatchExport = async () => {
    if (!activeBucket || activeBucket.history.length === 0) return;
    for (const item of activeBucket.history) {
      const fn = generateFilename({ label: activeBucket.label, metadata: item.metadata, version: item.version }, 0);
      await downloadImage(item.image, fn, { isRender: item.metadata?.renderMode !== 'Sales Sheet Render' });
    }
  };

  const reset = () => {
    setBuckets([]); setActiveBucketKey(null); setCurrentImage(null); setModifiedImage(null);
    setCurrentLabel(''); setCurrentVersion(undefined); setCurrentMetadata({});
    setBaseContext(undefined); setError(null); setPinnedItems([]); setIsComparing(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-brand-bg text-brand-ink">
      {/* Header */}
      <header className="glass-header px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between border-b border-brand-ink/10">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="bg-brand-ink p-1.5 sm:p-2 shrink-0">
            <Scissors className="w-4 h-4 sm:w-6 sm:h-6 text-brand-bg" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="font-display text-xl xs:text-2xl sm:text-4xl leading-none tracking-tighter uppercase">SWEATERVISION</h1>
              <span className="bg-brand-accent text-white font-mono text-[8px] sm:text-[10px] px-1.5 py-0.5 rounded-sm animate-pulse tracking-tighter">V{VERSION}</span>
            </div>
            <p className="font-mono text-[8px] sm:text-[10px] uppercase tracking-widest opacity-50 hidden xs:block">AI Design Engine by RD Style</p>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-6 shrink-0">
          {/* Collection name */}
          <input type="text" value={collectionName} onChange={e => setCollectionName(e.target.value)}
            placeholder="Collection name..."
            className="hidden md:block w-40 bg-transparent border border-brand-ink/20 px-3 py-1.5 font-mono text-[10px] focus:outline-none focus:border-brand-ink transition-colors uppercase tracking-widest"
          />

          {/* Upload new */}
          <input type="file" ref={headerFileInputRef}
            onChange={async e => { const f = e.target.files?.[0]; if (f) { const b = await fileToBase64(f); handleImageUpload(b, false); } }}
            accept="image/*,.heic,.heif" className="hidden" />
          {currentImage && (
            <button onClick={() => headerFileInputRef.current?.click()}
              className="font-display text-[10px] sm:text-[11px] font-bold uppercase tracking-wider hover:text-brand-accent transition-colors flex items-center gap-1 sm:gap-1.5">
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Upload New</span>
            </button>
          )}

          {/* Compare (show when items pinned) */}
          {pinnedItems.length >= 2 && (
            <button onClick={() => setIsComparing(c => !c)}
              className={cn('font-display text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5',
                isComparing ? 'text-brand-accent' : 'hover:text-brand-accent')}>
              <Layout className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Compare ({pinnedItems.length})</span>
            </button>
          )}

          {/* Export ZIP */}
          {buckets.some(b => b.history.length > 0) && (
            <button onClick={() => downloadCollectionZip(buckets, collectionName || 'RD-Collection')}
              className="font-display text-[10px] sm:text-[11px] font-bold uppercase tracking-wider hover:text-brand-accent transition-colors flex items-center gap-1 sm:gap-1.5">
              <Archive className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Export All</span>
            </button>
          )}

          <button onClick={() => setIsShowingSettings(true)}
            className="font-display text-[10px] sm:text-[11px] font-bold uppercase tracking-wider hover:text-brand-accent transition-colors flex items-center gap-1 sm:gap-1.5">
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          {currentImage && (
            <button onClick={reset}
              className="flex items-center gap-1 sm:gap-2 font-display text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-brand-accent hover:opacity-70 transition-opacity">
              <RefreshCcw className="w-3 h-3" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 md:p-12">
        {!currentImage ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto pt-10 sm:pt-20">
            <div className="text-center mb-12">
              <h2 className="font-display text-4xl xs:text-5xl sm:text-6xl md:text-8xl uppercase leading-[0.85] tracking-tighter mb-6">
                Redesign<br />On The Spot.
              </h2>
              <p className="font-mono text-[10px] sm:text-xs uppercase tracking-[0.2em] opacity-60 max-w-md mx-auto px-4">
                Transform garment fit and color requests into visual reality instantly
              </p>
            </div>
            {/* Require API key before uploading */}
            {!settings.geminiApiKey ? (
              <div className="space-y-4 text-center">
                <div className="border border-amber-300 bg-amber-50 p-6 space-y-3">
                  <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
                  <p className="font-mono text-[11px] uppercase tracking-widest text-amber-700">Gemini API key required to start</p>
                  <button onClick={() => setIsShowingSettings(true)} className="btn-primary">
                    Open Settings
                  </button>
                </div>
              </div>
            ) : (
              <ImageUploader onImageUpload={handleImageUpload} />
            )}
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-start">

            {/* Left sidebar — style buckets + history */}
            <div className="lg:col-span-3 space-y-6">
              {/* Multi-style switcher */}
              {buckets.length > 1 && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="font-mono text-[9px] uppercase tracking-widest opacity-40">Styles ({buckets.length})</h2>
                  </div>
                  <div className="space-y-1.5">
                    {buckets.map(bucket => (
                      <button key={bucket.key} onClick={() => handleSelectBucket(bucket.key)}
                        className={cn('w-full flex items-center gap-3 p-2.5 border transition-all text-left',
                          bucket.key === activeBucketKey ? 'border-brand-ink bg-white shadow-sm' : 'border-brand-ink/10 hover:border-brand-ink/30')}>
                        <div className="w-10 h-10 border border-brand-ink/10 overflow-hidden flex-shrink-0">
                          <img src={bucket.originalImage} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-[9px] uppercase tracking-wider truncate font-bold">
                            {bucket.label || 'Unnamed Style'}
                          </p>
                          <p className="font-mono text-[8px] uppercase opacity-40">{bucket.history.length} render{bucket.history.length !== 1 && 's'}</p>
                        </div>
                        {bucket.aspectWarning && (
                          <span title="Landscape image — portrait recommended" className="text-amber-500 text-[10px]">⚠</span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Aspect warning */}
              {activeBucket?.aspectWarning && (
                <div className="border border-amber-200 bg-amber-50 p-3">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-amber-700 leading-relaxed">
                    ⚠ Landscape image detected. For best results, upload portrait-oriented (3:4) images.
                  </p>
                </div>
              )}

              {/* History sidebar */}
              {activeBucket && activeBucket.history.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-mono text-[9px] uppercase tracking-widest opacity-40 flex items-center gap-2">
                      <History className="w-3.5 h-3.5" /> History
                    </h2>
                    <div className="flex items-center gap-2">
                      {pinnedItems.length > 0 && (
                        <button onClick={() => setIsComparing(c => !c)}
                          className="font-mono text-[8px] uppercase tracking-widest text-brand-accent hover:opacity-70">
                          View ({pinnedItems.length})
                        </button>
                      )}
                      <button onClick={handleBatchExport}
                        className="font-mono text-[8px] uppercase tracking-widest opacity-40 hover:opacity-80 flex items-center gap-1">
                        <Download className="w-3 h-3" /> All
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {activeBucket.history.map((item, index) => {
                      const isPinned = pinnedItems.some(p => p.item.id === item.id);
                      return (
                        <div key={item.id} className="flex gap-1">
                          <button onClick={() => handleHistoryItemClick(item)}
                            className={cn('flex-1 flex items-center gap-3 p-2.5 border border-brand-ink/10 hover:border-brand-ink transition-all group text-left',
                              modifiedImage === item.image && 'border-brand-ink bg-white shadow-sm')}>
                            <div className={cn('w-10 h-10 border border-brand-ink/10 overflow-hidden flex-shrink-0 relative',
                              item.metadata?.renderMode !== 'Sales Sheet Render' ? 'transparency-checkerboard' : 'bg-white')}>
                              <img src={item.image} alt="" className="w-full h-full object-cover" />
                              {item.version && (
                                <div className="absolute top-0 right-0 bg-brand-ink text-white text-[7px] font-bold px-1 py-0.5">V{item.version}</div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-mono text-[8px] uppercase tracking-tight truncate opacity-60">{item.prompt.slice(0, 60)}</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.metadata?.colorName && (
                                  <span className="bg-brand-ink/5 border border-brand-ink/10 text-brand-ink px-1.5 py-0.5 rounded-full font-mono text-[7px] uppercase truncate max-w-[100px]">
                                    {item.metadata.colorName}
                                  </span>
                                )}
                                {item.metadata?.renderMode && (
                                  <span className={cn('px-1.5 py-0.5 rounded-full font-mono text-[7px] uppercase',
                                    item.metadata.renderMode !== 'Sales Sheet Render' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-brand-ink/5 text-brand-ink')}>
                                    {item.metadata.renderMode}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                          {/* Pin button */}
                          <button onClick={() => handlePinItem(item, activeBucket.label || 'Style')}
                            title={isPinned ? 'Unpin from comparison' : 'Pin to colorway comparison'}
                            className={cn('px-2 border transition-all',
                              isPinned ? 'border-brand-accent bg-brand-accent/10 text-brand-accent' : 'border-brand-ink/10 hover:border-brand-ink text-brand-ink/30 hover:text-brand-ink')}>
                            <Pin className="w-3 h-3" />
                          </button>
                          {/* Use as base */}
                          <button onClick={() => handleUseAsBase(item.image)} title="Set as base for further edits"
                            className="px-2 border border-brand-ink/10 hover:bg-brand-ink hover:text-white transition-all">
                            <RefreshCcw className="w-3 h-3" />
                          </button>
                          {/* Download */}
                          <button onClick={() => downloadImage(item.image, generateFilename({ label: activeBucket.label, metadata: item.metadata, version: item.version }, index), { isRender: item.metadata?.renderMode !== 'Sales Sheet Render' })}
                            className="px-2 border border-brand-ink/10 hover:bg-brand-ink hover:text-white transition-all">
                            <Download className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>

            {/* Center — preview */}
            <div className="lg:col-span-5 space-y-4">
              {/* Comparison view */}
              <AnimatePresence>
                {isComparing && pinnedItems.length >= 2 && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    className="bg-white border border-brand-ink p-6 space-y-4">
                    <MultiComparison
                      pinnedItems={pinnedItems}
                      onRemovePin={id => setPinnedItems(prev => prev.filter(p => p.item.id !== id))}
                      onClose={() => setIsComparing(false)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex items-start gap-3 p-4 border border-red-200 bg-red-50">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="font-mono text-[10px] uppercase tracking-widest text-red-600 leading-relaxed">{error}</p>
                </motion.div>
              )}

              <GarmentPreview
                originalImage={currentImage}
                modifiedImage={modifiedImage}
                isProcessing={isProcessing}
                processingStep={processingStep}
                label={currentLabel}
                metadata={currentMetadata}
                version={currentVersion}
                baseContext={baseContext}
                onUseAsBase={handleUseAsBase}
              />
            </div>

            {/* Right — modification panel */}
            <div className="lg:col-span-4">
              <ModificationPanel
                colorState={colorState}
                onColorChange={patch => setColorState(prev => ({ ...prev, ...patch }))}
                collectionPalette={collectionPalette}
                onSaveColorToPalette={handleSaveColorToPalette}
                onRemoveFromPalette={id => setCollectionPalette(prev => prev.filter(c => c.id !== id))}
                onSelectFromPalette={handleSelectFromPalette}
                onModify={handleModify}
                isProcessing={isProcessing}
                useClaudePrompt={!!settings.anthropicApiKey}
              />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-brand-ink p-6 bg-white/50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.3em] opacity-40">© 2026 RD Style · All Rights Reserved</div>
          <div className="flex gap-8 font-mono text-[9px] uppercase tracking-widest">
            <span className="opacity-40">SweaterVision v{VERSION}</span>
            <span className="opacity-40">Claude + Gemini Engine</span>
          </div>
        </div>
      </footer>

      {/* Settings modal */}
      <AnimatePresence>
        {isShowingSettings && (
          <SettingsPanel settings={settings} version={VERSION}
            onSave={s => { setSettings(s); saveSettings(s); }}
            onClose={() => setIsShowingSettings(false)} />
        )}

        {/* Rate limit modal */}
        {isTimerActive && settings.showRateLimitTimer && (
          <motion.div key="rate-limit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-[#141414]/80 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.95, y: 15 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 15 }}
              className="bg-white border-2 border-brand-ink max-w-md w-full p-8 space-y-6 rounded-xl shadow-2xl">
              <div className="space-y-2 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-700 animate-pulse border border-amber-200">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="font-display text-2xl uppercase tracking-tighter text-brand-ink pt-2">Quota Pause</h3>
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#141414]/50">Temporary rate limit cooling</p>
              </div>
              <div className="bg-[#141414] text-white p-6 text-center rounded-lg">
                <div className="font-mono text-5xl font-bold tracking-widest">{formatTime(countdownSeconds)}</div>
                <p className="font-mono text-[8px] uppercase tracking-widest mt-2 opacity-50">Remaining</p>
              </div>
              <p className="text-[11px] font-mono text-[#141414]/70 text-center leading-relaxed">
                Add your own Gemini API key in Settings to bypass this limit.
              </p>
              <div className="flex flex-col items-center gap-4 pt-4 border-t border-brand-ink/10">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!settings.showRateLimitTimer}
                    onChange={e => { const s = { ...settings, showRateLimitTimer: !e.target.checked }; setSettings(s); saveSettings(s); }}
                    className="accent-brand-ink w-4 h-4" />
                  <span className="font-mono text-[10px] uppercase tracking-widest opacity-70">Don't show timer again</span>
                </label>
                <button onClick={() => setIsTimerActive(false)}
                  className="font-display text-[11px] font-bold uppercase tracking-widest text-brand-accent hover:opacity-80 underline">
                  Skip and try anyway →
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
