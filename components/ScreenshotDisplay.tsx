'use client';

interface ScreenshotDisplayProps {
  screenshot: string;
}

export function ScreenshotDisplay({ screenshot }: ScreenshotDisplayProps) {
  return (
    <div>
      <h3 className="text-lg mb-2 text-foreground">
        Current View
      </h3>
      <div className="border border-gray-700 overflow-hidden bg-black">
        <img
          src={`data:image/png;base64,${screenshot}`}
          alt="Browser screenshot"
          className="w-full h-auto"
        />
      </div>
    </div>
  );
}
