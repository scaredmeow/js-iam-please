# Requirements Document

## Introduction

IAM Please is a Papers, Please–style web game where the player acts as an access approver ("Gatekeeper") who must Approve or Deny access requests using a simplified but realistic model of cloud authorization. The game teaches the principle of least privilege through turn-based, document-inspection gameplay. Built as a client-only vanilla JS/HTML/CSS web application with data-driven scenarios, mock box graphics (no external assets required), and keyboard-first accessibility.

## Glossary

- **Gatekeeper**: The player character who reviews and stamps access request tickets
- **Ticket**: An access request document containing requester identity, role, team, requested actions, resources, justification, and constraints
- **Decision_Engine**: The core logic module that evaluates whether a request should be approved or denied based on roles, ABAC tags, and guardrails
- **Role_Matrix**: A data structure defining which roles have which permissions on which resource types and environments
- **ABAC_Overlay**: Attribute-based access control rules using tags (env, team, data_classification) to further constrain permissions
- **Guardrail**: A deny-override rule (permission boundary or SCP) that caps maximum permissions regardless of role allowances
- **Scenario**: A JSON data object describing a single access request ticket, its expected decision, and its teaching point
- **Rationale_Code**: A structured reason the player selects after stamping a decision (e.g., "Denied: prod data classification mismatch")
- **Day**: A game session consisting of a fixed set of tickets to review
- **Score_Event**: A record of the player's decision on a single ticket, including correctness and point delta
- **Feedback_Panel**: The UI area that displays immediate micro-feedback after each decision and end-of-day summary

## Requirements

### Requirement 1: Decision Engine Core Logic

**User Story:** As a game developer, I want a deterministic decision engine that evaluates access requests against roles, ABAC tags, and guardrails, so that every scenario has exactly one correct answer.

#### Acceptance Criteria

1. THE Decision_Engine SHALL implement implicit deny by default, requiring an explicit allow from the Role_Matrix before approving any request
2. WHEN an explicit deny exists in any Guardrail (permission boundary or SCP), THEN THE Decision_Engine SHALL deny the request regardless of Role_Matrix allowances
3. WHEN evaluating a request, THE Decision_Engine SHALL check all of the following: role permission on action/resource, environment scoping, team scoping, data classification, and active guardrails
4. WHEN a request contains wildcard actions or wildcard resources, THEN THE Decision_Engine SHALL deny the request unless the scenario explicitly permits break-glass Admin access with a valid ticket ID and time window
5. WHEN a break-glass Admin request is evaluated, THE Decision_Engine SHALL require a ticket ID and a time window before approving
6. THE Decision_Engine SHALL produce a structured result containing the decision (APPROVE or DENY), a reason code, and an explanation string

### Requirement 2: Scenario Data and Validation

**User Story:** As a content author, I want scenarios defined as JSON data validated against a schema, so that every ticket is structurally correct and has an unambiguous expected outcome.

#### Acceptance Criteria

1. THE Scenario data SHALL conform to a JSON Schema that requires id, day, title, request (with requester, actions, resources, justification), expected decision, reason code, and teaching point
2. WHEN a Scenario JSON file is loaded, THE Scenario_Loader SHALL validate the file against the JSON Schema and reject invalid files with a descriptive error
3. THE Scenario_Loader SHALL parse valid Scenario JSON into Scenario objects usable by the Decision_Engine and the game UI
4. THE Scenario_Pretty_Printer SHALL format Scenario objects back into valid JSON strings conforming to the schema
5. FOR ALL valid Scenario objects, parsing then printing then parsing SHALL produce an equivalent Scenario object (round-trip property)

### Requirement 3: Role Matrix and ABAC Configuration

**User Story:** As a game designer, I want roles and ABAC rules defined as data, so that the permission model can evolve across game acts without code changes.

#### Acceptance Criteria

1. THE Role_Matrix SHALL be loaded from a JSON configuration defining roles, allowed action categories per resource type, and environment constraints
2. WHEN the ABAC_Overlay is active, THE Decision_Engine SHALL additionally check environment tag, team tag, and data classification tag against the request attributes
3. WHEN a role is not present in the Role_Matrix for a given action/resource combination, THE Decision_Engine SHALL deny the request (implicit deny)
4. THE Role_Matrix SHALL be serializable to JSON for storage and configuration
5. FOR ALL valid Role_Matrix configuration objects, serializing then deserializing SHALL produce an equivalent configuration object (round-trip property)

### Requirement 4: Game Flow and Day Structure

**User Story:** As a player, I want to play through a structured day of access request tickets with clear progression, so that each session is a focused learning session.

#### Acceptance Criteria

1. WHEN a day starts, THE Game_Controller SHALL load the set of Scenario tickets for that day and present the first ticket
2. WHEN the player stamps a ticket (APPROVE or DENY) and selects a Rationale_Code, THE Game_Controller SHALL evaluate the decision against the expected outcome and record a Score_Event
3. WHEN a ticket is completed, THE Game_Controller SHALL advance to the next ticket in the day sequence
4. WHEN all tickets in a day are completed, THE Game_Controller SHALL display an end-of-day summary showing total score, accuracy, and per-ticket feedback
5. IF the player attempts to approve a request that is missing required fields (no justification, no resource, no ticket ID for elevated access), THEN THE Game_Controller SHALL display a warning reinforcing implicit deny before allowing the approval

### Requirement 5: Scoring System

**User Story:** As a player, I want to receive meaningful scores that reward correct reasoning and penalize dangerous approvals, so that I learn which mistakes are most costly.

#### Acceptance Criteria

1. WHEN the player makes a correct decision, THE Scoring_System SHALL award positive points (base +10)
2. WHEN the player makes a dangerous false approval (approving access to production restricted data or wildcard permissions), THE Scoring_System SHALL apply a higher penalty (−15)
3. WHEN the player makes a false denial (denying legitimate access), THE Scoring_System SHALL apply a moderate penalty (−5)
4. WHEN the player selects the correct Rationale_Code matching the expected reason, THE Scoring_System SHALL award bonus points (+3)
5. THE Scoring_System SHALL persist the current day score and cumulative score to localStorage

### Requirement 6: Feedback and Teaching

**User Story:** As a player, I want immediate feedback after each decision and a summary at end of day, so that I understand my mistakes and learn the correct reasoning.

#### Acceptance Criteria

1. WHEN a ticket decision is submitted, THE Feedback_Panel SHALL display immediate micro-feedback explaining whether the decision was correct and why
2. WHEN the player makes an incorrect decision, THE Feedback_Panel SHALL display a hint describing what would have made the request approvable or why it should have been denied
3. WHEN all tickets in a day are completed, THE Feedback_Panel SHALL display an end-of-day debrief with patterns (e.g., "You over-approved production data access") and the teaching point for each missed ticket
4. THE Feedback_Panel SHALL include an "Explain this decision" button that shows the full expected reasoning for the current ticket after the player has stamped it

### Requirement 7: Progressive Difficulty

**User Story:** As a player, I want the game to start simple and gradually introduce more complex IAM concepts, so that I build understanding incrementally.

#### Acceptance Criteria

1. WHILE the game is in Act One (Days 1–3), THE Game_Controller SHALL present only RBAC-based scenarios using the base Role_Matrix without ABAC or guardrails
2. WHILE the game is in Act Two (Days 4–7), THE Game_Controller SHALL activate the ABAC_Overlay and present scenarios involving environment, team, and data classification tags
3. WHILE the game is in Act Three (Days 8–11), THE Game_Controller SHALL activate Guardrails (permission boundaries and SCPs) and present scenarios where guardrails override role allowances
4. WHILE the game is in Act Four (Days 12+), THE Game_Controller SHALL present advanced scenarios including break-glass access, PassRole traps, and incomplete request quality checks

### Requirement 8: User Interface Layout and Interaction

**User Story:** As a player, I want a clear single-screen layout with the request document, rulebook, and decision controls visible, so that I can inspect and decide efficiently.

#### Acceptance Criteria

1. THE UI SHALL display a request document panel (left) showing requester name, role, team, environment, requested actions, resources, justification, ticket ID, and time window
2. THE UI SHALL display a rulebook panel (right) showing the current Role_Matrix, active ABAC tag rules, and active Guardrails
3. THE UI SHALL display a decision bar (bottom) with APPROVE and DENY stamp buttons, a Rationale_Code picker, and a Next Ticket control
4. WHEN the player clicks or keyboard-activates the APPROVE stamp, THE UI SHALL prompt for a Rationale_Code selection before recording the decision
5. WHEN the player clicks or keyboard-activates the DENY stamp, THE UI SHALL prompt for a Rationale_Code selection before recording the decision
6. THE UI SHALL use CSS-only mock box styling for all visual elements (desk background, paper texture, stamp graphics) without requiring external image assets

### Requirement 9: Keyboard Accessibility and Focus Management

**User Story:** As a player using keyboard navigation, I want all game functions operable via keyboard with visible focus indicators, so that I can play without a mouse.

#### Acceptance Criteria

1. THE UI SHALL make all interactive elements (stamps, rationale picker, next ticket, explain button, rulebook tabs) operable via keyboard using Tab, Shift+Tab, Enter, and Escape
2. THE UI SHALL display a visible focus indicator on the currently focused interactive element
3. WHEN a modal dialog opens (rationale picker, feedback panel), THE UI SHALL trap focus within the modal and return focus to the triggering element when the modal closes
4. THE UI SHALL support keyboard shortcuts: A key for Approve stamp, D key for Deny stamp, Escape to close modals
5. THE UI SHALL use native HTML button elements for stamps and controls rather than div-based custom widgets

### Requirement 10: Game State Persistence

**User Story:** As a player, I want my progress saved locally, so that I can resume where I left off.

#### Acceptance Criteria

1. WHEN a day is completed, THE Game_Controller SHALL persist the day completion status and score to localStorage
2. WHEN the game loads, THE Game_Controller SHALL read saved progress from localStorage and resume from the last incomplete day
3. THE Game_Controller SHALL serialize game state to JSON for localStorage storage
4. THE Game_Controller SHALL deserialize game state from JSON when loading from localStorage
5. FOR ALL valid game state objects, serializing then deserializing SHALL produce an equivalent game state (round-trip property)
