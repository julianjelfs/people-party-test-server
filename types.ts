export const ESTIMATED_CALL_DURATION = 1000 * 60 * 10; // todo - 10 minutes - I hope we don't need this

// This is just a wild-ass guess at the moment
export type Party = {
  id: number;
  callStart: number;
  registrationStart: number;
  registrationEnd: number;
  location: string;
  longitudeMin: number;
  longitudeMax: number;
  finished: boolean;
};

export type Location = {
  longitude: number;
  latitude: number;
};

export type Participant = {
  name: string;
  location: Location;
  key: unknown;
};

export function fakePartyRegPending(id: number): Party {
  const start = Date.now() + 1000 * 60 * 60 * 96;
  return {
    location: "London",
    longitudeMax: 25,
    longitudeMin: -25,
    id,
    callStart: start,
    registrationEnd: Date.now() + 1000 * 60 * 60 * 72,
    registrationStart: Date.now() + 1000 * 60 * 60 * 48,
    finished: Date.now() - start >= ESTIMATED_CALL_DURATION,
  };
}

export function fakePartyRegOpen(id: number): Party {
  const start = Date.now() + 1000 * 60 * 60 * 72;
  return {
    location: "London",
    longitudeMax: 25,
    longitudeMin: -25,
    id,
    callStart: start,
    registrationEnd: Date.now() + 1000 * 60 * 60 * 48,
    registrationStart: Date.now() - 1000 * 60 * 60 * 48,
    finished: Date.now() - start >= ESTIMATED_CALL_DURATION,
  };
}

export function fakePartyRegClosed(id: number): Party {
  const start = Date.now() + 1000 * 30 * 1;
  return {
    location: "London",
    longitudeMax: 25,
    longitudeMin: -25,
    id,
    callStart: start,
    registrationEnd: Date.now() - 1000 * 60 * 60 * 48,
    registrationStart: Date.now() - 1000 * 60 * 60 * 72,
    finished: Date.now() - start >= ESTIMATED_CALL_DURATION,
  };
}

export function fakeParticipant(
  name: string,
  lat = 51.39781989392261,
  long = -0.2220753698364275
) {
  return {
    name,
    location: {
      latitude: lat,
      longitude: long,
    },
    key: undefined,
  };
}

export function fakeProfile(): Profile {
  return {
    validationScore: 3,
    pastParties: [],
    upcomingParties: [
      {
        id: 0,
        location: {
          latitude: 51.39781989392261,
          longitude: -0.2220753698364275,
        },
      },
    ],
  };
}

export type RegisteredParty = {
  id: number;
  location: Location;
};

export type Profile = {
  upcomingParties: RegisteredParty[];
  validationScore: number;
  pastParties: number[];
};

export type RegisterResponse =
  | "missing_deposit"
  | "registration_not_allowed"
  | "insufficient_deposit"
  | "already_registered"
  | "success"
  | "invalid_location"
  | "location_taken";

export type OptionalVote = boolean | undefined;

export type Vote = {
  voter: string;
  vote: "approve" | "deny";
};

export type CallResult = Record<number, Record<string, "approve" | "deny">>;

export type InternalCallState = {
  publicCallState: CallState;
  allVotes: CallResult;
  joined: Record<string, string>; // username -> key
};

export type CallState =
  | NotCreated
  | NotStarted
  | Starting
  | NotJoined
  | Active
  | Ended;

export type NotCreated = { kind: "not_created" };

export type NotStarted = {
  kind: "not_started";
  joined: boolean;
  callStartsInSeconds: number;
};

export type NotJoined = {
  kind: "not_joined";
};

export type Starting = {
  kind: "starting";
  myself: string;
  participants: Participant[];
  validationStartsInSeconds: number;
};

export type Active = {
  kind: "active";
  myself: string;
  participants: Participant[];
  round: number;
  remainingSeconds: number;
  votersInRound: string[];
};

export type Ended = {
  kind: "ended";
};
