/**
 * Service configuration — controls mock vs real integrations.
 *
 * Set environment variables to switch to real APIs:
 *   USE_REAL_PRACTICEQ=true
 *   USE_REAL_QUICKBOOKS=true
 *   USE_REAL_LIFEFILE=true
 *   USE_REAL_SPRUCE=true
 *
 * Or set USE_REAL_INTEGRATIONS=true to enable all at once.
 */

const all = process.env.USE_REAL_INTEGRATIONS === "true";

export const serviceConfig = {
  practiceq: {
    useMock: !(all || process.env.USE_REAL_PRACTICEQ === "true"),
    apiKey: process.env.PRACTICEQ_API_KEY ?? "",
    baseUrl: process.env.PRACTICEQ_BASE_URL ?? "https://api.practiceq.com/v2",
    intakeEndpoint: process.env.PRACTICEQ_INTAKE_ENDPOINT ?? "",
  },
  quickbooks: {
    useMock: !(all || process.env.USE_REAL_QUICKBOOKS === "true"),
    clientId: process.env.QB_CLIENT_ID ?? "",
    clientSecret: process.env.QB_CLIENT_SECRET ?? "",
    realmId: process.env.QB_REALM_ID ?? "",
    refreshToken: process.env.QB_REFRESH_TOKEN ?? "",
  },
  lifefile: {
    useMock: !(all || process.env.USE_REAL_LIFEFILE === "true"),
    vendorId: process.env.LIFEFILE_VENDOR_ID ?? "",
    locationId: process.env.LIFEFILE_LOCATION_ID ?? "",
    apiNetworkId: process.env.LIFEFILE_API_NETWORK_ID ?? "",
    username: process.env.LIFEFILE_API_USERNAME ?? "",
    password: process.env.LIFEFILE_API_PASSWORD ?? "",
    practiceId: process.env.LIFEFILE_PRACTICE_ID ?? "",
    baseUrl: process.env.LIFEFILE_BASE_URL ?? "https://host37a.lifefile.net/lfapi/v1",
    prescriberNpi: process.env.LIFEFILE_PRESCRIBER_NPI ?? "",
    prescriberLastName: process.env.LIFEFILE_PRESCRIBER_LAST_NAME ?? "",
    prescriberFirstName: process.env.LIFEFILE_PRESCRIBER_FIRST_NAME ?? "",
    prescriberPhone: process.env.LIFEFILE_PRESCRIBER_PHONE ?? "",
    shippingServiceId: parseInt(process.env.LIFEFILE_SHIPPING_SERVICE_ID ?? "999", 10),
  },
  spruce: {
    useMock: !(all || process.env.USE_REAL_SPRUCE === "true"),
    apiKey: process.env.SPRUCE_API_KEY ?? "",
    fromNumber: process.env.SPRUCE_FROM_NUMBER ?? "",
    baseUrl: process.env.SPRUCE_BASE_URL ?? "https://api.sprucehealth.com/v1",
  },
};

export type ServiceConfig = typeof serviceConfig;
