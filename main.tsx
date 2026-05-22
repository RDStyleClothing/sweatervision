@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
@import "tailwindcss";

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Space Grotesk", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;

  --color-brand-bg: #E4E3E0;
  --color-brand-card: #FFFFFF;
  --color-brand-accent: #2563EB;
  --color-brand-ink: #141414;

  --shadow-minimal: 4px 4px 0px rgba(0,0,0,0.1);
  --shadow-hover: 8px 8px 0px rgba(0,0,0,0.2);

  @keyframes shake {
    0%,100% { transform: translateX(0); }
    10%,30%,50%,70%,90% { transform: translateX(-2px); }
    20%,40%,60%,80% { transform: translateX(2px); }
  }
  --animate-shake: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;

  @keyframes fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  --animate-fade-in: fade-in 0.4s ease both;
}

@layer base {
  body {
    @apply bg-brand-bg text-brand-ink font-sans antialiased selection:bg-brand-ink selection:text-white;
  }
}

@layer components {
  .minimal-card {
    @apply bg-brand-card shadow-none border border-brand-ink transition-all duration-300;
  }
  .glass-header {
    @apply sticky top-0 z-50 bg-brand-bg/80 backdrop-blur-md border-b border-brand-ink;
  }
  .btn-primary {
    @apply bg-brand-ink text-white px-6 py-3 font-mono font-medium tracking-widest hover:bg-black transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed uppercase text-[10px];
  }
  .btn-secondary {
    @apply bg-transparent border border-brand-ink px-6 py-3 font-mono font-medium tracking-widest hover:bg-brand-ink hover:text-white transition-all duration-300 uppercase text-[10px];
  }
}

.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { @apply bg-transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { @apply bg-brand-ink/10 rounded-full; }

.transparency-checkerboard {
  background-color: #ffffff;
  background-image:
    linear-gradient(45deg, #efefef 25%, transparent 25%),
    linear-gradient(-45deg, #efefef 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #efefef 75%),
    linear-gradient(-45deg, transparent 75%, #efefef 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}
