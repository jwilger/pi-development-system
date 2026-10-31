import type { ReviewPacket } from "../core/review-packet.ts";
import type { ArchitectureSubmission } from "./architecture-evidence.ts";

/** Reviewer results submitted through `devsys_submit_review`, waiting for `devsys_review_record`. */
export type SubmittedReviewPacket = ReviewPacket & {
  readonly architecture?: ArchitectureSubmission;
};

export type SubmissionStore = {
  /**
   * Keep a packet. One for the same slice and round that shares a lens replaces the earlier one
   * (a corrected resubmission); packets for disjoint lenses (parallel lens reviewers) are all kept.
   */
  put(packet: SubmittedReviewPacket, inputIdentity?: string): void;
  forRound(slice: string, round: number, inputIdentity?: string): SubmittedReviewPacket[];
  /** Drop every packet of a slice, when a new round starts or one is recorded. */
  clear(slice: string): void;
};

const sameRound = (a: ReviewPacket, b: ReviewPacket): boolean =>
  a.slice === b.slice && a.round === b.round;

const sharesLens = (a: ReviewPacket, b: ReviewPacket): boolean =>
  a.lenses.some((lens) => b.lenses.includes(lens));

/** In memory on purpose (ADR 0006): a round takes minutes and a lost submission is visible. */
export function createSubmissionStore(): SubmissionStore {
  let packets: { packet: SubmittedReviewPacket; identity: string | undefined }[] = [];
  return {
    put(packet, identity) {
      packets = [
        ...packets.filter(
          (p) =>
            !(
              p.identity === identity &&
              sameRound(p.packet, packet) &&
              sharesLens(p.packet, packet)
            ),
        ),
        { packet, identity },
      ];
    },
    forRound(slice, round, identity) {
      return packets
        .filter(
          (p) => p.identity === identity && p.packet.slice === slice && p.packet.round === round,
        )
        .map((p) => p.packet);
    },
    clear(slice) {
      packets = packets.filter((p) => p.packet.slice !== slice);
    },
  };
}
