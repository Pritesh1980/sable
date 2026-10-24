------------------------- MODULE DeleteRetry -------------------------
EXTENDS Naturals

CONSTANT SerializeDeletes

VARIABLES local, remote, pending, intent, dirty, deletePhase, flushPhase

vars == <<local, remote, pending, intent, dirty, deletePhase, flushPhase>>

\* A restart with an offline deletion awaiting retry; the server still has it.
Init ==
    /\ local = FALSE
    /\ remote = TRUE
    /\ pending = TRUE
    /\ intent = "delete"
    /\ dirty = FALSE
    /\ deletePhase = "idle"
    /\ flushPhase = "idle"

\* pull retries remove() independently of flushChain.
BeginRetry ==
    /\ pending
    /\ ~local
    /\ deletePhase = "idle"
    /\ deletePhase' = "writing"
    /\ UNCHANGED <<local, remote, pending, intent, dirty, flushPhase>>

ReaddLocally ==
    /\ intent = "delete"
    /\ local' = TRUE
    /\ intent' = "keep"
    /\ dirty' = TRUE
    /\ UNCHANGED <<remote, pending, deletePhase, flushPhase>>

\* Upsert succeeds and confirms this re-add's generation.
FlushReadd ==
    /\ local
    /\ dirty
    /\ flushPhase = "idle"
    /\ (~SerializeDeletes \/ deletePhase # "writing")
    /\ remote' = TRUE
    /\ pending' = FALSE
    /\ dirty' = FALSE
    /\ flushPhase' = "done"
    /\ UNCHANGED <<local, intent, deletePhase>>

CompleteRetry ==
    /\ deletePhase = "writing"
    /\ remote' = FALSE
    /\ pending' = FALSE
    /\ deletePhase' = "done"
    /\ UNCHANGED <<local, intent, dirty, flushPhase>>

Next == BeginRetry \/ ReaddLocally \/ FlushReadd \/ CompleteRetry

TypeOK ==
    /\ local \in BOOLEAN
    /\ remote \in BOOLEAN
    /\ pending \in BOOLEAN
    /\ intent \in {"keep", "delete"}
    /\ dirty \in BOOLEAN
    /\ deletePhase \in {"idle", "writing", "done"}
    /\ flushPhase \in {"idle", "done"}

ConfirmedReaddExists == (intent = "keep" /\ ~dirty) => remote

=====================================================================
