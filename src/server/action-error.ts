/**
 * Fehler mit Bausteinschlüssel statt fertigem Satz.
 *
 * Ein `throw new Error("Spieler nicht gefunden.")` wäre eine Sackgasse: der
 * Satz entsteht im Server, gelesen wird er im Browser – und dort womöglich auf
 * Englisch. Deshalb reist nur der Schlüssel, formuliert wird erst am Ende,
 * in `runAction`, in der Sprache des angemeldeten Kontos.
 *
 * `message` trägt den Schlüssel weiter, damit ein durchgerutschter Fehler im
 * Server-Log wenigstens lesbar bleibt.
 */
export class ActionError extends Error {
  constructor(
    readonly key: string,
    readonly params?: Record<string, string | number>,
  ) {
    super(key);
    this.name = "ActionError";
  }
}
