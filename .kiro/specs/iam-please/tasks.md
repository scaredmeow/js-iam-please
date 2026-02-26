# Implementation Plan: IAM Please

## Overview

Build a client-only vanilla JS/HTML/CSS web game implementing a Papers, Please–style IAM access request approval workflow. Implementation follows the architecture from the design: data layer (JSON schemas/config), engine layer (pure JS logic), and UI layer (DOM rendering). Property-based tests use fast-check via Vitest.

## Tasks

- [x] 1. Set up project structure and tooling
  - Create directory structure: `src/engine/`, `src/ui/`, `src/data/`, `tests/engine/`
  - Initialize `package.json` with Vitest and fast-check as dev dependencies
  - Create `vitest.config.js` for ES module support
  - Create `index.html` entry point with basic HTML shell (three-panel layout placeholder)
  - Create `src/main.js` entry point that wires modules together
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 2. Implement data models and JSON schema validation
  - [x] 2.1 Create scenario JSON schema and validation logic
    - Implement `src/engine/scenario-loader.js` with `parseScenario()` and `printScenario()` functions
    - Implement schema validation that checks required fields (id, day, title, request, expected, teachingPoint) and types
    - Throw `ValidationError` with descriptive messages for invalid input
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.2 Write property test for scenario round-trip (Property 6)
    - **Property 6: Scenario parse/print round-trip**
    - **Validates: Requirements 2.3, 2.4, 2.5**

  - [x] 2.3 Write property test for invalid scenario rejection (Property 7)
    - **Property 7: Invalid scenario rejection**
    - **Validates: Requirements 2.2**

- [x] 3. Implement role matrix and ABAC configuration
  - [x] 3.1 Create role matrix data model and loader
    - Implement `src/engine/role-matrix.js` with role definitions, permission lookups, and serialization/deserialization
    - Implement `src/data/roles.json` with the base role matrix (Intern, Developer, Security Engineer, Data Analyst, Auditor, Admin)
    - _Requirements: 3.1, 3.4, 3.5_

  - [x] 3.2 Create ABAC overlay and guardrail data models
    - Implement `src/engine/abac-overlay.js` with tag-based constraint checking (environment, team, data classification)
    - Implement `src/engine/guardrails.js` with SCP and permission boundary deny logic
    - Implement `src/data/abac-rules.json` and `src/data/guardrails.json` configuration files
    - _Requirements: 3.2_

  - [x] 3.3 Write property test for role matrix round-trip (Property 8)
    - **Property 8: Role matrix serialization round-trip**
    - **Validates: Requirements 3.4, 3.5**

- [x] 4. Implement decision engine
  - [x] 4.1 Implement core decision engine logic
    - Implement `src/engine/decision-engine.js` with `evaluate()` function
    - Evaluation order: guardrails → ABAC overlay → role matrix → wildcard/break-glass checks
    - Return structured result: `{ decision, reasonCode, explanation }`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 4.2 Write property test for implicit deny (Property 1)
    - **Property 1: Implicit deny for unmatched requests**
    - **Validates: Requirements 1.1, 3.3**

  - [x] 4.3 Write property test for explicit deny overrides (Property 2)
    - **Property 2: Explicit deny overrides allow**
    - **Validates: Requirements 1.2**

  - [x] 4.4 Write property test for wildcard/break-glass constraints (Property 3)
    - **Property 3: Wildcard and Admin break-glass constraints**
    - **Validates: Requirements 1.4, 1.5**

  - [x] 4.5 Write property test for decision result completeness (Property 4)
    - **Property 4: Decision result completeness**
    - **Validates: Requirements 1.6**

  - [x] 4.6 Write property test for ABAC overlay enforcement (Property 5)
    - **Property 5: ABAC overlay enforcement**
    - **Validates: Requirements 3.2**

- [x] 5. Checkpoint - Ensure all engine tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement scoring system
  - [x] 6.1 Implement scoring logic
    - Implement `src/engine/scoring.js` with `computeScore()` function
    - Correct decision: +10, correct rationale bonus: +3, dangerous false approval: −15, false denial: −5
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 6.2 Write property test for scoring correctness (Property 9)
    - **Property 9: Scoring correctness**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 7. Implement game controller and flow
  - [x] 7.1 Implement game controller
    - Implement `src/engine/game-controller.js` with `GameController` class
    - Day loading, ticket progression, decision submission, day completion, summary generation
    - Progressive difficulty: Act 1 (days 1-3) RBAC only, Act 2 (days 4-7) + ABAC, Act 3 (days 8-11) + guardrails, Act 4 (days 12+) all features
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 7.1, 7.2, 7.3, 7.4_

  - [x] 7.2 Write property test for ticket progression (Property 10)
    - **Property 10: Game flow ticket progression**
    - **Validates: Requirements 4.2, 4.3, 4.4**

  - [x] 7.3 Write property test for act feature unlocking (Property 11)
    - **Property 11: Act feature unlocking**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [x] 8. Implement state persistence
  - [x] 8.1 Implement persistence module
    - Implement `src/engine/persistence.js` with `serializeState()`, `deserializeState()`, `saveToLocalStorage()`, `loadFromLocalStorage()`
    - Handle corrupted data gracefully (reset to initial state)
    - Handle missing localStorage (continue without persistence)
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 8.2 Write property test for game state round-trip (Property 12)
    - **Property 12: Game state persistence round-trip**
    - **Validates: Requirements 10.3, 10.4, 10.5**

- [x] 9. Checkpoint - Ensure all engine and persistence tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Create scenario content
  - Create `src/data/scenarios/` directory with scenario JSON files for at least Days 1-3 (Act One)
  - Include the 10 sample scenarios from the research report adapted to the schema
  - Validate all scenario files against the JSON schema
  - _Requirements: 2.1, 7.1_

- [x] 11. Build UI - HTML structure and CSS styling
  - [x] 11.1 Create main HTML layout and CSS
    - Build the three-panel layout in `index.html`: request panel (left), rulebook panel (right), decision bar (bottom)
    - Implement CSS-only desk/paper/stamp aesthetics (box shadows, borders, gradients, transforms)
    - Use native HTML `<button>` elements for stamps and controls
    - Ensure visible focus indicators on all interactive elements
    - Ensure adequate color contrast and non-color cues for stamp outcomes
    - _Requirements: 8.1, 8.2, 8.3, 8.6, 9.2, 9.5_

- [x] 12. Build UI - Interactive components
  - [x] 12.1 Implement request panel rendering
    - Implement `src/ui/request-panel.js` to render ticket fields (requester, role, team, environment, actions, resources, justification, ticket ID, time window)
    - _Requirements: 8.1_

  - [x] 12.2 Implement rulebook panel rendering
    - Implement `src/ui/rulebook-panel.js` to render current Role_Matrix, active ABAC rules, and active Guardrails
    - _Requirements: 8.2_

  - [x] 12.3 Implement decision bar with stamps and rationale picker
    - Implement `src/ui/decision-bar.js` with APPROVE/DENY stamp buttons and rationale code picker
    - Implement `src/ui/modal.js` for accessible rationale picker modal (focus trap, Escape to close)
    - Prompt for rationale code selection before recording decision
    - _Requirements: 8.3, 8.4, 8.5_

  - [x] 12.4 Implement feedback panel
    - Implement `src/ui/feedback-panel.js` for micro-feedback after each decision
    - Implement end-of-day summary display with patterns and teaching points
    - Include "Explain this decision" button
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 12.5 Implement keyboard handler and focus management
    - Implement `src/ui/keyboard-handler.js` for global shortcuts (A=Approve, D=Deny, Escape=close modal)
    - Ensure Tab/Shift+Tab cycles through all interactive elements
    - Implement focus trap for modal dialogs
    - _Requirements: 9.1, 9.3, 9.4_

- [x] 13. Wire everything together
  - [x] 13.1 Connect engine to UI in main.js
    - Wire GameController to UI components in `src/main.js`
    - Load scenario data, role matrix, ABAC rules, and guardrails at startup
    - Load saved game state from localStorage on startup
    - Connect stamp buttons → submitDecision → feedback display → next ticket flow
    - Connect day completion → summary screen → next day flow
    - Implement missing-field warning when approving incomplete requests
    - _Requirements: 4.1, 4.5, 5.5, 10.1, 10.2_

- [x] 14. Final checkpoint - Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required including property-based tests
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- All UI uses native HTML elements and CSS-only styling — no external image assets needed
