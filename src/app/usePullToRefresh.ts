import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const THRESHOLD = 68;
const MAX_PULL = 128;
const RESISTANCE = 0.52;
const REFRESH_HOLD = 42;

type Options = {
  disabled?: boolean;
};

export function usePullToRefresh(
  scrollRef: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<void>,
  { disabled = false }: Options = {},
) {
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const triggered = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  const pullPxRef = useRef(0);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    pullPxRef.current = pullPx;
  }, [pullPx]);

  const runRefresh = useCallback(async () => {
    const hold = Math.max(pullPxRef.current, REFRESH_HOLD);
    pullPxRef.current = hold;
    setPullPx(hold);
    setRefreshing(true);
    try {
      await onRefreshRef.current();
    } finally {
      setRefreshing(false);
      setPullPx(0);
      pullPxRef.current = 0;
    }
  }, []);

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || refreshing) return;
    const el = scrollRef.current;
    if (!el || el.scrollTop > 2) return;
    startY.current = e.touches[0]?.clientY ?? 0;
    pulling.current = true;
    triggered.current = false;
  }, [disabled, refreshing, scrollRef]);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling.current || disabled || refreshing) return;
    const el = scrollRef.current;
    if (!el || el.scrollTop > 2) {
      pulling.current = false;
      setPullPx(0);
      return;
    }
    const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
    if (dy <= 0) {
      setPullPx(0);
      return;
    }
    e.preventDefault();
    const px = Math.min(MAX_PULL, dy * RESISTANCE);
    setPullPx(px);
    triggered.current = px >= THRESHOLD;
  }, [disabled, refreshing, scrollRef]);

  const onTouchEnd = useCallback(() => {
    if (!pulling.current) return;
    pulling.current = false;
    if (triggered.current && !refreshing && !disabled) {
      void runRefresh();
      return;
    }
    setPullPx(0);
  }, [disabled, refreshing, runRefresh]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || disabled) return;
    el.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    el.addEventListener("touchend", onTouchEnd, { capture: true });
    el.addEventListener("touchcancel", onTouchEnd, { capture: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart, true);
      el.removeEventListener("touchmove", onTouchMove, true);
      el.removeEventListener("touchend", onTouchEnd, true);
      el.removeEventListener("touchcancel", onTouchEnd, true);
    };
  }, [scrollRef, disabled, onTouchStart, onTouchMove, onTouchEnd]);

  return { pullPx, refreshing, threshold: THRESHOLD };
}
