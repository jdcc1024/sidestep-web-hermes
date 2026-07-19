"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type ComparisonOption = {
  name: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
};

export function OptionPanel({
  option,
  side,
}: {
  option: ComparisonOption;
  side: "left" | "right";
}) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-2",
        side === "left" ? "items-end text-right" : "items-start text-left"
      )}
    >
      <div className="relative aspect-[3/2] w-full max-w-xs overflow-hidden rounded-xl bg-muted flex items-center justify-center">
        {!imgFailed && (
          <img
            src={option.imageSrc}
            alt={option.imageAlt}
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
        )}
        <span className="text-xs font-medium text-muted-foreground">
          {option.name}
        </span>
      </div>
      <div>
        <p className="font-semibold text-foreground">{option.name}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{option.description}</p>
      </div>
    </div>
  );
}
