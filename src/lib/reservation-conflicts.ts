import type { ConflictResult, Reservation } from "./reservation-types";

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export interface ConflictCandidate {
  startDate: string;
  endDate: string;
  privatized: boolean;
  /** ID de la réservation en cours de modification, à exclure de la comparaison. */
  excludeId?: string;
}

/**
 * Vérifie si une nouvelle réservation (ou une modification) entre en conflit avec les
 * réservations existantes actives sur la période. Ne prend en compte que les réservations
 * "confirmed" — les annulées sont ignorées.
 */
export function checkConflict(
  candidate: ConflictCandidate,
  existing: Reservation[],
): ConflictResult {
  const overlapping = existing.filter(
    (r) =>
      r.status === "confirmed" &&
      r.id !== candidate.excludeId &&
      rangesOverlap(candidate.startDate, candidate.endDate, r.startDate, r.endDate),
  );

  for (const r of overlapping) {
    if (r.type === "personal" && r.privatized) {
      return {
        blocked: true,
        reason: `${r.reservedBy} a privatisé la maison sur cette période. Impossible de réserver dessus.`,
        overlapping: [],
      };
    }
  }

  // À ce stade, tous les chevauchements restants sont des résa perso non-privatisées.
  if (candidate.privatized && overlapping.length > 0) {
    return {
      blocked: true,
      reason: "Il y a déjà du monde sur cette période, tu ne peux pas privatiser.",
      overlapping: [],
    };
  }

  return {
    blocked: false,
    reason: null,
    overlapping: overlapping.map((r) => ({
      reservedBy: r.reservedBy,
      headcount: r.adults + r.children,
      mood: r.mood,
    })),
  };
}
