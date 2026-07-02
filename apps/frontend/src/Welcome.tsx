import React, { useState, useEffect } from "react";
import bgHero from "./assets/bg_hero.jpg";
import heroCharRaw from "./assets/hero_char.jpg";
import { playAestheticClick } from "./lib/utils";

interface WelcomeProps {
  onStart?: (interviewId: string) => void;
}

// Custom hook to dynamically remove the checkerboard background of the anime character JPEG
const useTransparentImage = (src: string) => {
  const [processedSrc, setProcessedSrc] = useState<string>(src);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;

        // Sample background colors at the corners
        const bgColors: [number, number, number][] = [];
        const addBgColor = (color: [number, number, number]) => {
          if (color[0] > 180 && color[1] > 180 && color[2] > 180) {
            const exists = bgColors.some(c => 
              Math.abs(c[0] - color[0]) < 10 &&
              Math.abs(c[1] - color[1]) < 10 &&
              Math.abs(c[2] - color[2]) < 10
            );
            if (!exists) bgColors.push(color);
          }
        };

        const getPixel = (x: number, y: number): [number, number, number] => {
          const idx = (y * width + x) * 4;
          return [data[idx]!, data[idx + 1]!, data[idx + 2]!];
        };

        // Sample along borders
        for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 15))) {
          addBgColor(getPixel(x, 0));
          addBgColor(getPixel(x, height - 1));
        }
        for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 15))) {
          addBgColor(getPixel(0, y));
          addBgColor(getPixel(width - 1, y));
        }

        // If no bg colors, default to white/light grey
        if (bgColors.length === 0) {
          bgColors.push([255, 255, 255]);
          bgColors.push([240, 240, 240]);
        }

        // Perform BFS starting from borders to flood-fill background with transparency
        const visited = new Uint8Array(width * height);
        const queue: number[] = [];

        const enqueue = (x: number, y: number) => {
          const idx = y * width + x;
          if (!visited[idx]) {
            visited[idx] = 1;
            queue.push(idx);
          }
        };

        for (let x = 0; x < width; x++) {
          enqueue(x, 0);
          enqueue(x, height - 1);
        }
        for (let y = 0; y < height; y++) {
          enqueue(0, y);
          enqueue(width - 1, y);
        }

        let head = 0;
        while (head < queue.length) {
          const idx = queue[head++]!;
          const px = idx % width;
          const py = Math.floor(idx / width);

          const r = data[idx * 4]!;
          const g = data[idx * 4 + 1]!;
          const b = data[idx * 4 + 2]!;

          const matchesBg = bgColors.some(c => 
            Math.abs(c[0] - r) < 30 &&
            Math.abs(c[1] - g) < 30 &&
            Math.abs(c[2] - b) < 30
          );

          const isLightGreyOrWhite = (r > 190 && g > 190 && b > 190 && Math.abs(r - g) < 12 && Math.abs(g - b) < 12);

          if (matchesBg || isLightGreyOrWhite) {
            data[idx * 4 + 3] = 0; // Alpha = 0

            // Check 4-way neighbors
            if (px > 0) enqueue(px - 1, py);
            if (px < width - 1) enqueue(px + 1, py);
            if (py > 0) enqueue(px, py - 1);
            if (py < height - 1) enqueue(px, py + 1);
          }
        }

        ctx.putImageData(imageData, 0, 0);
        setProcessedSrc(canvas.toDataURL("image/png"));
      } catch (err) {
        console.error("Failed to key out checkerboard background:", err);
      }
    };
  }, [src]);

  return processedSrc;
};

const Welcome = ({ onStart }: WelcomeProps) => {
  const [loading, setLoading] = useState(false);
  const transparentChar = useTransparentImage(heroCharRaw);

  const handleStart = async () => {
    setLoading(true);
    try {
      // 1. Check if server is started
      const statusRes = await fetch("http://localhost:3001/api/status");
      if (!statusRes.ok) {
        throw new Error("Server is not started");
      }
      
      // 2. Start interview via backend API
      const res = await fetch("http://localhost:3001/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      
      if (!res.ok) {
        throw new Error("Failed to create interview");
      }
      
      const data = await res.json();
      if (data.interviewId && onStart) {
        // Proceed with interview immediately
        onStart(data.interviewId);
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (err) {
      console.error("Start interview error:", err);
      alert("Backend server is not running or database is offline. Please make sure the backend is active on http://localhost:3001");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="relative flex flex-col justify-center items-center min-h-screen bg-[#FBEFEF] bg-cover bg-center px-4 overflow-hidden"
      style={{ backgroundImage: `url(${bgHero})` }}
    >
      {/* Background Soft Layer for subtle glass tint */}
      <div className="absolute inset-0 bg-[#FBEFEF]/30 backdrop-blur-[0.5px]" />

      {/* Main Responsive Container */}
      <div className="relative flex flex-col items-center justify-end w-full max-w-lg min-h-[85vh] z-10 pb-8">
        
        {/* Waving Anime Character standing behind the Box */}
        <div className="absolute top-0 bottom-44 flex items-center justify-center pointer-events-none z-10 w-full select-none">
          <img 
            src={transparentChar} 
            alt="Anime character welcome" 
            className="h-full max-h-[50vh] md:max-h-[55vh] object-contain drop-shadow-[0_12px_24px_rgba(11,9,9,0.12)] transition-transform duration-300 transform translate-y-4 hover:scale-[1.02]"
          />
        </div>

        {/* Welcome Card Box (in front of character, z-20) */}
        <div className="relative z-20 w-full max-w-sm p-8 rounded-3xl border-2 border-[#0B0909] bg-[#FBEFEF]/95 backdrop-blur-md shadow-[6px_6px_0px_0px_#0B0909] flex flex-col items-center text-center transform transition-all duration-300 hover:translate-y-[-2px] hover:shadow-[8px_8px_0px_0px_#0B0909]">
          <span className="text-[11px] font-extrabold tracking-[0.25em] uppercase text-[#0B0909] mb-2.5 select-none bg-[#EEEEEE] px-2.5 py-0.5 rounded-lg border border-[#0B0909]/20 shadow-[1px_1px_0px_0px_#0B0909]">
            Mockview
          </span>

          <h1 className="font-serif text-[28px] leading-snug text-[#0B0909] mb-3 font-bold">
            Practice the interview
            <br />
            before it counts.
          </h1>

          <p className="text-xs text-[#0B0909]/80 mb-7 leading-relaxed font-medium max-w-[280px]">
            Talk through real questions, get real-time feedback with your AI interview assistant.
          </p>

          <button
            onClick={() => {
              playAestheticClick();
              handleStart();
            }}
            disabled={loading}
            className="group relative flex items-center gap-3 w-full justify-center
                       rounded-xl bg-[#0B0909] hover:bg-[#0B0909]/90 active:scale-[0.98]
                       text-[#FBEFEF] font-semibold text-sm py-3.5 px-6 border border-[#0B0909]
                       transition-all duration-150 disabled:opacity-50
                       shadow-[3px_3px_0px_0px_#EEEEEE] hover:shadow-[5px_5px_0px_0px_#EEEEEE]
                       focus:outline-none cursor-pointer"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#FBEFEF] opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FBEFEF]" />
            </span>
            {loading ? "Initializing..." : "Start Interview"}
          </button>
        </div>

      </div>
    </div>
  );
};

export default Welcome;
