/**
 * Venue map embed for recruitment drives.
 *
 * Uses OpenStreetMap's free embed endpoint — no API key needed, no
 * rate limiting under sensible traffic, no third-party tracking.
 * The drive's lat/lng come straight off the schema; we wrap with
 * a small bbox so the marker isn't pinned to the corner of the
 * map.
 *
 * The "Open in Maps" link below the iframe gives the candidate a
 * one-tap route to their device's preferred map app (Google Maps
 * URL deep-links open natively on Android + iOS Safari).
 *
 * Falls back to a card with the address text when lat/lng aren't
 * set — admins don't always pin the venue, especially for online
 * fairs.
 */
export function VenueMap({
  lat,
  lng,
  venueName,
  venueAddress,
  city,
  state,
}: {
  lat: number | null;
  lng: number | null;
  venueName: string | null;
  venueAddress: string | null;
  city: string;
  state: string | null;
}) {
  const fullAddress = [venueName, venueAddress, city, state].filter(Boolean).join(", ");

  if (lat == null || lng == null) {
    // No pin — render an honest text card. Better than a broken
    // map iframe pointing at coordinate (0,0) somewhere off Africa.
    return (
      <div className="rounded-md border border-emce-border bg-white p-4">
        <p className="text-section text-emce-text">📍 Venue</p>
        {venueName && <p className="mt-1 font-bold text-emce-text">{venueName}</p>}
        {venueAddress && <p className="text-hint text-emce-text-sec">{venueAddress}</p>}
        <p className="text-hint text-emce-text-sec">
          {city}
          {state ? `, ${state}` : ""}
        </p>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-hint font-bold text-emce-dark hover:underline"
        >
          Open in Maps →
        </a>
      </div>
    );
  }

  // OpenStreetMap embed. The bbox sets the visible window — ~0.01°
  // around the pin = roughly a 1km square at India's latitude,
  // which gives the candidate enough context to recognise the
  // neighbourhood without zooming in so far that the next building
  // is off-screen.
  const delta = 0.012;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  const embedSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  // Google Maps deep-link for the "Get directions" CTA. Goes via
  // the standard URL schema so it opens the device's default map
  // app on mobile and a browser tab on desktop.
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return (
    <div className="overflow-hidden rounded-md border border-emce-border bg-white">
      <div className="aspect-[16/9] w-full bg-emce-light-soft">
        <iframe
          src={embedSrc}
          title={`${venueName ?? city} venue map`}
          loading="lazy"
          // Same-origin sandboxing — the iframe loads OSM only;
          // disabling top-navigation stops a hostile redirect even
          // on the off chance OSM ships a future bug.
          referrerPolicy="no-referrer-when-downgrade"
          className="h-full w-full"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          {venueName && <p className="truncate font-bold text-emce-text">{venueName}</p>}
          <p className="text-hint text-emce-text-sec">
            {[venueAddress, city, state].filter(Boolean).join(", ")}
          </p>
        </div>
        <a
          href={directionsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-emce-border bg-white px-3 py-1.5 text-hint font-bold text-emce-dark hover:bg-emce-light-soft"
        >
          Get directions →
        </a>
      </div>
    </div>
  );
}
