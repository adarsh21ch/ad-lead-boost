import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type RailItem = { id: string; label: string };
export type RailGroup = { label: string; items: RailItem[] };

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
 * In-page section nav. Sticky on desktop, a horizontal chip row on mobile.
 * One scroll-spy mechanism (IntersectionObserver over the section elements)
 * drives highlighting in both scroll directions.
 */
export function SectionRail({
  groups,
  onJump,
}: {
  groups: RailGroup[];
  onJump?: (id: string) => void;
}) {
  const ids = groups.flatMap((g) => g.items.map((i) => i.id));
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

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
        {groups.flatMap((g) =>
          g.items.map((item) => (
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
          )),
        )}
      </nav>

      {/* Desktop: sticky rail */}
      <nav className="sticky top-6 hidden max-h-[calc(100vh-3rem)] w-48 shrink-0 overflow-y-auto lg:block">
        {groups.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => go(item.id)}
                    className={cn(
                      "w-full rounded-md border-l-2 border-transparent px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
                      active === item.id &&
                        "border-primary bg-accent font-medium text-foreground",
                    )}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
