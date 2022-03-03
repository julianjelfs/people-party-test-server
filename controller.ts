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

function userName<T extends string>(ctx: RouterContext<T>) {
  return ctx.request.headers.get("X-PARTICIPANT") || "gorillafez";
}

const CONNECTION_TIME = 10;

let loop: number | undefined = undefined;

let parties: Party[] = [
  fakePartyRegClosed(0),
  // fakePartyRegOpen(0),
  fakePartyRegOpen(1),
  fakePartyRegPending(2),
];

const participants = [
  fakeParticipant("gorillafez", 51.4107954, -0.3008432),
  fakeParticipant("largewheel", 51.4064159, -0.2871206),
  fakeParticipant("rugbyconfront", 51.4142412, -0.2689883),
  fakeParticipant("hopglaring", 51.4042837, -0.2502624),
  fakeParticipant("delightgod", 51.3995109, -0.2234965),
  fakeParticipant("fifthfrap", 51.4131514, -0.2336259),
];

export function getParties({ response }: Context) {
  response.body = parties;
}

export function getPersonProfile(ctx: RouterContext<"/get_person_profile">) {
  ctx.response.body = fakeProfile();
}

export function register() {}

export function deregister() {}

function stopLoop() {
  if (loop !== undefined) {
    clearInterval(loop);
    loop = undefined;
  }
}

export function reset(ctx: RouterContext<"/reset">) {
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

export function result(ctx: RouterContext<"/result">) {
  const user = userName(ctx);

  // we are always operating on the same call here - the *real* implementation is more tricky
  const round = participants.findIndex((p) => p.name === user);
  const votesForMe = Object.values(currentCall.allVotes[round] || {});
  const approvals = votesForMe.filter((v) => v === "approve");
  ctx.response.body = approvals.length >= 3;
}

export async function vote(ctx: RouterContext<"/vote">) {
  if (!ctx.request.hasBody) {
    ctx.response.status = 400;
    ctx.response.body = "No request body";
    return;
  }

  await sleep(2);

  const body = await ctx.request.body();
  const { participant, vote } = await body.value;
  const user = userName(ctx);

  if (currentCall.publicCallState.kind === "active") {
    const currRound = currentCall.publicCallState.round;
    const prover = currentCall.publicCallState.participants[currRound];
    const votersInRound =
      prover.name === participant &&
      !currentCall.publicCallState.votersInRound.includes(user)
        ? [...currentCall.publicCallState.votersInRound, user]
        : currentCall.publicCallState.votersInRound;

    currentCall = {
      ...currentCall,
      publicCallState: {
        ...currentCall.publicCallState,
        votersInRound,
      },
      allVotes: recordVote(currentCall.allVotes, user, currRound, vote),
    };
  }

  ctx.response.status = 200;
}

export async function join(ctx: RouterContext<"/join">) {
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
      callStartsInSeconds: secondsTillCallStart() - CONNECTION_TIME / 1000,
    },
    joined: {
      ...currentCall.joined,
      [user]: bodyVal.key,
    },
  };

  ctx.response.status = 200;
}

export function getCallState(ctx: RouterContext<"/get_call_state/:id">) {
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
  } else if (currentCall.publicCallState.kind === "active") {
    ctx.response.body = {
      ...currentCall.publicCallState,
      myself: user,
    };
  } else if (currentCall.publicCallState.kind === "starting") {
    ctx.response.body = {
      ...currentCall.publicCallState,
      myself: user,
    };
  } else {
    ctx.response.body = currentCall.publicCallState;
  }
}

const initialState: InternalCallState = {
  publicCallState: {
    kind: "not_started",
    joined: false,
    callStartsInSeconds: secondsTillCallStart(),
  },
  allVotes: {},
  joined: {},
};

function secondsTillCallStart() {
  const p = parties[0].callStart;
  const now = Date.now();
  return (p - now) / 1000;
}
function secondsSinceCallStart() {
  const p = parties[0].callStart;
  const now = Date.now();
  return (now - p) / 1000;
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
    if (countdown <= 0) {
      currentCall = {
        ...currentCall,
        publicCallState: {
          kind: "starting",
          myself: "anon",
          validationStartsInSeconds: CONNECTION_TIME,
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
          callStartsInSeconds: countdown,
        },
      };
    }
  }

  if (currentCall.publicCallState.kind === "starting") {
    const countdown = CONNECTION_TIME - secondsSinceCallStart();
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
            myself: "anon",
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
