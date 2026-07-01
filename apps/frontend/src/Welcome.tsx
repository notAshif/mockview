import React from "react";

interface WelcomeProps {
  onStart?: () => void;
}

const Welcome = ({ onStart }: WelcomeProps) => {
  return (
    <div className="flex flex-col justify-center items-center min-h-screen bg-[#0B0C0E] px-4">
      <div className="flex flex-col items-start w-full max-w-sm p-8 rounded-2xl border border-[#2A2D33] bg-[#16181C] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]">
        <span className="text-xs tracking-[0.18em] uppercase text-[#8A8F98] mb-3">
          Mockview
        </span>

        <h1 className="font-serif text-[28px] leading-tight text-[#F5F0E8] mb-2">
          Practice the interview
          <br />
          before it counts.
        </h1>

        <p className="text-sm text-[#8A8F98] mb-7 leading-relaxed">
          Talk through real questions, get feedback on your answers.
        </p>

        <button
          onClick={onStart}
          className="group relative flex items-center gap-2.5 w-full justify-center
                     rounded-lg bg-[#C17F3B] hover:bg-[#D18F4B] active:bg-[#B0722F]
                     text-[#0B0C0E] font-medium text-sm py-3 px-5
                     transition-colors duration-150
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C17F3B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#16181C]"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#0B0C0E] opacity-40 motion-safe:animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0B0C0E]" />
          </span>
          Start Interview
        </button>
      </div>
    </div>
  );
};

export default Welcome;
