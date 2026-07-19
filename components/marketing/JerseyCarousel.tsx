"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Slide {
  id: string;
  label: string;
  number: string;
  colors: [string, string, string];
  src: string;

}

const SLIDES: Slide[] = [
  { id: "heartbreakers",  label: "Heartbreakers", number: "07", colors: ["#0d9488", "#0f766e", "#134e4a"], src: "/images/carousel/01-heartbreakers.png" },
  { id: "tidal-koi",      label: "TiDaL Koi",   number: "11", colors: ["#2563eb", "#1d4ed8", "#1e3a8a"], src: "/images/carousel/02-tidal-w.png" },
  { id: "panic-c",        label: "PAN!C",       number: "23", colors: ["#9333ea", "#7e22ce", "#581c87"], src: "/images/carousel/03-panic.png" },
  { id: "mamba-black",    label: "Mamba Black", number: "99", colors: ["#ea580c", "#dc2626", "#991b1b"], src: "/images/carousel/04-mamba-black.png" },
];

const INTERVAL_MS = 4500;

export function JerseyCarousel() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const restart = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(
      () => setCurrent((c) => (c + 1) % SLIDES.length),
      INTERVAL_MS,
    );
  }, []);

  useEffect(() => {
    if (!paused) restart();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, restart]);

  const navigate = (dir: "next" | "prev") => {
    setCurrent((c) =>
      dir === "next" ? (c + 1) % SLIDES.length : (c - 1 + SLIDES.length) % SLIDES.length,
    );
    restart();
  };

  const goTo = (idx: number) => {
    setCurrent(idx);
    restart();
  };

  return (
    <div
      className="group relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-2xl shadow-xl ring-1 ring-black/10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {SLIDES.map((slide, i) => (
        <div
          key={slide.id}
          aria-hidden={i !== current}
          className="absolute inset-0 transition-[opacity,transform] duration-700 ease-in-out"
          style={{
            opacity: i === current ? 1 : 0,
            transform: i === current ? "scale(1)" : "scale(1.06)",
            background: `linear-gradient(145deg, ${slide.colors[0]}, ${slide.colors[1]} 55%, ${slide.colors[2]})`,
            zIndex: i === current ? 1 : 0,
          }}
        >
          {/* glare highlight */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_18%,rgba(255,255,255,0.28),transparent_52%)]" />

          {/* jersey image */}
          <div className="absolute inset-0 z-10 scale-125">
            <Image
              src={slide.src}
              alt={slide.label}
              fill
              className="object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
              sizes="(max-width: 768px) 100vw, 448px"
              priority={i === 0}
            />
          </div>

          {/* bottom vignette + label */}
          <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/50 via-black/10 to-transparent pb-4 pt-12 text-center">
            <p className="text-sm font-semibold tracking-wide text-white/90 drop-shadow-sm">
              {slide.label}
            </p>
          </div>
        </div>
      ))}

      {/* prev arrow */}
      <button
        onClick={() => navigate("prev")}
        className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/20 p-2 text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 hover:bg-black/40 focus-visible:opacity-100"
        aria-label="Previous jersey"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* next arrow */}
      <button
        onClick={() => navigate("next")}
        className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/20 p-2 text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 hover:bg-black/40 focus-visible:opacity-100"
        aria-label="Next jersey"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* dot indicators */}
      <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={cn(
              "h-1.5 rounded-full bg-white transition-all duration-300",
              i === current ? "w-5 opacity-100" : "w-1.5 opacity-40 hover:opacity-65",
            )}
          />
        ))}
      </div>
    </div>
  );
}
