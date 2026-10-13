"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const PAGE_SIZE = 60;

// Tags come from the presets-cream-of-the-crop folders: "Category/Subcategory/Author - title".
type PresetInfo = { name: string; file: string; category: string; sub: string; title: string; author: string };

function describe(name: string, file: string): PresetInfo {
  const parts = name.split("/");
  const title = parts.at(-1)!;
  const dash = title.indexOf(" - ");
  return {
    name,
    file,
    category: parts.length > 1 ? parts[0] : "",
    sub: parts.length > 2 ? parts[1] : "",
    title: dash > 0 ? title.slice(dash + 3) : title,
    author: dash > 0 ? title.slice(0, dash) : "",
  };
}

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
}

// Stable per-name color for cards that don't have a thumbnail yet.
function placeholderHue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function Chip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 transition ${
        active ? "border-zinc-200 bg-zinc-100 text-black" : "border-zinc-700 text-zinc-300 hover:border-zinc-400"
      }`}
    >
      {label}
      {count !== undefined && <span className={active ? "text-zinc-500" : "text-zinc-500"}> {count}</span>}
    </button>
  );
}

export default function PresetGallery({
  presets,
  thumbs,
  current,
  onSelect,
}: {
  presets: Map<string, string>; // name -> file id
  thumbs: Set<string>; // ids with a thumbnail in /thumbs
  current: string;
  onSelect: (name: string) => void;
}) {
  const [category, setCategory] = useState("");
  const [sub, setSub] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => [...presets].map(([name, file]) => describe(name, file)), [presets]);
  const categories = useMemo(() => countBy(all, (p) => p.category), [all]);
  const inCategory = useMemo(() => (category ? all.filter((p) => p.category === category) : all), [all, category]);
  const subs = useMemo(() => countBy(inCategory, (p) => p.sub), [inCategory]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inCategory.filter((p) => (!sub || p.sub === sub) && (!q || p.name.toLowerCase().includes(q)));
  }, [inCategory, sub, search]);

  // Changing a filter scrolls back to the top with the first page.
  const resetPaging = () => {
    setLimit(PAGE_SIZE);
    gridRef.current?.scrollTo({ top: 0 });
  };

  // Infinite scroll: load another page when the end of the grid comes into view.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setLimit((l) => l + PAGE_SIZE), {
      root: gridRef.current,
      rootMargin: "400px",
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
    // Re-observe after every page: if the end is still in view, load the next one.
  }, [limit, filtered.length]);

  return (
    <section className="flex min-h-0 flex-col gap-3 rounded-lg border border-zinc-800 p-4">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-bold">Presets</h2>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetPaging();
          }}
          placeholder="Search by name or author…"
          className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 outline-none focus:border-zinc-400"
        />
        <span className="shrink-0 text-zinc-500">{filtered.length}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip
          active={!category}
          onClick={() => {
            setCategory("");
            setSub("");
            resetPaging();
          }}
          label="All"
          count={all.length}
        />
        {categories.map(([name, count]) => (
          <Chip
            key={name}
            active={category === name}
            onClick={() => {
              setCategory(category === name ? "" : name);
              setSub("");
              resetPaging();
            }}
            label={name}
            count={count}
          />
        ))}
      </div>

      {category && subs.length > 0 && (
        <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto border-t border-zinc-800 pt-3">
          {subs.map(([name, count]) => (
            <Chip
              key={name}
              active={sub === name}
              onClick={() => {
                setSub(sub === name ? "" : name);
                resetPaging();
              }}
              label={name}
              count={count}
            />
          ))}
        </div>
      )}

      <div ref={gridRef} className="min-h-40 flex-1 overflow-y-auto">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {filtered.slice(0, limit).map((p) => (
            <button
              key={p.name}
              onClick={() => onSelect(p.name)}
              title={p.name}
              className={`group flex flex-col gap-1 rounded-md p-1 text-left transition hover:bg-zinc-800 ${
                p.name === current ? "bg-zinc-800 ring-2 ring-zinc-100" : ""
              }`}
            >
              <div className="relative aspect-video w-full overflow-hidden rounded bg-zinc-900">
                {thumbs.has(p.file) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- thousands of static files, no optimization
                  <img
                    src={`/thumbs/${p.file}.webp`}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] text-white/60"
                    style={{
                      background: `radial-gradient(circle at 30% 30%, hsl(${placeholderHue(p.name)} 70% 35%), #000 75%)`,
                    }}
                  >
                    no image
                  </div>
                )}
              </div>
              <span className="truncate text-zinc-200">{p.title}</span>
              <span className="truncate text-[10px] text-zinc-500">
                {[p.author, p.sub || p.category].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </div>
        <div ref={sentinelRef} className="h-px" />
        {filtered.length === 0 && <p className="p-4 text-center text-zinc-500">No presets match that filter.</p>}
      </div>
    </section>
  );
}
