/**
 * Stage 2 of the scheduling audit (docs/SCHEDULING_NOTIFICATIONS_AUDIT.md, S1/S5/S14):
 * explicit availability responses. A row is now either an available window or
 * an explicit "unavailable"; absence of a row is the only thing that means
 * "hasn't responded". Dates are normalized to UTC midnight of the calendar day.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Server } from "http";
import { createTestApp, createTestUser } from "./test/setup";
import { MemoryStorage } from "./test/memory-storage";
import { availabilityDateKey } from "@shared/scheduling";

describe("Availability responses (stage 2)", () => {
  let storage: MemoryStorage;
  let app: Express;
  let server: Server;
  let teamId: string;
  const user = createTestUser({ id: "user-1" });

  beforeEach(async () => {
    storage = new MemoryStorage();
    storage.setUser(user);
    const result = await createTestApp({ storage, authenticatedUser: user });
    app = result.app;
    server = result.server;

    const teamRes = await request(app).post("/api/teams").send({
      name: "T",
      teamType: "dnd",
      diceMode: "polyhedral",
      timezone: "America/New_York",
    });
    teamId = teamRes.body.id;
  });

  afterEach(() => {
    server.close();
  });

  describe("explicit unavailable (S1)", () => {
    it("creates an unavailable response with no times", async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({ date: "2026-01-15", status: "unavailable" })
        .expect(200);

      expect(res.body.status).toBe("unavailable");
      expect(res.body.startTime).toBeNull();
      expect(res.body.endTime).toBeNull();
    });

    it("defaults to available and still requires valid times", async () => {
      await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({ date: "2026-01-15", startTime: "not-a-time", endTime: "22:00" })
        .expect(400);

      const res = await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({ date: "2026-01-15", startTime: "19:00", endTime: "22:00" })
        .expect(200);
      expect(res.body.status).toBe("available");
    });

    it("rejects an unknown status", async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({ date: "2026-01-15", status: "maybe" })
        .expect(400);
      expect(res.body.message).toContain("Invalid status");
    });

    it("ignores submitted times on an unavailable response", async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({ date: "2026-01-15", status: "unavailable", startTime: "19:00", endTime: "22:00" })
        .expect(200);
      expect(res.body.startTime).toBeNull();
      expect(res.body.endTime).toBeNull();
    });
  });

  describe("switching response via PATCH", () => {
    it("available → unavailable clears the window", async () => {
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({ date: "2026-01-15", startTime: "19:00", endTime: "22:00" })
        .expect(200);

      const res = await request(app)
        .patch(`/api/teams/${teamId}/user-availability/${createRes.body.id}`)
        .send({ status: "unavailable" })
        .expect(200);

      expect(res.body.status).toBe("unavailable");
      expect(res.body.startTime).toBeNull();
      expect(res.body.endTime).toBeNull();
    });

    it("unavailable → available requires times", async () => {
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({ date: "2026-01-15", status: "unavailable" })
        .expect(200);

      await request(app)
        .patch(`/api/teams/${teamId}/user-availability/${createRes.body.id}`)
        .send({ status: "available" })
        .expect(400);

      const res = await request(app)
        .patch(`/api/teams/${teamId}/user-availability/${createRes.body.id}`)
        .send({ status: "available", startTime: "19:00", endTime: "22:00" })
        .expect(200);

      expect(res.body.status).toBe("available");
      expect(res.body.startTime).toBe("19:00");
    });
  });

  describe("date normalization (S5/S14)", () => {
    it("stores the intended calendar day for a west-of-UTC local-midnight ISO date", async () => {
      // A browser in UTC-7 sends "Jan 15 local midnight" as Jan 15 07:00Z
      const res = await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({ date: "2026-01-15T07:00:00.000Z", startTime: "19:00", endTime: "22:00" })
        .expect(200);

      expect(availabilityDateKey({ date: new Date(res.body.date) })).toBe("2026-01-15");
      expect(new Date(res.body.date).toISOString()).toBe("2026-01-15T00:00:00.000Z");
    });

    it("detects a duplicate across different representations of the same day", async () => {
      await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({ date: "2026-01-15T07:00:00.000Z", startTime: "19:00", endTime: "22:00" })
        .expect(200);

      // Same calendar day sent as a plain key → still a duplicate
      await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({ date: "2026-01-15", startTime: "10:00", endTime: "12:00" })
        .expect(409);
    });

    it("allows adjacent days", async () => {
      await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({ date: "2026-01-15", startTime: "19:00", endTime: "22:00" })
        .expect(200);
      await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({ date: "2026-01-16", status: "unavailable" })
        .expect(200);
    });
  });
});
