-------------------------- MODULE StalePull --------------------------
EXTENDS Naturals

CONSTANT RetainDeleteHistory

VARIABLES local, remote, pending, intent, pullPhase, reply,
          pushPhase, deletedSincePull

vars == <<local, remote, pending, intent, pullPhase, reply,
          pushPhase, deletedSincePull>>

Init ==
    /\ local = TRUE
    /\ remote = TRUE
    /\ pending = FALSE
    /\ intent = "keep"
    /\ pullPhase = "idle"
    /\ reply = FALSE
    /\ pushPhase = "idle"
    /\ deletedSincePull = FALSE

\* list() has taken its snapshot, but its promise has not resolved.
BeginPull ==
    /\ pullPhase = "idle"
    /\ pullPhase' = "reading"
    /\ reply' = remote
    /\ deletedSincePull' = pending
    /\ UNCHANGED <<local, remote, pending, intent, pushPhase>>

\* trackListEdit: persist the deletion and its retry marker synchronously.
DeleteLocally ==
    /\ intent = "keep"
    /\ local' = FALSE
    /\ pending' = TRUE
    /\ intent' = "delete"
    /\ deletedSincePull' = TRUE
    /\ UNCHANGED <<remote, pullPhase, reply, pushPhase>>

BeginFlush ==
    /\ pending
    /\ pushPhase = "idle"
    /\ pushPhase' = "writing"
    /\ UNCHANGED <<local, remote, pending, intent, pullPhase, reply,
                   deletedSincePull>>

\* runFlush: successful remove() clears the pending-delete sidecar.
CompleteFlush ==
    /\ pushPhase = "writing"
    /\ remote' = FALSE
    /\ pending' = FALSE
    /\ pushPhase' = "done"
    /\ UNCHANGED <<local, intent, pullPhase, reply, deletedSincePull>>

\* pull: filter the saved reply by the CURRENT pending deletes, then merge.
CompletePull ==
    /\ pullPhase = "reading"
    /\ local' = (local \/ (reply /\ ~pending
                    /\ ~(RetainDeleteHistory /\ deletedSincePull)))
    /\ pullPhase' = "done"
    /\ UNCHANGED <<remote, pending, intent, reply, pushPhase, deletedSincePull>>

Next == BeginPull \/ DeleteLocally \/ BeginFlush \/ CompleteFlush \/ CompletePull

TypeOK ==
    /\ local \in BOOLEAN
    /\ remote \in BOOLEAN
    /\ pending \in BOOLEAN
    /\ intent \in {"keep", "delete"}
    /\ pullPhase \in {"idle", "reading", "done"}
    /\ reply \in BOOLEAN
    /\ pushPhase \in {"idle", "writing", "done"}
    /\ deletedSincePull \in BOOLEAN

DeletedRowsStayDeleted == intent = "delete" => ~local

=====================================================================
