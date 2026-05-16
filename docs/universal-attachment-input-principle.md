# Universal Attachment Input Principle

**Principle:** 입력은 항상 동일하고, 내부 처리만 모드별로 다르다.  
*(Input is always the same, and only internal processing differs by mode.)*

## Overview

This document establishes a foundational product principle for attachment input handling across all modes. The goal is to ensure a consistent, predictable user experience while allowing mode-specific internal processing.

## Problem Statement

### Why Mode-Specific Attachment Limits Confuse Users

- **Inconsistent UI/UX:** Different attachment limits, allowed file types, or input restrictions per mode create a confusing mental model
- **Hidden Rules:** Users are forced to learn undocumented mode-specific constraints through trial and error
- **Support Burden:** Mode-specific restrictions generate support tickets and friction
- **Predictability Loss:** Users cannot rely on their understanding from one mode when switching to another

## Principle: Unified Input Surface

### User-Facing Contract

All modes should expose **identical input surfaces** to users:
- Same attachment types allowed
- Same size limits presented
- Same UI controls and interactions
- Same validation feedback

Users should not need to learn different rules for each mode.

### Internal Processing May Differ

Implementation details and processing logic can vary by mode:
- Different storage backends
- Different validation chains
- Different routing logic
- Different payload transformations

**This is an internal concern, not a user concern.**

## Key Guidelines

1. **Do Not Teach Users Hidden Rules**
   - If a constraint exists (e.g., "Draft mode only accepts images"), expose it universally in the UI or not at all
   - Avoid mode-gated features that have no product reason for the gate

2. **Future Implementation Must Use Small PRs**
   - Unification changes to attachment input are high-risk
   - Break work into small, reviewable pull requests
   - Each PR should change one subsystem at a time
   - Easier to revert, easier to reason about, easier to test

3. **High-Risk Areas Requiring Careful Coordination**
   - **Shared Composer:** The attachment input component itself
   - **Attachment Routing:** Logic determining where attachments are processed
   - **Payload Contracts:** How attachment metadata flows through the system

   Changes in these areas can break multiple modes simultaneously.

## Implementation Considerations

- Update attachment input UI components to unify available options across modes
- Standardize validation messages and error states
- Document attachment processing pipelines per mode in internal code
- Add integration tests that verify identical input handling across modes
- Use feature flags if gradual rollout is needed

## Related Areas

- Attachment validation
- File type allowlisting
- Storage backend selection
- Payload serialization
- Error handling and user feedback

## Future Work

Future implementations should:
1. Audit current mode-specific input restrictions
2. Identify which are user-facing (UX debt) vs. legitimate internal concerns
3. Unify input surfaces incrementally via small PRs
4. Maintain backward compatibility during transition
5. Update user documentation to reflect unified behavior
