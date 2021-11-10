import { Router } from "https://deno.land/x/oak/mod.ts";
import {
  getParties,
  getPersonProfile,
  register,
  deregister,
  getCallState,
  vote,
  join,
  reset,
  result,
} from "./controller.ts";

const router = new Router();
router
  .get("/get_parties", getParties)
  .get("/get_person_profile", getPersonProfile)
  .get("/result", result)
  .post("/register", register)
  .post("/vote", vote)
  .post("/join", join)
  .post("/deregister", deregister)
  .post("/reset", reset)
  .get("/get_call_state/:id", getCallState);

export default router;
