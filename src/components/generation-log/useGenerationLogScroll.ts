import { useCallback, useEffect, useRef, useState } from 'react';

interface UseGenerationLogScrollOptions {
  logCount: number;
  autoScroll?: boolean;
}

export function useGenerationLogScroll({
  logCount,
  autoScroll = true,
}: UseGenerationLogScrollOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setIsScrolledToBottom(scrollHeight - scrollTop - clientHeight < 50);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setIsScrolledToBottom(true);
  }, []);

  useEffect(() => {
    if (autoScroll && isScrolledToBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logCount, autoScroll, isScrolledToBottom]);

  return {
    scrollRef,
    isScrolledToBottom,
    handleScroll,
    scrollToBottom,
  };
}
