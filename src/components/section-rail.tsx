import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type RailItem = { id: string; label: string };

export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Trailing spacer that gives the last sections enough scroll to reach their own
 * rail item's line. Height = max(0, viewportHeight - bottomOfLastRailItem).
 */
export function RailSpacer() {
  const [h, setH] = useState(0);
  useEffect(() => {
    const measure = () => {
      const buttons = document.querySelectorAll<HTMLElement>("[data-rail-button]");
      const last = buttons[buttons.length - 1];
      if (!last) return setH(0);
      const bottom = last.getBoundingClientRect().bottom;
      setH(Math.max(0, window.innerHeight - bottom));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return <div aria-hidden style={{ height: h }} />;
}

/**
 * In-page section nav. The desktop rail is position:fixed to the viewport — it
 * never moves, scrolls, or jumps; only the content column scrolls. An invisible
 * placeholder div keeps the flex layout honest and provides the fixed anchor
 * coordinates. On mobile it is a horizontal chip row pinned under the header.
 *
 * Alignment rule: clicking rail item N scrolls section N's heading onto the same
 * horizontal line as rail item N (on mobile: just under the sticky chip row).
 * Scroll-spy follows the same rule — the active item is the LAST section whose
 * top is at or above its own rail item's line.
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
  const mobileNavRef = useRef<HTMLElement>(null);
  const buttonsRef = useRef(new Map<string, HTMLElement>());
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // While a click-driven scroll is animating, the spy must not touch the active
  // item — otherwise it flickers through every section passed en route.
  const programmatic = useRef(false);

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

  /** Line the given section should land on, in viewport coordinates. */
  const anchorTopFor = useCallback((id: string) => {
    const mobileNav = mobileNavRef.current;
    const isMobile = mobileNav ? mobileNav.offsetParent !== null : false;
    if (isMobile && mobileNav) return mobileNav.getBoundingClientRect().bottom + 8;
    const btn = buttonsRef.current.get(id);
    if (btn) return btn.getBoundingClientRect().top;
    return 88;
  }, []);

  // Scroll-spy: last section whose top is at or above its own rail item's line.
  useEffect(() => {
    let frame = 0;
    const compute = () => {
      frame = 0;
      if (programmatic.current) return;
      const el = document.scrollingElement ?? document.documentElement;
      // Bottom/top of page overrides — the page can run out of scroll first.
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
        const last = ids[ids.length - 1];
        if (last) setActive(last);
        return;
      }
      if (el.scrollTop <= 4) {
        const first = ids[0];
        if (first) setActive(first);
        return;
      }
      let next = ids[0] ?? null;
      for (const id of ids) {
        const section = document.getElementById(id);
        if (!section) continue;
        if (section.getBoundingClientRect().top <= anchorTopFor(id) + 2) next = id;
      }
      if (next) setActive(next);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(compute);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    compute();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join("|"), anchorTopFor]);

  const go = (id: string) => {
    onJump?.(id);
    setActive(id);
    programmatic.current = true;
    let done = false;
    const release = () => {
      if (done) return;
      done = true;
      programmatic.current = false;
      window.removeEventListener("scrollend", release);
    };
    // `scrollend` where supported; Safari lacks it, hence the timeout fallback.
    window.addEventListener("scrollend", release);
    window.setTimeout(release, 700);
    // allow a disclosure to open before measuring the target
    requestAnimationFrame(() => {
      const section = document.getElementById(id);
      if (!section) return;
      const sectionTop = section.getBoundingClientRect().top;
      const anchorTop = anchorTopFor(id);
      window.scrollBy({
        top: sectionTop - anchorTop,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    });
  };

  const register = (id: string) => (el: HTMLElement | null) => {
    if (el) buttonsRef.current.set(id, el);
    else buttonsRef.current.delete(id);
  };

  return (
    <>
      {/* Mobile: chip row pinned under the page header */}
      <nav
        ref={mobileNavRef}
        className="sticky top-24 z-30 -mx-1 mb-2 flex gap-2 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur lg:hidden"
      >
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
      <div ref={slotRef} aria-hidden className="hidden w-44 shrink-0 lg:block" />

      {/* Desktop: the rail itself is fixed to the viewport and never moves. */}
      <nav
        className="fixed z-30 hidden max-h-[calc(100vh-3rem)] w-44 overflow-y-auto lg:block"
        style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}
      >
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                data-rail-button
                ref={register(item.id)}
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
