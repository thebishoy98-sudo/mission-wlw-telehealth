import {
  normalizeAdminNotificationSettings,
  sendAdminNotification,
} from "@/services/admin-notifications";
import * as dbServer from "@/lib/db.server";
import * as spruceServer from "@/services/spruce.server";

jest.mock("@/lib/db.server", () => ({
  appSettingDb: {
    get: jest.fn(),
    set: jest.fn(),
  },
  integrationLogDb: {
    create: jest.fn(),
  },
}));

jest.mock("@/services/spruce.server", () => ({
  sendTextToPhone: jest.fn(),
}));

describe("admin notifications", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("normalizes phone numbers and defaults all supported events on", () => {
    expect(
      normalizeAdminNotificationSettings({
        phones: ["(555) 111-2222", "5551112222", "+1 555 333 4444", "bad"],
      })
    ).toEqual({
      phones: ["+15551112222", "+15553334444"],
      events: {
        identity_review_needed: true,
        order_received: true,
        pharmacy_shipped: true,
      },
    });
  });

  it("texts every configured admin for enabled events", async () => {
    (dbServer.appSettingDb.get as jest.Mock).mockResolvedValue({
      phones: ["+15551112222", "+15553334444"],
      events: {
        identity_review_needed: true,
        order_received: true,
        pharmacy_shipped: false,
      },
    });
    (spruceServer.sendTextToPhone as jest.Mock).mockResolvedValue({ skipped: true });

    await sendAdminNotification("order_received", {
      orderId: "order_123",
      patientName: "Bishoy Kamel",
    });

    expect(spruceServer.sendTextToPhone).toHaveBeenCalledTimes(2);
    expect(spruceServer.sendTextToPhone).toHaveBeenCalledWith(
      "+15551112222",
      expect.stringContaining("New order received"),
      expect.stringContaining("admin_order_received_order_123")
    );
    expect(dbServer.integrationLogDb.create).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationName: "spruce",
        action: "Admin notification queued",
        orderId: "order_123",
        status: "pending",
      })
    );
  });

  it("does not send disabled admin notification events", async () => {
    (dbServer.appSettingDb.get as jest.Mock).mockResolvedValue({
      phones: ["+15551112222"],
      events: {
        identity_review_needed: false,
        order_received: true,
        pharmacy_shipped: true,
      },
    });

    await sendAdminNotification("identity_review_needed", { orderId: "order_123" });

    expect(spruceServer.sendTextToPhone).not.toHaveBeenCalled();
  });
});
