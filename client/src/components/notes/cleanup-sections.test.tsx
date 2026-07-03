/**
 * @vitest-environment jsdom
 *
 * PRD-049: Relationship Suggestions + Quest Promotion sections in AI Cleanup.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  RelationshipSuggestionsSection,
  type RelationshipSuggestionStatus,
} from "./relationship-suggestions-section";
import {
  QuestPromotionSection,
  type QuestSuggestionStatus,
} from "./quest-promotion-section";
import type {
  CleanupQuestSuggestion,
  CleanupRelationshipSuggestion,
} from "@shared/cleanup-suggestions";

const relationshipSuggestion: CleanupRelationshipSuggestion = {
  id: "rel:abc",
  fromEntityId: "entity:kettle:0",
  fromEntityText: "Kettle",
  toEntityId: "entity:silverwood:0",
  toEntityText: "Silverwood Forest",
  fromNoteId: "npc-1",
  toNoteId: "area-1",
  relationshipType: "NPCInPlace",
  evidenceType: "Mention",
  confidence: 0.85,
  confidenceBucket: "HIGH",
  snippetText: "Kettle lives near the Silverwood Forest.",
  sourceBlockId: "auto:xyz",
  requiresResolution: false,
};

const questSuggestion: CleanupQuestSuggestion = {
  id: "quest:def",
  proposedQuestTitle: "Find Lost Relic",
  snippetText: "He asked us to Find the Lost Relic before nightfall.",
  startOffset: 40,
  endOffset: 60,
  existingQuestMatches: [
    { id: "quest-1", title: "Find Lost Relic", noteType: "quest" },
  ],
  suggestedNpcNoteId: "npc-1",
  suggestedAreaNoteId: "area-1",
};

describe("RelationshipSuggestionsSection (PRD-049 FR-1)", () => {
  it("renders entity pair, type, evidence, confidence bucket, and snippet", () => {
    render(
      <RelationshipSuggestionsSection
        suggestions={[relationshipSuggestion]}
        statusById={new Map()}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText("Relationship Suggestions")).toBeInTheDocument();
    expect(screen.getByText("Kettle")).toBeInTheDocument();
    expect(screen.getByText("Silverwood Forest")).toBeInTheDocument();
    expect(screen.getByText("NPC → Place")).toBeInTheDocument();
    expect(screen.getByText("Mention")).toBeInTheDocument();
    expect(screen.getByText("High (85%)")).toBeInTheDocument();
    expect(
      screen.getByText(/"Kettle lives near the Silverwood Forest\."/)
    ).toBeInTheDocument();
  });

  it("invokes accept and dismiss callbacks", () => {
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    render(
      <RelationshipSuggestionsSection
        suggestions={[relationshipSuggestion]}
        statusById={new Map()}
        onAccept={onAccept}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));
    expect(onAccept).toHaveBeenCalledWith(relationshipSuggestion);
  });

  it("disables Accept until both entities resolve to notes", () => {
    render(
      <RelationshipSuggestionsSection
        suggestions={[
          { ...relationshipSuggestion, fromNoteId: null, requiresResolution: true },
        ]}
        statusById={new Map()}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /Accept/ })).toBeDisabled();
    expect(
      screen.getByText(/Link both entities to existing notes/)
    ).toBeInTheDocument();
  });

  it("shows Accepted state and hides dismissed suggestions", () => {
    const { rerender } = render(
      <RelationshipSuggestionsSection
        suggestions={[relationshipSuggestion]}
        statusById={
          new Map<string, RelationshipSuggestionStatus>([["rel:abc", "accepted"]])
        }
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText("Accepted")).toBeInTheDocument();

    rerender(
      <RelationshipSuggestionsSection
        suggestions={[relationshipSuggestion]}
        statusById={
          new Map<string, RelationshipSuggestionStatus>([["rel:abc", "dismissed"]])
        }
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(
      screen.queryByText("Relationship Suggestions")
    ).not.toBeInTheDocument();
  });
});

describe("QuestPromotionSection (PRD-049 FR-3)", () => {
  it("renders proposed title, snippet, and all actions", () => {
    render(
      <QuestPromotionSection
        suggestions={[questSuggestion]}
        statusById={new Map()}
        onCreateQuest={vi.fn()}
        onLinkExistingQuest={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText("Quest Promotion")).toBeInTheDocument();
    expect(screen.getByText("Find Lost Relic")).toBeInTheDocument();
    expect(
      screen.getByText(/"He asked us to Find the Lost Relic before nightfall\."/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Create Quest/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Link "Find Lost Relic"/ })
    ).toBeInTheDocument();
  });

  it("invokes create and link-existing callbacks", () => {
    const onCreateQuest = vi.fn();
    const onLinkExistingQuest = vi.fn();
    render(
      <QuestPromotionSection
        suggestions={[questSuggestion]}
        statusById={new Map()}
        onCreateQuest={onCreateQuest}
        onLinkExistingQuest={onLinkExistingQuest}
        onDismiss={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Create Quest/ }));
    expect(onCreateQuest).toHaveBeenCalledWith(questSuggestion);

    fireEvent.click(
      screen.getByRole("button", { name: /Link "Find Lost Relic"/ })
    );
    expect(onLinkExistingQuest).toHaveBeenCalledWith(questSuggestion, "quest-1");
  });

  it("shows Promoted state and hides dismissed suggestions", () => {
    const { rerender } = render(
      <QuestPromotionSection
        suggestions={[questSuggestion]}
        statusById={
          new Map<string, QuestSuggestionStatus>([["quest:def", "promoted"]])
        }
        onCreateQuest={vi.fn()}
        onLinkExistingQuest={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText("Promoted")).toBeInTheDocument();

    rerender(
      <QuestPromotionSection
        suggestions={[questSuggestion]}
        statusById={
          new Map<string, QuestSuggestionStatus>([["quest:def", "dismissed"]])
        }
        onCreateQuest={vi.fn()}
        onLinkExistingQuest={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.queryByText("Quest Promotion")).not.toBeInTheDocument();
  });
});
