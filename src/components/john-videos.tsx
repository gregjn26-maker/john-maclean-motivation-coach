// Reusable "Watch John" video list.
// <<-- ADD MORE VIMEO LINKS HERE IN FUTURE -->>
// Just append entries to JOHN_VIDEOS — each needs a unique id, a title, and a Vimeo embed URL
// (the player.vimeo.com/video/<id>?h=<hash> form). The grid auto-expands.

type JohnVideo = {
  id: string;
  title: string;
  embedUrl: string;
};

export const JOHN_VIDEOS: JohnVideo[] = [
  {
    id: "meet-john",
    title: "Meet John",
    embedUrl: "https://player.vimeo.com/video/1037317845?h=03dca97dd1",
  },
  // <<-- ADD MORE VIMEO LINKS HERE IN FUTURE -->>
];

function VimeoEmbed({ title, embedUrl }: { title: string; embedUrl: string }) {
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border bg-black shadow-sm" style={{ paddingTop: "56.25%" }}>
      <iframe
        src={embedUrl}
        title={title}
        className="absolute inset-0 h-full w-full"
        frameBorder={0}
        allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
        allowFullScreen
      />
    </div>
  );
}

export function JohnVideos({ heading = "Watch John" }: { heading?: string }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#F4B400" }} />
        <h2 className="text-base font-semibold text-brand-navy">{heading}</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {JOHN_VIDEOS.map((v) => (
          <figure key={v.id} className="space-y-2">
            <VimeoEmbed title={v.title} embedUrl={v.embedUrl} />
            <figcaption className="text-sm font-medium text-brand-text">{v.title}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
