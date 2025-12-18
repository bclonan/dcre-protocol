# DCRE — USPTO Drawings (Mermaid Source of Truth)

This document contains the complete, authoritative diagram source for the
**Deterministic Computation with Replayable Evolution (DCRE)** patent family.

All figures are schematic, black-and-white, examiner-friendly, and correspond
directly to the written specification.  
Each figure is intended to be exported individually (SVG or 300-dpi PNG)
and assembled into a USPTO-compliant drawings PDF (one figure per page).

---

## Brief Description of the Drawings

FIG. 1 illustrates an overall system architecture for deterministic computation
with replayable evolution.

FIG. 2 illustrates a bounded modular lattice state space with fixed topology.

FIG. 3 illustrates a local block transformation using a modular integer matrix.

FIG. 4 illustrates sparse delta evolution between lattice epochs.

FIG. 5 illustrates verification by replay and fingerprint comparison.

FIG. 6 illustrates a deterministic receipt structure.

FIG. 7 illustrates triangulation-free communication using shared deterministic lanes.

FIG. 8 illustrates message encoding as deterministic lattice perturbation.

FIG. 9 illustrates epoch synchronization and bounded replay windows.

FIG. 10 illustrates separation of observer and verifier roles.

FIG. 11 illustrates deterministic ordering of delta application.

FIG. 12 illustrates contrast between address-based communication and
signature-based recognition.

FIG. 13 illustrates parallel lanes and channel isolation.

FIG. 14 illustrates deterministic collision handling and anti-jamming.

FIG. 15 illustrates the key system components and their interactions.

FIG. 16 illustrates transform families and their reversibility.

---

## Global Init (Monochrome / Exam-Friendly)

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%
flowchart TB
  I[DCRE – Monochrome Mermaid Init Loaded]
```

## FIG. 1 — DCRE End-to-End System Overview

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "primaryColor": "#ffffff",
    "primaryBorderColor": "#000000",
    "primaryTextColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "fontFamily": "Arial"
  }
}}%%
flowchart TB
  A[Input or Observation Data] --> B[Deterministic Encoder E]
  B --> C[Initial Lattice State G0]
  C --> D[Local Transform Engine M]
  D --> E[Sparse Delta Engine]
  E --> F[Final Lattice State Gt]
  F --> G[Fingerprint of Gt]
  E --> H[Fingerprint of Delta Sequence]
  E --> I[Replay Verification Engine]
  I --> J{Do fingerprints match}
  J -->|Yes| K[Valid Proof by Replay]
  J -->|No| L[Invalid or Divergent Execution]
  K --> M[Proof of Correct Execution]
  L --> N[Proof of Divergence]
  M --> O[Proof of Correct Execution]
  N --> O[Proof of Divergence]

  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```

FIG. 1 illustrates an end-to-end system for deterministic computation with replayable evolution. Input or observation data is deterministically encoded into an initial lattice state G0 defined over a bounded modular grid. The lattice state evolves through local block transformations using a transform matrix operating modulo a fixed modulus. State changes are recorded as sparse delta representations. Verification is performed by replaying the delta sequence from the initial lattice state and comparing computed fingerprints to establish proof of correct execution.

## FIG. 2 — Bounded Modular Lattice Structure

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%
flowchart TB
  subgraph G[Bounded Lattice Grid]
    direction LR
    C11[Cell] --- C12[Cell] --- C13[Cell]
    C21[Cell] --- C22[Cell] --- C23[Cell]
    C31[Cell] --- C32[Cell] --- C33[Cell]
  end
  R1[Fixed grid dimensions] --> G
  R2[Each cell stores bounded value] --> G
  R3[No overflow and no carry] --> G
  R4[Zero is a normal cell value] --> G
  N1{{Fixed n\n×n grid}} --- G
  N2{{Values bounded 0..m−1}} --- G
  N3{{Digit-wise arithmetic\nNo carry propagation}} --- G

  Note1{{All cell values are bounded residues in Z_m<br/>Digit-wise arithmetic, no carry propagation<br/>Zero is first-class}} 

  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
  ```

## FIG. 3 — Local Block Transformation (Matrix Evolution) (Axiom 9)

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%
flowchart LR
  B0[Local Block at epoch t] --> M[Apply Matrix Transform M]
  M --> B1[Local Block at epoch t plus 1]
  R[Only local neighborhood is read and written] --- M
  Note1{{Local block transformation using matrix M}} --- B0
  Note2{{Matrix M is fixed and known}} --- M
  Note3{{Matrix M is applied modulo m}} --- B1

  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```

## FIG. 4 — Sparse Delta Evolution (Axioms 12–13)

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%

flowchart LR
  Gt[Lattice State at epoch t] --> D[Delta at epoch t]
  D --> Gt1[Lattice State at epoch t plus 1]
  N1[Delta stores only changed cells] --- D
  N2[Unchanged cells are omitted] --- D

  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```

## FIG. 5 — Proof by Replay Verification (Axiom 18)

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%

flowchart TB
  subgraph Original[Original Execution]
    O0[Start State G0] --> O1[Apply Deltas] --> O2[End State Gt]
    O2 --> OH[Fingerprint of Gt]
  end

  subgraph Replay[Replay Verification]
    R0[Start State G0] --> R1[Replay Same Deltas] --> R2[Reconstructed State]
    R2 --> RH[Fingerprint of Reconstructed State]
  end

  OH --> C{Compare}
  RH --> C
  C -->|Match| OK[Valid Proof]
  C -->|Mismatch| BAD[Invalid Proof]

  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```

## FIG. 6 — Deterministic Receipt Structure

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%
classDiagram
  class Receipt {
    observer_id
    epoch
    n
    m
    lattice_fingerprint
    delta_fingerprint
    perturbation_hash
    timestamp
    signature
  }

  Receipt --> observer_id
  Receipt --> epoch
  Receipt --> n
  Receipt --> m
  Receipt --> lattice_fingerprint
  Receipt --> delta_fingerprint
  Receipt --> perturbation_hash
  Receipt --> timestamp
  Receipt --> signature

  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%

flowchart TB
  R[Receipt] --> F1[Observer Identifier]
  R --> F2[Epoch]
  R --> F3[Grid Size]
  R --> F4[Modulus]
  R --> F5[Lattice Fingerprint]
  R --> F6[Delta Fingerprint]
  R --> F7[Perturbation Fingerprint]
  R --> F8[Timestamp]
  R --> F9[Signature]

  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```

## FIG. 7 — Triangulation-Free “Bowling Alley” Communication Lane

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%
flowchart LR
  subgraph Lane[Shared Deterministic Lane]
    T0[Epoch 0] --> T1[Epoch 1] --> T2[Epoch 2] --> T3[Epoch 3]
  end
  S[Sender Injects Perturbation] --> T1
  R[Receiver Detects by Replay] --> T2
  N[No addressing or routing] --- Lane

  Note2{{No routing / no addressing<br/>No triangulation / no coordinates}} --- LANE

  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%
flowchart TB
  subgraph Lane[Shared Deterministic Lane]
    T0[Epoch t0] --> T1[Epoch t0+1] --> T2[Epoch t0+2]
  end
  A[Node A injects perturbation] --> T0
  B[Node B injects perturbation] --> T1
  R[Receiver detects via replay] --> T2
  
  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```

## FIG. 8 — Message Encoding as Deterministic Lattice Perturbation

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%
flowchart TB
  MSG[Message] --> ENC[Encode]
  ENC --> P[Perturbation P]
  P --> G[Lattice Update]
  G --> EV[Evolution]
  EV --> FP[Fingerprint + Receipt]
  Note1{{Message is encoded as deterministic perturbation<br/>Lattice evolves deterministically, fingerprintable}} --- FP

  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```

## FIG. 9 — Epoch Synchronization and Replay Window

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%
flowchart LR
  T[Shared Epoch Counter] --> W[Replay Window n* t−k .. t+k]
  W --> V[Attempt Replay and Match]
  V -->|Match Found| OK[Accept]
  V -->|No Match| REJ[Reject]
 
  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```

## FIG. 10 — Observer and Verifier Roles

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%
flowchart LR
  O[Observer] --> A[Artifacts Recorded]
  A --> V[Verifier]
  V --> P[Replay and Compare]
  P --> R[Result]

  Note1{{Observer verifies current state<br/>Verifier checks replayable trajectory}} --- OBSERVER
  Note2{{Separate roles: observer can verify without replaying<br/>Verifier must replay to ensure integrity}} --- VERIFIER
 
  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%
flowchart LR
  OBS[Observer\nrecords G, Δ, H] --> LOG[Artifacts]
  LOG --> VER[Verifier replays deterministically]
  VER --> OUT[Valid iff fingerprints match]

  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```

## FIG. 11 — Deterministic Ordering of Delta Application

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%
flowchart TB
  Δ[Delta Δ_t] --> O[Deterministic Ordering Rule]
  O --> A[Apply changes]
  A --> G[Lattice G_t]

  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```

## FIG. 12 — Address-Based vs. Signature-Based Communication

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%
flowchart LR
  subgraph Traditional
    SA[Sender Address] --> RT[Routing] --> RA[Receiver Address]
  end
  subgraph DCRE
    H[Perturbation Signature] --> EV[Evolution] --> RX[Receiver via Replay]
  end

  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```

## FIG. 13 — Parallel Lanes / Channel Isolation

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%
flowchart LR
  subgraph Lane1[Lane 1 Public Broadcast]
    A1[Epoch t] --> A2[Epoch t plus 1] --> A3[Epoch t plus 2]
  end

  subgraph Lane2[Lane 2 Private Team]
    B1[Epoch t] --> B2[Epoch t plus 1] --> B3[Epoch t plus 2]
  end

  subgraph Lane3[Lane 3 Sensor Telemetry]
    C1[Epoch t] --> C2[Epoch t plus 1] --> C3[Epoch t plus 2]
  end

  N[Participant Node] --> Lane1
  N --> Lane2
  N --> Lane3

  Note3[Lanes are isolated\nDistinct initial state, transforms, deltas, and fingerprints\nSelective subscription without identity or location] --- N

  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```

## FIG. 14 — Deterministic Collision Handling / Anti-Jamming

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%
flowchart TB
  M1[Encode message A] --> C[Composite Injection Operator]
  M2[Encode message B] --> C
  J[Interference or Jamming Signal] --> C

  C --> G0[Composite Lattice State at epoch t]
  G0 --> EV[Deterministic Evolution via local transforms]
  EV --> FP[Replayable Trajectory with Fingerprints]

  Note4[Collision produces deterministic composite state Jamming creates observable structure, not ambiguity] --- FP

  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```



## FIG. 15 — System Components

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%
flowchart TB
  BA[Bounded Arithmetic Module\nDigit wise, no carry] --> LS[Lattice State Store\nFixed grid, bounded values]
  IN[Input or Observation] --> EN[Deterministic Encoder E]
  EN --> LS
  LS --> TE[Lattice Transform Engine\nLocal transforms with matrix M]
  TE --> DE[Delta Evolution Engine\nSparse delta list]
  DE --> FP[Fingerprinting Module H]
  DE --> RV[Replay Verification Engine]
  CM[Channel Manager\nMulti lane support] --> LS
  RV --> OUT[Verification Result and Receipt]
  FP --> OUT

  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%
flowchart TB
  BA[Bounded Arithmetic Module digit-wise, no carry] --> LS[Lattice State Store<br/>G ∈ Z_m^*n×n*]
  LS --> EN[Deterministic Encoder E]
  LS --> TE[Lattice Transform Engine<br/>local transforms with M]
  TE --> DE[Delta Evolution Engine<br/>sparse Δ]
  DE --> FP[Fingerprinting Module H]
  DE --> RV[Replay Verification Engine]
  CM[Communication Channel Manager<br/>multi-lane lanes] --> LS
  RV --> OUT[Verification Result / Receipt]

  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```

## FIG. 16 — Transform Families & Reversibility

```mermaid
%%{init: {
  "theme": "base",
    "flowchart": {
        "htmlLabels": false
    },
  "themeVariables": {
    "fontFamily": "Arial",
    "fontSize": "14px",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#000000",
    "primaryBorderColor": "#000000",
    "lineColor": "#000000",
    "secondaryColor": "#ffffff",
    "tertiaryColor": "#ffffff",
    "noteBkgColor": "#ffffff",
    "noteTextColor": "#000000",
    "textColor": "#000000"
  },
  "flowchart": { "curve": "linear" }
}}%%
flowchart TB
  F[Select Transform Matrix Family] --> K1[Identity]
  F --> K2[Shear]
  F --> K3[Swap]
  F --> K4[Fibonacci style]
  F --> K5[Other small integer matrices]

  F --> DET{Is determinant invertible}
  DET -->|Yes| REV[Reversible Transform\nSupports backward replay]
  DET -->|No| IRR[Irreversible Transform\nStill deterministic forward]

  classDef op stroke:#000,stroke-width:2px,fill:#fff,color:#000;
```