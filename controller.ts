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

const GROUP_ASSEMBLY_TIME = 30000;
const CONNECTION_TIME = 10000;

let loop: number | undefined = undefined;

let parties: Party[] = [
  fakePartyRegClosed(0),
  fakePartyRegOpen(1),
  fakePartyRegPending(2),
];

const participants = [
  fakeParticipant("xonex", 51.4107954, -0.3008432),
  fakeParticipant("xtwox", 51.4064159, -0.2871206),
  fakeParticipant("xthreex", 51.4142412, -0.2689883),
  fakeParticipant("xfourx", 51.4042837, -0.2502624),
  fakeParticipant("xfivex", 51.3995109, -0.2234965),
  fakeParticipant("xsixx", 51.4131514, -0.2336259),
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
  console.log(parties);
  currentCall = {
    ...initialState,
    allVotes: {},
    joined: {},
  };
  stopLoop();
  ctx.response.status = 200;
  ctx.response.body = currentCall;
  console.log(currentCall);
  if (loop === undefined) {
    loop = setInterval(nextTick, 1000);
  }
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
      validationStartsInSeconds:
        secondsTillCallStart() - CONNECTION_TIME / 1000,
    },
    joined: {
      ...currentCall.joined,
      [user]: bodyVal,
    },
  };

  ctx.response.status = 200;
}

export function getCallState(ctx: RouterContext) {
  const user = userName(ctx);
  const seconds = secondsTillCallStart();
  if (seconds <= 0 && currentCall.joined[user] === undefined) {
    ctx.response.body = {
      kind: "not_joined",
    };
  } else if (currentCall.publicCallState.kind === "not_started") {
    ctx.response.body = {
      ...currentCall.publicCallState,
      joined: currentCall.joined[user] !== undefined,
    };
  } else {
    ctx.response.body = currentCall.publicCallState;
  }
}

const initialState: InternalCallState = {
  publicCallState: {
    kind: "not_started",
    joined: false,
    validationStartsInSeconds: secondsTillCallStart() - CONNECTION_TIME / 1000,
  },
  allVotes: {},
  joined: {},
};

function secondsTillCallStart() {
  // This is when the call will actuall begin. It is the callStart date (which is when the user must join by) + 60s for assembling the group + 10s for making rtc connections
  const p = parties[0].callStart + GROUP_ASSEMBLY_TIME + CONNECTION_TIME;
  const now = Date.now();
  return (p - now) / 1000;
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
    const countdown = secondsTillCallStart();
    if (countdown <= CONNECTION_TIME / 1000) {
      currentCall = {
        ...currentCall,
        publicCallState: {
          kind: "starting",
          validationStartsInSeconds: countdown,
          participants: participants
            .filter((p) => currentCall.joined[p.name] !== undefined)
            .map((p) => ({
              ...p,
              key: currentCall.joined[p.name],
            })),
        },
      };
    } else {
      currentCall = {
        ...currentCall,
        publicCallState: {
          ...currentCall.publicCallState,
          validationStartsInSeconds: countdown - CONNECTION_TIME / 1000,
        },
      };
    }
  }

  if (currentCall.publicCallState.kind === "starting") {
    const countdown = secondsTillCallStart();
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
        stopLoop();
      }
    } else {
      currentCall = {
        ...currentCall,
        publicCallState: {
          ...currentCall.publicCallState,
          validationStartsInSeconds: countdown,
        },
      };
    }
  }

  console.log("CurrentState: ", currentCall);
}
