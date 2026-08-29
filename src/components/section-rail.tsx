import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type RailItem = { id: string; label: string };

export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Scroll a section to the top of the viewport, honouring reduced-motion. */
export function jumpToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  });
}

/**
 * In-page section nav. The desktop rail is position:fixed to the viewport — it
 * never moves, scrolls, or jumps; only the content column scrolls. An invisible
 * placeholder div keeps the flex layout honest and provides the fixed anchor
 * coordinates. On mobile it is a horizontal chip row pinned under the header.
 * One scroll-spy mechanism (IntersectionObserver) drives highlighting.
 */
export function SectionRail({
  items,
  onJump,
}: {
  items: RailItem[];
  onJump?: (id: string) => void;
}) {
  const ids = items.map((i) => i.id);
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const slotRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Measure the placeholder once (and on resize) — never on scroll, so the
  // rail's fixed position stays constant while the content column moves.
  useEffect(() => {
    const measure = () => {
      const el = slotRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPos({ left: rect.left, top: rect.top });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (els.length === 0) return;

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }
        if (visible.size > 0) {
          // topmost visible section wins — works scrolling up and down
          const next = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
          if (next) setActive(next[0]);
        }
      },
      { rootMargin: "-88px 0px -55% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join("|")]);

  const go = (id: string) => {
    onJump?.(id);
    // allow a disclosure to open before measuring the target
    requestAnimationFrame(() => jumpToSection(id));
    setActive(id);
  };

  return (
    <>
      {/* Mobile: chip row pinned under the page header */}
      <nav className="sticky top-24 z-30 -mx-1 mb-2 flex gap-2 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur lg:hidden">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => go(item.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground",
              active === item.id && "bg-accent text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Desktop: invisible placeholder reserves the column width in the flex row. */}
      <div ref={slotRef} aria-hidden className="hidden w-48 shrink-0 lg:block" />

      {/* Desktop: the rail itself is fixed to the viewport and never moves. */}
      <nav
        className="fixed z-30 hidden max-h-[calc(100vh-3rem)] w-48 overflow-y-auto lg:block"
        style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}
      >
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => go(item.id)}
                className={cn(
                  "w-full rounded-md border-l-2 border-transparent px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
                  active === item.id && "border-primary bg-accent font-medium text-foreground",
                )}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
