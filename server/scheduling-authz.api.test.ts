/**
 * Stage 1 of the scheduling audit (docs/SCHEDULING_NOTIFICATIONS_AUDIT.md):
 * authorization guards (S6/S7) and the previously-untested candidates and
 * overrides HTTP surface (S8), exercised through the shared handler factories
 * used by BOTH the production and test routers.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Server } from "http";
import { createTestApp, createTestUser } from "./test/setup";
import { MemoryStorage } from "./test/memory-storage";
import { instantAt } from "@shared/recurrence";

describe("Scheduling authorization + candidates API (audit S6/S7/S8)", () => {
  let storage: MemoryStorage;
  let dmApp: Express;
  let dmServer: Server;
  let memberApp: Express;
  let memberServer: Server;
  let teamId: string;
  const dmUser = createTestUser({ id: "dm-user" });
  const memberUser = createTestUser({ id: "member-user" });

  beforeEach(async () => {
    storage = new MemoryStorage();
    storage.setUser(dmUser);
    storage.setUser(memberUser);

    const dmResult = await createTestApp({ storage, authenticatedUser: dmUser });
    dmApp = dmResult.app;
    dmServer = dmResult.server;
    const memberResult = await createTestApp({ storage, authenticatedUser: memberUser });
    memberApp = memberResult.app;
    memberServer = memberResult.server;

    const teamRes = await request(dmApp).post("/api/teams").send({
      name: "Sched Team",
      teamType: "dnd",
      diceMode: "polyhedral",
      recurrenceFrequency: "weekly",
      dayOfWeek: 4,
      startTime: "19:00",
      timezone: "America/New_York",
    });
    teamId = teamRes.body.id;
    await storage.createTeamMember({ teamId, userId: memberUser.id, role: "member" });
  });

  afterEach(() => {
    dmServer.close();
    memberServer.close();
  });

  describe("user-availability ownership (S6)", () => {
    it("blocks a member from editing another member's availability row", async () => {
      const createRes = await request(dmApp)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({ date: "2026-01-15T00:00:00.000Z", startTime: "19:00", endTime: "22:00" })
        .expect(200);

      const res = await request(memberApp)
        .patch(`/api/teams/${teamId}/user-availability/${createRes.body.id}`)
        .send({ startTime: "09:00" })
        .expect(403);
      expect(res.body.message).toContain("another member's availability");

      // Row untouched
      const rows = await storage.getUserAvailability(
        teamId,
        new Date("2026-01-01"),
        new Date("2026-02-01")
      );
      expect(rows[0].startTime).toBe("19:00");
    });

    it("blocks a member from deleting another member's availability row", async () => {
      const createRes = await request(dmApp)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({ date: "2026-01-15T00:00:00.000Z", startTime: "19:00", endTime: "22:00" })
        .expect(200);

      await request(memberApp)
        .delete(`/api/teams/${teamId}/user-availability/${createRes.body.id}`)
        .expect(403);

      const rows = await storage.getUserAvailability(
        teamId,
        new Date("2026-01-01"),
        new Date("2026-02-01")
      );
      expect(rows).toHaveLength(1);
    });

    it("404s on a row from a different team even for its owner", async () => {
      // Second team owned by the same DM
      const otherTeamRes = await request(dmApp).post("/api/teams").send({
        name: "Other Team",
        teamType: "dnd",
        diceMode: "polyhedral",
      });
      const otherCreate = await request(dmApp)
        .post(`/api/teams/${otherTeamRes.body.id}/user-availability`)
        .send({ date: "2026-01-15T00:00:00.000Z", startTime: "19:00", endTime: "22:00" })
        .expect(200);

      // Addressed through the WRONG team's URL
      await request(dmApp)
        .patch(`/api/teams/${teamId}/user-availability/${otherCreate.body.id}`)
        .send({ startTime: "09:00" })
        .expect(404);
    });

    it("still lets the owner update their own row", async () => {
      const createRes = await request(memberApp)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({ date: "2026-01-15T00:00:00.000Z", startTime: "19:00", endTime: "22:00" })
        .expect(200);

      const res = await request(memberApp)
        .patch(`/api/teams/${teamId}/user-availability/${createRes.body.id}`)
        .send({ startTime: "20:00" })
        .expect(200);
      expect(res.body.startTime).toBe("20:00");
    });
  });

  describe("session override scoping (S6)", () => {
    it("404s when deleting an override through the wrong team", async () => {
      await request(dmApp)
        .post(`/api/teams/${teamId}/session-overrides`)
        .send({ occurrenceKey: "2026-01-15", status: "canceled" })
        .expect(200);
      const overrides = await storage.getSessionOverrides(teamId);

      const otherTeamRes = await request(dmApp).post("/api/teams").send({
        name: "Other Team",
        teamType: "dnd",
        diceMode: "polyhedral",
      });

      await request(dmApp)
        .delete(`/api/teams/${otherTeamRes.body.id}/session-overrides/${overrides[0].id}`)
        .expect(404);

      expect(await storage.getSessionOverrides(teamId)).toHaveLength(1);
    });

    it("deletes an override through its own team", async () => {
      await request(dmApp)
        .post(`/api/teams/${teamId}/session-overrides`)
        .send({ occurrenceKey: "2026-01-15", status: "canceled" })
        .expect(200);
      const overrides = await storage.getSessionOverrides(teamId);

      await request(dmApp)
        .delete(`/api/teams/${teamId}/session-overrides/${overrides[0].id}`)
        .expect(200);
      expect(await storage.getSessionOverrides(teamId)).toHaveLength(0);
    });
  });

  describe("legacy session availability validation (S8)", () => {
    it("rejects an invalid status (validation now shared, not test-only)", async () => {
      const sessionRes = await request(dmApp)
        .post(`/api/teams/${teamId}/sessions`)
        .send({ scheduledAt: "2026-01-20T19:00:00.000Z" })
        .expect(200);

      const res = await request(memberApp)
        .post(`/api/teams/${teamId}/sessions/${sessionRes.body.id}/availability`)
        .send({ status: "definitely-not-a-status" })
        .expect(400);
      expect(res.body.message).toBe("Invalid status");
    });

    it("404s when the session belongs to a different team (S6)", async () => {
      const otherTeamRes = await request(dmApp).post("/api/teams").send({
        name: "Other Team",
        teamType: "dnd",
        diceMode: "polyhedral",
      });
      const foreignSession = await request(dmApp)
        .post(`/api/teams/${otherTeamRes.body.id}/sessions`)
        .send({ scheduledAt: "2026-01-20T19:00:00.000Z" })
        .expect(200);

      await request(memberApp)
        .post(`/api/teams/${teamId}/sessions/${foreignSession.body.id}/availability`)
        .send({ status: "available" })
        .expect(404);
    });
  });

  describe("session creation validation (S7)", () => {
    it("rejects a session without a valid scheduledAt", async () => {
      await request(dmApp)
        .post(`/api/teams/${teamId}/sessions`)
        .send({ notes: "no date" })
        .expect(400);
    });

    it("ignores non-whitelisted fields in the body", async () => {
      const res = await request(dmApp)
        .post(`/api/teams/${teamId}/sessions`)
        .send({ scheduledAt: "2026-01-20T19:00:00.000Z", teamId: "someone-elses-team", status: "canceled" })
        .expect(200);
      expect(res.body.teamId).toBe(teamId);
      expect(res.body.status).toBe("scheduled");
    });
  });

  describe("team PATCH allow-list (S7)", () => {
    it("cannot reassign ownerId or flip the AI paywall flag", async () => {
      const before = await storage.getTeam(teamId);
      expect(before!.ownerId).toBe(dmUser.id);

      await request(dmApp)
        .patch(`/api/teams/${teamId}`)
        .send({ name: "Renamed", ownerId: "attacker", aiEnabled: true })
        .expect(200);

      const after = await storage.getTeam(teamId);
      expect(after!.name).toBe("Renamed");
      expect(after!.ownerId).toBe(dmUser.id);
      expect(after!.aiEnabled).toBe(false);
    });

    it("accepts recurrence config including anchor/threshold/duration (S14)", async () => {
      await request(dmApp)
        .patch(`/api/teams/${teamId}`)
        .send({
          recurrenceFrequency: "biweekly",
          recurrenceAnchorDate: "2026-01-01T12:00:00.000Z",
          minAttendanceThreshold: 3,
          defaultSessionDurationMinutes: 240,
        })
        .expect(200);

      const after = await storage.getTeam(teamId);
      expect(after!.recurrenceFrequency).toBe("biweekly");
      expect(after!.recurrenceAnchorDate).toEqual(new Date("2026-01-01T12:00:00.000Z"));
      expect(after!.minAttendanceThreshold).toBe(3);
      expect(after!.defaultSessionDurationMinutes).toBe(240);
    });
  });

  describe("session-candidates endpoint (S8 — previously untested over HTTP)", () => {
    it("returns recurrence candidates with team-timezone occurrence keys", async () => {
      const res = await request(memberApp)
        .get(
          `/api/teams/${teamId}/session-candidates?startDate=${instantAt(
            "2026-01-01",
            "00:00",
            "America/New_York"
          ).toISOString()}&endDate=${instantAt("2026-01-31", "23:59", "America/New_York").toISOString()}`
        )
        .expect(200);

      // January 2026 Thursdays
      expect(res.body.candidates.map((c: { occurrenceKey: string }) => c.occurrenceKey)).toEqual([
        "2026-01-01",
        "2026-01-08",
        "2026-01-15",
        "2026-01-22",
        "2026-01-29",
      ]);
      // 19:00 America/New_York in January is 00:00Z the next day
      expect(res.body.candidates[0].scheduledAt).toBe("2026-01-02T00:00:00.000Z");
    });

    it("applies overrides to the returned candidates", async () => {
      await request(dmApp)
        .post(`/api/teams/${teamId}/session-overrides`)
        .send({ occurrenceKey: "2026-01-15", status: "canceled" })
        .expect(200);

      const res = await request(memberApp)
        .get(
          `/api/teams/${teamId}/session-candidates?startDate=2026-01-01T05:00:00.000Z&endDate=2026-01-31T05:00:00.000Z`
        )
        .expect(200);

      const canceled = res.body.candidates.find(
        (c: { occurrenceKey: string }) => c.occurrenceKey === "2026-01-15"
      );
      expect(canceled.status).toBe("canceled");
      expect(canceled.isOverridden).toBe(true);
    });

    it("requires the date range", async () => {
      await request(memberApp).get(`/api/teams/${teamId}/session-candidates`).expect(400);
    });

    it("supports biweekly recurrence end-to-end (anchor no longer dropped by MemoryStorage)", async () => {
      await request(dmApp)
        .patch(`/api/teams/${teamId}`)
        .send({
          recurrenceFrequency: "biweekly",
          recurrenceAnchorDate: instantAt("2026-01-01", "12:00", "America/New_York").toISOString(),
        })
        .expect(200);

      const res = await request(memberApp)
        .get(
          `/api/teams/${teamId}/session-candidates?startDate=${instantAt(
            "2026-01-01",
            "00:00",
            "America/New_York"
          ).toISOString()}&endDate=${instantAt("2026-01-31", "23:59", "America/New_York").toISOString()}`
        )
        .expect(200);

      expect(res.body.candidates.map((c: { occurrenceKey: string }) => c.occurrenceKey)).toEqual([
        "2026-01-01",
        "2026-01-15",
        "2026-01-29",
      ]);
    });
  });
});
