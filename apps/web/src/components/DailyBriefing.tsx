"use client";

import { useEffect, useState, useRef } from "react";
import { api, type BriefingResponse } from "@/lib/api";
import AiStatusBadge from "@/components/AiStatusBadge";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

function TypewriterText({ text, speed = 30, onDone }: { text: string; speed?: number; onDone?: () => void }) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);
  const frameRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    indexRef.current = 0;
    setDisplayed("");
    const tick = () => {
      if (indexRef.current < text.length) {
        setDisplayed(text.slice(0, indexRef.current + 1));
        indexRef.current++;
        frameRef.current = setTimeout(tick, speed);
      } else {
        onDone?.();
      }
    };
    tick();
    return () => { if (frameRef.current) clearTimeout(frameRef.current); };
  }, [text, speed]);

  return <span>{displayed}</span>;
}

export default function DailyBriefing() {
  const { user, token } = useAuth();
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paragraphDone, setParagraphDone] = useState<boolean[]>([false, false, false]);
  const [allDone, setAllDone] = useState(false);

  const canRegenerate = user?.role === "operator" || user?.role === "admin";

  useEffect(() => {
    let cancelled = false;
    async function load(refresh = false) {
      try {
        setError(null);
        const data = await api.intelligence.briefing(refresh, token ?? undefined);
        if (!cancelled) {
          setBriefing(data);
          setParagraphDone([false, false, false]);
          setAllDone(false);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load briefing");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [token]);

  const regenerate = async () => {
    setLoading(true);
    try {
      setError(null);
      const data = await api.intelligence.briefing(true, token ?? undefined);
      setBriefing(data);
      setParagraphDone([false, false, false]);
      setAllDone(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate briefing");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="relative z-10 px-4 mb-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-night-secondary rounded-2xl p-6 shadow animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-night-border rounded w-40 mb-4" />
            <div className="space-y-3">
              <div className="h-3 bg-gray-200 dark:bg-night-border rounded w-full" />
              <div className="h-3 bg-gray-200 dark:bg-night-border rounded w-5/6" />
              <div className="h-3 bg-gray-200 dark:bg-night-border rounded w-4/6" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (error || !briefing) {
    return (
      <section className="relative z-10 -mt-16 mb-8 px-4">
        <div className="max-w-4xl mx-auto backdrop-blur-xl bg-white/80 dark:bg-night-secondary/80 border border-gray-200/60 dark:border-night-border/60 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Daily AI Briefing</h3>
            <AiStatusBadge state={briefing} />
          </div>
          <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error ?? "AI briefing unavailable."}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative z-10 -mt-16 mb-8 px-4">
      <div className="max-w-4xl mx-auto backdrop-blur-xl bg-white/80 dark:bg-night-secondary/80 border border-gray-200/60 dark:border-night-border/60 rounded-2xl p-6 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="text-3xl shrink-0">{"\uD83E\uDD16"}</div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Daily AI Briefing</h3>
              <div className="flex items-center gap-2">
                {briefing.available && !allDone && briefing.paragraphs.length > 0 && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500" />
                  </span>
                )}
                <AiStatusBadge state={briefing} />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(briefing.generated_at).toLocaleString()}
                </span>
                {canRegenerate && (
                  <Button size="sm" variant="secondary" onClick={regenerate}>
                    Regenerate
                  </Button>
                )}
              </div>
            </div>
            {briefing.available ? (
              <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {briefing.paragraphs.map((p, i) => (
                  <p key={i}>
                    {allDone || paragraphDone[i] ? (
                      p
                    ) : (
                      <TypewriterText
                        text={p}
                        speed={20}
                        onDone={() => {
                          setParagraphDone((prev) => {
                            const next = [...prev];
                            next[i] = true;
                            if (next.every(Boolean)) setAllDone(true);
                            return next;
                          });
                        }}
                      />
                    )}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-red-700 dark:text-red-300">
                AI briefing unavailable: {briefing.reason ?? "Groq not configured"}.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
