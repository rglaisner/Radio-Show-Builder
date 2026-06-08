export function RainbowBackground() {
  return (
    <>
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[70vw] h-[70vh] rounded-full bg-[#ff00a2]/40 mix-blend-screen filter blur-[120px] animate-blob" />
        <div className="absolute top-[10%] -right-[10%] w-[60vw] h-[60vh] rounded-full bg-[#143dff]/40 mix-blend-screen filter blur-[120px] animate-blob animation-delay-2000" />
        <div className="absolute -bottom-[20%] left-[10%] w-[70vw] h-[70vh] rounded-full bg-[#43ff0d]/30 mix-blend-screen filter blur-[120px] animate-blob animation-delay-4000" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[60vw] h-[60vh] rounded-full bg-[#ffc500]/30 mix-blend-screen filter blur-[120px] animate-blob animation-delay-6000" />
        <div className="absolute top-[30%] left-[30%] w-[50vw] h-[50vh] rounded-full bg-[#ff2a2a]/30 mix-blend-screen filter blur-[120px] animate-blob animation-delay-3000" />
      </div>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[60px] z-0 pointer-events-none" />
    </>
  );
}
