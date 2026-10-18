export function Dots({ count, active, onPick }: { count: number; active: number; onPick: (i: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 9, justifyContent: "center", marginTop: 14 }}>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          aria-label={`Page ${i + 1}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onPick(i);
          }}
          style={{ width: 8, height: 8, borderRadius: 4, background: i === active ? "#fff" : "rgba(255,255,255,.35)", transition: "background .2s" }}
        />
      ))}
    </div>
  );
}
