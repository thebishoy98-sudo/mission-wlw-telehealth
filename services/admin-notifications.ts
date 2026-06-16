import * as dbServer from "@/lib/db.server";
import { generateId } from "@/lib/utils";
import * as spruceServer from "@/services/spruce.server";
import type { AdminNotificationEvent, AdminNotificationSettings } from "@/types";

const SETTINGS_KEY = "admin_notification_settings";

const DEFAULT_EVENTS: Record<AdminNotificationEvent, boolean> = {
  identity_review_needed: true,
  order_received: true,
  pharmacy_shipped: true,
};

const localSettings: { current: AdminNotificationSettings } = {
  current: { phones: [], events: { ...DEFAULT_EVENTS } },
};

function normalizePhone(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw.startsWith("+") && digits.length >= 10 ? `+${digits}` : null;
}

export function normalizeAdminNotificationSettings(input: unknown): AdminNotificationSettings {
  const raw = input && typeof input === "object" ? input as Partial<AdminNotificationSettings> : {};
  const phones = Array.from(new Set((Array.isArray(raw.phones) ? raw.phones : [])
    .map(normalizePhone)
    .filter((phone): phone is string => Boolean(phone))));

  return {
    phones,
    events: {
      ...DEFAULT_EVENTS,
      ...(raw.events && typeof raw.events === "object" ? raw.events : {}),
    },
  };
}

export async function getAdminNotificationSettings(): Promise<AdminNotificationSettings> {
  const stored = await dbServer.appSettingDb.get<AdminNotificationSettings>(SETTINGS_KEY).catch(() => null);
  if (!stored) return localSettings.current;
  const normalized = normalizeAdminNotificationSettings(stored);
  localSettings.current = normalized;
  return normalized;
}

export async function saveAdminNotificationSettings(input: unknown): Promise<AdminNotificationSettings> {
  const settings = normalizeAdminNotificationSettings(input);
  localSettings.current = settings;
  await dbServer.appSettingDb.set(SETTINGS_KEY, settings).catch(() => settings);
  return settings;
}

function renderAdminMessage(event: AdminNotificationEvent, data: Record<string, string | undefined>) {
  const order = data.orderId ? `Order ${data.orderId}` : "An order";
  const patient = data.patientName ? ` for ${data.patientName}` : "";
  if (event === "identity_review_needed") {
    return `Mission WLW: Identity review needed${patient}. ${order}.`;
  }
  if (event === "pharmacy_shipped") {
    const tracking = data.trackingNumber ? ` Tracking: ${data.trackingNumber}.` : "";
    return `Mission WLW: Pharmacy shipped${patient}. ${order}.${tracking}`;
  }
  return `Mission WLW: New order received${patient}. ${order}.`;
}

export async function sendAdminNotification(
  event: AdminNotificationEvent,
  data: Record<string, string | undefined> = {}
) {
  const settings = await getAdminNotificationSettings();
  if (!settings.events[event] || settings.phones.length === 0) return [];

  const text = renderAdminMessage(event, data);
  const log = async (entry: Parameters<typeof dbServer.integrationLogDb.create>[0]) => {
    try {
      await Promise.resolve(dbServer.integrationLogDb.create(entry));
    } catch {
      // Notification delivery should not fail because activity logging failed.
    }
  };
  const results = await Promise.all(settings.phones.map(async (phone) => {
    const idempotencyKey = `admin_${event}_${data.orderId ?? "no_order"}_${phone.replace(/\D/g, "")}`;
    try {
      const response = await spruceServer.sendTextToPhone(phone, text, idempotencyKey);
      const duplicate = (response as { duplicate?: boolean })?.duplicate;
      const skipped = (response as { skipped?: boolean })?.skipped;
      await log({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "spruce",
        action: duplicate
          ? "Admin notification already sent (duplicate)"
          : skipped
            ? "Admin notification queued"
            : "Admin notification sent",
        orderId: data.orderId,
        patientId: data.patientId,
        status: skipped ? "pending" : "success",
        details: { event, phone },
      });
      return { phone, status: duplicate ? "duplicate" : skipped ? "pending" : "sent" };
    } catch (error) {
      await log({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "spruce",
        action: "Admin notification failed",
        orderId: data.orderId,
        patientId: data.patientId,
        status: "error",
        details: { event, phone },
        error: error instanceof Error ? error.message : String(error),
      });
      return { phone, status: "failed" };
    }
  }));

  return results;
}
