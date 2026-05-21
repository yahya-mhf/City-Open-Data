"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface SearchResult {
  lat: string;
  lon: string;
  display_name: string;
}

interface AddressSearchBarProps {
  onSelect: (lon: number, lat: number, name: string) => void;
}

export default function AddressSearchBar({ onSelect }: AddressSearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&viewbox=-8.1,31.5,-7.8,31.8&bounded=1`
      );
      const data: SearchResult[] = await res.json();
      setResults(data);
      setOpen(data.length > 0);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelect = (r: SearchResult) => {
    setQuery(r.display_name);
    setOpen(false);
    onSelect(parseFloat(r.lon), parseFloat(r.lat), r.display_name);
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-md">
      <div className="relative">
        <div className="flex items-center bg-white rounded-xl shadow-lg border border-gray-200/80 backdrop-blur-sm">
          <span className="pl-4 text-gray-400 text-lg">&#x1F50D;</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Search address or place..."
            className="flex-1 px-3 py-3 text-sm bg-transparent border-none outline-none rounded-xl"
          />
          {loading && (
            <span className="pr-4">
              <span className="w-4 h-4 block border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </span>
          )}
        </div>

        {open && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-200 max-h-72 overflow-y-auto">
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => handleSelect(r)}
                className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0 transition flex items-start gap-3"
              >
                <span className="text-gray-400 mt-0.5 shrink-0">&#x1F4CD;</span>
                <span className="text-gray-700 leading-snug">{r.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
