export function PageSkeleton({ label }: { label: string }) {
  const block = "animate-pulse rounded-2xl border border-border bg-surface";
  return (
    <div className="space-y-6" aria-busy aria-label={label}>
      <div className="h-14 w-56 animate-pulse rounded-xl bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 md:gap-6 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${block} h-28 ${i === 2 ? "hidden xl:block" : ""}`} />
        ))}
      </div>
      <div className={`${block} h-96`} />
    </div>
  );
}
