const BLOCK = "rounded-xl bg-stone motion-safe:animate-pulse";

/** Shape of the section while its comments load; the detail does not wait (RNF rendimiento). */
export function CommentsSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando comentarios…"
      className="flex flex-col gap-4"
    >
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} aria-hidden="true" className="flex gap-3">
          <div className={`size-8 shrink-0 rounded-full ${BLOCK}`} />
          <div className="flex flex-1 flex-col gap-2">
            <div className={`h-4 w-32 ${BLOCK}`} />
            <div className={`h-10 ${BLOCK}`} />
          </div>
        </div>
      ))}
    </div>
  );
}
