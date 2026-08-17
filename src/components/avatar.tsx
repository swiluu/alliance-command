"use client";

import { useState } from "react";

/**
 * Profilbild eines Spielers.
 *
 * Das Bild liegt beim Bildernetz des Spiels, nicht bei uns. Deshalb zwei
 * Vorkehrungen: `referrerPolicy` verrät der fremden Seite nicht, von welcher
 * Unterseite aus geladen wurde, und schlägt der Abruf fehl, treten die
 * Initialen an die Stelle. Ein kaputtes Bildsymbol im Profilkopf sähe nach
 * einem Fehler des Dashboards aus, obwohl die Ursache anderswo liegt.
 *
 * Bewusst ein einfaches <img> statt next/image: der Bildoptimierer müsste
 * jedes fremde Bild über den Server holen und zwischenlagern – viel Aufwand
 * für ein Beiwerk, das auch fehlen darf.
 */
export function Avatar({
  src,
  name,
  size = 64,
}: {
  src: string | null;
  name: string;
  size?: number;
}) {
  const [kaputt, setKaputt] = useState(false);

  // Erste Buchstabe(n) des Namens – bei Zeichen ausserhalb des Alphabets
  // (viele Namen tragen Symbole) bleibt notfalls ein Fragezeichen.
  const initialen =
    [...name.trim()]
      .filter((z) => /\p{L}|\p{N}/u.test(z))
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const gemeinsam = "shrink-0 rounded-full border border-line object-cover";

  if (!src || kaputt) {
    return (
      <div
        className={`${gemeinsam} grid place-items-center bg-panel-2 font-display text-sand`}
        style={{ width: size, height: size, fontSize: size * 0.36 }}
        aria-hidden
      >
        {initialen}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setKaputt(true)}
      className={`${gemeinsam} bg-panel-2`}
      style={{ width: size, height: size }}
    />
  );
}
