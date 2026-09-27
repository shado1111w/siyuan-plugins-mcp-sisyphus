import { describe, expect, it } from "vitest";
import {
    buildDefaultTelemetryConfig,
    normalizeTelemetryConfig,
    TELEMETRY_CONFIG_STORAGE_KEY,
    TELEMETRY_CONFIG_PATH,
} from "@/ui/setting/telemetry-config";

describe("telemetry-config", () => {
    it("buildDefaultTelemetryConfig", () => {
        const c = buildDefaultTelemetryConfig();
        expect(c.enabled).toBe(false);
        expect(c.reportIntervalHours).toBe(24);
        expect(c.lastReportAt).toBe(0);
    });

    it("normalizeTelemetryConfig with valid data", () => {
        const c = normalizeTelemetryConfig({ enabled: true, lastReportAt: 123, reportIntervalHours: 48, endpoint: "https://t.example.com" });
        expect(c.enabled).toBe(true);
        expect(c.lastReportAt).toBe(123);
        expect(c.reportIntervalHours).toBe(48);
        expect(c.endpoint).toBe("https://t.example.com");
    });

    it("normalizeTelemetryConfig with null/undefined", () => {
        expect(normalizeTelemetryConfig(null).enabled).toBe(false);
        expect(normalizeTelemetryConfig(undefined).enabled).toBe(false);
        expect(normalizeTelemetryConfig("string").enabled).toBe(false);
        expect(normalizeTelemetryConfig(42).enabled).toBe(false);
        expect(normalizeTelemetryConfig([]).enabled).toBe(false);
    });

    it("normalizeTelemetryConfig clamps reportIntervalHours", () => {
        expect(normalizeTelemetryConfig({ reportIntervalHours: 0 }).reportIntervalHours).toBe(1);
        expect(normalizeTelemetryConfig({ reportIntervalHours: 1 }).reportIntervalHours).toBe(1);
        expect(normalizeTelemetryConfig({ reportIntervalHours: 168 }).reportIntervalHours).toBe(168);
        expect(normalizeTelemetryConfig({ reportIntervalHours: 200 }).reportIntervalHours).toBe(168);
        expect(normalizeTelemetryConfig({ reportIntervalHours: -5 }).reportIntervalHours).toBe(1);
        expect(normalizeTelemetryConfig({ reportIntervalHours: NaN }).reportIntervalHours).toBe(24);
        expect(normalizeTelemetryConfig({ reportIntervalHours: "x" }).reportIntervalHours).toBe(24);
    });

    it("normalizeTelemetryConfig trims endpoint", () => {
        expect(normalizeTelemetryConfig({ endpoint: "  https://x.com  " }).endpoint).toBe("https://x.com");
        expect(normalizeTelemetryConfig({ endpoint: "" }).endpoint).toBeUndefined();
        expect(normalizeTelemetryConfig({ endpoint: 123 }).endpoint).toBeUndefined();
    });

    it("normalizeTelemetryConfig clamps lastReportAt", () => {
        expect(normalizeTelemetryConfig({ lastReportAt: -5 }).lastReportAt).toBe(0);
        expect(normalizeTelemetryConfig({ lastReportAt: "x" }).lastReportAt).toBe(0);
        expect(normalizeTelemetryConfig({ lastReportAt: 999 }).lastReportAt).toBe(999);
    });

    it("has correct storage constants", () => {
        expect(TELEMETRY_CONFIG_STORAGE_KEY).toBe("telemetryConfig");
        expect(TELEMETRY_CONFIG_PATH).toContain("telemetryConfig");
    });
});
