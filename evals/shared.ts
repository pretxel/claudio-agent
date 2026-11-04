import { satisfies } from "eve/evals/expect";

// Pictographic emoji; plain punctuation and accented letters do not match.
const EMOJI = /\p{Extended_Pictographic}/u;

/** The owner's register: no emoji (he has not used any), never "usted". */
export const noEmoji = satisfies((reply: unknown) => !EMOJI.test(String(reply ?? "")), "no emoji");
export const noUsted = satisfies((reply: unknown) => !/\busted(es)?\b/i.test(String(reply ?? "")), 'never "usted"');
