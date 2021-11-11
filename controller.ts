import { sleep } from "https://deno.land/x/sleep/mod.ts";
import { Context, RouterContext } from "https://deno.land/x/oak/mod.ts";
import {
  CallResult,
  fakeParticipant,
  fakePartyRegClosed,
  fakePartyRegOpen,
  fakePartyRegPending,
  fakeProfile,
  InternalCallState,
  Participant,
  Party,
} from "./types.ts";

function userName(ctx: RouterContext) {
  return ctx.request.headers.get("X-PARTICIPANT") || "gorillafez";
}

let loop: number | undefined = undefined;

let parties: Party[] = [
  fakePartyRegClosed(0),
  fakePartyRegOpen(1),
  fakePartyRegPending(2),
];

const participants = [
  fakeParticipant("largewheel"),
  fakeParticipant("rugbyconfront"),
  fakeParticipant("hopglaring"),
  fakeParticipant("delightgod"),
  fakeParticipant("fifthfrap"),
  fakeParticipant("gorillafez"),
];

export function getParties({ response }: Context) {
  response.body = parties;
}

export function getPersonProfile(ctx: RouterContext) {
  ctx.response.body = fakeProfile(userName(ctx));
}

export function register() {}

export function deregister() {}

function stopLoop() {
  if (loop !== undefined) {
    clearInterval(loop);
    loop = undefined;
  }
}

export function reset(ctx: RouterContext) {
  parties = [
    fakePartyRegClosed(0),
    fakePartyRegOpen(1),
    fakePartyRegPending(2),
  ];
  currentCall = {
    ...initialState,
    allVotes: {},
  };
  stopLoop();
  ctx.response.status = 200;
  console.log(currentCall);
}

function recordVote(
  votes: CallResult,
  user: string,
  round: number,
  vote: "approve" | "deny"
): CallResult {
  const roundVotes = votes[round] ?? {};
  roundVotes[user] = vote;
  votes[round] = roundVotes;
  return votes;
}

export function result(ctx: RouterContext) {
  const user = userName(ctx);

  // we are always operating on the same call here - the *real* implementation is more tricky
  const round = participants.findIndex((p) => p.name === user);
  const votesForMe = Object.values(currentCall.allVotes[round] || {});
  const approvals = votesForMe.filter((v) => v === "approve");
  ctx.response.body = approvals.length >= 3;
}

export async function vote(ctx: RouterContext) {
  if (!ctx.request.hasBody) {
    ctx.response.status = 400;
    ctx.response.body = "No request body";
    return;
  }

  await sleep(2);

  const body = await ctx.request.body();
  const { round, vote } = await body.value;
  const user = userName(ctx);

  if (currentCall.publicCallState.kind === "active") {
    const currRound = currentCall.publicCallState.round;
    const votersInRound =
      currRound === round &&
      !currentCall.publicCallState.votersInRound.includes(user)
        ? [...currentCall.publicCallState.votersInRound, user]
        : currentCall.publicCallState.votersInRound;
    currentCall = {
      ...currentCall,
      publicCallState: {
        ...currentCall.publicCallState,
        votersInRound,
      },
      allVotes: recordVote(currentCall.allVotes, user, round, vote),
    };
  }

  ctx.response.status = 200;
}

export async function join(ctx: RouterContext) {
  if (currentCall.publicCallState.kind !== "not_started") {
    ctx.response.status = 500;
    ctx.response.body = "Call is not in a joinable state";
    return;
  }

  const user = userName(ctx);

  if (!ctx.request.hasBody) {
    ctx.response.status = 400;
    ctx.response.body = "No request body";
    return;
  }

  await sleep(2);

  const body = await ctx.request.body();
  const bodyVal = await body.value;

  currentCall = {
    ...currentCall,
    publicCallState: {
      ...currentCall.publicCallState,
      startsInSeconds: secondsTillStart(),
      participants: currentCall.publicCallState.participants.map((p) => {
        if (p.name === user) {
          return {
            ...p,
            key: bodyVal.key,
          };
        }
        return p;
      }),
    },
  };

  if (loop === undefined) {
    loop = setInterval(nextTick, 1000);
  }

  ctx.response.status = 200;
}

export function getCallState(ctx: RouterContext) {
  ctx.response.body = currentCall.publicCallState;
}

const initialState: InternalCallState = {
  publicCallState: {
    kind: "not_started",
    participants: participants,
    startsInSeconds: 0,
  },
  allVotes: {},
};

function secondsTillStart() {
  const p = parties[0];
  const now = Date.now();
  return (p.callStart - now) / 1000;
}

let currentCall: InternalCallState = {
  ...initialState,
  allVotes: {},
};

function getNextRound(
  participants: Participant[],
  round: number
): number | undefined {
  const nextRound = round + 1;
  if (nextRound >= participants.length) return undefined;
  if (
    participants[nextRound] !== undefined &&
    participants[nextRound].key !== undefined
  ) {
    return nextRound;
  } else {
    return getNextRound(participants, nextRound);
  }
}

function allVoted() {
  if (currentCall.publicCallState.kind === "active") {
    const round = currentCall.publicCallState.round;
    const voters = currentCall.publicCallState.participants.filter(
      (p, i) => i !== round && p.key !== undefined
    );

    return voters.length === currentCall.publicCallState.votersInRound.length;
  }
  return false;
}

function nextTick() {
  if (currentCall.publicCallState.kind === "active") {
    const countdown = currentCall.publicCallState.remainingSeconds - 1;
    if (countdown > 0 && !allVoted()) {
      currentCall = {
        ...currentCall,
        publicCallState: {
          ...currentCall.publicCallState,
          remainingSeconds: countdown,
        },
      };
    } else {
      const next = getNextRound(
        currentCall.publicCallState.participants,
        currentCall.publicCallState.round
      );
      if (next === undefined) {
        currentCall = {
          ...currentCall,
          publicCallState: { kind: "ended" },
        };
        stopLoop();
      } else {
        currentCall = {
          ...currentCall,
          publicCallState: {
            ...currentCall.publicCallState,
            round: next,
            remainingSeconds: 60,
            votersInRound: [],
          },
        };
      }
    }
  }

  if (currentCall.publicCallState.kind === "not_started") {
    const countdown = secondsTillStart();
    if (countdown <= 0) {
      const firstRound = getNextRound(
        currentCall.publicCallState.participants,
        -1
      );
      if (firstRound !== undefined) {
        currentCall = {
          ...currentCall,
          publicCallState: {
            kind: "active",
            participants: currentCall.publicCallState.participants,
            round: firstRound,
            remainingSeconds: 60,
            votersInRound: [],
          },
        };
      } else {
        console.log("Seems like no one joined the call. ");
        currentCall = {
          ...currentCall,
          publicCallState: { kind: "ended" },
        };
      }
    } else {
      currentCall = {
        ...currentCall,
        publicCallState: {
          ...currentCall.publicCallState,
          startsInSeconds: countdown,
        },
      };
    }
  }

  console.log("CurrentState: ", currentCall);
}
