'use client';

import { useState } from 'react';

type TestThumbnailProps = {
  src: string | null;
  flexClass: string;
};

export function TestThumbnail({ src, flexClass }: TestThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div className={`${flexClass} min-w-0 h-full bg-[#1F1F20] overflow-hidden`}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt=""
          className="w-full h-full object-cover object-top"
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}
