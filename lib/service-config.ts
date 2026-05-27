/**
 * Service configuration - controls mock vs real integrations.
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
const env = (...names: string[]) => {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== "") return value;
  }
  return "";
};

export const serviceConfig = {
  practiceq: {
    useMock: !(all || process.env.USE_REAL_PRACTICEQ === "true"),
    apiKey: process.env.PRACTICEQ_API_KEY ?? "",
    baseUrl: process.env.PRACTICEQ_BASE_URL ?? "https://intakeq.com/api/v1",
    intakeEndpoint: process.env.PRACTICEQ_INTAKE_ENDPOINT ?? "",
    questionnaireId: process.env.PRACTICEQ_QUESTIONNAIRE_ID ?? "",
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
    vendorId: env("LIFEFILE_VENDOR_ID", "LF_X_VENDOR_ID"),
    locationId: env("LIFEFILE_LOCATION_ID", "LF_X_LOCATION_ID"),
    apiNetworkId: env("LIFEFILE_API_NETWORK_ID", "LF_X_API_NETWORK_ID"),
    username: env("LIFEFILE_API_USERNAME", "LF_API_USERNAME"),
    password: env("LIFEFILE_API_PASSWORD", "LF_API_PASSWORD"),
    practiceId: env("LIFEFILE_PRACTICE_ID", "LF_PRACTICE_ID", "LF_ID"),
    baseUrl: env("LIFEFILE_BASE_URL", "LF_BASE_URL") || "https://host37a.lifefile.net/lfapi/v1",
    orderEndpoint: env("LIFEFILE_ORDER_ENDPOINT", "LF_ENDPOINT_ORDER_API"),
    prescriberNpi: env("LIFEFILE_PRESCRIBER_NPI", "LF_PRESCRIBER_NPI"),
    prescriberLastName: env("LIFEFILE_PRESCRIBER_LAST_NAME", "LF_PRESCRIBER_LAST_NAME"),
    prescriberFirstName: env("LIFEFILE_PRESCRIBER_FIRST_NAME", "LF_PRESCRIBER_FIRST_NAME"),
    prescriberPhone: env("LIFEFILE_PRESCRIBER_PHONE", "LF_PRESCRIBER_PHONE"),
    prescriberEmail: env("LIFEFILE_PRESCRIBER_EMAIL", "LF_PRESCRIBER_EMAIL"),
    prescriberLicenseState: env("LIFEFILE_PRESCRIBER_LICENSE_STATE", "LF_PRESCRIBER_LICENSE_STATE"),
    prescriberLicenseNumber: env("LIFEFILE_PRESCRIBER_LICENSE_NUMBER", "LF_PRESCRIBER_LICENSE_NUMBER"),
    shippingServiceId: parseInt(env("LIFEFILE_SHIPPING_SERVICE_ID", "LF_SHIPPING_SERVICE_ID", "LF_SERVICE") || "999", 10),
  },
  spruce: {
    useMock: !(all || process.env.USE_REAL_SPRUCE === "true"),
    apiKey: process.env.SPRUCE_API_KEY ?? "",
    fromNumber: process.env.SPRUCE_FROM_NUMBER ?? "",
    baseUrl: process.env.SPRUCE_BASE_URL ?? "https://api.sprucehealth.com/v1",
  },
};

export type ServiceConfig = typeof serviceConfig;
