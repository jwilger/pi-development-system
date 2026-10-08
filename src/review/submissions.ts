import type { ReviewPacket } from "../core/review-packet.ts";

/** Reviewer results submitted through `devsys_submit_review`, waiting for `devsys_review_record`. */
export type SubmissionStore = {
  /**
   * Keep a packet. One for the same slice and round that shares a lens replaces the earlier one
   * (a corrected resubmission); packets for disjoint lenses (parallel lens reviewers) are all kept.
   */
  put(packet: ReviewPacket): void;
  forRound(slice: string, round: number): ReviewPacket[];
  /** Drop every packet of a slice, when a new round starts or one is recorded. */
  clear(slice: string): void;
};

const sameRound = (a: ReviewPacket, b: ReviewPacket): boolean =>
  a.slice === b.slice && a.round === b.round;

const sharesLens = (a: ReviewPacket, b: ReviewPacket): boolean =>
  a.lenses.some((lens) => b.lenses.includes(lens));

/** In memory on purpose (ADR 0006): a round takes minutes and a lost submission is visible. */
export function createSubmissionStore(): SubmissionStore {
  let packets: ReviewPacket[] = [];
  return {
    put(packet) {
      packets = [
        ...packets.filter((p) => !(sameRound(p, packet) && sharesLens(p, packet))),
        packet,
      ];
    },
    forRound(slice, round) {
      return packets.filter((p) => p.slice === slice && p.round === round);
    },
    clear(slice) {
      packets = packets.filter((p) => p.slice !== slice);
    },
  };
}
