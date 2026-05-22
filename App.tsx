import React, { useCallback, useState } from 'react';
import { Upload, AlertTriangle } from 'lucide-react';
import { cn, fileToBase64, checkImageAspectRatio } from '../lib/utils';

interface ImageUploaderProps {
  onImageUpload: (base64: string, aspectWarning: boolean) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) return;
    setIsLoading(true);
    try {
      const base64 = await fileToBase64(file);
      const { isPortrait } = await checkImageAspectRatio(base64);
      onImageUpload(base64, !isPortrait);
    } catch (e) {
      console.error('File read failed:', e);
    } finally {
      setIsLoading(false);
    }
  }, [onImageUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <label
      className={cn(
        "block border-2 border-dashed border-brand-ink/30 hover:border-brand-ink transition-all duration-300 cursor-pointer p-12 text-center group",
        isDragging && "border-brand-ink bg-brand-ink/5"
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input type="file" accept="image/*,.heic,.heif" className="hidden" onChange={handleChange} />
      <div className="space-y-4">
        <div className={cn(
          "w-16 h-16 border border-brand-ink/20 rounded-full mx-auto flex items-center justify-center transition-all duration-300",
          "group-hover:border-brand-ink group-hover:scale-110"
        )}>
          {isLoading
            ? <div className="w-6 h-6 border-2 border-brand-ink border-t-transparent rounded-full animate-spin" />
            : <Upload className="w-6 h-6 text-brand-ink/50 group-hover:text-brand-ink transition-colors" />
          }
        </div>
        <div className="space-y-2">
          <p className="font-display text-lg font-bold uppercase tracking-tighter text-brand-ink">
            {isDragging ? 'Drop to Upload' : 'Upload Garment'}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-brand-ink/50">
            Photo · Sketch · Tech Pack · Sales Sheet
          </p>
          <p className="font-mono text-[9px] uppercase tracking-widest text-brand-ink/30">
            JPG · PNG · HEIC · WebP — Portrait orientation recommended
          </p>
        </div>
      </div>
    </label>
  );
};
