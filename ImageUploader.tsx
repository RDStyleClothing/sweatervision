import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Eye, EyeOff } from 'lucide-react';
import type { AppSettings } from '../types';
import { cn } from '../lib/utils';

interface SettingsPanelProps {
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
  onClose: () => void;
  version: string;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onSave, onClose, version }) => {
  const [geminiKey, setGeminiKey] = useState(settings.geminiApiKey);
  const [anthropicKey, setAnthropicKey] = useState(settings.anthropicApiKey);
  const [showTimer, setShowTimer] = useState(settings.showRateLimitTimer);
  const [showGemini, setShowGemini] = useState(false);
  const [showAnthropic, setShowAnthropic] = useState(false);

  const handleSave = () => {
    onSave({ geminiApiKey: geminiKey.trim(), anthropicApiKey: anthropicKey.trim(), showRateLimitTimer: showTimer });
    onClose();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] bg-[#141414]/80 backdrop-blur-md flex items-center justify-center p-6">
      <motion.div initial={{ scale: 0.95, y: 15 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 15 }}
        className="bg-white border-2 border-brand-ink max-w-lg w-full p-8 space-y-6 rounded-xl shadow-2xl">

        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl uppercase tracking-tighter">Settings</h2>
          <button onClick={onClose} className="p-2 hover:bg-brand-ink/5 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Gemini key */}
          <div className="space-y-2">
            <label className="font-mono text-[10px] uppercase tracking-widest block opacity-60">
              Gemini API Key <span className="text-brand-accent">(Image Rendering)</span>
            </label>
            <div className="relative">
              <input type={showGemini ? 'text' : 'password'} value={geminiKey} onChange={e => setGeminiKey(e.target.value)}
                placeholder="AIza..."
                className="w-full bg-transparent border border-[#141414] p-3 pr-10 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#141414]" />
              <button type="button" onClick={() => setShowGemini(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-ink/40 hover:text-brand-ink transition-colors">
                {showGemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="font-mono text-[9px] opacity-40">Get your key at <a href="https://aistudio.google.com/" target="_blank" rel="noopener" className="underline">aistudio.google.com</a></p>
          </div>

          {/* Anthropic key */}
          <div className="space-y-2">
            <label className="font-mono text-[10px] uppercase tracking-widest block opacity-60">
              Anthropic API Key <span className="text-brand-accent">(Prompt Intelligence)</span>
            </label>
            <div className="relative">
              <input type={showAnthropic ? 'text' : 'password'} value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full bg-transparent border border-[#141414] p-3 pr-10 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#141414]" />
              <button type="button" onClick={() => setShowAnthropic(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-ink/40 hover:text-brand-ink transition-colors">
                {showAnthropic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="font-mono text-[9px] opacity-40">
              Optional but recommended for best color accuracy. Get key at <a href="https://console.anthropic.com/" target="_blank" rel="noopener" className="underline">console.anthropic.com</a>
            </p>
            {!anthropicKey && (
              <p className="font-mono text-[9px] text-amber-600">Without Anthropic key, local prompt builder is used (still works, less color precision).</p>
            )}
          </div>

          {/* Rate limit timer */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={showTimer} onChange={e => setShowTimer(e.target.checked)}
              className="accent-brand-ink w-4 h-4" />
            <span className="font-mono text-[10px] uppercase tracking-widest opacity-70">Show rate limit countdown timer</span>
          </label>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex-1">Save Settings</button>
        </div>

        <p className="font-mono text-[8px] uppercase tracking-widest opacity-30 text-center">
          SweaterVision v{version} · Keys stored locally in your browser
        </p>
      </motion.div>
    </motion.div>
  );
};
