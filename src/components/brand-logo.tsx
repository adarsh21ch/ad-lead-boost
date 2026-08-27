import logoAsset from "@/assets/adspro-logo.png.asset.json";
import { cn } from "@/lib/utils";

const SIZES = { sm: "h-7 w-7", md: "h-8 w-8", lg: "h-10 w-10" } as const;

export function BrandLogo({
  size = "md",
  withWordmark = true,
  className,
}: {
  size?: keyof typeof SIZES;
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <img
        src={logoAsset.url}
        alt="AdsPro logo"
        width={512}
        height={512}
        className={cn(SIZES[size], "rounded-[22%] object-contain")}
      />
      {withWordmark ? (
        <span className="text-lg font-semibold tracking-tight text-foreground">AdsPro</span>
      ) : null}
    </span>
  );
}
